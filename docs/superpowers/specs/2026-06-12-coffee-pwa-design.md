# 安卓优先咖啡豆仓与冲煮日志 PWA 设计草案

日期：2026-06-12

## 设计修订

自 2026-08-08 起，数据安全、离线写入、多设备同步、备份恢复和 Supabase 加固以
[`2026-08-08-coffee-data-safety-sync-design.md`](./2026-08-08-coffee-data-safety-sync-design.md)
为详细设计依据。本文件仍是产品总设计；若两份文档在上述范围内存在差异，以 2026-08-08 专项设计为准。

## 目标

制作一款个人长期使用的咖啡工具，优先服务安卓手机。第一版采用 PWA + 云数据库方案，不做蓝牙秤、社区分享或复杂设备生态。核心目标是稳定记录咖啡豆信息、冲煮记录，并结合历史记录与 AI 辅助推荐新豆的冲煮方案。

第一版直接接入云数据库，同时保留本地缓存和文件导出能力。数据必须可导出、可恢复、可迁移，不能被云服务或单一工具锁死。

## 使用场景

用户在手机上打开已安装到桌面的 PWA，完成以下操作：

1. 录入一支新咖啡豆，包括处理法、产地、品种、处理站、海拔、烘焙日期和风味信息。
2. 每次冲煮后记录器具、研磨度、水温、粉水比、时间、评分和口感反馈。
3. 准备冲煮新豆时，输入豆子信息，系统根据历史相似豆子和高评分记录推荐可尝试的方案。
4. 登录后将豆仓和冲煮记录同步到云数据库。
5. 在需要建议时调用 DeepSeek API，由 AI 结合历史记录和豆子信息生成推荐。
6. 定期导出轻量备份，必要时从备份文件恢复数据。

## 第一版范围

### 必做功能

- 豆仓管理：新增、编辑、删除、搜索、筛选咖啡豆。
- 冲煮日志：新增、编辑、删除、查看每次冲煮记录。
- 风味与评分：记录酸、甜、苦、涩、醇厚度、余韵、整体评分和文字备注。
- 来源导入：支持单页 URL 辅助录入，以及 `coffeer.net/beans` 的轻量候选导入。
- 相似豆推荐：根据处理法、产地、品种、烘焙度、风味标签、海拔和历史评分推荐方案。
- AI 辅助推荐：通过服务端函数调用 DeepSeek API，根据用户历史记录生成建议。
- 云数据库：第一版接入 Supabase Postgres，保存豆仓、冲煮日志、推荐结果和备份元数据。
- 账号登录：使用 Supabase Auth，让数据归属于单个用户。
- 本地数据层：使用 IndexedDB 保存可离线管理的数据、权威快照和统一待同步队列。
- PWA 安装：支持安卓 Chrome 添加到主屏幕。
- 弱网使用：无网时仍能打开并查看已缓存数据；新增或编辑数据先进入待同步队列，联网后再提交。
- 备份恢复：支持版本化 JSON 完整数据导出、安全合并、明确确认后的全量回滚，以及 CSV 导出。

### 暂不实现

- 蓝牙秤连接。
- iOS 原生 App。
- 微信小程序。
- 社区分享。
- 自动搜索全网并批量抓取豆子资料。
- 复杂多模型调度。
- 向量数据库和语义检索。
- 自动训练个人模型。

## 页面结构

### 首页

首页服务于手机快速操作，显示：

- 新增冲煮记录按钮。
- 新增咖啡豆按钮。
- 最近冲煮记录。
- 当前豆仓摘要。
- 云同步状态。
- AI 推荐入口。
- 上次导出备份时间。
- 备份提醒。

### 豆仓

豆仓展示所有咖啡豆，可按状态、处理法、产地、烘焙商、风味标签筛选。

新增豆子时支持三种方式：

- 手动录入。
- 粘贴单个商品页或烘焙商页面辅助录入。
- 粘贴指定站点入口进行候选导入。

单支豆子字段：

- 名称。
- 烘焙商。
- 产地。
- 庄园或处理站。
- 处理法。
- 品种。
- 海拔。
- 烘焙日期。
- 烘焙度。
- 风味标签。
- 净含量。
- 购买价格。
- 购买日期。
- 豆袋照片或压缩图片。
- 来源网址。
- 备注。

