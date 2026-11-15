# CarryBee Issue Escalation Tracker (v1)

DB is single source of truth. Issue ID `ESC-YYYYMMDD-####` is sync key. All timestamps UTC stored, displayed Asia/Dhaka `dd-MMM-yyyy hh:mm AM/PM`.

## Live resources (this build)
- Supabase project: `CarryBee Issue Escalation Tracker` (ref `kssypfibhlmoxucabhdu`, region `ap-southeast-1`)
  - URL: `https://kssypfibhlmoxucabhdu.supabase.co`
- Google Sheets (zone → spreadsheet):
  - ISD: `CarryBee Issue Escalation Tracker - ISD` — `1fseMs55zUnwNXeS73yO6mRUk0Or4mipphg3clS2wzLU`
  - OSD: `CarryBee Issue Escalation Tracker - OSD` — `10gHOAFJYA8jL7ykbhYUiBu-YsixOnmzJ3v5UbwNpK7g`
  - CTG: `CarryBee Issue Escalation Tracker - CTG` — `1K-FQ3SvBtvO6_HFuiRGkpgzUF-nJF7N7vNxbMl2L7GQ`
  - Tabs: `Active` (live), `Archive` (closed >90d), `Snapshot`
- Vercel: see deploy section below.

## Sheet layout (A–AC, 29 cols)
| Col | Header | Owner |
|---|---|---|
| A | Issue ID | system (protected) |
| B | Timestamp | system (protected) |
| C | Email Address | system (protected) |
| D | Consignment ID | requester (protected) |
| E | Merchant Name | requester (protected) |
| F | Channel (KAM/MX) | system (protected) |
| G | Zone (ISD/OSD/CTG) | requester (protected) |
| H | Concern Hub | requester (protected) |
| I | Issue Status (Open/Reopened/Closed) | requester (protected) |
| J | Issue Category | requester (protected) |
| K | Issue Sub Category | requester (protected) |
| L | Issue Details | requester (protected) |
| M | KAM Name | requester (protected) |
| N | Week (ISO) | system (protected) |
| O | Priority Scale (P1–P4) | requester (protected) |
| P | KAM Feedback Status | requester (protected; DB→sheet only) |
| Q | Layer 1 Response (HUB Incharge) | ops (editable, free text) |
| R | Layer 2 Response (Cluster Lead) | ops (editable, free text) |
| S | Layer 3 Response (Regional Lead) | ops (editable, free text) |
| T | Issue Pick Time | system/ops (set-once) |
| U | ISSUE STATUS (New/Picked/In Progress/On Hold/Resolved/Unresolved) | ops (dropdown) |
| V | Remarks | ops (editable) |
| W | Regional Lead | ops (dropdown, auto from Hub Master) |
| X | Issue Response Date & Time | system (protected, auto-stamped on first Layer 1/2/3 response) |
| Y | Division | ops (dropdown, auto from Hub Master) |
| Z | Ops Status (Pending/In Progress/Completed/Dropped) | ops (dropdown) |
| AA | Validation (Valid/Invalid/Duplicate/Insufficient Info) | ops (dropdown) |
| AB | Issue Category (Ops Type) | ops (dropdown) |
| AC | Row Version | hidden, service account only |
| AD | Last Synced At | hidden, service account only |

## Response SLA (per layer, cumulative)
- Clock starts at the issue Timestamp (column B).
- **Layer 1 (HUB Incharge)** cell (Q) turns **red** if still empty 2 hours after the issue was raised.
- **Layer 2 (Cluster Lead)** cell (R) turns **red** if Layer 1 is still empty at 2h AND Layer 2 is still empty at 4h.
- **Layer 3 (Regional Lead)** cell (S) turns **red** if Layers 1 and 2 are still empty at 2h/4h AND Layer 3 is still empty at 6h.
- Typing any text in a layer cell clears the red for that layer and stops the escalation to the layers below it.
- Conditional formatting formulas (applied to Q2:Q1000, R2:R1000, S2:S1000):
  - Q: `=AND($Q2="",$B2<>"",NOW()-$B2>2/24)`
  - R: `=AND($R2="",$Q2="",$B2<>"",NOW()-$B2>4/24)`
  - S: `=AND($S2="",$R2="",$Q2="",$B2<>"",NOW()-$B2>6/24)`
- Spreadsheet time zone must be **Asia/Dhaka** so NOW() and the Timestamp are compared in local time.

> Assumption A1: PRD lists Consignment ID / Merchant Name as one item but requires two form inputs + separate search. Implemented as two sheet columns (D,E), so Requester block is B–P (15 cols) and total is 30 cols (A–AD). DB stores them separately.

