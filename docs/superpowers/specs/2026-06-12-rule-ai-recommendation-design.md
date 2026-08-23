# Rule and DeepSeek Brew Recommendation Design

## Scope

Add a first recommendation feature for logged-in users. The user chooses one existing coffee bean, the app produces a rule-based brew recommendation from historical brew logs, then optionally asks DeepSeek for a natural-language brewing suggestion through a Supabase Edge Function.

## Safety and Secrets

DeepSeek API keys must never be placed in frontend code, GitHub repository variables, or committed files. Both AI Edge Functions share the Supabase Edge Function Secret `DEEPSEEK_VISION_API_KEY`.

## Recommendation Flow

1. Frontend loads beans and active brew logs from Supabase.
2. User selects a target bean.
3. Rule engine scores historical brew logs by:
   - Same bean bonus.
   - Matching process, origin, variety, roast level, and flavor tags.
   - Pinned recipe bonus.
   - Higher rating bonus.
4. The best historical record becomes the primary recommendation.
5. The frontend invokes `recommend-brew` Edge Function with target bean, primary recommendation, and up to three references.
6. If Edge Function or DeepSeek is unavailable, the UI still shows the rule recommendation and a clear AI-unavailable message.

## Recommendation Output

The rule output includes ratio, water temperature, grind setting, total time, method, dripper, score, and human-readable reasons.

The AI output is plain Chinese text with:
- First-cup brewing suggestion.
- Why the chosen parameters fit this bean.
- Adjustment advice if the result is sour, bitter, thin, or heavy.

## Edge Function

The Edge Function uses DeepSeek's OpenAI-compatible `/chat/completions` endpoint at `https://api.deepseek.com`. It uses `deepseek-v4-flash-vision-exp` with text-only structured recommendation context. If `DEEPSEEK_VISION_API_KEY` is missing, it returns `configured: false` without exposing server details. Existing saved records retain their original `model_name`; no migration rewrites them.

## Vision Model Text Request Compatibility

`deepseek-v4-flash-vision-exp` 的用户消息必须使用 OpenAI 兼容的内容块数组。冲煮推荐虽然不发送图片，也必须把规则上下文放入单个文本块：

```ts
content: [{ type: "text", text: buildPrompt(payload) }]
```

系统消息继续使用现有字符串格式，与已验证可用的来源图片解析请求保持一致。此次修复不改变规则计算、候选模板、输入字段、推荐 JSON 结构、保存行为或数据库。

## AI Availability And Error States

推荐结果区必须区分以下状态，不能把所有失败都显示成“DeepSeek 未启用”：

- `configured: false`：仅表示服务端缺少 `DEEPSEEK_VISION_API_KEY`，显示“DeepSeek 未配置”。
- `AI_TIMEOUT`：显示模型响应超时，规则推荐仍可用。
- `AI_UPSTREAM_ERROR` 或函数调用失败：显示 AI 推荐暂时不可用，规则推荐仍可用。
- 已配置但没有可展示内容：显示模型未返回可用建议。
前端只显示稳定的本地文案，不展示 Supabase 或 DeepSeek 原始错误、响应体、密钥、请求内容或内部标识。本次修复完成并部署后，先验证 AI 草稿能够生成，再另行设计推荐规则优化。

## Vision Recommendation Timeout

视觉实验模型生成结构化冲煮建议可能超过原有 30 秒。`recommend-brew` 的上游等待时间设为 90 秒，低于 Supabase 托管 Edge Function 的 150 秒请求空闲上限，并保留 `AbortController` 主动中止。

超时后仍返回稳定的 `AI_TIMEOUT`，前端继续显示规则推荐；不自动重试，避免重复消耗配额或产生并发建议。本次调整只改变等待窗口，不改变提示词、规则计算、模型参数、输出结构或保存行为。

## Non-Goals

This version does not store recommendation history, does not use vector search, and does not automatically tune recipes after tasting feedback.

## Phase 2: Bean-Aware Rule Optimization

### Goal

Improve brew recommendations so the first cup is not only copied from a similar historical record, but adjusted from three grounded inputs:

1. The user's strongest historical brew records.
2. The closest system or user brew templates.
3. Real bean attributes such as process, roast level, variety, altitude, farm or station, and flavor tags.

The system should produce a better starting recipe and a clear explanation. It must not claim that a single perfect recipe is guaranteed. Coffee quality still depends on grinder, water, filter, pouring technique, roast freshness, and user taste.

### Research Basis

The rule layer uses conservative brewing facts from public brewing references:

- Pour-over recipes commonly use water around 195-205°F, about 90.5-96°C. Too-hot water can push bitterness; too-cool water can under-extract and taste weak or sour.
- Pour-over grind is usually medium to medium-fine, then adjusted by taste and drawdown time.
- Dripper shape matters: cone brewers like V60 emphasize clarity but are more sensitive to channeling and pouring; flat-bottom brewers like Kalita are more forgiving and can extend contact time.
- Brew ratio, grind, time, and temperature interact. The rule engine should make small bounded adjustments rather than large jumps.

