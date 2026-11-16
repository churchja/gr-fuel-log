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

## Station lists

Members pick stations from one shared list, named Brand · Street. Two public E85 lists fill it in, and each
station from either list shows up for every member:

- **U.S. DOE Alternative Fuels Data Center**, loaded Mondays by `supabase/functions/afdc` (`afdc-weekly`).
- **E85prices.com** (Renewable Fuels Association), used with RFA's permission. RFA allows the download once a week,
  Sundays between 11 PM and 4 AM Central. `supabase/functions/e85prices` runs Sundays at 11:30 PM Central
  (`e85prices-weekly`, scheduled at both 04:30 and 05:30 UTC Monday to cover daylight saving time). The function
  does nothing outside that window or a second time in the same week. It reads one page
  (`https://e85prices.com/e85map`) into `e85p_stations`, and `link_e85p()` ties each listing to a DOE or member
  station at the same place (within 300 m sharing the brand or street number, or within 3 km sharing both;
  a matching street number wins over a nearer listing) or adds it as a station of its own. A listing is set
  aside, not added, when a listed station of the same brand is within 300 m, at the same street number within
  3 km, or at the same street number and city within 15 km: these are repeats or pins copied from another
  station. The parser repairs swapped coordinates and a missing minus sign, and skips listings outside the U.S.
  or with unusable coordinates. Their last E85 price shows only if it was reported in the last 3 months.
  Usernames on the site are never kept.
- **Pausing E85prices.com.** One switch hides their stations, prices and listings from members:
  `update public.app_config set e85p_enabled = false where id = 1;` plus `select cron.unschedule('e85prices-weekly');`
  to stop the download. The stored copy stays, so resuming is instant: set `e85p_enabled = true` and re-run the
  `cron.schedule('e85prices-weekly', ...)` from the `e85prices_resume` migration. To remove their data entirely,
  delete the `source = 'e85prices'` stations, clear `e85p_id`/`e85p` on the rest, and empty `e85p_stations`.

## Running the tests

```
node test/calc.test.mjs
node --experimental-strip-types test/model.test.ts
node --experimental-strip-types test/afdc.test.ts
node --experimental-strip-types test/e85prices.test.ts
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
4. Everything else rebuilds itself: map, DOE and E85prices.com stations reload on their own, and the `learn` function
   recomputes E85 strength, sensor offsets and fuel-left curves after the first fill is saved.

The file holds members' email addresses and fill history; keep it private.
