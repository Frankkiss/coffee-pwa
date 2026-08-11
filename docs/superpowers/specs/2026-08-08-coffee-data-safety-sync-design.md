# Coffee 数据安全、统一离线同步与 Supabase 加固设计

日期：2026-08-08

状态：已批准，待实施

适用项目：Coffee PWA

## 1. 文档关系

本设计是 [`2026-06-12-coffee-pwa-design.md`](./2026-06-12-coffee-pwa-design.md) 的专项修订，覆盖以下范围：

- 多设备与离线数据流；
- 同步冲突规则；
- 备份、导入和全量回滚；
- Supabase 数据约束与事务接口；
- 现有 IndexedDB 队列和生产数据的迁移；
- 数据安全相关测试与上线门槛。

现有功能继续使用当前 Supabase 项目、Supabase Auth、Postgres、RLS 和 Edge Functions，不迁移到另一套后台。
仓库中的 SQL 只代表预期结构；实施前必须读取并核对线上 Supabase 的实际 schema、迁移记录和数据状态。

本设计取代以下旧设计在同一范围内的规则：

- `2026-06-15-offline-read-cache-design.md` 的只读缓存边界；
- `2026-06-12-backup-import-design.md` 的 v1 恢复能力边界；
- `2026-06-15-backup-restore-point-design.md` 的非事务式恢复点流程。

旧文档仍保留为历史记录，不回写成新方案。

## 2. 背景与目标

实际使用已经从“安卓手机单设备为主”发展为手机和电脑频繁共同使用：电脑主要新增和编辑，手机主要查看冲煮记录，
但两端都可能产生修改。现有页面级缓存和队列可以处理部分断网场景，却无法为跨实体关联、多标签页、重复提交、
完整备份和真正回滚提供统一保障。

本轮目标按优先级排列：

1. 先保证已有云端数据和本地待同步数据不因升级丢失。
2. 建立一个供所有页面使用的离线数据层和同步核心。
3. 保留现有 Supabase，并用事务 RPC、RLS、约束和幂等回执加固后台。
4. 将备份范围扩展到全部用户可见数据，提供默认安全合并和明确确认后的全量回滚。
5. 为后续重做录豆、AI 推荐和冲煮记录建立可靠的数据基础。

## 3. 已确认的产品决策

### 3.1 云端与本地的角色

- Supabase Postgres 是登录用户的云端事实来源和唯一长期在线主库。
- IndexedDB 是本地工作层、权威快照缓存和弱网队列，不是唯一耐久存储。
- UI 优先从本地数据层读取，以获得即时响应；同步成功后由服务器快照校准。
- JSON 和 CSV 文件导出继续保留，不能因云同步存在而取消。

### 3.2 离线范围

允许离线新增、编辑和删除：

- 咖啡豆，包括单品豆和拼配豆；
- 冲煮记录；
- 用户自定义冲煮模板；
- 用户设置。

联网限制：

- AI 推荐生成必须联网并通过 Supabase Edge Function；
- 来源 URL 或文本解析必须联网并通过 Supabase Edge Function；
- 已保存的 AI 推荐可缓存并离线查看，但离线状态下不保证修改推荐状态；
- 来源导入记录进入备份，但不属于本轮离线编辑范围。

### 3.3 冲突与历史

- 冲突采用记录级“最后成功写入服务器者为准”。
- “最后”指 Supabase 事务成功提交的顺序，不指设备本地时间。
- 不做字段级合并；一条上行 `upsert` 携带该记录的完整当前内容。
- 较晚恢复联网的旧设备可能覆盖另一端已经提交的内容，这是本轮明确接受的取舍。
- 不保留用户可见的逐条版本历史。
- 短期幂等回执仅用于重复请求去重，不保存字段差异，不视为修改历史。
- 真正回滚依靠定期文件备份和执行回滚前生成的完整备份。

## 4. 总体架构

```text
React 页面
  -> 业务 Repository
    -> IndexedDB 实体仓库 + Outbox（同一本地事务）
      -> SyncManager
        -> Supabase Authenticated RPC
          -> Postgres 业务表 + 幂等回执
      <- 服务器权威快照
  <- 本地合成视图（服务器基线 + 尚未提交的本地修改）
```

组件职责：

- **业务 Repository**：提供豆子、冲煮、模板、设置和只读推荐的统一读写接口，隐藏 IndexedDB 与 Supabase 细节。
- **本地实体仓库**：保存当前用户可见实体和最近一次服务器基线。
- **Outbox**：保存尚未被服务器确认的本地意图。
- **SyncManager**：负责互斥、压缩、排序、上传、退避、拉取和状态发布。
- **Supabase RPC**：校验当前用户、应用批次、提供一致快照和执行备份恢复事务。
- **Realtime**：只作为“服务器可能变化”的唤醒信号，不直接替代权威拉取。

页面组件不得自行维护第二套同步队列，也不得用 `navigator.onLine` 推断“已经同步”。

