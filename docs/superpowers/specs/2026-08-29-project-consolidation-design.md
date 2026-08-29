# Coffee PWA 项目文档与目录整理设计

日期：2026-08-29

## 目标

在不改变任何用户数据、线上行为、同步协议、备份格式、恢复流程和数据库迁移历史的前提下，整理 Coffee PWA 仓库：

- 将仍有效的产品、数据安全和 AI 规则合并为少量稳定文档；
- 删除已经完成且被当前实现取代的阶段性设计和实施计划；
- 删除已经确认的重复文件、未使用资源和本地生成物；
- 建立清晰的项目入口和文档索引，避免后续继续依赖多份互相覆盖的日期文档；
- 用 Git 历史保留被删除文档的追溯能力。

## 审计结论

当前仓库工作树干净，共有 76 份受版本控制的文档。其中：

- `docs/superpowers/plans` 有 48 份阶段性实施计划；
- `docs/superpowers/specs` 有 22 份设计文档；
- `docs/operations` 有 6 份运维文档；
- 除 `AGENTS.md` 指向产品总设计外，业务代码和自动化流程不依赖这些日期文档路径。

已经确认的文件级冗余：

- `supabase/sql/001_initial_schema.sql` 与迁移 `20260612000000_initial_schema.sql` 内容相同；
- `supabase/sql/002_blend_beans.sql` 与迁移 `20260615000000_blend_beans.sql` 内容相同；
- `supabase/sql/003_brew_templates.sql` 与迁移 `20260615010000_brew_templates.sql` 内容相同；
- `app/public/favicon.svg` 与 `app/public/icons/icon.svg` 内容相同；
- `app/src/assets/hero.png`、`react.svg`、`vite.svg` 没有代码引用；
- `app/README.md` 仍是 Vite 模板说明，不是 Coffee PWA 项目文档。

本机还有不受 Git 管理的缓存和旧工作区：

- `.npm-cache` 约 348 MB；
- `.worktrees` 约 380 MB，其中已登记的两个功能分支均已合并且工作树干净，另外两个目录也没有未提交改动；
- `app/dist` 是可重新生成的构建产物；
- `.superpowers` 只剩空目录；
- `app/node_modules` 是当前开发依赖，不属于需要删除的冗余；
- 两个 Supabase CLI 可执行文件可能仍用于本地部署，本轮保留。

## 整理后的文档结构

最终只保留稳定路径，不再用日期文件串联当前规则：

```text
README.md
docs/
  README.md
  product-design.md
  data-architecture.md
  ai-recommendation.md
  operations/
    production-runbook.md
    deepseek-edge-function-setup.md
```

### `README.md`

作为仓库入口，说明项目用途、当前技术栈、目录结构、开发命令、测试命令、部署入口和文档入口。删除 Vite 默认 README，不重复保存两套项目介绍。

### `docs/product-design.md`

合并当前产品设计和用户可见行为，包括：

- 豆仓、SOE 与成品拼配豆的录入边界；
- 来源文字和包装图片导入，禁止网址抓取和浏览器 OCR；
- 热手冲、冰手冲、冷萃、意式四类冲煮记录；
- 冷萃子类型、冰量显示、冰手冲仅以热水计算粉水比；
- 精简后的系统模板库；
- 离线能力、AI 草稿确认和移动端使用原则。

### `docs/data-architecture.md`

合并当前数据安全专项设计中仍有效的架构契约，包括：

- Supabase 为登录用户云端事实源；
- IndexedDB 缓存、统一离线写入队列和多设备同步；
- 旧数据兼容、稳定 ID、冲突和重试规则；
- RLS、事务 RPC、备份恢复 v2、恢复前保护；
- 图片备份边界、来源记录和保留字段；
- 禁止破坏性迁移和静默覆盖的约束。

迁移 SQL、数据库测试和备份实现不因文档整理而修改。

### `docs/ai-recommendation.md`

合并来源解析和推荐专项设计中的当前规则，包括：

