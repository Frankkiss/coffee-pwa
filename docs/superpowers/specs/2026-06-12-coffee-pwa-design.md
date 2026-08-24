# 安卓优先咖啡豆仓与冲煮日志 PWA 设计草案

日期：2026-06-12

## 设计修订

自 2026-08-08 起，数据安全、离线写入、多设备同步、备份恢复和 Supabase 加固以
[`2026-08-08-coffee-data-safety-sync-design.md`](./2026-08-08-coffee-data-safety-sync-design.md)
为详细设计依据。本文件仍是产品总设计；若两份文档在上述范围内存在差异，以 2026-08-08 专项设计为准。

自 2026-08-23 起，包装图片来源导入以 [`2026-08-23-deepseek-vision-source-import-design.md`](./2026-08-23-deepseek-vision-source-import-design.md) 为准；浏览器本地 OCR 已由服务端 DeepSeek 视觉模型替代。

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
- 来源导入：仅接受用户粘贴的商品详情文字和用户主动上传的包装图片；不读取或抓取用户提交的网址。
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

新增豆子时支持以下方式：

- 手动录入。
- 粘贴商品详情文字辅助录入。
- 使用已批准的图片/多模态入口辅助录入。

手动录入把拼配豆视为一包成品豆。选择“拼配豆”后，继续填写袋级产地、处理法、品种、风味和备注，
但不显示“拼配组成”或“拼配说明”，避免要求用户重建烘焙商未公开的配方。已有
`blend_components` 与 `blend_notes` 仍须在编辑保存、同步、备份恢复和旧数据兼容中原值保留；
在推荐、来源导入和所有兼容链路完成独立改造并经用户确认前，不得删除字段、清空旧值或执行破坏性迁移。

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
- 剩余豆量；允许为 0，未记录时为 null。
- 购买价格。
- 购买日期。
- 豆袋照片或压缩图片。
- 来源网址。
- 备注。

剩余豆量是用户可见库存数据，必须作为豆子的一等字段贯穿录入与编辑、IndexedDB、本地 Outbox、同步 wire payload、
Supabase Postgres、服务器快照、JSON/CSV 导出和备份恢复。旧版离线数据中的 `remaining_grams` 必须原值迁移；
任何升级都不得静默丢弃、改写进备注或仅保留在临时恢复文件中。

来源导入只处理用户主动提供的商品详情文字和包装图片。图片通过 Supabase Edge Function 交给已批准的 DeepSeek 视觉模型解析，不在浏览器执行 OCR，也不持久化原图。前端不得提供网址抓取输入；`import-source` 即使收到伪造的 `url` 字段也必须稳定拒绝，且不得发起任何外部页面请求。解析结果仅作为待确认草稿，用户确认后才写入豆仓。

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
- 规范化冲煮方式：热手冲、冰手冲、冷萃或意式。
- 具体方法：保留现有下拉选项手冲、爱乐压、法压、冷萃、意式和摩卡壶。
- 冷萃子类型：直接饮用或浓缩基底。
- 冰手冲冰块重量。
- 意式杯中出液重量。
- 粉水比。
- 水温。
- 总时间。
- 注水阶段。
- 口感评分。
- 酸、甜、苦、涩、醇厚度、余韵。
- 风味标签。
- 是否钉为推荐方案。
- 备注。

规范化冲煮方式与具体方法采用双向联动，但承担不同职责：规范化方式决定表单字段、计量约束、历史匹配和推荐规则；
具体方法保留用户真实使用习惯。选择具体方法时自动切换到兼容的规范化方式：冷萃对应冷萃，意式和摩卡壶对应意式，
爱乐压和法压对应热手冲；手冲在当前为冰手冲时保留冰手冲，否则对应热手冲。反向选择规范化方式时，仅在当前具体方法
不兼容时自动改为该方式的默认方法：热手冲和冰手冲默认手冲，冷萃默认冷萃，意式默认意式。界面继续显示完整的原有
具体方法下拉框；用户选择会立即触发联动，不允许保存规范化方式与具体方法相互矛盾的新记录。

