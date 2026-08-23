# DeepSeek Edge Function Setup

This guide enables AI brew recommendations and packaging-image source import for the deployed PWA.

## Current Project

- Supabase project ref: `tmjpgcjcrcaxxxhqbyng`
- Brew recommendation function: `recommend-brew`
  - Source: `supabase/functions/recommend-brew/index.ts`
  - Model: `deepseek-v4-flash-vision-exp`（纯文本请求）
- Source import function: `import-source`
  - Source: `supabase/functions/import-source/index.ts`
  - Model: `deepseek-v4-flash-vision-exp`

## Important Safety Rules

- Do not paste the DeepSeek API key into GitHub, Codex chat, source code, or documentation.
- Store the key only in Supabase Edge Function Secrets.
- The frontend calls Supabase Edge Function; it never calls DeepSeek directly.

## Step 1: Set the DeepSeek Secret in Supabase Dashboard

Recommended for this project because it avoids putting the key into local shell history.

1. Open Supabase Dashboard.
2. Go to project `tmjpgcjcrcaxxxhqbyng`.
3. Open `Edge Functions`.
4. Open `Secrets` or `Secrets Management`.
5. Create a new key in the DeepSeek platform and add one Supabase Secret:
   - `DEEPSEEK_VISION_API_KEY`: shared by `recommend-brew` and `import-source`.
   - Paste the value only into this Supabase Secret.
6. Save.

Supabase says production Edge Function secrets can be set through the Dashboard or CLI, and secrets are available to functions without redeploying.

## Step 2: Deploy the Edge Function

This machine does not currently have the `supabase` command installed globally. Supabase's current docs recommend using `npx supabase` or installing the CLI locally as a dev dependency; global installation via `npm install -g supabase` is not supported.

Run these commands in PowerShell from `D:\coffee`:

```powershell
npx supabase login
npx supabase functions deploy recommend-brew --project-ref tmjpgcjcrcaxxxhqbyng
npx supabase functions deploy import-source --project-ref tmjpgcjcrcaxxxhqbyng
```

The login command opens or asks for Supabase authentication. After deployment, the function URL is:

```text
https://tmjpgcjcrcaxxxhqbyng.supabase.co/functions/v1/recommend-brew
https://tmjpgcjcrcaxxxhqbyng.supabase.co/functions/v1/import-source
```

## Step 3: Verify in the App

1. Open `https://frankkiss.github.io/coffee-pwa/`.
2. Log in.
3. Make sure you have at least one coffee bean and one brew log with usable parameters.
4. In `冲煮方案推荐`, choose a bean and click `生成推荐`.
5. Expected result:
   - Rule recommendation appears first.
   - DeepSeek suggestion appears below it.
6. In `来源导入`, select one JPEG, PNG, or WebP packaging image no larger than 8 MB.
7. Click `AI 解析图片/文字`.
8. Expected result:
   - A draft preview appears; the image is not stored.
   - The bean is not saved until `确认保存到豆仓` is clicked.

If DeepSeek does not appear, the rule recommendation should still work. Check:

- `DEEPSEEK_VISION_API_KEY` exists in Supabase Edge Function Secrets.
- `recommend-brew` is deployed.
- `import-source` is deployed.
- The browser is logged in, because `verify_jwt = true` is enabled for both functions.

After both functions have been deployed and verified, the retired `DEEPSEEK_API_KEY` secret may be removed. Do not remove it before the new shared secret and both deployments are confirmed.

## CLI Secret Alternative

Dashboard setup is preferred for this project. If you later choose CLI-based secret management, follow Supabase's current CLI documentation and do not commit any `.env` file.
