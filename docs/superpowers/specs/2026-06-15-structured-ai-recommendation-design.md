# Structured AI Recommendation Design

## Goal

Change DeepSeek brew recommendations from a single text paragraph into a stable structured result that can be displayed clearly, saved safely, and later converted into a brew log draft.

## Scope

This version updates the Supabase Edge Function response shape, frontend normalization, display, and saved recommendation payload. It does not change database tables and does not automatically create brew logs.

## Response Shape

The frontend normalizes AI output into:

```ts
{
  summary: string
  recipe: {
    method: string | null
    dripper: string | null
    grindSetting: string | null
    waterTemperatureC: number | null
    coffeeGrams: number | null
    waterGrams: number | null
    ratio: string | null
    totalTimeSeconds: number | null
  }
  pourPlan: Array<{
    label: string
    time: string
    waterGrams: number | null
    action: string
  }>
  adjustments: string[]
  reasons: string[]
  riskNotes: string[]
  rawText: string
}
```

`rawText` remains available so old saved recommendations and JSON parse failures still display useful information.

## Edge Function

`recommend-brew` prompts DeepSeek to return JSON only. If the model returns JSON inside markdown fences, the function extracts it. If parsing fails, the function returns the raw text with `structured: null`.

## Frontend

The recommendation panel displays:

- 推荐参数
- 分段注水
- 推荐理由
- 微调建议
- 注意事项

If structured data is unavailable, it falls back to the old text display.

## Saving

Saved recommendation JSON keeps both:

- `ai.structured`
- `ai.suggestion`

This preserves backward compatibility and makes future "save as brew log" work straightforward.