旧记录必须兼容：已有 `brew_mode` 时以其为规范化事实；缺少 `brew_mode` 时只根据可识别的旧 `method` 在读取和编辑草稿中推断，
不得未经用户保存确认批量回写、覆盖或迁移原记录。无法识别的旧方法原值保留，进入编辑时要求用户确认规范化方式后再保存。

### 冲煮模板库

系统模板收敛为 20 个可直接执行的核心模板，并与规范化冲煮方式保持一致：热手冲 11 个、冰手冲 2 个、
冷萃直接饮用 2 个、冷萃浓缩基底 2 个、意式 3 个。系统模板不再提供摩卡壶、法压壶、爱乐压、
Switch、聪明杯等当前范围外方法，也不再把冠军配方单独作为模板类型。每个核心模板必须包含明确粉量、
用水或出液量、温度、总时间、可执行步骤、适用方向和来源说明；参数以可复现的家庭冲煮范围表达，
不能仅复制来源标题或宣传文案。

模板页以规范化冲煮方式作为唯一主筛选，并按“我的模板”在前、“系统核心模板”在后分区展示。
现有用户自定义模板继续保留原数据结构和完整可见性；无法映射到新方式的旧用户模板仍显示在“我的模板”中，
不得静默删除或改写。移除旧系统模板只影响当前内置模板列表和推荐候选池，不迁移、不覆盖用户模板、
既有冲煮记录、已保存推荐或备份数据。

系统模板使用显式的 `brewMode` 标识热手冲、冰手冲、冷萃或意式；冷萃另用 `brewVariant` 区分直接饮用与
浓缩基底。推荐规则必须使用这些显式元数据筛选候选模板，不再依赖模板 ID 前缀或模糊文本判断。

### 推荐

用户选择豆子、冲煮方式、本次器具和磨豆机后，系统先在同方式历史与模板中生成确定性基础配方，
再交给 DeepSeek 在规则边界内解析优化。支持热手冲、冰手冲、冷萃和意式；冷萃区分直接饮用与浓缩基底。
剩余豆量不进入推荐规则或 AI 请求。推荐规则不再依赖拼配组成字段，只读取袋级豆子信息。

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
加入 `remaining_grams` 原值迁移后，current `migrationVersion` 提升到 `11`，旧 v10 及更早 completion 继续走
upgrade-required。

legacy 迁移必须接受可选 `AbortSignal`。composition root 在登出、切换账号、session generation 变化或 StrictMode cleanup 时先
abort 旧 generation，再停止其 SyncManager。IndexedDB 迁移事务建立后必须监听 abort 并调用 `transaction.abort()`；每轮读取完成、
排队写入实体/Outbox 和写 migration meta 前都要检查 signal。取消使用稳定本地取消错误，不发布 `needs_attention`，必须移除监听器，
且事务回滚后 v2、v3 与 migration meta 保持原样。旧 migration promise 无论何时完成，都不得启动 manager 或发布状态。

认证退出必须在调用 `supabase.auth.signOut()` 前同步暂停当前 sync runtime：立即 abort 当前 legacy migration generation、停止 manager、
失效所有旧 callback，并阻止普通 render 重新启动。暂停接口返回幂等 resume 令牌；退出成功后保持暂停直到 session change/unmount，
退出失败时仅当组件仍 mounted 且 user/session 未变化才恢复一个新 generation。确认取消不得暂停；退出请求悬挂期间 timer、online、
realtime 与在途 RPC 的迟到 callback 均不得写本地 storage 或发布状态。

legacy create 的确认预览只能显示安全比较摘要。客户端从当前 attention mutation 中按实体类型挑选最少字段：咖啡豆仅名称、烘焙商、
产地、烘焙日；冲煮仅方法、冲煮时间与不含 UUID 的关联豆摘要；模板仅名称；设置仅单位。不得显示备注、来源 URL、完整 payload、
数据库 ID、token 或其他敏感字段。云端候选也只能使用同一类安全 DTO。缺少可区分摘要，或同一预览中的本地 legacy 咖啡豆不能彼此
区分时，界面显示“无法安全比较”，禁止确认重新上传，但仍允许放弃并恢复。

