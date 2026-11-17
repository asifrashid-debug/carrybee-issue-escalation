# Push steps: patches 0010 to 0016

Base: GitHub `main` at `d6dc2ce` (production on Vercel is already built from this commit).

Run in your local clone of `carrybee-issue-escalation`, on `main`, with `d6dc2ce` as HEAD:

    git log --oneline -1          # should show d6dc2ce
    git am 0010-admin-hub-add-form.patch
    git am 0011-kam-mx-forms-demo-layout.patch
    git am 0012-tracker-at-a-glance-pipeline.patch
    git am 0013-dashboard-week-change.patch
    git am 0014-sync-sources-table.patch
    git am 0015-no-access-header.patch
    git am 0016-next-14.2.35-patch-release.patch
    git push origin main

Or apply everything as one diff:

    git apply ALL-0010-0016-combined.patch
    git add -A && git commit -m "Demo layout: Admin, KAM/MX forms, Tracker, Dashboard, Sync, No access; Next 14.2.35"
    git push origin main

Patch author on the commits is a placeholder ("Patch prep"). Amend it with
`git commit --amend --reset-author` after `git am` if you want your name on them.

Checks already run here: npm test 108/108; next build exit 0 on the full tree;
the series applies cleanly on d6dc2ce and matches the working tree byte for byte.

Not in these patches (decide first):
- vercel.json sets regions to sin1; the project runs on iad1.
- npm audit: 6 issues left (next 16 and googleapis 178 are breaking upgrades).
- Preview environment lacks SUPABASE_SERVICE_ROLE_KEY, WEBHOOK_SECRET and GOOGLE_OAUTH_* (production has them).
