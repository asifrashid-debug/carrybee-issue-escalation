# MX CRM API

The MX CRM sends issues to the CarryBee tracker through this API. Each issue is saved as an **MX** issue (the same kind the MX form creates) and is **always routed to HUB**. The API never sends an issue to IR, Central Sort or TNL.

---

## 1. Overview

| Item | Value |
|---|---|
| Base URL | `https://<tracker-domain>` (production domain of the tracker) |
| Create an issue | `POST /api/mx/issues` |
| Check an issue | `GET /api/mx/issues?external_id=<id>` |
| Format | JSON in and out (UTF-8) |
| Authentication | `Authorization: Bearer <MX_API_KEY>` |
| Idempotency | Keyed on `external_id`. Retries are safe. |
| Routing | HUB always. `route_*` fields are ignored. |
| Time zone | Times are returned in ISO 8601 (UTC). Dhaka time is used for SLA and week numbering. |

---

## 2. Authentication

Every request must include:

```
Authorization: Bearer <MX_API_KEY>
```

- The key is set by CarryBee in the server environment variable `MX_API_KEY`.
- A missing or wrong key returns `401` with `WWW-Authenticate: Bearer`.
- If `MX_API_KEY` is not set on the server, every request returns `401`. Nothing is accepted by default.
- Send the key only over HTTPS. Do not put it in URLs, logs or chat messages.
- **Rotation:** set a new `MX_API_KEY` in the server environment, redeploy, then give the new key to the MX team. The old key stops working as soon as the new deployment is live, so coordinate the switch.

---

## 3. Create an issue: `POST /api/mx/issues`

### 3.1 Request fields

| Field | Type | Required | Rules |
|---|---|---|---|
| `external_id` | string | yes | The MX CRM's own reference for this issue. Letters, digits, and `. _ : -` only. Up to 100 characters. This is the idempotency key. |
| `reporter_email` | string | yes | Email of the MX team member who raised the issue. Stored as the issue's raiser. Must be a valid email. Stored in lower case. |
| `consignment_id` | string | one of the two | 6 to 30 letters, digits or dashes (`-`). No spaces or underscores. Checked after uppercasing, the same rule as the database. |
| `merchant_name` | string | one of the two | A business ID or business name. Looked up in Business Master. Up to 200 characters. |
| `concern_hub` | string | yes | Hub name **exactly** as in Hub Master (no free text). |
| `issue_category` | string | yes | Must be an active pair with `issue_sub_category` in the requester category list. |
| `issue_sub_category` | string | yes | See `issue_category`. |
| `issue_details` | string | yes | 20 to 2,000 characters. |

Valid values (checked against the live database):
- **Hub Master:** 244 hub names. Examples: `Mirpur Hub`, `Dhaka Central Hub`, `Chattogram Central Hub`. Some hubs have near-duplicate names (for example `Mohammadpur` and `Mohammadpur Hub`, `Jatrabari` and `Jatrabari Hub`, `Uttara` and `Uttara Hub`). Send the exact name. Do not guess.
- **Requester category pairs:** 105 active pairs (for example `Pickup` / `Pickup Timing Issue`, `Delivery Delay` / `Rider Shortage`, `Damage` / `Poor Packaging`, `Lost` / `Trackless`). Several pairs are inactive, for example `Delivery Delay` / `Late Delivery`, and are rejected. The full list is available from CarryBee on request.

Rules:
- At least one of `consignment_id` or `merchant_name` must be given.
- Any other fields are ignored. In particular, `route_hub`, `route_ir`, `route_central_sort` and `route_tnl` are ignored. Every MX API issue is HUB-routed.
- The request body must be 64 KB or less.

### 3.2 Example request

```bash
curl -X POST "https://<tracker-domain>/api/mx/issues" \
  -H "Authorization: Bearer $MX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "external_id": "MXCRM-2026-000123",
    "reporter_email": "rahim.ahmed@carrybee.com",
    "consignment_id": "CB12345678",
    "merchant_name": "Acme Store",
    "concern_hub": "Mirpur Hub",
    "issue_category": "Pickup",
    "issue_sub_category": "Pickup Timing Issue",
    "issue_details": "Parcel was not picked up within the promised window. Merchant called twice."
  }'
```

### 3.3 Responses

**201 Created**: the issue was saved.

```json
{
  "issue_id": "CB-26-11-7421",
  "submitted_at": "2026-11-14T06:12:09.418Z",
  "zone": "ISD",
  "concern_hub": "Mirpur Hub",
  "kam_name": "CM",
  "issue_status": "Open",
  "ops_issue_status": "New",
  "ops_status": "Pending",
  "routes": { "hub": true },
  "sync": "success",
  "duplicate_warning": null
}
```

- `kam_name`: the KAM from Business Master for the merchant. `CM` if no business matched.
- `sync`: result of the HUB sheet write. `success`, `failed` or `queued`. A `failed` value does **not** undo the issue. The issue is saved and CarryBee retries or fixes the sheet write (see section 6).
- `duplicate_warning`: set when an open issue exists with the same Consignment ID and category. The issue is still created.