同步失败文案不得直接显示 `lastErrorMessage`。界面只按稳定 error code 映射本地白名单中文说明；未知 RPC、Postgres 或原始服务端消息
统一显示可行动的通用说明，并可单独复制非敏感 code。SQL、URL、备注、payload、实体 ID 与 mutation ID 禁止进入 DOM。

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

完整备份是轻量逻辑备份的可选增强：ZIP 必须始终包含可独立恢复的 `backup.json`；任何图片抓取、校验、解码或压缩失败只写入图片清单的稳定错误码，不能阻断或削弱逻辑备份。完整备份最多处理 100 张图片，单张响应最多 5 MB，每张超时 10 秒，并限制并发与进程内图片字节总预算，避免移动设备出现突发内存占用。

图片抓取仅允许 `https:`，或与当前应用同源的 `http:` 地址；请求不得携带 cookie、凭据或 referrer。重定向后的最终地址必须重新校验协议与来源。只接受 JPEG、PNG、WebP，声明的 MIME 必须与文件魔数一致。文件名由实体类型和实体 ID 确定生成，禁止使用远端文件名，避免路径穿越和重名覆盖；每张归档图片记录 SHA-256。

可解码图片最长边压缩至不超过 1600 像素，并优先编码为质量 0.82 的 WebP；浏览器不支持安全编码或编码结果更大时保留已校验的原压缩字节。完整 ZIP 的条目顺序与时间戳固定，确保相同输入生成确定性归档。界面将“包含可访问图片的完整 ZIP”作为次级操作，并明确说明不可访问图片会在清单中报告。

不保存原图。上传或拍摄图片后，应用应压缩为适合查看的尺寸，减少长期存储压力。

### 恢复前保护

不保留逐条修改历史，也不依赖浏览器内的滚动快照。执行全量回滚前必须先从 Supabase 生成并下载一份
恢复前完整备份；数据库结构升级前另行创建生产数据备份并核对记录数量和关联完整性。

### 备份提醒

首页从 Supabase 的备份元数据读取上次手动导出时间。超过用户设置的周期（默认 7 天）时提醒备份，
不再只依赖单台设备的 `localStorage`。

跨设备提醒通过仅限已登录用户调用的 `get_latest_backup_export()` 读取当前用户最新、未删除的
`backup_exports.created_at`。响应只能是 `null`，或恰好包含 `exportedAt`、`fileName` 的对象；时间必须是
RFC 3339，文件名必须是非空安全文件名。函数内部只依据 `auth.uid()` 过滤并按 `created_at desc, id desc`
确定唯一最新记录，不能接受客户端传入的用户 ID，也不能泄露其他用户的元数据。

`kaday:last-json-backup` 仅保留一个稳定版本的只读兼容窗口：只有云端查询成功且明确返回无记录时才允许
读取本地旧值。云端查询失败、账号切换、组件卸载或较旧异步请求晚到时，都不得把旧本地值显示成云端结果；
应用不得再写入该键。提醒周期来自离线优先的用户设置仓库，缺失或读取失败时使用 7 天。

### 恢复

默认恢复为安全合并，只加入真正缺失的数据且不覆盖、复活或删除现有记录。全量回滚仅接受完整 v2 备份，
必须预览影响、下载恢复前备份并明确确认，然后在单个数据库事务中执行；缺失记录使用软删除，任何错误都回滚。
旧 v1 备份可以迁移后安全合并，但不能用于全量回滚。

安全合并必须在与同步相同的用户级事务锁内重新完成完整格式、计数、校验和、重复 ID 与关联校验，不能把预览结果当作授权。
服务端按 `profile → userSettings → beans → brewTemplates → brewLogs → aiRecommendations → sourceImports` 的依赖顺序处理，
并把 profile 主键及所有 `user_id` 统一重写为当前登录用户。记录 ID 在全局范围已经存在时，无论属于当前用户、其他用户、
处于活动状态还是已软删除，都只能计为跳过；安全合并不得更新、复活或删除任何既有记录，也不得改变 `sync_epoch`。
依赖记录只能引用本次确实会插入的豆子或当前用户现有的活动豆子；跨用户 ID 碰撞、已软删除豆子和缺失豆子均不能满足关联。
任一选中记录校验或写入失败时，七个分区的全部写入必须随同一事务回滚。

