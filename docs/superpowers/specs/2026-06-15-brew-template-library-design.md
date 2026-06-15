# 冲煮方案模板库 v1 设计

日期：2026-06-15

## 目标

为咖Day增加一套结构化的冲煮方案模板库。模板库用于解决当前推荐结果过于泛化的问题：推荐不应只给出水温、研磨、粉水比和总时间，而应提供可执行的分段注水计划。

第一版模板库先作为应用内置知识库，不保存到 Supabase 用户数据表。模板可以被页面展示、筛选，也可以作为后续 DeepSeek 推荐的输入上下文。DeepSeek 的职责是从模板中选择合适方案，并根据咖啡豆信息、历史冲煮记录和用户偏好微调参数，不允许凭空编造没有模板依据的冲煮法。

## 范围

### 本阶段实现

- 内置一批结构化冲煮模板。
- 每个模板包含粉量、总水量、粉水比、水温、研磨、分段注水、目标总时间、适合豆子、调整建议和参考来源。
- 提供模板库页面，支持移动端浏览、筛选和查看详情。
- 为推荐系统预留“模板候选输入”接口，使后续 AI 推荐可以基于模板选择和微调。

### 本阶段不实现

- 不做用户自定义模板保存。
- 不做模板云同步。
- 不做全网自动搜索冲煮方案。
- 不假设 DeepSeek API 自带实时网页搜索能力。
- 不直接把模板一键写入冲煮记录；该能力留到下一阶段。

## 关键原则

### 模板优先，AI 辅助

推荐链路应为：

1. 应用根据豆子信息和历史记录筛选出 1 到 3 个候选模板。
2. 应用把候选模板、目标豆子、相似历史记录发给 Supabase Edge Function。
3. Edge Function 调用 DeepSeek。
4. DeepSeek 只能基于候选模板微调水温、研磨、粉水比、分段时间和解释理由。
5. 前端展示“来源模板”和“AI 微调说明”，用户确认后再保存。

### DeepSeek 联网边界

调用 DeepSeek API 需要联网，但这不等于模型拥有实时网页搜索能力。DeepSeek 官方 API 文档提供 Chat API、JSON Output、Tool Calls、Context Caching 等能力；Tool Calls 需要调用方自己提供实际工具，模型本身不会执行搜索或网页抓取。

因此第一版使用内置模板库。后续如果需要联网补充参考资料，应由咖Day自己的 Supabase Edge Function 执行搜索、抓取或读取用户提供的链接文本，再把结果交给 DeepSeek 解析成模板候选，并要求用户确认后保存。

## 模板数据结构

建议在前端创建 `app/src/features/brewTemplates/`，模板以 TypeScript 常量形式内置。

```ts
type BrewTemplate = {
  id: string
  name: string
  category: BrewTemplateCategory
  difficulty: 'easy' | 'medium' | 'advanced'
  brewer: string
  filter: string
  doseGrams: number
  waterGrams: number
  ratio: string
  waterTemperatureC: {
    min: number
    max: number
  }
  grindSize: string
  targetTimeSeconds: {
    min: number
    max: number
  }
  pourSteps: BrewTemplatePourStep[]
  suitableFor: string[]
  avoidFor: string[]
  flavorGoal: string
  adjustmentRules: string[]
  sourceNotes: string
  sourceUrls: string[]
  isChampionReference: boolean
}

type BrewTemplatePourStep = {
  order: number
  startSeconds: number
  endSeconds: number | null
  targetWaterGrams: number
  label: string
  action: string
}
```

`targetWaterGrams` 使用累计水量。例如第二段注水到 140g，而不是本段注水 100g。这样更贴近手冲秤的实际读数。

## 模板列表 v1

### 日常主流手冲

1. 经典三段式 V60
   - 适合：水洗、中浅烘、花香、柑橘、日常稳定试冲。
   - 特点：容易复现，信息不足的新豆也能使用。

2. V60 五段脉冲注水
   - 适合：想提高甜感和均匀萃取的浅烘或中浅烘豆。
   - 特点：每段水量较小，控制感强。

3. V60 单次主注水
   - 适合：希望减少扰动、追求干净口感的水洗豆。
   - 特点：闷蒸后一次主注水，减少过多分段带来的不稳定。

4. James Hoffmann 风格 V60
   - 适合：浅烘、中浅烘，强调均匀浸润和稳定萃取。
   - 特点：重视闷蒸、旋转和完整萃取，适合作为高稳定基础模板。