**200 OK**: the same `external_id` and the same content were sent before. Nothing new was created. The existing issue is returned with `"replayed": true`.

```json
{ "issue_id": "CB-26-11-7421", "replayed": true, "routes": { "hub": true }, "...": "same fields as 201" }
```

### 3.4 Errors

| HTTP | `code` | Meaning | What to do |
|---|---|---|---|
| 400 | `validation` | One or more fields are wrong. `errors` lists each field and message. | Fix the fields and send again with the same `external_id`. |
| 400 | `bad_json` | Body is not valid JSON. | Send valid JSON with `Content-Type: application/json`. |
| 401 | `unauthorized` | Key is missing, wrong, or the server has no key set. | Check the key. Ask CarryBee if it was rotated. |
| 409 | `external_id_conflict` | This `external_id` was already sent with **different** content. | Do not reuse an `external_id` for a different issue. Use a new one, or send the original content. |
| 409 | `in_progress` | The same `external_id` is being processed now. | Wait a few seconds, then retry. Or check with `GET`. |
| 413 | `too_large` | Body is over 64 KB. | Remove extra content. |
| 500 | `server_error` | Could not save. **Nothing was saved.** | Retry with the same `external_id` after a short wait. |

Validation example (400):

```json
{
  "error": "Validation failed",
  "code": "validation",
  "errors": [
    { "field": "concern_hub", "message": "Concern Hub must match a name in Hub Master exactly." },
    { "field": "issue_details", "message": "At least 20 characters." }
  ]
}
```

---

## 4. Check an issue: `GET /api/mx/issues?external_id=<id>`

Returns the status of an issue the MX CRM sent. Internal fields are not returned.

```bash
curl "https://<tracker-domain>/api/mx/issues?external_id=MXCRM-2026-000123" \
  -H "Authorization: Bearer $MX_API_KEY"
```

**200 OK**

```json
{
  "external_id": "MXCRM-2026-000123",
  "issue_id": "CB-26-11-7421",
  "submitted_at": "2026-11-14T06:12:09.418Z",
  "zone": "ISD",
  "concern_hub": "Mirpur Hub",
  "kam_name": "CM",
  "issue_status": "Open",
  "ops_issue_status": "New",
  "ops_status": "Pending",
  "routes": { "hub": true }
}
```

| HTTP | `code` | Meaning |
|---|---|---|
| 202 | `in_progress` | Still being processed. Check again shortly. |
| 404 | `not_found` | No issue with this `external_id`. |
| 400 | `validation` | `external_id` missing. |
| 401 | `unauthorized` | Key missing or wrong. |

---

## 5. Processing steps (what happens inside CarryBee)

```
MX CRM                     CarryBee API                              Database / Sheets
  |  POST /api/mx/issues      |                                              |
  |-------------------------->|                                              |
  |                           | 1. Check Bearer key (constant time)          |
  |                           |    no key / wrong key -> 401                 |
  |                           | 2. Read body (<= 64 KB, JSON)                |
  |                           |    -> 413 / 400 bad_json                     |
  |                           | 3. Validate fields                           |
  |                           |    -> 400 validation (errors[])              |
  |                           | 4. Claim external_id (mx_api_requests) ----->| insert, or read existing
  |                           |    same id + same content -> 200 replayed    |
  |                           |    same id + other content -> 409 conflict   |
  |                           |    claim without issue -> 409 in_progress    |
  |                           | 5. Consignment format (app_config)  ------->|
  |                           | 6. Hub exists in Hub Master         ------->|  -> 400 if not
  |                           | 7. Category pair is active (requester)  --->|  -> 400 if not
  |                           | 8. Business lookup -> business name + KAM -->|
  |                           | 9. Duplicate check (open, same consignment   |
  |                           |    and category) -> warning only    ------->|
  |                           | 10. Next issue ID (next_issue_id)   ------->|
  |                           | 11. Insert issue: channel MX,               |
  |                           |     route_hub = true, others false   ------->| escalations
  |                           | 12. Audit row (source 'system')      ------->| audit_log
  |                           | 13. HUB sheet write (logged)         ------->| sync_log, Google Sheet
  |                           | 14. CM notification if KAM is CM (best effort, never fails the request)
  |                           | 15. Save issue_id on the claim       ------->| mx_api_requests
  |  201 (issue_id, sync...)  |                                              |
  |<--------------------------|                                              |
  |                           |
  | Any failure before step 11: claim is released, nothing saved, 400 or 500.
  | The MX CRM retries with the same external_id.
```