安全合并响应只允许根字段 `mode` 与 `counts`；`mode` 固定为 `safe_merge`，`counts` 必须恰好包含七个逻辑分区，
每个分区只包含非负整数 `inserted` 与 `skipped`，两者之和等于该次选中的有效传输记录数。空的 `profile` 或
`userSettings` 计为 `0/0`。v1 衍生传输包只处理其声明的三个权威分区，其余空传输分区必须保持 `0/0`。
在全量回滚任务完成前，客户端只能调用 `safe_merge`，不得提供可调用的 `full_rollback` 恢复入口。

浏览器解析备份时必须先严格校验根对象、对应版本的全部字段和类型、记录计数、分区内重复 ID，以及跨分区 UUID 关联，
再进入预览或恢复。备份中的 `user_id` 仅是来源审计信息，不能作为当前登录用户的归属证明；服务端恢复时必须统一重写归属。
任何 v1 文件或 v1 衍生传输包都固定为 `fullRollbackEligible: false`，客户端提供的同名字段、确认文本或其他未知字段均不能提升资格。
v1 只允许把实际存在的 `beans`、`brewLogs`、`brewTemplates` 列入 `authoritativeSections`；缺失分区以空数组传输，
但不得冒充权威分区。引用文件内不存在豆子的冲煮记录属于无效关联，必须报告并排除，不能静默改为无豆记录。

v2 只有在完整结构校验及 SHA-256 复核均成功后才具备全量回滚资格。校验和不匹配使用稳定错误码
`BACKUP_CHECKSUM_MISMATCH`，面向用户显示“备份校验失败，文件可能已损坏或被修改”，不得继续预览或恢复。

### 导出格式

第一版支持：

- JSON：完整恢复使用。
- CSV：用于 Excel、Notion 或其他工具查看。

v2 JSON 的逻辑数据必须在浏览器和 PostgreSQL 中生成完全相同的规范文本后再计算 SHA-256。对象键按字典序排列、数组保持原序，字符串使用 JSON 转义且不加入无意义空白。数值只接受两端可逐字一致的 JSON 数值子集：有限值、绝对值小于 `1e21`，且十进制写法不触发 JavaScript 指数格式或精度归并；不符合时服务端必须拒绝导出并要求先修正数据，不能生成浏览器无法复核的校验和。

备份下载记录只能在浏览器已成功发起文件下载后写入。服务端从登录会话确定用户并生成时间戳；文件名、备份模式以及七个逻辑分区的计数必须严格校验，客户端不能指定或覆盖 `user_id`。

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
attention 操作还必须使用 UI generation token 和稳定 item key（至少包含 mutationId、error code、status、attempt count 与 base epoch）。
切换条目、同 ID 状态变化、组件卸载或更新操作开始时必须使旧 token/预览失效；慢请求不得覆盖更新请求，过期预览不得用于确认。

## AI 设计

第一版 AI 能力聚焦于冲煮方案建议，不做闲聊机器人。

### AI 输入

AI 请求只能包含必要上下文：

- 新豆信息。
- 用户选择的器具。
- 用户可用磨豆机。
- 3 到 5 条相似历史冲煮记录。
- 用户偏好，例如喜欢明亮、甜感、低苦味。
- 用户粘贴的有限商品详情文字或主动上传的单张包装图片。
- 已批准的图片/多模态入口提取出的有限候选豆子信息。

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
- DeepSeek 不直接浏览网页；系统也不代用户读取网址。Edge Function 仅对用户主动提交的文字或已批准的图片/多模态输入执行有界解析。
- 来源导入生成的内容只能作为草稿或候选列表，必须由用户确认后保存。
- 不提供 `coffeer.net/beans` 或其他站点适配器，不扩展为全网自动抓取。

当前来源导入与冲煮推荐统一通过 Supabase Edge Function 调用 `deepseek-v4-flash-vision-exp`，共享服务端 Secret `DEEPSEEK_VISION_API_KEY`；来源导入发送图片/文字内容块，冲煮推荐只发送规则计算后的结构化文本上下文。

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