来源导入分为两种模式。

模式一：单页 URL 辅助录入。

1. 用户粘贴烘焙商页面、商品页面或豆单页面链接。
2. 前端调用 Supabase Edge Function。
3. Edge Function 抓取该指定链接的页面内容，并抽取正文文本。
4. Edge Function 将有限页面文本交给 DeepSeek，让 AI 输出结构化豆子字段。
5. 前端展示“待确认草稿”，用户必须手动确认后才写入豆仓。
6. 如果页面无法访问、内容过少或字段不可靠，系统提示用户手动补全。

模式二：指定站点候选导入。

第一版只支持 `https://www.coffeer.net/beans` 作为轻量导入来源。

1. 用户粘贴 `https://www.coffeer.net/beans`。
2. 前端识别为已支持的指定站点。
3. Edge Function 读取公开页面和必要的公开前端资源。
4. 系统从公开可访问内容中提取豆子候选信息。
5. AI 将候选信息整理为统一字段。
6. 前端展示候选列表，用户勾选需要保存的豆子。
7. 被选中的候选豆子进入待确认草稿，用户确认后才写入豆仓。

该功能不做全网搜索、不高频批量抓取、不自动定时同步、不绕过登录墙或反爬限制。`coffeer.net/beans` 导入器只是指定站点适配器，不是通用爬虫平台。

### 冲煮日志

每条冲煮记录绑定一支咖啡豆。

字段：

- 咖啡豆 ID。
- 冲煮日期。
- 器具。
- 滤纸。
- 磨豆机。
- 研磨度。
- 粉量。
- 水量。
- 粉水比。
- 水温。
- 总时间。
- 注水阶段。
- 口感评分。
- 酸、甜、苦、涩、醇厚度、余韵。
- 风味标签。
- 是否钉为推荐方案。
- 备注。

### 推荐

用户选择或录入一支新豆后，系统先计算历史记录相似度，再将候选历史记录和新豆信息交给 AI 生成建议。

推荐结果包括：

- 推荐粉水比。
- 推荐水温。
- 推荐研磨度。
- 推荐总时间。
- 推荐器具。
- 推荐理由。
- 参考的历史记录。
- AI 生成的调整建议。
- 用户是否采纳。

第一版推荐必须保留可解释的规则评分。AI 只在规则筛选出的候选记录基础上生成建议，不能直接替代历史数据检索。

## 推荐算法第一版

第一版使用规则评分作为推荐基础：

```text
相似度 =
处理法匹配 * 25
产地匹配 * 20
品种匹配 * 15
烘焙度匹配 * 15
风味标签重合 * 15
海拔接近 * 5
烘焙日期阶段接近 * 5
```

推荐时优先选择相似度高且评分高的历史冲煮记录。展示推荐理由时，要明确说明来自哪些相似记录。

AI 辅助推荐流程：

1. 用户输入或选择新豆信息。
2. 系统用规则评分找出最相似的历史记录。
3. 系统整理有限上下文，包括新豆信息、3 到 5 条相似历史记录、用户偏好和可用器具。
4. 前端调用 Supabase Edge Function。
5. Edge Function 在服务端读取 DeepSeek API Key 并调用 DeepSeek。
6. AI 返回建议粉水比、水温、研磨度、时间、操作步骤和调整理由。
7. 前端展示 AI 建议，并允许用户保存为候选配方。

DeepSeek API Key 不能放在前端代码、浏览器本地存储或公开配置中。它只能保存在服务端环境变量中。

## 数据安全与备份

数据安全是第一版核心功能。第一版既要使用云数据库，也要保留文件级导出备份。

### 云端数据

核心数据保存在 Supabase Postgres 中。所有用户数据表必须包含 user_id，并启用 Row Level Security，确保用户只能访问自己的数据。

云端保存：

- 咖啡豆档案。
- 冲煮记录。
- 推荐结果。
- 备份元数据。
- 用户设置。

### 本地数据与统一同步

手机和电脑均使用 IndexedDB 作为本地工作层，但 Supabase 仍是登录用户的云端事实来源。豆子、冲煮记录、
自定义模板和用户设置允许离线新增与编辑；已有 AI 推荐允许离线查看；AI 生成和来源解析必须联网。