Protections: A–P + X protected (X = Issue Response Date & Time). Header frozen + styled, basic filter on, AC–AD hidden. Dropdowns on U, W, Y, Z, AA, AB. Layer cells Q–S are free text and stay editable.

## Setup
1. Supabase: project already created. Migrations in `supabase/migrations/001_init.sql` (already applied). Seed hubs/categories/users already inserted.
2. Env (Vercel + local `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `SHEET_ISD/OSD/CTG` (IDs above)
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — create GCP service account with Sheets scope, share each spreadsheet with it (Editor). Until set, DB→Sheet pushes are queued in `sync_log` as `failed` (no data loss; retry on reconcile).
   - `WEBHOOK_SECRET` — shared secret for Apps Script.
3. Run: `npm install && npm run dev` → http://localhost:3000
4. Seed demo: `npm run seed` (needs dotenv; or insert via Supabase SQL Editor).

## Apps Script (Sheet → DB)
For each hub spreadsheet: Extensions → Apps Script → paste `apps-script/Code.gs` → set `WEBHOOK_URL` to `https://<vercel>/api/webhook/sheet` + `WEBHOOK_SECRET` → Triggers → Add trigger `onEdit` (time-driven not needed; onEdit is installable). Test by editing an Ops cell.

## Sync rules
- DB→Sheet: on create/update/pick, `pushToSheet()` appends/updates by Issue ID (idempotent, never duplicates). Target ≤60s.
- Sheet→DB: webhook validates field ownership (Requester block → DB wins, rejected + logged), pick-time rules, response stamping (first comment stamps X once), auto-pick on `Picked`.
- Reconciliation: `POST /api/sync/reconcile {zone}` compares sheet vs DB, re-appends missing rows, repairs version drift. Schedule every 15 min via Vercel Cron or external cron. Daily report = `sync_log` where direction=reconciliation.
- Zone change (Admin only): PATCH with `actor_role=admin` + new `zone`; old row should be marked `MOVED → [new zone]` in old sheet (do via sheet UI or API), new row appended in new sheet with same Issue ID + full history (audit covers it).
- Archival: closed >90d (configurable in `app_config.validation.archive_days`) → move to `Archive` tab; DB keeps everything.

## Roles (pilot demo auth)
Tracker top bar lets you act as any seeded user (from `users_roles`). Prod must replace with Google Workspace SSO (CarryBee domain only) + RLS policies per role. Current RLS is permissive `pilot_all` for pilot; tighten before prod.
Seeded users: `asif.rashid@carrybee.com` (admin), `kam.user@…` / `mx.user@…` (requester), `hub.isd/osd/ctg@…` (hub_ops), `lead.dhaka@…` (regional_lead), `mgmt@…` (management).

## Acceptance mapping (AC-01…AC-15)
- AC-01/02: KAM/MX forms → DB + Issue ID + tracker ≤5s (see `app/api/escalations/route.js`, `components/EscalationForm.js`).
- AC-03: both empty blocked (API + form).
- AC-04: zone push ≤60s via `lib/sheets.js` (needs service account).
- AC-05/06: response stamp on first comment, set-once (API PATCH + webhook).
- AC-07: pick set-once, re-pick blocked; sheet pick validated.
- AC-08: protected ranges + API field ownership + audit.
- AC-09: KAM Feedback DB→sheet via PATCH push.
- AC-10: admin zone change (PATCH zone).
- AC-11: reconcile re-appends deleted rows.
- AC-12: filters/search/export (`/api/export`).
- AC-13: `audit_log` on every change.
- AC-14: `sync_log` queue + idempotent push (no duplicates).
- AC-15: server-side pagination + indexes (50k: add `EXPLAIN` check; seed via bulk insert if needed).

## Open questions (defaults used, per PRD)
Q1 Channel = escalating team (KAM/MX). Q2 Priority P1–P4, SLA pick 4h / response 24h / resolution 72h (configurable). Q3 ISSUE STATUS vs Ops Status kept separate. Q4 Closure = requester sets Closed after Resolved. Q5 Validation by Hub Ops/Lead. Q6 No separate last-response (only first-response stamp). Q7 Auto-stamp pick on Picked = yes. Q8 No historical migration. Q9 Regional Lead = view+edit own region. Q10 ISO week. Q11 Notifications = Phase 2 (hooks only). Q12 Sheets owned by service account (currently owned by `asif.rashid@carrybee.com`; share with service account).

## Conditional formatting note
Connector API rejects conditional-format `underline` field. Rules were attempted; if missing, add manually in Sheets: select O2:O1000 → Conditional formatting → Custom formula `=$O2="P1"` → red fill; S2:S1000 → `=AND($S2="",NOW()-$B2>4/24)` → orange; X2:X1000 → `=AND($X2<>"",$T2<>"Resolved")` → yellow. Or run a `googleapis` setup script with service account.