统一同步迁移收尾时，首页概览也必须通过 `SyncProvider` 暴露的豆子与冲煮 Repository 读取并订阅本地合成视图，不能继续直读
Supabase 或维护旧 `snapshots` 缓存。来源解析、图片识别和来源记录仍保持原有联网边界，但用户确认导入草稿后，豆子必须先经
`beanRepository` 原子写入本地实体与 Outbox，再以 best-effort 方式唤醒 `SyncManager`；同步唤醒失败不能把已经安全落盘的豆子
误报为保存失败。只有上述生产消费者全部迁移且 import 扫描为零后，才能删除旧 `offlineCache`、`offlineQueue` 和页面直连 CRUD
service 源码。删除源码不得升级或删除 IndexedDB 中的物理 `snapshots`、`pendingMutations` store，旧数据迁移与恢复导出继续由
自包含的 `legacyMigration` raw reader 负责。

## 5. 本地数据模型

### 5.1 IndexedDB 存储

新本地数据库按 `userId` 隔离，至少包含：

- `beans`；
- `brewLogs`；
- `brewTemplates`；
- `userSettings`；
- `aiRecommendations`，只读离线缓存；
- `outbox`；
- `syncMeta`；
- `migrationMeta`。

所有新业务记录在创建时直接使用 `crypto.randomUUID()` 生成永久 UUID。服务器接受客户端生成的合法 UUID，
不再创建 `local-bean-*` 一类临时主键，因此离线豆子与冲煮记录可以立即建立稳定关联。

`syncMeta` 只保存非敏感技术状态，例如当前用户、非敏感 `deviceId`、最近成功同步时间、最近服务器快照时间、
当前数据库版本和迁移状态。认证令牌、API Key 和 `service_role` Key 不进入 IndexedDB。

### 5.2 Outbox 记录

每条待同步意图至少包含：

```text
mutationId
userId
deviceId
baseSyncEpoch
entityType
entityId
operation: upsert | delete
payload
queuedAt
attemptCount
status: pending | syncing | needs_attention
lastErrorCode
lastErrorMessage
```

Outbox 行是仅存在于 IndexedDB 的本地持久化契约，不等于发送给 RPC 的 wire operation。发送给
`apply_sync_batch` 的每项操作只允许包含 `mutationId`、`deviceId`、`entityType`、`entityId`、`operation`
和 `payload`；`userId`、`baseSyncEpoch`、`queuedAt`、`attemptCount`、本地状态和错误信息绝不进入 wire payload。
`userId` 只用于本地账号隔离，RPC ownership 始终来自已认证会话；批次代次通过独立的 `syncEpoch` 参数传递。

操作契约使用按 `entityType` 和 `operation` 判别的联合：豆子、冲煮记录和模板允许完整 `upsert` 或 `delete`，
设置只允许完整 `upsert`，TypeScript 与运行时验证均不得表达或接受 settings delete。所有 delete 的 `payload`
统一为严格空对象 `{}`；upsert payload 必须是该实体全部客户端可变字段，包含受控 `schema_version`，但排除
ownership、主键、服务器时间戳和软删除字段。

所有进入同步契约的 JSON 必须可被 JSON 序列化。客户端使用递归 `JsonPrimitive | JsonValue[] | JsonObject`
建模，拒绝 `undefined`、函数和 `symbol`；已知由对象承载的设置与推荐字段进一步收紧为 `JsonObject`。

一次本地保存必须在同一个 IndexedDB 事务内完成：

1. 更新本地实体；
2. 写入或合并 Outbox 意图；
3. 提交事务后通知 UI。

任何一步失败都不得出现“界面已保存但队列没有记录”的状态。

统一本地 Repository 提供按 `userId` 和实体存储类型过滤的变更订阅。通知只能在包含实体与 Outbox 的事务成功提交后发布；
事务失败、回滚或中止时不得发布。取消订阅必须幂等，账号切换后旧用户的通知不得进入新用户页面。页面通过该订阅重新读取本地合成视图，
不得轮询 IndexedDB，也不得自行维护第二份同步队列。

本地 envelope 也属于不可信持久化输入。Outbox 读取必须把记录明确分类为 `missing`、`foreign`、`valid` 或
`corrupt-owned`，不能把所有校验失败都当作“其他账号记录”静默过滤。只要 envelope `userId`、value 内的
`userId`、key 对应的目标 mutation 三者任一指向当前用户，而其余 ownership、key、形状或规范时间字段不一致，
即为当前用户的 `corrupt-owned` 数据；Repository 必须抛出稳定错误 `LOCAL_SYNC_DATA_CORRUPT`，中止当前批量状态更新、
快照替换或同步循环，不得提交其他部分写入。合法外用户记录继续忽略；完全无法归属的孤立损坏记录不能阻塞任意账号，
但按目标 mutationId 直接命中孤立损坏记录时必须拒绝修改。保护模式应允许用户导出包含诊断元数据的本地恢复包，
再由后续恢复工具处理，不能自动删除损坏行。