Notes on the steps:
- **Step 4 is the idempotency guard.** Two requests with the same `external_id` cannot create two issues.
- **Steps 5 to 7** are the same checks the MX form makes. A failure there returns `400` and releases the claim.
- **Step 8:** a business ID or name gives the business name and its KAM. No match gives KAM `CM`. For `CM`, the issue goes to the CM queue and the CM pick timer starts.
- **Step 13:** the HUB sheet write. If it fails, the issue still exists. The failure is recorded in `sync_log` with status `failed` and shown in the response as `sync: "failed"`.
- **After step 11, nothing releases the claim.** If a later step fails, the issue is still reported as saved (`201`), and a retry with the same `external_id` replays it. A duplicate cannot be created this way.
- **Known risk:** if the claim cannot be pointed at the saved issue after two tries, the server logs `mx_api: could not attach issue to claim`. Retries of that `external_id` return `409 in_progress` until someone fixes the claim row. Tell CarryBee if this appears in the logs.
- **Step 14:** CM members get a notification, the same as for a form-created CM issue.

### After the issue is saved

The issue then follows the normal lifecycle: HUB response, KAM feedback, and the pick and feedback timers. Because it is HUB-routed, it appears in the HUB list. It is saved with channel `MX`, the same as a form-created MX issue.

---

## 6. Sync failures

When `sync` is `failed`:
1. Open `sync_log` in the database and filter by `issue_id` to see `error_message`.
2. Fix the cause (for example, sheet permissions, or an unset environment variable).
3. The issue is already saved. Ask CarryBee to re-run the HUB sheet write for that `issue_id`.

Do not send the same issue again with a new `external_id`. That would create a duplicate.

---

## 7. Setup checklist (CarryBee side)

1. **Migration `026_mx_api.sql`: already applied** to the live Supabase project on 28 Nov 2026 (recorded as `mx_api`). It created `mx_api_requests` with RLS on and no policies, so only the server (service role) can reach it. Do not apply it again.
2. **Set `MX_API_KEY`** in Vercel (Production, and Preview if you test there). Use a long random value, for example `openssl rand -hex 32`.
3. **Deploy** the code (the route, `lib/mxApi.mjs`, `lib/mxIntake.js`, and the `middleware.js` change that makes `/api/mx/` public, because the key check happens in the route).
4. **Test on a preview deployment** with the examples in sections 3.2 and 4. Expect `201`, then the same request again expecting `200 replayed`, then a changed body expecting `409`.
5. **Give the MX team the key** through a secure channel (password manager share, or a secure message). Never through chat or plain email.
6. **Watch the first live requests:** `mx_api_requests` (one row per `external_id`), `escalations` (channel `MX`), and `sync_log` (failed rows).

---

## 8. Setup checklist (MX team side)

1. Use `POST https://<tracker-domain>/api/mx/issues` with `Content-Type: application/json` and the Bearer key.
2. Give every issue a unique, stable `external_id`. Reuse it when retrying the same issue.
3. Send `reporter_email` for the person who raised the issue, and a `concern_hub` that matches Hub Master exactly. Use the list in the tracker to check names.
4. Use the category and sub category exactly as in the requester list.
5. Handle the responses:
   - `201` or `200`: saved. Store `issue_id`.
   - `400`: fix the fields listed in `errors`, then send again with the same `external_id`.
   - `409 in_progress` or `500`: wait and retry with the same `external_id`.
   - `409 external_id_conflict`: do not reuse the id. Investigate on your side.
   - `401`: check the key.
6. To check progress, call `GET /api/mx/issues?external_id=...`.

---

## 9. Limits and what is not included

- **Rate limit:** none is enforced yet. Tell CarryBee if the MX CRM sends bursts above a few hundred requests a minute.
- **One key for all MX clients.** Per-client keys or request signing can be added later.
- **Status updates are not pushed back** to the MX CRM. The MX team checks with `GET`.
- **Attachments are not accepted.** The MX form does not take attachments either.
- **Batch creation** (many issues in one request) is not supported. Send one request per issue.

---

## 10. Testing

Automated (in the repository):
- `tests/mxApi.test.mjs`: validation, field limits, routing (HUB always), request fingerprint, key checks.
- `tests/mxIntake.test.mjs`: idempotency states (new, replay, conflict, in progress), claim release on validation failure, and no silent retry on database errors.

Route checks (run on a deployment):
- No key or wrong key returns `401`.
- Bad JSON returns `400 bad_json`.
- Missing fields return `400 validation` with `errors`.
- A valid request returns `201`. The same request again returns `200` with `replayed: true`. The same `external_id` with a changed field returns `409 external_id_conflict`.
- `GET` with a known `external_id` returns `200`. With an unknown one, `404`.

Not verified in the development sandbox: the live database path (the migration has not been applied to the live project, and the create path has been tested with a fake database client only), the real HUB sheet write, and the deployed Vercel behaviour. Check these on a preview deployment before going live.

---

## 11. Decisions to confirm

1. **`reporter_email` is required** in every request, so the issue shows who raised it. Alternative: one shared service identity for all MX API issues.
2. **Authentication is one shared key.** Acceptable for a single MX CRM. Per-client keys or HMAC signing are options if more systems connect.
3. **Audit source is `system`** with the reporter as actor. The database check on `audit_log.source` does not allow `api`. Adding `api` needs a migration.
4. **Field limits** (details 20 to 2,000 characters, external ID up to 100 characters) are chosen to match the form. Tell me if the MX CRM needs different limits.
