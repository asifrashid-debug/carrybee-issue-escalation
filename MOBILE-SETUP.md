# Using the tracker on a phone (iPhone and Android)

The tracker now auto-fills the **Concern Hub** on a phone too — **no browser extension is needed**.
The laptop extension ("CarryBee Hive to Tracker") keeps working exactly as before; on a phone the
tracker does the same job from the server.

## 1. Put the tracker on your home screen (once)

The site is installable as an app on both iPhone and Android. Open
`https://carrybee-escalation-tracker.vercel.app` in your phone's browser, sign in, and tap the
**Install app** button on the page (or the steps below). After that, a **CB Tracker** icon appears
on your home screen and the app opens full screen, like a normal app.

- **Android (Chrome):** tap the ⋮ menu → **Install app** (or *Add to Home screen*).
- **iPhone (Safari):** tap the **Share** button (square with arrow) → **Add to Home Screen**.

## 2. Filing an escalation on a phone

1. Open **CB Tracker** → sign in.
2. Open the **KAM** or **MX** form.
3. Type the **Consignment ID** (for example `CB-2026110899`).
4. Pause typing for one second — **the Concern Hub fills itself automatically**. A green note says
   where it came from:
   - **"Hub filled from Hive."** — real-time from Hive (only after step 4 below is set up), or
   - **"Hub filled from the last escalation for this Consignment ID on …"** — from the tracker's own history.
5. Choose **Issue Category → Sub Category** (priority is set automatically), write **Issue Details**
   (at least 20 characters), and press **Submit**.

If no hub could be found automatically (for example a brand-new Consignment ID that was never
escalated before, while Hive is not connected yet), the form shows:
*"Auto hub lookup is not available on this device. Select the Concern Hub from the list (type to
search)."* — just type the first letters in the **Concern Hub** box and pick from the 225 master
hubs. Nothing breaks; the rest of the form works the same on a phone as on a laptop.

## 3. What changed (technical)

- New endpoint `POST /api/hub-lookup` (`app/api/hub-lookup/route.js`, logic in
  `lib/hubLookupServer.mjs`), signed-in users only. It tries, in order:
  1. **Hive** — when `HIVE_API_URL` is configured (server-side version of the extension).
  2. **Tracker history** — the most recent escalation for the same Consignment ID
     (`escalations` table).
- The escalation form (`components/EscalationForm.js`) asks the extension first (laptop, unchanged),
  then falls back to the endpoint. The hub text is still matched against the active hub list
  before it is written to the form — same trust rules as before.
- Tests: `tests/hubLookupServer.test.mjs`, plus new cases in `tests/hubLookup.test.mjs`.

## 4. (Admin) Connecting Hive for real-time lookup on phones

Until this is done, phones use the "last escalation" history from step 2. To get the real-time
Hive answer on every device (and to make the laptop extension optional), the server needs a way to
ask Hive for a Consignment ID's current hub.

Ask the Hive team for:
- an endpoint that takes a Consignment ID and returns its current hub (for example
  `https://<hive>/api/track/{id}` returning JSON),
- an API key (or any auth header they provide),
- the JSON path where the hub text sits (for example `data.currentHub`).

Then in **Vercel → Project → Settings → Environment Variables (Production)** add:

| Variable | Value |
| --- | --- |
| `HIVE_API_URL` | the endpoint URL, with `{id}` where the Consignment ID goes |
| `HIVE_API_KEY` | the API key (sent as `Authorization: Bearer …`) |
| `HIVE_HUB_JSON_PATH` | dot path to the hub text, e.g. `data.currentHub` (omit if it is `hub`) |
| `HIVE_LOOKUP_METHOD` | `GET` (default) or `POST` |
| `HIVE_TIMEOUT_MS` | optional, default `8000` |

Then **redeploy** (settings only apply on the next deploy). From that moment, the escalation form
on **any** device — phone or laptop — gets the live Hive hub first, and the laptop extension is
only a backup. If a Hive call fails, the form automatically falls back to the tracker history, and
then to manual selection.

## Rollback

If anything looks wrong after the deploy: Vercel → previous READY production deployment →
**Instant Rollback** (the site serves the previous commit until you fix it).