### 5.3 队列压缩与依赖

- 同一实体的多次编辑压缩为最终一次完整 `upsert`。
- 离线新增后继续编辑，仍为一次 `upsert`。
- 从未同步的本地新增随后被删除时，同时移除实体和待同步意图，无需上传。
- 已存在于服务器的记录删除时生成 `delete`，服务器设置 `deleted_at`。
- 上传顺序优先保证豆子先于引用它的冲煮记录。
- 删除依赖按安全顺序执行，不能制造悬空关联。
- 模板和设置不依赖豆子，可以与安全的其他操作继续提交。

## 6. SyncManager 行为

### 6.1 触发条件与互斥

同步在以下场景触发：

- 登录和会话恢复成功；
- 浏览器 `online` 事件；
- 页面回到前台；
- 用户手动重试；
- 应用位于前台时的低频定时检查；
- Supabase Realtime 收到当前用户相关变化信号。

同一浏览器内只能有一个活动同步器。优先使用 Web Locks API；不支持时使用带过期时间和持有者标识的 IndexedDB 租约。
锁丢失或页面终止后，其他标签页可以安全接管。

### 6.2 一次同步循环

1. 确认有效会话和用户一致性。
2. 获取跨标签页互斥锁。
3. 读取 `pending` 与可重试的队列项。
4. 压缩同实体操作并按依赖排序。
5. 携带最近快照的 `syncEpoch` 调用 `apply_sync_batch`。
6. 仅删除服务器已经确认的 `mutationId`。
7. 调用 `get_sync_snapshot` 获取当前完整权威快照。
8. 更新服务器基线，再叠加仍待上传或需要处理的本地修改。
9. 发布全局和逐实体同步状态。
10. 释放锁。

Outbox 压缩必须保守。当前 `SyncMutation` 没有可靠的服务器存在性或实体来源元数据，无法安全区分“仅在本地新建后又删除”与
“编辑服务器既有实体后删除”。因此，同一用户、同一实体的最终操作为 `delete` 时，必须保留压缩后的最新完整 `upsert`
及其后的 `delete`，并按该顺序发送；不得把两者自动抵消。`delete → upsert` 可压缩为最后一个完整 `upsert`，连续
`upsert` 只保留最后一个完整 `upsert`，连续 `delete` 只保留最后一个 `delete`。只有未来为 mutation 增加并验证可信的
origin metadata 后，才可以针对已证明从未存在于服务器的实体抵消 `upsert → delete`。压缩不得跨用户，也不得把
`needs_attention` 与可发送项合并或自动发送。已标记为 `syncing` 的 mutation 可能已经在途或已被服务器应用，必须作为
不可压缩边界保留原 mutationId，且默认不得选入新批次；只能压缩边界之间的 `pending` 序列。Task 9 在取得跨标签锁后，
必须先把上一次中断遗留的 stale `syncing` 恢复为 `pending` 并重新读取 Outbox，之后才能选择新批次。

压缩批次必须为每个实际发送的 mutation 同时保留其覆盖的所有原 mutationId。只有该发送项得到服务器确认后，存储层才能
在同一用户作用域内原子确认该项及其覆盖的 IDs，避免旧 Outbox 行在下一轮重新出现并覆盖新状态。失败批次不得确认任何
covered ID；只有整个原子 RPC 成功且对应发送 operation 收到 `applied | duplicate` 后才可确认。排序以精确 RFC 3339 时间
为稳定基准，只为真实实体依赖和同一实体的原操作因果增加拓扑边；优先级只用于同一时间的稳定决胜。不得为了保持实体连续
而破坏无依赖 mutation 的时间顺序，也不得用非传递比较器造成同实体操作反转。

发送前，存储层必须在单个、显式 `userId` 作用域的 IndexedDB 事务中将本批 mutation 标记为 `syncing` 并递增
`attemptCount`。网络、超时或 5xx 等可重试失败必须在同样的用户作用域内原子恢复为 `pending`，同时记录稳定错误码与
消息。确认、标记需处理、手动重试、放弃和旧代次隔离等所有 mutation 写操作都必须显式接收并校验 `userId`，不能只凭
`mutationId` 修改其他账号的行。

外部快照只有通过 Task 9 的完整 RPC schema validator 后才可以传入本地 Repository；Repository 仍必须独立验证
snapshot ownership、本地 envelope 完整性和 snapshot/meta 单调性。应用快照与写入同步元数据必须在同一 IndexedDB
事务中先读取当前用户 `syncMeta`，再遵守以下规则：低于当前 `syncEpoch` 的响应拒绝；同一 epoch 中
`serverTime` 早于 `lastSyncedAt` 的响应拒绝；相同或更新的同 epoch 响应允许幂等应用；更高 epoch 允许前进，
不以跨 epoch 的 wall-clock 大小阻止恢复。拒绝使用稳定错误 `STALE_LOCAL_SNAPSHOT`，且实体与 meta 均保持不变。
独立 `writeSyncMeta` 使用同一单调检查，迟到响应不得降低 epoch 或时间。

