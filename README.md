# Daily report, Send report button, 8 PM cron: apply to GitHub main

Copy every file in this folder into your local clone at the same relative path (e.g. `lib/mailer.js`).
These files are new, so nothing existing is overwritten by the copy itself.

## 1. Install the mailer library
From the clone root (Git Bash):
    npm install nodemailer@^10.6.0

This updates package.json and package-lock.json.

## 2. Add the 8 PM schedule to vercel.json
Keep everything already in vercel.json and add a "crons" entry. Example for the current file (regions shown as in the sandbox copy):

    {
      "regions": ["sin1"],
      "crons": [
        { "path": "/api/cron/daily-report", "schedule": "0 14 * * *" }
      ]
    }

14:00 UTC is 20:00 Asia/Dhaka.

## 3. Add the three settings to .env.example (documentation only, no values)
    # Daily 8 PM report (Gmail SMTP app password, cron auth)
    GMAIL_USER=<...>
    GMAIL_APP_PASSWORD=<...>
    CRON_SECRET=<...>

## 4. Add the button to the dashboard
In app/dashboard/page.js:
- Add at the top with the other imports:
      import SendReportButton from '../../components/SendReportButton';
- In the page header of the loaded dashboard, next to the date filter (the header that renders DateRangeFilter), add:
      <SendReportButton />
The button renders only for role admin, so team leads will not see it.

## 5. Check locally before pushing
    npm run build

It must finish without errors. Then, with `.env.local` in place:
    npm run dev
Sign in as the super admin, open the dashboard and click "Send report". The draft should open and show the preview.
Click Cancel. Do NOT click the send button until the three Vercel settings are in place.

## 6. Commit and push
    git add -A
    git commit -m "Daily 8 PM team report, super admin draft and send, cron"
    git push origin main

A push to main deploys to Vercel.

## 7. Vercel settings (Project > Settings > Environment Variables, Production)
- GMAIL_USER: the Gmail / Workspace sender address
- GMAIL_APP_PASSWORD: a Google app password for that account (not the normal password)
- CRON_SECRET: a long random string you generate (for example: openssl rand -hex 32)
Settings changed after a deploy only apply to the next deploy: redeploy after adding them.

## 8. Test the scheduled job without sending
    curl -s -H "Authorization: Bearer <CRON_SECRET>" "https://<your-domain>/api/cron/daily-report?dry=1"
This returns the recipient list and portfolio counts. Nothing is sent.

## What to send back if something fails
- the build output (if npm run build fails)
- the dry-run JSON from step 8
- the error text shown in the Send report dialog
