# Push and deploy: phone hub-lookup solution (no extension needed)

Base: GitHub main `2fcc3bc` (the commit this branch was cut from).
Tested: patch applies to a fresh copy of that main; full test suite (227/227) passes; `next build` exits 0.
Not included: `.env.local` (secrets), `.vercel/`.

What this does: the escalation form auto-fills the **Concern Hub on a phone** (iPhone and Android)
without the Chrome extension. It first asks the extension (laptop, unchanged), then asks the new
`/api/hub-lookup` endpoint: **Hive** when `HIVE_API_URL` is set in Vercel, otherwise **the last
escalation for the same Consignment ID**. See `MOBILE-SETUP.md` for phone steps and the admin
checklist for connecting Hive.

## Steps (on your machine)

1. Copy `carrybee-phone-hub-lookup.patch` and `push-phone-hub-lookup.sh` to your computer.
2. Your clone must be clean (`git status` shows nothing).
3. Set your identity once: `git config user.name "Your Name"` and `git config user.email "you@example.com"`.
4. Run:
   `bash push-phone-hub-lookup.sh ~/path/to/carrybee-issue-escalation ~/path/to/carrybee-phone-hub-lookup.patch`
   It pulls main, applies the patch, runs `npm ci`, `npm test` and `next build`, stages only the
   listed files, then asks you to type `yes`. Nothing is committed or pushed until you type `yes`.
5. The push starts the Vercel production deploy automatically.

## Check Vercel after the push

- Deployments: the newest Production deployment shows the new commit and status READY.
- On a phone: open the site, sign in, open the KAM form, type a Consignment ID that was escalated
  before — the Concern Hub should fill itself and show a green note
  "Hub filled from the last escalation for this Consignment ID on …".
- The laptop is unchanged: with the extension installed it still answers first.

## Optional: connect Hive for real-time hub lookup on every device

See **MOBILE-SETUP.md, section 4**. Add `HIVE_API_URL` (+ `HIVE_API_KEY`,
`HIVE_HUB_JSON_PATH`, `HIVE_LOOKUP_METHOD`) in Vercel → Settings → Environment Variables
(Production) and redeploy. Until then, phones use the last-escalation history.

## If something is wrong

- Build fails on Vercel: production keeps serving the previous deployment. Send the build log to the agent.
- Live site is wrong after a good build: Vercel → previous READY production deployment → Instant Rollback. Or `git revert` the new commit and push.