5. Tetsu Kasuya 4:6 风格
   - 适合：甜感、层次感、日晒或中浅烘豆。
   - 特点：前 40% 水量调整酸甜，后 60% 水量调整浓度。

6. April / 平底低扰动风格
   - 适合：平底滤杯、甜感豆、希望降低扰动的日晒豆。
   - 特点：少量多段，水柱稳定，减少冲散粉床。

7. Kalita Wave 稳定甜感模板
   - 适合：甜感、坚果、巧克力、平衡型豆子。
   - 特点：平底滤杯容错高，适合稳定日常记录。

8. Origami 锥形滤纸明亮模板
   - 适合：水洗、花香、柑橘、瑰夏。
   - 特点：流速较快，强调清晰度和明亮酸质。

9. Origami 平底滤纸厚甜模板
   - 适合：日晒、蜜处理、莓果、甜感。
   - 特点：平底滤纸提高接触时间和甜感。

10. Orea / 快流速平底模板
    - 适合：浅烘、需要高萃取但避免堵塞的豆子。
    - 特点：快流速器具配合略细研磨，适合干净高萃取。

### 浸泡和混合式

11. Hario Switch 浸泡释放模板
    - 适合：新手、难以稳定注水、想要厚实且干净的杯感。
    - 特点：关闭阀门浸泡后释放，降低注水技术依赖。

12. Hario Switch 前段浸泡 + 后段过滤模板
    - 适合：想要兼顾厚甜和清晰度的浅烘豆。
    - 特点：前段浸泡建立甜感，后段打开阀门过滤萃取。

13. Clever Dripper 稳定浸泡模板
    - 适合：日常稳定、办公室、弱化手法影响。
    - 特点：浸泡后释放，适合对比豆子本身风味。

14. 法压壶清澈版
    - 适合：中烘、坚果、巧克力、多人分享。
    - 特点：长浸泡、撇浮沫、轻压滤网，追求比传统法压更干净。

### 特殊豆子适配

15. 水洗浅烘明亮模板
    - 适合：埃塞俄比亚、肯尼亚、巴拿马水洗，花香和柑橘调性。
    - 微调方向：水温略高，研磨中细，保持清晰酸质。

16. 日晒莓果甜感模板
    - 适合：日晒、莓果、热带水果、甜感明显的豆子。
    - 微调方向：降低扰动，避免酸质变尖。

17. 厌氧 / 发酵感降温模板
    - 适合：厌氧、共发酵、酒香、发酵感强的豆子。
    - 微调方向：水温略低，减少过度萃取带来的刺激感。

18. 瑰夏 / 花香高酸模板
    - 适合：瑰夏、花香、茶感、精致酸质。
    - 微调方向：控制扰动，避免过萃压掉香气。

19. 深烘 / 坚果巧克力低温模板
    - 适合：深烘、中深烘、坚果、巧克力、低酸豆。
    - 微调方向：水温更低，时间略短，避免苦味和焦感。

20. 新豆试冲默认模板
    - 适合：资料不足或第一次冲煮的新豆。
    - 微调方向：使用保守参数，便于第二次按反馈调整。

### 世界冠军参考模板

冠军模板标记为 `isChampionReference: true`，默认不作为第一推荐，除非用户选择“进阶参考”或 AI 判断目标豆子非常接近该模板条件。

21. 2016 Tetsu Kasuya 4:6 参考
22. 2021 Matt Winton 五段注水参考
23. 2022 Sherry Hsu 四段 50g 参考
24. 2023 Carlos Medina 五次 50g 参考
25. 2024 Martin Wolfl 60 / 60 / 50 / 100g 参考
26. 2025 Peng Jinyang 30 / 90 / 90 参考

这些模板主要用于学习和尝试。它们通常围绕特定比赛豆、特定器具、特定研磨和水质设计，与日常经典三段式差异很大，不应默认套用到所有豆子。

## 模板匹配规则

第一版先用本地规则筛选模板：

- 处理法匹配：水洗、日晒、蜜处理、厌氧、共发酵。
- 烘焙度匹配：浅烘、中浅烘、中烘、深烘。
- 风味标签匹配：花香、柑橘、莓果、热带水果、坚果、巧克力、酒香、茶感。
- 器具匹配：V60、Origami、Kalita、Orea、Switch、Clever、法压壶。
- 难度匹配：日常默认优先 easy 和 medium；冠军参考属于 advanced。

输出候选时最多给 3 个模板：

1. 一个最稳的日常模板。
2. 一个贴近豆子风味的模板。
3. 一个可选的进阶或冠军参考模板。

