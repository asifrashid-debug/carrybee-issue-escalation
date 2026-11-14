# Deploy to Vercel (production)
Project already created: carrybee-escalation-tracker (prj_lLgqwAshoQpPA2v4CXZvX5IGb9eM)
Env vars already set in Vercel (Supabase + Sheets + WEBHOOK_SECRET).

From this folder:
  npm i -g vercel
  vercel login
  vercel --prod

Then add GOOGLE_SERVICE_ACCOUNT_JSON in Vercel dashboard (Project > Settings > Environment Variables) and redeploy.
Then install Apps Script trigger per sheet (apps-script/Code.gs) with WEBHOOK_URL=https://<your-url>/api/webhook/sheet
