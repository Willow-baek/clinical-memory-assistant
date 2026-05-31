# API-first v2 setup

Clinical Memory Assistant v2 keeps the browser app simple and sends expensive AI work to Supabase Edge Functions.

## Current function

### `analyze-schedule-image`

Purpose:

- Accept one pasted Smart CRM schedule screenshot as a temporary `data:image/...` payload.
- Call OpenAI vision from a Supabase Edge Function.
- Return sectioned text that the existing schedule parser can import:

```text
[VISITS]
2026-05-16 09:00 김바보 40

[APPOINTMENTS]
2026-05-19 09:30 조아람 30
```

The image is not stored by the app or function.

## Supabase secrets

Do not commit API keys to GitHub.

First, log in to the Supabase CLI:

```bash
npx supabase login --token <SUPABASE_ACCESS_TOKEN>
```

Set the OpenAI key in Supabase:

```bash
npx supabase secrets set OPENAI_API_KEY=sk-... --project-ref mwwbqzdpnvnrvcdfxflh
```

Optional model override:

```bash
npx supabase secrets set OPENAI_SCHEDULE_MODEL=gpt-4.1-mini --project-ref mwwbqzdpnvnrvcdfxflh
```

If the CLI reports an access-token format error only for `secrets`, set the same values in the Dashboard instead:

1. Open Supabase Dashboard for `clinical-memory-assistant`.
2. Go to `Edge Functions` -> `Secrets`.
3. Add `OPENAI_API_KEY`.
4. Optionally add `OPENAI_SCHEDULE_MODEL` with `gpt-4.1-mini`.

## Deploy

From the project folder:

```bash
npx supabase functions deploy analyze-schedule-image --project-ref mwwbqzdpnvnrvcdfxflh --use-api
```

The frontend calls:

```text
/functions/v1/analyze-schedule-image
```

through the configured Supabase project URL.

## Frontend workflow

1. Log in to Supabase from the app.
2. Paste a Smart CRM schedule screenshot into `스케줄 통합 Import`.
3. The app sends only the pasted image to the Edge Function.
4. The Edge Function returns structured schedule text.
5. The existing import parser immediately creates/updates Visit and Appointment blocks.
6. If API analysis fails, paste the external AI text result manually as before.

## Next functions

Planned:

- `analyze-transcript`: Whisper transcript to chart draft sections.
- `analyze-initial-chart`: doctor initial chart image to patient/chart candidate.
