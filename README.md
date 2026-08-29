# Coffee PWA

个人使用、移动端优先的咖啡豆仓与冲煮记录 PWA。项目支持离线录入和查看、Supabase 多设备同步、备份恢复，以及由确定性规则约束的 DeepSeek 冲煮建议。

生产站点：[Coffee PWA](https://frankkiss.github.io/coffee-pwa/)

## 当前能力

- 咖啡豆新增、编辑、筛选和剩余量管理；
- 热手冲、冰手冲、冷萃、意式冲煮记录；
- 精简系统模板和用户自定义模板；
- 规则基础方案、历史反馈修正和 AI 优化草稿；
- 商品详情文字与包装图片辅助录豆；
- IndexedDB 离线写入、Supabase 同步和异常恢复；
- JSON、CSV 和含图片完整备份，安全合并与全量恢复。

## 安全边界

- Supabase 是登录用户的云端事实源，所有用户数据受 RLS 隔离。
- DeepSeek Key 只存在于 Supabase Edge Function Secret，禁止进入前端、Git 或日志。
- 来源导入不抓取网址，不在浏览器执行 OCR；解析结果必须由用户确认。
- AI 推荐只能生成草稿，不能自动写入正式冲煮记录。
- 不得把目录整理当作删除同步兼容、迁移、备份或恢复机制的理由。

## 目录

- `app/`：React、TypeScript、Vite PWA 前端。
- `supabase/`：数据库迁移、SQL 预检、数据库测试和 Edge Functions。
- `docs/`：当前产品、数据、AI 与生产运维文档。
- `.github/workflows/`：数据安全质量门和 GitHub Pages 部署。

## 本地开发

```powershell
Set-Location D:\coffee\app
npm install
npm run dev
```

质量检查：

```powershell
npm test
npm run lint
npm run build
```

环境变量只允许使用公开的前端配置：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SYNC_ROLLOUT_MODE`

## 部署

前端由 `.github/workflows/deploy-pages.yml` 通过质量门发布到 GitHub Pages。数据库迁移和 Edge Function 部署不随前端自动执行，必须按[生产运维手册](docs/operations/production-runbook.md)单独核对和批准。

## 文档

从[文档索引](docs/README.md)进入当前权威文档。已经完成的日期化设计和实施计划只保留在 Git 历史中。