所有页面通过统一数据仓库和 `SyncManager` 读写，不再各自维护同步逻辑。一次本地修改必须在同一个 IndexedDB
事务内更新实体并写入统一 `outbox`。联网后由认证 Supabase RPC 原子提交，成功后再拉取服务器权威快照。
冲突采用“最后成功写入服务器者为准”，不使用设备本地时钟，也不保留逐条修改历史。

业务 Repository 可以先读取当前用户实体来构造完整 row，但该预读不能作为最终安全判定。每次 create、update 或 delete
必须把存在性、active 状态与版本前置条件交给本地实体仓库，并在更新实体与写入 `outbox` 的同一个 user-scoped IndexedDB
`readwrite` 事务内重读和验证：create 只允许目标缺失；update/delete 只允许目标属于当前用户、未软删除且 `updated_at`
仍等于业务 Repository 预读的版本。任一前置条件不符必须稳定拒绝且零写，防止并发 delete 后被陈旧 update 复活，或并发
update 被陈旧完整 row 覆盖。用户设置以 `userId` 为稳定实体 ID，create 同样只允许缺失，已有设置必须走 update 并保留原
`created_at`。

为保证 `updated_at` 可作为本地 CAS 版本，成功的 update/delete 必须产生严格晚于事务内当前行 `updated_at` 的 provisional
时间戳，即取 `max(context.now(), current.updated_at + 1ms)` 并输出 strict ISO。即使多个操作落在同一毫秒或设备时钟回拨，首个
成功写入也必须改变版本；无法生成合法的下一版本时稳定拒绝且零写。本地实体仓库在事务内除匹配 `expectedUpdatedAt` 外，还要
强制新实体（delete 时包括 tombstone 的 `updated_at`/`deleted_at`）满足该单调条件，不能只依赖业务 Repository 正确调用 helper。
同一次 Task 10 写入的 mutation `queuedAt` 必须复用该实体的 provisional `updated_at`，不得再次读取 raw 本地时钟；create 的
`created_at`、`updated_at` 与 `queuedAt` 相同，update/delete 的 `queuedAt` 与上述单调时间为同一 instant。这样设备时钟回拨时
`listOutbox` 仍保持同实体 create→update/delete 因果顺序，发送阶段压缩不会错误保留旧 payload。本地实体仓库对所有带原子
前置条件的写入强制 `mutation.queuedAt` 与新实体 `updated_at` 为同一 instant；delete 还必须满足 tombstone 的
`deleted_at`、`updated_at`、`queuedAt` 三者为同一 instant，任一不符稳定拒绝且零写。
跨实体依赖不得假设本地时钟排序等同于创建顺序：Task 7 必须从完整的压缩节点集合识别 Brew upsert 所引用的 Bean upsert，
建立 Bean→Brew 拓扑边后再按时间稳定排序。设备时钟回拨导致 Brew 排在 Bean 前时仍须先发送 Bean；没有对应本地 Bean
upsert 时不得伪造依赖，且既有 Bean delete/recovery 顺序不得形成环或丢失 `coveredMutationIds`。
同理，所有引用该 Bean 状态的 Brew upsert 必须先于相关 Bean delete 发送，不得要求 delete 在墙钟或输入顺序中位于 Brew
之后。Bean 自身压缩节点的同实体顺序是可靠因果链：若链中存在 upsert，以最后一个 upsert 作为唯一恢复基点，统一建立
`历史 delete → latest Bean upsert → 全部 matching Brew upsert → latest-upsert 后的 Bean delete`；恢复前的历史 delete 不得
反向连边。若完全没有 Bean upsert，则全部 matching Brew 必须先于该链中的全部 Bean delete，以保持无环且不丢 coverage。

本地实体仓库必须在验证 entity、mutation 与事务前置条件后、第一次 `await` 或打开 IndexedDB 前，对整个待写对象图执行
同步 structured-clone 快照；实体、mutation、payload 及嵌套数组/对象随后都只使用该快照。调用方在 promise 已发起后继续
修改共享引用，不能改变最终实体或 Outbox 内容，也不能绕过 wire validator。