- `deepseek-v4-flash-vision-exp` 与服务端 `DEEPSEEK_VISION_API_KEY`；
- 来源图片/文字解析与草稿确认；
- 四类冲煮的确定性规则、模板筛选、历史记录匹配；
- 剩余量和拼配内部字段不得进入推荐；
- 大白话反馈解析、AI 优化边界、步骤和配方校验；
- 冰手冲比例、历史参考比例和错误降级策略。

### 运维文档

`production-runbook.md` 合并生产预检、灰度、回滚和当前稳定状态。日期化的 RC 与审批包只保留在 Git 历史，不继续作为当前操作入口。

`deepseek-edge-function-setup.md` 保留稳定路径并更新交叉引用，继续只记录 Secret 名称和部署方式，不记录密钥值。

## 删除与保留边界

### 删除

- 已完成并被当前设计或实现取代的 48 份实施计划；
- 内容已合并的旧专项设计与旧产品总设计；
- 日期化的生产 RC 和审批快照；
- 三份与正式 migration 重复的初始 SQL；
- 重复 favicon 和三个未使用的示例/旧图片资源；
- Vite 默认 README；
- 已合并且干净的旧 worktree、对应已合并功能分支；
- `.npm-cache`、`app/dist`、Supabase 临时目录和空 `.superpowers` 目录。

本设计和后续实施计划属于过渡文档。整理完成并且内容已进入稳定文档后，也从工作树删除，仅由 Git 历史保留。

### 保留

- 所有 `supabase/migrations` 文件及其顺序；
- `supabase/sql/004_data_safety_preflight.sql`；
- 所有同步、备份、恢复、旧数据迁移和 RLS 代码与测试；
- 兼容旧数据所需的 `blend_components`、`blend_notes` 等字段和处理代码；
- `app/node_modules`，避免无意义地破坏当前开发环境；
- 当前 Supabase CLI 文件，直到另行确认可靠替代或迁移位置；
- 当前 `foundation`、`master` 和远端分支；只删除已经合并的本地 `codex/*` 功能分支。

## 源码整理边界

本轮只删除有静态引用证据和构建验证支持的资源，不以“文件名相似”作为合并业务源码的依据。

同步、备份、恢复、迁移、推荐校验等模块即使数量较多，也不得为了减少文件数而合并。模块边界有助于测试和数据安全；只有确认无导入、无运行时入口、无测试用途的文件才可删除。

## 实施顺序

1. 建立稳定文档并逐项迁移仍有效规则。
2. 更新 `AGENTS.md`、README 和所有文档交叉引用。
3. 用关键词和路径检查确认没有规则只存在于待删除文档。
4. 删除旧设计、旧计划和日期快照。
5. 删除明确重复 SQL、图标与未使用资源。
6. 运行文档引用检查、秘密扫描、单元测试、lint 和生产构建。
7. 检查构建产物中的 PWA 图标、Manifest、路由和关键文案。
8. 在确认所有 Git 变更后，再清理本地缓存和旧 worktree。

## 验收标准

- `git status` 中没有意外文件或未跟踪文件；
- 当前文档不再链接已删除的日期文档；
- 产品、同步、备份恢复、AI 推荐和部署规则各有唯一权威入口；
- 所有 migration、RLS、事务 RPC 和兼容代码保持不变；
- `npm test`、`npm run lint`、`npm run build` 全部通过；
- PWA favicon、Manifest 图标、GitHub Pages 子路径和 Service Worker 资源正常；
- 旧 worktree 删除前再次确认工作树干净且提交已包含在 `foundation`；
- 删除内容可通过 Git 历史恢复，并在最终交付中明确列出。

## 非目标

- 不调整当前同步协议、数据库结构、备份格式或恢复语义；
- 不修改冲煮规则参数、AI Prompt 或 Edge Function 行为；
- 不重新设计页面 UI；
- 不部署数据库迁移或 Edge Function；
- 不清理生产数据或浏览器 IndexedDB；
- 不为了减少文件数量而合并职责不同的源码模块。
