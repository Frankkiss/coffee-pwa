# Supabase Setup

Project dashboard:
https://supabase.com/dashboard/project/tmjpgcjcrcaxxxhqbyng

Frontend API URL:
https://tmjpgcjcrcaxxxhqbyng.supabase.co

Region:
Asia Pacific, Sydney

Rules:

- The frontend may use only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Never commit the Supabase service role key.
- Never commit DeepSeek API keys.
- Apply SQL files through the Supabase SQL editor or Supabase CLI after review.
- Keep Row Level Security enabled on all user-owned tables.

Magic Link auth settings:

- Site URL: `https://frankkiss.github.io/coffee-pwa/`
- Redirect URL: `https://frankkiss.github.io/coffee-pwa/`
- Local redirect URL: `http://localhost:5173/coffee-pwa/`

GitHub repository variables for Pages builds:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Edge Function setup:

- Function source: `supabase/functions/recommend-brew/index.ts`
- Function config: `supabase/config.toml`
- Shared DeepSeek secret name: `DEEPSEEK_VISION_API_KEY`
- Detailed guide: `docs/operations/deepseek-edge-function-setup.md`

Current architecture and production procedures:

- Data architecture: `docs/data-architecture.md`
- AI and recommendation contracts: `docs/ai-recommendation.md`
- Production runbook: `docs/operations/production-runbook.md`