`SyncManager` 在每个异步边界后都要重新确认活动用户和当前运行代次；登出、切换账号或 `stop()` 会使旧 generation
失效。旧账号的延迟 RPC、Realtime、定时器或网络回调不得确认、重排、覆盖或删除新账号的本地数据。

个人数据规模下，第一版在成功推送后拉取完整快照，优先保证正确性。待数据量或性能指标证明有必要时，
才引入增量游标；Realtime 始终只是唤醒机制。

### 6.3 失败分类

- **网络中断、超时、5xx**：保留队列，采用有上限的指数退避，并允许手动立即重试。
- **认证失效**：停止上传，等待重新登录；不得把旧用户队列交给新用户。
- **字段校验、关联或权限错误**：将相关操作标记为 `needs_attention`，阻塞其依赖项，但允许无关安全操作继续。
- **上传成功但响应丢失**：下次以相同 `mutationId` 重试，由服务器回执返回原确认结果。
- **上传成功但快照拉取失败**：保留已确认状态，下次仅重拉快照，不重复应用业务写入。
- **同步代次已经失效**：停止自动上传旧代次 Outbox，先拉取全量回滚后的权威快照，并将旧修改隔离为
  `needs_attention`；只有用户逐条确认重新应用后，才可生成新代次操作。

## 7. 用户可见的同步状态

全局只使用以下状态：

- 已同步；
- 正在同步；
- 离线，存在 N 条待同步修改；
- 同步暂时失败，将自动重试；
- 有 N 条数据需要处理。

同时满足“Outbox 为空、没有 `needs_attention`、最近一次快照拉取成功”才可显示“已同步”。
首页显示当前设备最近一次完整推送与拉取成功时间，而不是仅显示网络在线。

需要处理的记录提供：

- 可理解的失败原因；
- 重试；
- 放弃本地修改并恢复服务器版本。

“放弃并恢复”不是单独删除 Outbox。SyncManager 必须先成功获取并完整验证服务器快照，然后调用一个原子 storage 操作：
在同一 IndexedDB 事务中验证并删除目标 mutation，以删除后的剩余有效 Outbox 重新计算受保护实体集合，应用五类服务器
快照并更新 `syncMeta`。目标 mutation 缺失、属于其他账号、当前用户本地数据损坏、快照过期或任一步失败时全部回滚；
不得先删队列再异步拉取，也不得向用户显示已经恢复。

退出登录时如存在待同步或异常记录，必须先提示影响。队列按 `userId` 隔离，切换账号后不得互相可见。

## 8. Supabase 数据库加固

### 8.1 基础规则

对线上实际表逐一核查，而不是只假设仓库 SQL 已全部部署：

- 所有用户数据均绑定 `user_id` 或等价的用户主键；
- 所有用户数据表启用 RLS；
- 策略同时限制读取条件与写入 `with check`；
- `updated_at` 由数据库触发器生成，不接受客户端时钟作为提交顺序；
- 可删除业务实体统一使用 `deleted_at` 软删除；
- `schema_version` 在所有需要迁移的用户实体上统一；
- 为 `user_id`、`deleted_at`、`updated_at` 和主要查询组合增加适当索引；
- 对评分、重量、温度、耗时、枚举状态和 JSON 结构增加可验证的约束。

Postgres `jsonb` 可以保存任意合法 JSON，当前 `brew_templates.category`、`difficulty` 等字段也没有数据库枚举
约束。本阶段不回改 Task 3 数据库迁移；窄枚举、结构化模板注水步骤和对象型 JSON 被视为“通过客户端 API 边界验证后的
服务器行”。数据库返回值不能直接断言成这些类型，必须先按下述 RPC 响应规则验证，畸形历史行会被安全拒绝而不是进入缓存。

`schema_version` 是随实体同步的受控版本标签，用于判断实体结构和后续迁移路径，不属于 ownership 或服务器时间戳字段。
客户端完整记录 payload 可以携带该字段，但 RPC 只能接受服务器当前明确支持的版本；第一版仅接受整数 `1`，省略时按
`1` 处理。未来版本必须先部署服务器端 schema 迁移和兼容处理，再放开对应版本，客户端不能自行提交尚未支持的版本。
客户端始终不得在 payload 中提供 `id`、`user_id`、`created_at`、`updated_at` 或 `deleted_at`。

`user_settings` 是每用户单例，不要求模拟普通实体删除；恢复时更新或重建该用户设置行。

### 8.2 同用户关联完整性

`brew_logs.bean_id` 和 `ai_recommendations.bean_id` 不能只验证目标 UUID 存在，还必须验证目标豆子属于同一用户。
实现时优先采用 `(id, user_id)` 唯一约束与复合外键；若线上数据或 PostgreSQL 限制要求其他实现，
可使用事务内约束触发器，但行为必须一致。