旧版本升级时，legacy snapshot 只作为本地 materialized cache 和完整实体基线，不能视为服务器已接收写入的证明。
snapshot 的 `updatedAt` 仅用于格式校验和迁移审计，不能据此确认或丢弃 `pendingMutations`。迁移阶段必须把当前用户
的每一条合法 pending 写入一对一转换进 v3 Outbox，不在落盘前做破坏性压缩。发送阶段才由 Task 7 的
`selectSendableMutationBatch` 保守压缩，并通过 `coveredMutationIds` 保留所有源 mutation 的确认范围；只有服务器 RPC
返回成功回执后才允许 acknowledge。迁移结果必须始终保留一条 legacy pending 对应一条 v3 Outbox row；任何压缩都只能发生在
发送选择的内存结果中，不能改写迁移落盘记录或丢失 coverage。迁移不得因为 cache 写入时间较新而吞掉尚未同步的 create、
update 或 delete。

迁移完成记录必须带有精确的 current algorithm `migrationVersion`，并满足
`counts.sourceMutations === counts.migratedMutations`。缺失版本、旧版本或不满足该不变量的 completed 记录都不能当作
当前迁移已完成，也不能自动清空 v3 后重跑：中间版本可能已经产生新的 v3 编辑，客户端无法可靠区分。此时必须以稳定的
`LEGACY_MIGRATION_UPGRADE_REQUIRED` 错误安全拒绝，保持 v2/v3 与原 meta 原样，并引导用户导出 legacy recovery data。
首次正式发布只写 current version 的完成记录。

current migration algorithm 还必须证明 snapshot 中每个 `local-bean-*` 与 `local-brew-*` 实体身份都有同类型、同 ID 的
合法 legacy pending `create`；brew snapshot 中的本地 `bean_id` 引用也必须有对应 bean create 链。缺少该证据时，客户端
无法判断本地 ID 是否已经上传过，禁止合成 upsert 以免在云端重复创建。迁移应提升 algorithm version，并稳定抛出
`LEGACY_MIGRATION_RECOVERY_REQUIRED`，提示 `exportLegacyRecoveryData`，同时保持 v2、v3 与 migration meta 全部原样。

即使存在合法 local create 链，也无法证明旧客户端是否已经把 create 提交到服务器后丢失响应。迁移必须保留可见实体和
一对一 Outbox，但把同一 local entity 的 create/update/delete 全链标为 `needs_attention`；任何时点引用 local bean 的 brew
entity mutation 全链也必须隔离。隔离项使用稳定 `lastErrorCode: LEGACY_CREATE_REQUIRES_CONFIRMATION` 与说明
`Legacy create may already exist in cloud; compare the latest cloud snapshot and explicitly retry.`，绝不能进入自动 sendable batch。
Task 9 的用户重试流程负责拉取并比较云快照，只有用户确认后才生成或放行使用 current sync epoch 的 mutation；Task 8
不实现自动确认、自动重试或可能重复创建的猜测。

`SyncManager` 的生命周期依赖必须显式注入 online、visibility 和 Realtime wake-up 订阅适配器；核心管理器不得直接读取全局
`window`、`document` 或 Supabase client。`start()`/`stop()` 必须幂等，且每次 start 建立独立 generation；停止后的旧事件、定时器、
Realtime 回调和异步结果不得再写 storage 或发布状态。composition root 在后续任务中负责把浏览器事件与
`subscribeToSyncWakeups` 绑定到这些适配器，并保证所有清理函数只执行一次。

`applyBatch` 在调用服务器前必须验证请求中每个 `mutationId` 唯一；重复 ID 使用稳定本地验证错误拒绝，RPC 不得发出。
响应回执必须按原始请求长度与 ID 一一对应，不能用 `Map` 或集合去重掩盖重复请求、重复回执、缺失或额外回执。

本地 Outbox 持久化与读取必须复用与 wire mapper 相同的运行时边界：UUID、实体/操作判别、完整 mutable payload allowlist、
`schema_version`、有限数值、时间与领域约束任一不满足时，新的实体加 Outbox 事务必须在写入前拒绝；已有 current-user owned row
必须分类为 `LOCAL_SYNC_DATA_CORRUPT`。`needs_attention` 等纯本地状态字段不影响 wire payload 校验。`SyncManager` 必须在任何
`markMutationsSyncing` 前逐项完成 wire 映射；单项 `INVALID_SYNC_OPERATION` 只隔离其全部 `coveredMutationIds`，随后从更新后的内存
Outbox 重新选择批次，使依赖该非法项的 mutation 不会误发，同时继续上传其余合法、无依赖冲突的项。未知 mapper 异常保持
mutation 为 pending 并发布失败；marked、sent 与 acknowledged IDs 只能来自成功映射且实际发送的 selection。

