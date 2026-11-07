# GR Fuel Log

E85 blend math at the pump, a fill log that learns your E85, and community numbers from GR Corolla owners.
Live at https://fuel.shadyacres.my.

## What's here

| Path | What it is |
| --- | --- |
| `index.html`, `app.css`, `app.js` | The app: plain HTML, CSS and JavaScript, no build step |
| `calc.js` | Blend math, history, oil status and receipt text parsing (shared by the app and tests) |
| `config.js` | Public settings: Supabase URL, publishable key, Turnstile site key. No secrets. |
| `sw.js`, `manifest.webmanifest`, `icons/` | Install-to-home-screen and offline support |
| `supabase/functions/` | Server functions: `read-receipt` (Claude Haiku 5.5), `notify` (Fastmail warnings), `learn` (the model) |
| `test/` | Tests for the math, the learning model and the UI |

The database (tables, access rules, sign-up gate, admin functions) lives in the Supabase project `gr-fuel-log`
and its migration history.

## How the learning works

Each fill is a noisy measurement of the E85 strength at the station where it was pumped. The `learn` function
tracks every station's strength over time with a Kalman filter, spots blend switches within a fill or two,
and estimates each car's flex-sensor offset from how its readings compare with other owners' at the same
stations. Accuracy is measured honestly: each fill is predicted before its reading is used. See
`supabase/functions/learn/model.ts`.

## Running the tests

```
node test/calc.test.mjs
node --experimental-strip-types test/model.test.ts
node test/ui.test.js
```

## One-time setup (Supabase dashboard)

- Edge Functions → Secrets: `ANTHROPIC_API_KEY` and `FASTMAIL_APP_PASSWORD`.
- Authentication → SMTP: `smtp.fastmail.com`, port 465, sender `fuel@shadyacres.my`.
- Authentication → Email templates: show `{{ .Token }}` so emails carry the 6-digit code.
- Authentication → URL configuration: site URL `https://fuel.shadyacres.my`.
- Authentication → Attack protection: Cloudflare Turnstile secret key; put the site key in `config.js`.

## Backups

Every Sunday at 23:41 UTC the database runs the `backup` function. If members' data changed since the last
backup, it emails the admin (`app_config.admin_email`) a file named `gr-fuel-log-backup-YYYY-MM-DD.json.gz`:
gzipped JSON with one list per table (`users`, `profiles`, `fills`, `oil_changes`, `member_stations`,
`app_config`, `signup_log`, `alerts`, `devices`). Weeks with no changes send nothing. If a backup fails, the admin
gets a warning email instead.

To send one right now, run this in the Supabase SQL editor:

```sql
select net.http_post(
  url := 'https://szmxucbaomgcfkeqbuoc.supabase.co/functions/v1/backup',
  body := '{"force": true}'::jsonb,
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-fn-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fn_secret')),
  timeout_milliseconds := 120000);
```

### Restoring

1. Unzip the attachment: `gunzip gr-fuel-log-backup-YYYY-MM-DD.json.gz`.
2. Recreate each account in `users` with the Supabase admin API (`auth.admin.createUser({ email, email_confirm: true })`).
   New accounts get new ids, so map each old `id` to the new one by email.
3. With that mapping, insert `profiles`, `fills` and `oil_changes` (rewrite `id` and `user_id`), then the
   `member_stations` rows (rewrite `created_by` and `std_by`), using the service role.
4. Everything else rebuilds itself: map and DOE stations reload on their own, and the `learn` function
   recomputes E85 strength, sensor offsets and fuel-left curves after the first fill is saved.

The file holds members' email addresses and fill history; keep it private.