复合外键统一使用 `ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED`。`RESTRICT` 引用动作不能延迟，
会在从 `auth.users` 发起并同时经过豆子、冲煮记录和 AI 推荐等多条级联路径删除时过早检查；`NO ACTION`
允许把关联完整性检查推迟到事务结束，避免级联执行顺序造成误报。上线迁移不得依赖历史约束名，而应通过
`pg_constraint` 的引用表、被引用表及两侧列语义定位并删除旧的 `(bean_id) -> beans(id)` 单列外键，
且不得误删目标复合外键或其他关系约束。

迁移前先报告：

- 悬空 `bean_id`；
- 跨用户引用；
- 重复或非法 UUID；
- 不符合新增 CHECK 约束的旧值；
- 缺失 `user_id`、`schema_version` 或时间字段的行。

异常数据不得自动删除。修复规则必须写入迁移计划并可复核。

### 8.3 幂等回执

新增 `sync_mutation_receipts` 技术表，核心字段为：

```text
user_id
mutation_id
device_id
entity_type
entity_id
operation
committed_at
result_summary
```

以 `(user_id, mutation_id)` 唯一。回执不保存完整旧值、新值或字段差异，默认保留 30 天后清理。
清理任务失败不得影响业务写入。

### 8.4 用户同步代次

新增每用户单例技术状态 `user_sync_state`，至少包含 `user_id`、`sync_epoch` 和 `updated_at`。普通同步不改变
`sync_epoch`；只有明确执行全量回滚时才在同一事务中递增。服务器快照返回当前代次，客户端 Outbox 记录创建时
所基于的代次。该机制不是记录历史，而是防止其他离线设备在回滚后自动重放旧修改。

## 9. Supabase RPC 契约

### 9.1 `apply_sync_batch`

- 从 Supabase Auth 会话读取 `auth.uid()`，忽略或拒绝客户端伪造的 `user_id`。
- 要求批次的 `syncEpoch` 与当前用户代次一致；不一致时不得应用任何业务写入。
- 对每个 `mutationId` 先查幂等回执。
- 验证实体类型、UUID、字段、受支持的 `schema_version`、软删除规则和跨实体关联；当前只接受整数版本 `1`。
- mutation payload 中的时间戳只接受有限的 RFC 3339 / ISO 8601 带时区字符串格式；拒绝 PostgreSQL
  `infinity` / `-infinity` 以及空格分隔、缺少时区等宽松非 ISO 表示，所有解析错误归一化为稳定、可定位的业务错误。
- 按依赖顺序在单个数据库事务内应用批次。
- 记录应用时使用服务器时钟写入 `updated_at`；最终值由数据库对同一记录的串行应用顺序决定。
- 成功时返回每个 `mutationId` 的确认结果和服务器提交时间。
- 批次中的结构性事务错误全部回滚；客户端校验错误应返回可定位的错误码。

### 9.2 `get_sync_snapshot`

- 只返回当前登录用户的数据。
- 返回豆子、冲煮记录、模板、用户设置和保存的 AI 推荐。
- 第一版返回用于重建本地基线的完整权威快照及服务器生成时间。
- 返回当前用户的 `syncEpoch`。
- `syncEpoch` 与豆子、冲煮记录、模板、用户设置、AI 推荐等全部实体集合必须由同一个 PostgreSQL
  statement 构造并共享同一个 MVCC snapshot，禁止分开查询后拼装，以免全量恢复与并发写入交错时产生代次和数据撕裂。
- 删除状态必须可被客户端识别，防止旧缓存复活已删除记录。
- Supabase SDK 返回的 RPC data 首先一律视为 `unknown`。`syncApi` 必须完整验证顶层结构、UUID/时间/数字、每个实体
  的全部必填字段、实体枚举、模板结构和递归 JSON 可序列化性；不能用类型断言把部分或畸形响应提升为快照类型。
- 只有整份响应验证成功后才构造 `SyncSnapshot` 并调用 `replaceServerSnapshot`。任意一行、JSON 值、枚举或必填字段
  不合法时，整份快照不得覆盖本地权威缓存，并返回稳定的 `INVALID_SYNC_RESPONSE` 安全错误。
- `apply_sync_batch` 的响应也按 `unknown` 验证 `syncEpoch`、`serverTime`、每个 `mutationId` 和
  `applied | duplicate` 枚举。无效 apply 响应不得确认本地 Outbox；有效 apply 响应已经确认的 mutation 可独立确认，
  随后畸形快照仍不得替换缓存。不可重试的响应结构错误进入全局 `needs_attention`，保留可诊断错误且不继续自动覆盖数据。

### 9.3 安全执行方式

RPC 优先使用调用者权限运行并保留 RLS。若某个恢复流程确实需要 `SECURITY DEFINER`，必须：

- 固定安全的 `search_path`；
- 在函数内首先验证 `auth.uid()`；
- 将所有操作强制限定为当前用户；
- 撤销匿名和非目标角色权限；
- 用跨用户攻击用例验证。

