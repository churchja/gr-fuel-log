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
