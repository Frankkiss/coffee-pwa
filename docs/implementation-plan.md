# Coffee PWA 统一性修复实施计划

**目标：** 按审查顺序消除冲煮显示、录豆确认、自定义模板、自动化验证和仓库整洁性中的剩余不一致，同时保持同步、备份、恢复和旧数据兼容。

**方案：** 先集中规范化“展示标签”和“派生比例”，再让录豆确认字段完整可见；随后用可空字段前向扩展用户模板，并让所有持久化边界同时兼容旧形态。最后补真实浏览器门禁，清理确认无引用的代码和重复工作流。生产数据库迁移只生成并验证，不在本轮自动应用。

**技术栈：** React 19、TypeScript、Vitest、Playwright、IndexedDB、Supabase Postgres/RPC、GitHub Actions。

---

## 1. 冲煮显示与比例

**文件：** `app/src/features/brews/brewMode.ts`、`BrewLogPanel.tsx`、`brewLogDetailModel.ts`、`homeOverviewModel.ts`、`beanDetailModel.ts` 及对应测试。

- [x] 先写回归测试：冰手冲旧存储比例 `1:15.6` 在首页、豆子详情和记录详情显示为由 16g 粉与 150g 热水推导的 `1:9.4`。
- [x] 先写回归测试：四类记录显示规范名称，默认方法不重复，冷萃带子类型。
- [x] 运行目标测试并确认因缺少统一派生/标签而失败。
- [x] 提取并接入统一展示函数，所有 UI 和 CSV 读取 `getCanonicalBrewRatio`。
- [x] 运行目标测试、全量单元测试、lint 和 build；提交 `fix: unify brew mode summaries`。

## 2. 录豆确认字段

**文件：** `app/src/features/sourceImports/sourceImportMapping.ts`、`SourceImportPanel.tsx`、`app/src/features/beans/BeanDashboard.tsx` 及对应测试。

- [x] 先写测试：来源草稿的净含量进入确认表单；价格和净含量都必须是显式可编辑字段。
- [x] 运行测试并确认净含量被丢弃、界面字段缺失。
- [x] 手动录豆增加净含量；来源确认增加净含量和价格，不自动改写剩余量。
- [x] 运行目标测试、全量单元测试、lint、build 和 360×800 核心表单验证；提交 `fix: expose bean package fields`。

## 3. 四模式用户模板

**文件：** `app/src/features/brewTemplates/*`、`app/src/features/sync/*`、`app/src/features/backup/*`、新增 `supabase/migrations/20260830010000_method_aware_brew_templates.sql`、数据库测试。

- [x] 先写模型和 Repository 测试：新模板显式保存四类方式；冷萃保存子类型；冰手冲保存冰量；意式保存出液量；旧模板仍可推断。
- [x] 先写同步、备份和恢复测试：新字段往返无损，缺失字段继续合法。
- [x] 运行目标测试并确认新字段尚未贯通。
- [x] 扩展类型、表单、Repository、IndexedDB/wire 校验、备份和恢复。
- [x] 编写只增加可空列、约束及 RPC/快照兼容的 migration 和 pgTAP 测试；不连接生产项目应用。
- [ ] 运行前端全量测试、数据库测试、lint、build 和手机尺寸模板验证；提交 `feat: align custom templates with brew modes`。

## 4. E2E 与 CI

**文件：** `app/playwright.config.ts`、`app/e2e/*`、`app/src/ciWorkflow.test.ts`、`.github/workflows/data-safety-checks.yml`。

- [x] 先写配置测试：Windows 可选系统 Chrome，Linux/CI 使用 Playwright Chromium；独立 CI 只执行一次质量门禁。
- [x] 增加手机核心 E2E：录豆净含量确认、四类记录联动、模板模式专属字段、规则推荐转草稿。
- [x] 在需要 Auth/REST 的本地 Supabase 作业安装 Chromium 并运行核心 E2E。
- [ ] 运行 CI 结构测试、可运行的本地 E2E、全量测试、lint 和 build；提交 `test: cover core coffee workflows`。

## 5. 清理与最终验证

**文件：** 已确认无引用的组件/旧推荐入口、`supabase/functions/import-source/index.ts`、GitHub Actions 和忽略的本地 CLI 文件。

- [ ] 用 `rg`、类型检查和测试证明候选文件无生产引用，再删除孤立组件和旧豆子单模式推荐入口。
- [ ] 删除来源 Prompt 中不再使用的拼配组成要求，同时保留旧响应/旧数据读取兼容。
- [ ] 移除 foundation push 上重复触发的独立质量工作流，保留 Pages 部署调用门禁和 PR/手动门禁。
- [ ] 精确核对本地 Supabase CLI 文件；只移除已确认损坏且有可恢复来源的重复副本，不触碰迁移和用户数据。
- [ ] 运行全量前端、Edge Function、数据库测试、lint、build、核心 E2E、Git 状态和秘密扫描；提交 `chore: remove obsolete project paths`。

## 完成边界

- 不自动应用生产数据库 migration，不修改 Supabase Secret，不改写旧用户记录。
- 不重做稳定的数据安全底层；只为模板新增字段贯通现有边界。
- 每项完成后保留独立提交；全部验证通过后再由用户决定是否推送。