前端永远不持有 Supabase `service_role` Key。

## 10. 备份格式 v2

### 10.1 默认轻量 JSON

默认备份覆盖全部用户可见数据：

- 用户资料中可见且可恢复的字段；
- 用户设置；
- 单品豆、拼配豆及拼配组成；
- 冲煮记录；
- 用户自定义冲煮模板；
- 已保存的规则推荐和 AI 推荐，包括接受状态；
- 为追溯豆子来源所需的来源 URL、结构化解析结果、用户选择结果和可复用导入记录。

默认不包含：

- 图片二进制；
- Supabase Auth 令牌和密码材料；
- API Key 或服务器密钥；
- IndexedDB 缓存、Outbox、失败日志、幂等回执和 `user_sync_state` 技术状态；
- 完整抓取网页正文和不必要的临时 OCR 内容；
- `backup_exports` 历史本身，避免备份递归包含备份记录。

建议顶层结构：

```json
{
  "schemaVersion": 2,
  "manifest": {
    "exportedAt": "server timestamp",
    "appVersion": "string",
    "backupMode": "lightweight",
    "recordCounts": {},
    "checksumAlgorithm": "SHA-256",
    "checksum": "hex"
  },
  "data": {
    "profile": {},
    "userSettings": {},
    "beans": [],
    "brewLogs": [],
    "brewTemplates": [],
    "aiRecommendations": [],
    "sourceImports": []
  }
}
```

校验和基于确定性序列化后的 `data` 内容计算。导出必须来自一个一致的数据库快照，不允许逐表读取期间混入部分新写入。
轻量 v2 已包含全部可恢复的逻辑数据，因此校验完整时具备全量回滚资格；图片 ZIP 只是可选扩展，
不是执行全量回滚的前置条件。

### 10.2 完整备份

只有用户明确选择时才生成包含图片的完整 ZIP：

- ZIP 内必须包含同一份 v2 JSON manifest；
- 图片使用受控尺寸和压缩格式，不默认保存原图；
- manifest 记录每个图片文件的逻辑归属、路径、媒体类型、字节数和校验和；
- 任一图片缺失或校验失败必须在预览中说明，不能悄悄当作完整备份。

### 10.3 备份元数据与提醒

成功下载后在 Supabase `backup_exports` 记录导出时间、模式、文件名和计数。首页从云端元数据计算提醒，
默认超过 7 天提醒，并允许由 `user_settings.backup_reminder_days` 调整。下载失败时不得提前记录成功。

## 11. 恢复模式

### 11.1 通用预检

恢复前先完成纯读取预检并显示：

- 文件格式、schema 版本和校验和；
- 各实体总数；
- 将新增、已存在、已软删除、关联异常和需要迁移的数量；
- 图片缺失或损坏情况；
- 是否具备全量回滚资格。

所有导入行的 `user_id` 均重写为当前登录用户，且关联只能指向备份内或当前用户已有的数据。

### 11.2 默认安全合并

- 只新增当前用户数据库中完全不存在的 ID。
- 不更新相同 ID 的现有记录。
- 相同 ID 的软删除记录视为“已存在”，不得静默复活。
- 不删除当前数据。
- 豆子先于冲煮记录导入；关联异常在预览中列出并阻止相关行写入，不自动改成 `null` 掩盖问题。
- 合并写入由服务器事务执行；发生错误时整个安全批次回滚。

### 11.3 明确确认后的全量回滚

全量回滚只接受字段完整、校验通过的 v2 备份。执行顺序：

1. 重新读取服务器当前状态并刷新影响预览。
2. 生成并下载恢复前完整轻量备份。
3. 验证恢复前备份下载成功。
4. 显示将新增、更新、软删除和恢复的数量。
5. 要求用户输入明确确认文本。
6. 通过所有同步与恢复 RPC 共用的用户级事务锁，暂停该用户其他同步写入并执行 `restore_backup_v2`。
7. 在一个数据库事务中恢复备份内容、递增 `syncEpoch`；备份中不存在的可删除业务记录设置 `deleted_at`。
8. 任一错误回滚整个事务。
9. 成功后所有设备重新拉取权威快照。

其他设备在回滚前创建的 Outbox 因代次不一致会被服务器拒绝并在本地隔离，不能自动覆盖恢复结果。
用户可以放弃这些旧修改，或在查看差异后明确选择重新应用为新代次修改。

不物理删除当前用户记录。v1 备份因范围不完整，只能迁移后执行安全合并，不能用于全量回滚。

### 11.4 RPC

- `export_backup_v2`：生成一致的 v2 数据快照和服务器时间。
- `preview_restore_v2`：验证并返回影响，不修改数据。
- `restore_backup_v2`：根据明确模式执行事务式安全合并或全量回滚。

## 12. 旧客户端数据迁移

