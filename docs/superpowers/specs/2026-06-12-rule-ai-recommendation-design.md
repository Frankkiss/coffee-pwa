# Rule and DeepSeek Brew Recommendation Design

## Scope

Add a first recommendation feature for logged-in users. The user chooses one existing coffee bean, the app produces a rule-based brew recommendation from historical brew logs, then optionally asks DeepSeek for a natural-language brewing suggestion through a Supabase Edge Function.

## Safety and Secrets

DeepSeek API keys must never be placed in frontend code, GitHub repository variables, or committed files. The key belongs in Supabase Edge Function Secrets as `DEEPSEEK_API_KEY`.

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

The Edge Function uses DeepSeek's OpenAI-compatible `/chat/completions` endpoint at `https://api.deepseek.com`. It uses `deepseek-v4-pro` by default for higher-quality suggestions. If `DEEPSEEK_API_KEY` is missing, it returns `configured: false` without exposing server details.

## Non-Goals

This version does not store recommendation history, does not use vector search, and does not automatically tune recipes after tasting feedback.