跨标签锁回调必须接收协作式 `SyncLockGuard`，至少提供 `signal` 与异步 `assertHeld()`。Web Locks guard 在回调期间始终有效；
IndexedDB lease guard 的续租返回失主或抛错时必须 abort signal，并捕获续租拒绝。`assertHeld()` 每次在原子只读事务内确认 owner
仍是当前持有者且 lease 尚未过期。`SyncManager` 在锁内每个 await 之后，以及每次后续 storage 写、API 下一步和状态发布之前，
必须同时验证 generation 与 guard。页面挂起导致 lease 过期并被另一标签页接管后，旧标签页恢复时允许已经在途的 RPC 完成，
但不得再 acknowledge、替换快照、标记队列或发布状态；旧 owner 的 release 也不得删除新 owner lease。

push 与随后的快照获取都成功时，确认 covered Outbox IDs 与安装服务器快照必须使用
`acknowledgeMutationsAndReplaceSnapshot(userId, coveredIds, snapshot)` 在一个 user-scoped IndexedDB readwrite 事务内完成。
事务先完整验证 confirmed IDs、归属、本地 envelope 与 snapshot 单调性；计算本地 overlay 时排除将确认的 IDs，再写入五类服务器
权威行、更新 sync meta 并删除 confirmed Outbox。任一步失败全部回滚。若 apply 回执已验证但 `getSnapshot` 失败，仍只单独
acknowledge 已确认 IDs 且不替换 cache；Outbox 为空的普通 pull 继续使用 `replaceServerSnapshot`。

对 `LEGACY_CREATE_REQUIRES_CONFIRMATION`，`retryMutation(mutationId, { confirmLegacyCreate?: boolean } = {})` 返回判别结果。
未确认时必须在跨标签锁内先获取并完整验证最新服务器快照，再读取当前用户 Outbox；返回 `confirmation_required` 预览，其中
包含目标 mutation、将被释放的关联链，以及当前用户云端同类型候选的安全比较字段，但不得修改队列。不得根据 legacy local ID
推断云端不存在。显式确认时必须再次获取新鲜、已验证的快照，再调用 user-scoped 原子 storage 操作：事务内重新验证目标与
关联链仍属于该用户、仍全部处于 `needs_attention/LEGACY_CREATE_REQUIRES_CONFIRMATION`，且关联链与预期集合完全一致；随后一次性
把同 local-create 根实体的完整链，以及引用该 local bean 的每个 brew 实体完整链，改为 `pending`，清空错误，并把每行
`baseSyncEpoch` 更新为该新鲜快照的 `syncEpoch`。任一行缺失、归属或状态变化、或链集合并发变化时全事务拒绝；只有原子释放成功后
才允许启动同步。禁止仅改单行、复用旧 epoch 或在预览阶段写入。

legacy bean/brew snapshot 完整 row 必须显式携带 `schema_version: 1`。真实 v2 bean/brew insert 与 update pending payload
原本不含该字段，因此允许缺失；一旦显式携带则只能严格等于 `1`。未来版本 `2`、`999` 等都不能降级成 v1，也不能
静默丢弃未知字段。snapshot row 或 non-delete pending payload 出现当前实体 schema 未知的字段时也必须拒绝。此类输入必须以
`LEGACY_MIGRATION_RECOVERY_REQUIRED` 中止并保留全部源数据；delete payload 例外。
bean `blend_components` 的每个 component 字段集合只允许 `origin`、`process`、`variety`、`percentage`、`role`、`notes`；
snapshot 或 pending payload 中出现任何嵌套未知字段都必须走同一 recovery-required 全事务回滚路径。