当前 IndexedDB 包含旧缓存和 `pendingMutations`，且可能存在 `local-bean-*` 主键。首次升级必须在单个受控迁移中：

1. 以只读方式盘点旧对象仓库和各用户记录数量。
2. 复制旧数据到新版本的临时目标仓库，不先清空来源。
3. 为每个 `local-bean-*` 生成永久 UUID，并保存确定的映射表。
4. 改写所有旧待同步操作、本地豆子、冲煮记录及其 `bean_id` 引用。
5. 将每个合法页面级源 mutation 一对一转换并落盘为新 Outbox row；迁移过程不执行压缩。只有发送选择阶段可以在内存中
   保守压缩，并且每个发送项的 `coveredMutationIds` 必须覆盖其代表的全部源 mutation ID，服务器确认后才能据此 acknowledge。
6. 校验实体数量、引用完整性、用户归属和 Outbox 数量。
7. 只有校验通过才标记迁移完成并停止使用旧仓库。

迁移解析必须在依赖完整 snapshot baseline 之前检查 bean `blend_components` 的嵌套字段白名单；即使无 baseline update 最终不能
重建实体，其中任何 component 的未知字段也必须优先触发 `LEGACY_MIGRATION_RECOVERY_REQUIRED` 并回滚整个事务。

completed meta 只保存非敏感 `sourceFingerprint` digest，不保存源 payload。指纹序列化必须覆盖支持的 IndexedDB structured-clone
可保存值的类型语义，明确区分普通对象、Date、Map、Set、ArrayBuffer、各类 typed array、undefined、特殊 number 等，并通过
稳定引用标记支持循环/共享引用；不得把这些值统一折叠为 `{}`。completed 后同 ID 源内容发生任一此类类型或内容变化时必须抛
`LEGACY_MIGRATION_SOURCE_CHANGED`，保持 v2、v3 与 meta 原样。Blob、File 或任何不能完整同步指纹的 structured-clone 类型
不读取异步内容字节，也永不满足 unchanged：首次迁移按既有恢复失败语义拒绝，completed fast path 必须返回
`LEGACY_MIGRATION_SOURCE_CHANGED`。该契约使用 current `migrationVersion: 10`；旧 v9 completion 必须走
`LEGACY_MIGRATION_UPGRADE_REQUIRED`。

若任何步骤失败：

- 事务回滚；
- 旧数据库保持可读且不被清空；
- 应用进入恢复保护状态；
- 向用户提供错误说明和本地恢复数据导出入口；
- 禁止在不确定的状态下继续上传。

迁移逻辑在至少一个稳定发布周期内保留，不能随新同步器上线立即删除。

## 13. 生产数据库迁移

采用 expand -> backfill -> validate -> switch -> contract：

1. 读取线上 schema、函数、RLS、索引、表计数和迁移历史。
2. 导出并验证现有生产数据备份。
3. 生成异常数据报告，确定每类修复规则。
4. 仅新增字段、索引、约束、技术表和 RPC；不删除旧接口。
5. 回填数据并验证计数、校验和、关联和 RLS。
6. 使用同一测试用户验证旧客户端与新接口短期兼容。
7. 部署带功能开关的新客户端和本地迁移器。
8. 小范围启用统一同步，确认后逐步扩大。
9. 稳定运行至少一个发布周期后，另立任务清理旧队列和废弃接口。

所有 SQL 迁移必须可在本地或隔离环境演练。生产执行需要明确授权和可用的 Supabase 管理访问，
不能只根据仓库 SQL 推断线上已经一致。

## 14. Edge Function 安全加固

AI 推荐和来源解析继续由现有 Supabase Edge Functions 承担。除密钥仅存在服务器环境变量外，来源解析还必须：

- 只允许 `http` 和 `https`；
- 拒绝环回、链路本地、私网、云元数据及解析后落入禁止地址的目标；
- 限制重定向次数，并对每次重定向重新验证目标；
- 设置连接、响应和总处理超时；
- 限制响应字节数和可接受媒体类型；
- 限制单用户调用频率；
- 不把完整敏感页面正文写入日志或长期备份。

AI 与解析结果仍是草稿或建议，必须由用户确认后才能成为豆子或冲煮业务数据。

## 15. 故障恢复与保护模式

- 客户端迁移失败：保留旧 IndexedDB，停止同步并提供导出。
- 上传中断：保留 Outbox，通过幂等回执重试。
- 快照拉取中断：不丢弃未提交本地修改，下次重新校准。
- 当前用户本地 envelope 损坏：停止同步与快照覆盖，报告 `LOCAL_SYNC_DATA_CORRUPT`，保留原数据并提供本地恢复导出入口。
- 数据库迁移失败：依靠事务回滚，旧客户端继续使用旧路径。
- 全量恢复失败：整个恢复事务回滚，不保留半恢复状态。
- 发现严重生产异常：关闭新同步功能开关，进入可查看、可导出、不可继续同步写入的保护模式。

保护模式不是“已同步”。UI 必须说明写入暂停和用户现有数据仍可导出。

