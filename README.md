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
| Q | Comments 1 (Ops End) | ops (editable) |
| R | Comments 2 (Ops End) | ops (editable) |
| S | Issue Pick Time | system/ops (set-once) |
| T | ISSUE STATUS (New/Picked/In Progress/On Hold/Resolved/Unresolved) | ops (dropdown) |
| U | Remarks | ops (editable) |
| V | Regional Lead | ops (dropdown, auto from Hub Master) |
| W | Division | ops (dropdown, auto from Hub Master) |
| X | Issue Response Date & Time | system (protected, auto-stamped) |
| Y | Ops Status (Pending/In Progress/Completed/Dropped) | ops (dropdown) |
| Z | Validation (Valid/Invalid/Duplicate/Insufficient Info) | ops (dropdown) |
| AA | Issue Category (Ops Type) | ops (dropdown) |
| AB | Row Version | hidden, service account only |
| AC | Last Synced At | hidden, service account only |

> Assumption A1: PRD lists Consignment ID / Merchant Name as one item but requires two form inputs + separate search. Implemented as two sheet columns (D,E), so Requester block is B–P (15 cols) and total is 29 cols (not 28). DB stores them separately.

Protections: A–P + X protected (blocked edits). Header frozen + styled, basic filter on, AB–AC hidden. Dropdowns on T,Y,Z,AA,V,W. Conditional formatting (P1 red, unpicked breach, responded-but-unclosed) — see note below.

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