current algorithm 的完成记录还必须保存当前用户外层 legacy snapshot/pending envelope 的完整原始语义内容的稳定非敏感
`sourceFingerprint`；不得先按内层 row/payload 归属过滤。摘要使用稳定 key 序列化与排序，仅在 meta 中保存 digest，不保存
用户 payload。序列化必须对支持的 IndexedDB structured-clone 值使用稳定类型标记，区分普通对象、Date、Map、Set、ArrayBuffer、
typed array、undefined 与特殊 number，并用引用 ID 支持循环/共享引用，不能让它们与 `{}` 或彼此碰撞。completed 检查必须在
同一 IndexedDB 事务内重读源：摘要相同才可幂等返回；新增、删除记录或同 ID payload 改写均以
`LEGACY_MIGRATION_SOURCE_CHANGED` 安全拒绝，提示恢复导出并保持 v2、v3 与 meta 原样。禁止自动重跑或覆盖可能已有的新 v3
编辑。Blob、File 或任何不能完整同步指纹的 structured-clone 类型不读取异步内容字节，也永不视为 unchanged：首次迁移按既有
恢复失败语义拒绝，completed fast path 必须返回 `LEGACY_MIGRATION_SOURCE_CHANGED`。强化该门禁与前置嵌套字段校验后，
current `migrationVersion` 提升到 `10`，旧 v9 completion 继续走 upgrade-required。

### 轻量备份

默认备份为版本化轻量 JSON 文件，包含全部用户可见文字数据：豆子、冲煮记录、自定义模板、AI 推荐、
用户设置和必要的来源导入记录，不包含图片。

导出文件命名：

```text
coffee-backup-YYYY-MM-DD.json
```

该备份通常很小。即使包含 100 支豆子和 1000 条冲煮记录，预计大致在 1 MB 到 5 MB 量级，具体取决于备注长度。

### 图片备份

图片不进入默认备份。用户手动选择“完整备份”时，才包含压缩后的图片或缩略图。

不保存原图。上传或拍摄图片后，应用应压缩为适合查看的尺寸，减少长期存储压力。

### 恢复前保护

不保留逐条修改历史，也不依赖浏览器内的滚动快照。执行全量回滚前必须先从 Supabase 生成并下载一份
恢复前完整备份；数据库结构升级前另行创建生产数据备份并核对记录数量和关联完整性。

### 备份提醒

首页从 Supabase 的备份元数据读取上次手动导出时间。超过用户设置的周期（默认 7 天）时提醒备份，
不再只依赖单台设备的 `localStorage`。

### 恢复

默认恢复为安全合并，只加入真正缺失的数据且不覆盖、复活或删除现有记录。全量回滚仅接受完整 v2 备份，
必须预览影响、下载恢复前备份并明确确认，然后在单个数据库事务中执行；缺失记录使用软删除，任何错误都回滚。
旧 v1 备份可以迁移后安全合并，但不能用于全量回滚。

### 导出格式

第一版支持：

- JSON：完整恢复使用。
- CSV：用于 Excel、Notion 或其他工具查看。

## 云同步与第二阶段预留

第一版直接实现云数据库。同步字段、实体字段和技术队列字段分开管理；用户实体至少保留：

```text
id
createdAt
updatedAt
deletedAt
schemaVersion
```

`deviceId`、`syncStatus`、`lastSyncedAt` 和 `mutationId` 属于本地同步或短期幂等元数据，不能混入用户业务字段，
也不能被误认为逐条修改历史。

后续阶段可扩展：

- WebDAV 文件备份。
- 更细粒度的增量游标和字段级冲突合并。
- 图片对象存储。
- 向量检索。
- 更多模型供应商。

第一版不实现字段级冲突合并。多个设备均可新增和编辑，以最后成功提交到 Supabase 的完整记录为准；
界面必须显示待同步数量、最后同步时间和需要处理的失败记录。

## AI 设计

第一版 AI 能力聚焦于冲煮方案建议，不做闲聊机器人。

### AI 输入

AI 请求只能包含必要上下文：

- 新豆信息。
- 用户选择的器具。
- 用户可用磨豆机。
- 3 到 5 条相似历史冲煮记录。
- 用户偏好，例如喜欢明亮、甜感、低苦味。
- 用户手动提供的网址及该页面抽取出的有限文本。
- 指定站点导入器提取出的有限候选豆子信息。

### AI 输出

冲煮推荐场景中，AI 必须输出结构化结果：

- 推荐粉水比。
- 推荐水温。
- 推荐研磨度。
- 推荐总时长。
- 推荐注水步骤。
- 为什么这样推荐。
- 如果太酸、太苦、太淡时下一次如何调整。