## AI 微调方式

发送给 DeepSeek 的上下文应包含：

- 目标咖啡豆摘要。
- 用户历史高评分冲煮记录摘要，最多 5 条。
- 候选模板的精简字段。
- 用户可用器具。
- 约束：只能基于候选模板微调，不能编造新冲煮法。

DeepSeek 返回结构化结果：

```ts
type TemplateBasedAiRecommendation = {
  selectedTemplateId: string
  templateName: string
  adjustedDoseGrams: number
  adjustedWaterGrams: number
  adjustedRatio: string
  adjustedWaterTemperatureC: number
  adjustedGrindSize: string
  adjustedTargetTimeSeconds: number
  adjustedPourSteps: BrewTemplatePourStep[]
  reason: string
  adjustmentExplanation: string[]
  nextTimeAdjustments: string[]
}
```

AI 输出必须展示“基于哪个模板”。如果 AI 无法在候选模板中做出选择，前端应显示规则候选模板，不显示空白结果。

## 页面设计 v1

新增一个“冲煮模板”入口，放在现有登录后的主内容中，靠近“冲煮方案推荐”。

页面结构：

- 顶部：模板库标题、简短说明。
- 筛选区：
  - 器具：V60、Origami、Kalita、Orea、Switch、Clever、法压壶。
  - 风味倾向：明亮、甜感、厚实、低苦、花香、发酵感。
  - 难度：日常、进阶、冠军参考。
- 列表卡片：
  - 模板名。
  - 适合豆子。
  - 粉水比、水温、目标时间。
  - 主要分段摘要。
- 详情区：
  - 完整分段注水。
  - 调整建议。
  - 参考来源。

移动端优先，卡片和详情不做复杂弹窗。第一版可以使用列表展开详情，减少页面状态复杂度。

## 数据安全和备份影响

内置模板不属于用户数据，不进入 JSON 备份，也不进入 CSV 导出。

如果后续加入用户自定义模板，则必须：

- 存入 Supabase 用户表。
- 包含 `user_id`。
- 启用 RLS。
- 纳入 JSON 备份。
- 导入时使用预览和明确确认，不覆盖已有模板。

## 联网资料扩展预留

后续可以增加“从链接生成模板草稿”：

1. 用户粘贴冲煮文章、烘焙商建议、视频文案或公开网页链接。
2. Edge Function 抓取可访问文本，或接收用户手动粘贴文本。
3. DeepSeek 将文本整理为模板草稿。
4. 前端显示预览。
5. 用户确认后保存为自定义模板。

该能力不做自动全网搜索，不绕过登录墙，不高频抓取，不默认信任 AI 输出。

## 测试要求

- 模板数据必须通过结构校验。
- 每个模板必须有唯一 `id`。
- 每个模板至少有 2 个注水或操作步骤。
- 每个步骤的累计水量不得超过模板总水量。
- 模板筛选函数应覆盖器具、风味倾向、难度和冠军参考开关。
- AI 请求构建函数必须只发送候选模板摘要，不发送全部模板库。
- 推荐结果必须保留 `selectedTemplateId`，否则不能保存为模板推荐。

## 验收标准

1. 用户能在手机上打开“冲煮模板”页面。
2. 用户能筛选并查看不少于 20 个内置模板。
3. 每个模板都有完整分段步骤。
4. 世界冠军方案被标记为进阶参考，不会默认混入日常推荐。
5. 模板库可以被推荐系统读取为候选模板。
6. DeepSeek 推荐设计明确限制为“基于模板微调”，不凭空编新方案。
7. 文档和代码都明确 DeepSeek API 不默认具备实时搜索能力。

## 参考资料

- DeepSeek API Quick Start: https://api-docs.deepseek.com/
- DeepSeek Tool Calls: https://api-docs.deepseek.com/guides/tool_calls
- World Brewers Cup: https://en.wikipedia.org/wiki/World_Brewers_Cup
- Serious Eats Kalita Wave: https://www.seriouseats.com/how-to-brew-coffee-using-a-kalita-wave-dripper-pourover-japanese-technique
- Serious Eats Hario Switch: https://www.seriouseats.com/hario-switch-review-11865428
- Serious Eats Clever Dripper: https://www.seriouseats.com/how-to-brew-coffee-in-a-clever-dripper-coffee-technique-tips
- Epicurious French Press: https://www.epicurious.com/expert-advice/how-to-use-a-french-press-to-make-coffee
