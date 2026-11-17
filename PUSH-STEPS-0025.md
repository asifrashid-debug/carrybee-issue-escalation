# Patch 0025: Tracker demo layout (queue cards, chip views, live data only)

Files changed (3, two new):
- app/page.js (Tracker rebuilt to the demo layout; live data only)
- app/trk-demo.css (NEW: the demo's CSS, scoped under .trk-demo, so only the Tracker changes)
- components/trk-icons.js (NEW: the demo's icon paths)

Everything else is unchanged: data fetch, filters, views, export, bulk KAM feedback, copy buttons,
optional columns, pagination, Board view, drawer, roles. Other pages are not touched (the demo CSS is scoped).

Not yet pushed. Do step 5 only after you have reviewed the result.

## Run these in Git Bash

Folder: `/e/Carrybee Tracker` (branch `main`).

1. Check the starting point. The last commit should be the Windows test fix:

    cd "/e/Carrybee Tracker"
    git status --short
    git log --oneline -1

   Expected: `tests: formatDhaka probe uses a file URL (fixes Windows failure)`.
   If `git status` shows changes, stop and send me the output.

2. Apply the patch as a commit:

    cd "/e/Carrybee Tracker"
    git -c user.name="ahmed asif rashid" -c user.email="asif.rashid@carrybee.com" am "/e/Carrybee Tracker/patches/0025-Tracker-match-the-demo-layout-live-data-only.patch"

   If it fails, run `git am --abort` and send me the error text.
   (Save the patch file into a `patches` folder inside `Carrybee Tracker` first, or change the path to where you saved it.)

3. Test and build:

    cd "/e/Carrybee Tracker"
    npm test
    npm run build

   Expected: `# pass 108`, `# fail 0`, and the build finishes with no errors.

4. Run it locally and check the Tracker on desktop and on a phone-width window:

    cd "/e/Carrybee Tracker"
    npm run dev

   Open http://localhost:3000, sign in, and open the Tracker tab. Check the queue cards,
   the chip views, the Open button, and the bulk select checkboxes (team lead account).

5. Only after you confirm the result, push (you run this yourself):

    cd "/e/Carrybee Tracker"
    git push origin main

   Vercel then builds the new production deployment. Do not push before you confirm.

## Rollback
If anything looks wrong after push, roll back with the previous production deployment
(`dpl_9g2NGC56ixTvV83cZh41LmKqNMHD`, commit `e8cfaab`) or revert commit 0025:

    cd "/e/Carrybee Tracker"
    git revert --no-edit HEAD
    git push origin main

## Still open (not in this patch)
- Sign-in error "Could not load issues" on the live site: needs your check of deployment
  `dpl_F2R3LbPLCVwmkWDef2zLVWyzcdcF` and the `0023` push.