来源导入场景中，AI 必须输出结构化豆子字段草稿：

- 名称。
- 烘焙商。
- 产地。
- 庄园或处理站。
- 处理法。
- 品种。
- 海拔。
- 烘焙度。
- 风味描述。
- 建议补充的缺失字段。
- 置信度或不确定说明。

### 安全边界

- DeepSeek API Key 只放在 Supabase Edge Function 环境变量中。
- 前端只能调用自有 Edge Function，不能直接调用 DeepSeek。
- AI 结果必须标注为建议，不覆盖用户自己的记录。
- 每次 AI 推荐结果可以保存，但必须和原始历史数据区分。
- 控制请求上下文长度，避免发送全部历史数据。
- DeepSeek 不直接浏览网页。页面抓取、正文抽取和内容截断必须由自有 Edge Function 完成。
- 来源导入生成的内容只能作为草稿或候选列表，必须由用户确认后保存。
- `coffeer.net/beans` 只作为第一版指定站点导入器，不扩展为全网自动抓取。

DeepSeek 官方文档显示其 API 支持 OpenAI/Anthropic 兼容格式，OpenAI 兼容 base_url 为 `https://api.deepseek.com`，示例模型包括 `deepseek-v4-flash` 和 `deepseek-v4-pro`。

## 技术方案

建议技术栈：

```text
Vite
React
TypeScript
Supabase Auth
Supabase Postgres
Supabase Edge Functions
IndexedDB + Dexie
vite-plugin-pwa 或 Workbox
DeepSeek API
轻量 CSS 或 Tailwind CSS
JSON / CSV 导入导出
```

部署方式：

- 前端可本地运行。
- 前端默认部署到 GitHub Pages。
- 使用 Git 管理版本，使用 GitHub 托管代码仓库。
- 使用 GitHub Actions 构建并发布前端。
- 云数据库、认证和 Edge Function 使用 Supabase。

GitHub Pages 部署注意事项：

- PWA 必须通过 HTTPS 访问，GitHub Pages 满足该要求。
- 如果站点部署在仓库子路径下，需要正确配置 Vite base、PWA manifest 的 start_url 和 scope。
- 前端路由优先使用 Hash Router，或配置适配 GitHub Pages 的 SPA fallback，避免刷新页面后 404。
- DeepSeek API Key 和 Supabase service role key 不能放在 GitHub 仓库或前端构建产物中，只能放在 Supabase Edge Function 的环境变量里。
- GitHub Actions 只负责构建和发布静态前端，不负责保存业务数据。

## 验收标准

第一版完成时，应满足：

1. 安卓 Chrome 可打开并添加到主屏幕。
2. 用户可以登录并访问自己的云端数据。
3. 可以新增、编辑、删除咖啡豆。
4. 可以新增、编辑、删除冲煮记录。
5. 数据写入 Supabase，并受 Row Level Security 保护。
6. 无网时仍可打开应用并查看已缓存数据。
7. 可以根据新豆信息生成相似历史记录推荐。
8. 可以通过 DeepSeek 生成 AI 辅助冲煮建议。
9. DeepSeek API Key 不出现在前端代码、浏览器存储或 Git 仓库中。
10. 可以导出轻量 JSON 备份。
11. 可以从 JSON 备份恢复。
12. 可以导出 CSV。
13. 默认备份不包含图片。
14. 完整备份可选包含压缩图片。
15. 首页能显示云同步状态、上次备份时间和超期提醒。

## 新手执行顺序

第一步不是写代码，而是确认这份设计是否准确表达需求。

确认后再进入实施计划，实施计划会把任务拆成更小的步骤，例如：

1. 初始化项目。
2. 创建 Supabase 项目。
3. 建立数据库表和 RLS 策略。
4. 接入登录。
5. 建立本地缓存。
6. 做豆仓页面。
7. 做冲煮记录页面。
8. 做备份导出和恢复。
9. 做 PWA 离线与安装。
10. 做相似豆推荐。
11. 做 DeepSeek Edge Function。
12. 在安卓手机上验证。

## 参考资料

- DeepSeek API Docs: https://api-docs.deepseek.com/
- Supabase Docs: https://supabase.com/docs
- Supabase Edge Function Secrets: https://supabase.com/docs/guides/functions/secrets
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