## 16. 测试设计

### 16.1 单元测试

- Repository 的本地事务行为；
- 当前用户 corrupt-owned Outbox 的 envelope/value/key/时间损坏会阻止读取、批量状态更新和快照覆盖且全部回滚；
- 快照/meta 的 epoch 与同 epoch 时间单调性，以及迟到响应不降级；
- 放弃 mutation 后由同一事务真正恢复服务器实体或 tombstone，同时保留其他本地意图；
- 永久 UUID 创建；
- Outbox 压缩、依赖排序和失败隔离；
- 服务器基线与本地待同步修改的合成；
- 指数退避和状态机；
- v1 到 v2 备份迁移、校验和和预览；
- 旧 `local-bean-*` 映射及冲煮引用改写。

### 16.2 数据库与 RPC 测试

- RLS 读取、插入、更新、软删除；
- 跨用户 UUID 和关联攻击；
- 同一 `mutationId` 重试不会重复应用；
- 批次任一事务错误会整体回滚；
- 数据库对同一记录的串行应用顺序决定最后写入，客户端时间不参与；
- 全量回滚递增同步代次，旧设备不能自动重放回滚前修改；
- 快照只包含当前用户；
- 安全合并不覆盖、复活或删除；
- 全量回滚的新增、更新、软删除及失败回滚。

### 16.3 集成与 E2E

- 断网新增、连续编辑、删除后恢复联网；
- 豆子和引用它的冲煮记录同时离线创建；
- 多标签页同时启动同步；
- 电脑先编辑，手机离线后晚提交并成为最后版本；
- 上传成功但客户端响应丢失；
- 单条坏数据不阻塞无关操作；
- 应用同步中被关闭后重开；
- 有待同步内容时退出和切换账号；
- v2 导出再安全合并；
- v2 完整回滚和恢复前备份；
- v1 文件只出现安全合并选项；
- 手机尺寸下状态、错误和确认操作可用。
- 在真实 Chromium IndexedDB 中执行数据库升级、blocked opener、实体+Outbox abort、快照+meta abort 的 smoke test；
  fake-indexeddb 单元测试不能单独作为发布证据。

## 17. 上线阶段与门槛

实施拆分为以下可回退阶段：

1. **基线与生产备份**：确认线上事实，不修改业务行为。
2. **Supabase 扩展**：添加约束、索引、RPC、回执和安全测试，保持旧客户端可用。
3. **本地数据核心**：实现 Repository、实体仓库、Outbox 和旧队列迁移器。
4. **统一同步接入**：按豆子、冲煮、模板、设置的顺序替换页面直连逻辑。
5. **备份恢复 v2**：上线完整导出、预览、安全合并和全量回滚。
6. **灰度启用**：在功能开关下执行多设备真实验证。
7. **稳定与清理**：稳定一个发布周期后再设计旧路径清理。

每一阶段在进入下一阶段前必须满足：

- 单元、数据库、集成和相关 E2E 测试通过；
- lint 和正式构建通过；
- 真实 Chromium IndexedDB smoke test 通过并记录浏览器版本与结果；
- 迁移前后记录计数与关联检查符合预期；
- 已验证回退路径；
- 未将任何密钥带入前端或构建产物。

## 18. 验收标准

1. 电脑和手机均可离线管理豆子、冲煮记录、模板和设置。
2. 离线创建的豆子与冲煮记录保持稳定 UUID 关联。
3. 所有页面只使用统一 Repository 与 SyncManager，不再各自实现队列。
4. 多标签页不会重复运行同步批次。
5. 重复 `mutationId` 不会造成重复写入。
6. 服务器提交顺序决定记录最终值，设备时钟不参与裁决。
7. 用户能区分已同步、待同步、离线、可重试失败和需要处理。
8. 已保存 AI 推荐可离线查看，AI 生成和来源解析在离线时明确不可用。
9. v2 轻量备份包含全部约定的用户可见数据且不含图片和密钥。
10. 默认恢复只安全合并，不覆盖、复活或删除现有数据。
11. 完整 v2 备份可在明确确认后事务式全量回滚。
12. v1 备份只能安全合并，不能全量回滚。
13. 旧 IndexedDB 队列迁移失败时不会被清空或继续错误上传。
14. 全量回滚后，其他设备的旧代次 Outbox 不会自动覆盖恢复结果。
15. RLS 和同用户关联约束可以阻止跨用户数据访问和引用。
16. JSON、CSV 和可选完整图片备份继续可用。

## 19. 非目标

本轮不实现：

- 字段级自动合并；
- CRDT、事件溯源或永久操作日志；
- 用户可见逐条版本历史；
- WebDAV 或第三方云盘自动备份；
- 蓝牙秤、原生 App、微信小程序或社区功能；
- AI 离线生成或来源离线解析；
- 为未来假设规模提前实现复杂增量同步。

这些能力如需加入，必须先修订本设计或另立专项设计。
