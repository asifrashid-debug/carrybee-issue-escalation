# Push and deploy: web and phone layer

Base: GitHub main 6e80577 (the commit Vercel serves in production, dpl_6gb59X7…).
Tested: patch applied to a fresh copy of main; npm test 105/105 pass; next build exit 0.
Not included: .env.local (secrets), .env.example, .vercel/, demo files.

## Steps (on your machine)
1. Copy carrybee-web-and-phone-layer.patch and push-web-and-phone-layer.sh to your computer.
2. Your clone must be clean (git status shows nothing).
3. Set your identity once: git config user.name "Your Name" and git config user.email "you@example.com"
4. Run: bash push-web-and-phone-layer.sh ~/path/to/carrybee-issue-escalation ~/path/to/carrybee-web-and-phone-layer.patch
   It pulls main, applies the patch, runs npm ci, npm test and next build, stages only the listed files,
   then asks you to type yes. Nothing is committed or pushed until you type yes.
5. The push starts the Vercel production deploy automatically.

## Check Vercel after the push
- Deployments: the newest Production deployment shows the new commit and status READY.
- Then open https://carrybee-escalation-tracker.vercel.app. Check the desktop pages and a phone (Add to Home Screen).
- Tell the agent when pushed and it will confirm the deployed commit.

## If something is wrong
- Build fails on Vercel: production keeps serving the previous deployment. Send the build log to the agent.
- Live site is wrong after a good build: Vercel → previous READY production deployment (dpl_6gb59X7…) → Instant Rollback. Or git revert the new commit and push.