Reference sources:

- Epicurious, "How to Make Pour-Over Coffee Like a Pro", water temperature and grind guidance: https://www.epicurious.com/expert-advice/how-to-make-pour-over-coffee
- Food & Wine, "How to Make Pour-Over Coffee", grinder, water, and temperature guidance: https://www.foodandwine.com/how-to-make-pour-over-coffee-11986208
- Simply Recipes, "A Simple Trick for Brewing Better Coffee at Home", water temperature and over/under extraction guidance: https://www.simplyrecipes.com/simple-trick-brewing-better-coffee-at-home-11879658
- Serious Eats, "The 8 Best Pour-Over Coffee Makers", dripper shape, flow, and extraction observations: https://www.seriouseats.com/best-pourover-coffee-makers-5441631

### Rule Model

The optimized recommendation flow has four layers:

1. **Historical record scoring**
   - Keep same-bean, pinned recipe, and high-rating bonuses.
   - Score exact and near matches for process, origin, variety, roast level, altitude range, farm or station, and flavor tags.
   - Treat process families as related: washed, natural, honey, anaerobic/co-ferment, wet-hulled, blend components.
   - Treat roast levels as ordered neighbors instead of exact strings only.
   - Use altitude buckets: low, medium, high, very high. High-altitude and light-roast beans can be treated as harder to extract.
   - Down-rank records below a minimum useful rating when enough higher-rated records exist.

2. **Template candidate scoring**
   - Keep the current template candidate system, but give stronger reasons when a template matches bean attributes.
   - Use `avoidFor` as an actual penalty, not just metadata.
   - Favor bean-specific templates when process, roast level, flavor, or variety matches.
   - Keep champion templates as optional references, not daily defaults.

3. **Bean-aware parameter adjustment**
   - Start from the best historical record when it is strong enough; otherwise start from the best template.
   - Apply bounded adjustments from bean attributes:
     - Light roast, very light roast, or high altitude: slightly higher temperature, slightly finer grind, or slightly longer target time.
     - Dark roast or medium-dark roast: lower temperature, coarser grind, shorter contact time, lower agitation.
     - Washed, citrus, floral, tea-like: preserve clarity with moderate-to-higher temperature and lower agitation.
     - Natural, honey, berry, tropical fruit: emphasize sweetness with moderate temperature and lower agitation.
     - Anaerobic, co-ferment, winey, strong fermentation: lower temperature and lower agitation to avoid over-amplifying fermentation notes.
     - Gesha or high-floral variety: preserve aroma with lower agitation and clear drawdown.
   - Clamp water temperature and time inside safe ranges for the chosen brew method.
   - Do not invent grinder-specific clicks unless the source record already uses that grinder language.

4. **Explainability**
   - Output reasons in three groups:
     - `historyReasons`
     - `templateReasons`
     - `beanAdjustmentReasons`
   - Show confidence as `high`, `medium`, or `low`:
     - High: strong same-bean or very similar high-rated history.
     - Medium: similar history plus matching template.
     - Low: mostly template-based or sparse bean data.

### AI Prompt Boundary

DeepSeek receives the rule result and may refine wording or choose within narrow ranges, but it must not replace the rule engine. The prompt should require:

- Use the provided historical record, template candidates, and bean adjustment reasons.
- Return structured JSON only.
- Explain which parameters came from history, which came from templates, and which were adjusted because of bean information.
- Provide next-cup fixes for sour, bitter, thin, and astringent outcomes.
- Lower confidence when bean data or history is sparse.
- Avoid claiming a perfect or guaranteed result.

### UI Impact

The recommendation panel should display:

- Chosen base: historical record or template.
- Bean-aware adjustments.
- Confidence.
- Structured first-cup recipe.
- Next-cup correction advice.

Saved recommendations should preserve the rule result and AI result separately so the user can later audit why a recipe was suggested.

### Acceptance Criteria

1. A washed light-roast high-altitude bean should favor clean, higher-extraction pour-over guidance over low-temperature dark-roast guidance.
2. A natural or honey process berry-sweet bean should favor sweetness and lower agitation over maximum clarity.
3. An anaerobic or co-ferment bean should receive lower-temperature, lower-agitation reasons.
4. A dark roast should not receive high-temperature light-roast recommendations unless the user's own high-rated history clearly supports it.
5. A Gesha or floral tea-like bean should preserve clarity and aroma in both template choice and AI reasons.
6. Sparse data should produce a lower-confidence template-based recommendation instead of pretending certainty.
7. Existing rule recommendation tests should remain green, with new tests covering process family, roast neighbor, altitude, `avoidFor`, and bean-aware adjustments.
