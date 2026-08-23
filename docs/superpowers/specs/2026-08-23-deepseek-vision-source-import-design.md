# DeepSeek 视觉来源导入设计

日期：2026-08-23

## 目标

把现有“浏览器本地 Tesseract OCR → DeepSeek 文本解析”替换为“图片/文字 → Supabase Edge Function → DeepSeek 视觉模型”，减少手机端等待和 OCR 错字，同时继续把解析结果作为待确认草稿。

## 范围

- `import-source` 使用实验模型 `deepseek-v4-flash-vision-exp`。
- 使用独立的 Supabase Edge Function Secret：`DEEPSEEK_VISION_API_KEY`。
- 支持单张 JPEG、PNG 或 WebP 包装图片，也支持只粘贴商品文字，或图片与文字一起提交。
- 移除前端 Tesseract、OCR 按钮和相关依赖。
- 不加入网址输入、网页抓取、自动保存、图片持久化或多图批量解析。

拼配表单简化和冲煮推荐优化不属于本阶段，分别设计和提交。

## 用户流程

1. 用户选择一张包装图片，可选补充商品详情文字。
2. 前端只允许 JPEG、PNG、WebP，单图最大 8 MiB；不合格文件在本地拒绝。
3. 用户点击一次“AI 解析图片/文字”。图片转为 Base64 data URL，随文字发送给已登录用户可调用的 `import-source`。
4. Edge Function 先认证、限流、限制请求体，再校验 data URL 的 MIME、Base64 格式和解码字节数。
5. Edge Function 使用 OpenAI 兼容的多内容块格式调用 `deepseek-v4-flash-vision-exp`：文字块说明提取规则，图片块使用 `image_url` 和 `detail: original`。
6. 前端展示结构化草稿；用户检查和修改后，点击“确认保存到豆仓”才写入本地仓库并等待同步。

## 数据与安全

- 新 API Key 只存在 Supabase Secret `DEEPSEEK_VISION_API_KEY`，不进入前端、Git、日志或响应。
- 原图仅在本次请求内经过内存，不写入 IndexedDB、Supabase 表、来源记录、备份或日志。
- 继续拒绝任何 `url` 请求字段，Edge Function 不下载外部网页或图片。
- 前端限制 8 MiB；Edge Function 对 JSON 请求体设置 12 MiB 上限，并对解码图片再次执行 8 MiB 上限，避免只信任客户端。
- DeepSeek 官方上限更高，但本项目采用更小的产品限制，以适配移动端 Base64 膨胀和 Edge Function 内存。
- 模型输出继续经过现有字段归一化；未知、缺失或低置信度内容不得自动覆盖已有豆子。

## 请求契约

```ts
type SourceImportRequest = {
  pastedText: string
  image?: {
    dataUrl: string
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
  }
}
```

文字和图片至少提供一种。请求不接受外部 URL、文件 ID、GIF 或任意额外图片数组。

## 错误处理

- 离线：禁用解析，已选图片和文字留在页面。
- 文件类型或大小不合格：前端立即提示；Edge Function 再次拒绝伪造请求。
- 缺少 `DEEPSEEK_VISION_API_KEY`：返回 `configured: false`，不暴露配置详情。
- DeepSeek 超时、非 2xx、非 JSON：显示稳定错误，不清空图片、文字或已编辑草稿。
- 来源记录只保存结构化响应和用户最终确认字段，不保存 Base64 图片。

## 兼容性

- 豆子、同步、备份和数据库表结构不变。
- 现有纯文本来源导入继续可用，但改由同一视觉模型处理。
- 已有 `source_imports` 记录和旧备份无需迁移。
- `DEEPSEEK_API_KEY` 继续供冲煮推荐使用，不被本阶段替换。

## 验收标准

1. 清晰包装图片可生成待确认豆子草稿，无浏览器 OCR 步骤。
2. 纯文字仍可生成草稿。
3. 空输入、伪造网址、超限请求、错误 MIME 和无效 Base64 均在调用模型前拒绝。
4. 原图和 Base64 不进入来源记录、同步、备份或日志。
5. 未确认草稿不会写入豆仓。
6. 来源导入测试、Edge Function 测试、全量前端测试、lint 和 build 通过。
7. 手机尺寸下完成选择图片、解析、审阅和确认保存的核心流程验证。

## 官方依据

- DeepSeek Vision Guide: `https://api-docs.deepseek.com/guides/vision/`
- 模型：`deepseek-v4-flash-vision-exp`
- 图片通过 Chat Completions 用户消息中的 `image_url` 内容块传入。

