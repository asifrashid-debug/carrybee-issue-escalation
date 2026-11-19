# Deploy to Cloudflare Workers (separate clone / deployment)

This repository is configured with `@opennextjs/cloudflare`, `wrangler.jsonc`, `open-next.config.ts`, and `worker.js` (including the `0 14 * * *` cron trigger for `/api/cron/daily-report`).

Because the original `asifrashid-debug/carrybee-issue-escalation` `main` branch deploys to Vercel, follow these steps on your own machine to clone this Cloudflare-ready branch into a separate GitHub repo and deploy it to Cloudflare.

---

## 1. Clone this branch into a separate GitHub repository

```bash
git clone -b arena/656c6cba-carrybee-issue-escalation https://github.com/asifrashid-debug/carrybee-issue-escalation.git carrybee-escalation-cloudflare
cd carrybee-escalation-cloudflare
git checkout -b main
```

Create a new repository on GitHub (for example `carrybee-escalation-cloudflare`) and push:

```bash
gh repo create carrybee-escalation-cloudflare --private --source=. --remote=origin --push
```

---

## 2. Configure environment variables & secrets

Next.js inlines `NEXT_PUBLIC_*` variables at build time, while server secrets are stored in Cloudflare Workers secrets.

Create `.env.production.local` locally before building:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_APP_URL=https://carrybee-escalation-tracker.<your-subdomain>.workers.dev
```

Upload runtime secrets to Cloudflare Workers:

```bash
npx wrangler login
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
npx wrangler secret put NEXT_PUBLIC_APP_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN
npx wrangler secret put SHEET_ISD
npx wrangler secret put SHEET_OSD
npx wrangler secret put SHEET_CTG
npx wrangler secret put WEBHOOK_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put GMAIL_USER
npx wrangler secret put GMAIL_APP_PASSWORD
```

Also add `https://<your-worker-domain>/api/auth/callback` to **Supabase > Authentication > URL Configuration > Redirect URLs**.

---

## 3. Deploy to Cloudflare

### Option A: Deploy from your terminal

```bash
npm ci
npm run cf:deploy
```

### Option B: Auto-deploy via GitHub Actions

In your cloned GitHub repository (**Settings > Secrets and variables > Actions**), add:
- `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, Account Settings: Read)
- `CLOUDFLARE_ACCOUNT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL`

Then push to `main` (or trigger **Actions > Deploy to Cloudflare Workers > Run workflow**).

---

## 4. Note on daily email reports (`lib/mailer.js`)

`lib/mailer.js` uses `nodemailer` over SMTP (`smtp.gmail.com:465`). Standard Cloudflare Workers block raw outbound SMTP ports, so `/api/report/send` and the `0 14 * * *` cron on `/api/cron/daily-report` will fail to send email until `lib/mailer.js` is switched to an HTTP email API (such as Gmail REST API via `googleapis`, Resend, or Postmark).
