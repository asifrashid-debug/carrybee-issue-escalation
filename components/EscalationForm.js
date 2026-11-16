'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import SearchSelect from './SearchSelect';
import { isValidParcelId, matchActiveHub, requestHubLookup, COOLDOWN_MS, TIMEOUT_MESSAGE, NO_UNIQUE_MATCH_MESSAGE, MISSING_EXTENSION_MESSAGE } from '../lib/hubLookup.mjs';
import { priorityForIssueType } from '../lib/priority';
import { formatDhaka } from '../lib/time';
import { PageHead } from './demo';

const CM = 'CM';

// KAM and MX intake form (demo layout). Zone comes from the chosen hub. KAM is looked up from the business (MX only).
// Priority comes from the sub category, so requesters never choose it. Server stamps time, email and week.
export default function EscalationForm({ channel }) {
  const isKam = channel === 'KAM';
  const [masters, setMasters] = useState({ hubs: [], categories: [] });
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ email: '', consignment_id: '', merchant_name: '', concern_hub: '', issue_category: '', issue_sub_category: '', issue_details: '', kam_name: '' });
  const [biz, setBiz] = useState(null); // { q, found, business_name, kam_name, input_type } for the merchant box
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  // "Find current hub in Hive". state: idle | loading | confirm | confirmed | manual | missing | error
  const [hubLookup, setHubLookup] = useState({ state: 'idle', message: '' });
  const [hubAuto, setHubAuto] = useState(null);      // { hub_name } filled from Hive, waiting for the agent to confirm
  const [hubConfirmed, setHubConfirmed] = useState(false);
  const hubReq = useRef(null);                        // the only lookup allowed to update the form
  const lastLookup = useRef('');                      // the Consignment ID most recently sent to Hive (each ID is looked up once)
  const consRef = useRef('');
  consRef.current = form.consignment_id.trim();

  useEffect(() => { fetch('/api/masters', { cache: 'no-store' }).then((r) => r.json()).then(setMasters); }, []);
  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((m) => {
      setMe(m);
      if (m?.email) setForm((f) => ({ ...f, email: m.email }));
    });
  }, []);

  // MX: resolve the business ID or name typed in the merchant box (debounced, stale responses ignored).
  const merchantQ = form.merchant_name.trim();
  useEffect(() => {
    if (isKam || !merchantQ) { setBiz(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/business/lookup?q=${encodeURIComponent(merchantQ)}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (cancelled || !j) return;
          setBiz({ ...j, q: merchantQ });
          // A business ID is replaced by the business name
          if (j.found && j.input_type === 'id' && j.business_name) {
            setForm((f) => (f.merchant_name.trim() === merchantQ ? { ...f, merchant_name: j.business_name } : f));
          }
        })
        .catch(() => {});
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [merchantQ, isKam]);

  const reqCats = masters.categories.filter((c) => c.side === 'requester');
  const categoryOptions = useMemo(() => [...new Set(reqCats.map((c) => c.category))].sort().map((c) => ({ value: c, label: c })), [masters.categories]); // eslint-disable-line react-hooks/exhaustive-deps
  const subOptions = useMemo(() => reqCats.filter((c) => c.category === form.issue_category).map((c) => ({ value: c.sub_category, label: c.sub_category, hint: c.issue_type || '' })), [masters.categories, form.issue_category]); // eslint-disable-line react-hooks/exhaustive-deps
  const subRow = reqCats.find((c) => c.category === form.issue_category && c.sub_category === form.issue_sub_category);
  const priority = subRow ? priorityForIssueType(subRow.issue_type) : null;
  const hubOptions = useMemo(() => masters.hubs.map((h) => ({ value: h.hub_name, label: h.hub_name, hint: `${h.zone} · ${h.division || '—'}` })), [masters.hubs]);
  const hub = masters.hubs.find((h) => h.hub_name === form.concern_hub);
  const bizNow = biz && biz.q === merchantQ ? biz : null;
  const kamShown = !isKam && merchantQ ? (bizNow ? (bizNow.found ? bizNow.kam_name : CM) : 'Checking…') : CM;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Looks up the hub for one Consignment ID in Hive and preselects it. Nothing is submitted here.
  async function findHub(parcel) {
    const token = {};
    hubReq.current = token;
    lastLookup.current = parcel;
    setHubLookup({ state: 'loading', message: 'Finding hub…' });
    const r = await requestHubLookup(parcel, { win: window, origin: window.location.origin });
    if (hubReq.current !== token) return; // a newer lookup replaced this one
    if (consRef.current !== parcel) { setHubLookup({ state: 'idle', message: '' }); return; } // the ID changed while waiting
    if (r.kind === 'hub') {
      // The Hive text is only compared with the active list. It is never written into the form.
      const m = matchActiveHub(r.hub, masters.hubs);
      if (m.status === 'unique') {
        set('concern_hub', m.hub.hub_name);
        setHubAuto({ hub_name: m.hub.hub_name });
        setHubConfirmed(false);
        setHubLookup({ state: 'confirm', message: `Found: ${m.hub.hub_name}. Confirm zone and hub before you submit.` });
      } else {
        setHubLookup({ state: 'manual', message: NO_UNIQUE_MATCH_MESSAGE });
      }
    } else if (r.kind === 'timeout') {
      setHubLookup({ state: 'manual', message: TIMEOUT_MESSAGE });
    } else if (r.kind === 'missing') {
      setHubLookup({ state: 'missing', message: MISSING_EXTENSION_MESSAGE });
    } else {
      setHubLookup({ state: 'error', message: r.message });
    }
  }

  // Automatic: once the Consignment ID is valid and typing has paused for 1 second, look it up.
  // Waits while a lookup is running, then picks up any ID typed in the meantime.
  const hubLoading = hubLookup.state === 'loading';
  useEffect(() => {
    const parcel = consRef.current;
    if (!isValidParcelId(parcel) || hubLoading || masters.hubs.length === 0) return undefined;
    if (parcel === lastLookup.current) return undefined;
    const t = setTimeout(() => findHub(parcel), COOLDOWN_MS);
    return () => clearTimeout(t);
  }, [form.consignment_id, hubLoading, masters.hubs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing the Consignment ID drops a hub that was filled for the previous ID, so it cannot be submitted by mistake.
  function onConsignmentChange(value) {
    set('consignment_id', value);
    if (hubAuto) {
      set('concern_hub', '');
      setHubAuto(null);
      setHubConfirmed(false);
    }
    if (hubLookup.state !== 'loading') setHubLookup({ state: 'idle', message: '' });
  }

  function confirmHub() {
    setHubConfirmed(true);
    setHubLookup({ state: 'confirmed', message: `Zone and hub confirmed: ${form.concern_hub}.` });
  }

  const parcelOk = isValidParcelId(form.consignment_id);
  const findHint = !form.consignment_id.trim()
    ? 'Enter a Consignment ID. The hub is found automatically.'
    : !parcelOk
      ? 'Use only letters, numbers, dashes and underscores (up to 80 characters).'
      : masters.hubs.length === 0 ? 'Loading hubs…' : '';
  const detLen = form.issue_details.trim().length;
  const roleLabel = me?.role ? me.role.replace(/_/g, ' ') : '';

  async function submit(e) {
    e.preventDefault(); setErr(null); setMsg(null);
    if (!hub) { setErr('Select a Concern Hub from the list.'); return; }
    if (hubAuto && !hubConfirmed) { setErr('Confirm zone and hub before you submit.'); return; }
    if (!form.issue_category || !form.issue_sub_category) { setErr('Select an Issue Category and Sub Category.'); return; }
    if (isKam && !form.consignment_id.trim()) { setErr('Consignment ID is required.'); return; }
    if (!isKam && !form.consignment_id.trim() && !form.merchant_name.trim()) { setErr('Consignment ID and Merchant name cannot both be empty. Provide at least one.'); return; }
    if (form.issue_details.trim().length < 20) { setErr('Issue Details must be at least 20 characters.'); return; }
    // Zone and KAM are set by the server. KAM form sends its typed KAM name; MX form sends the merchant only.
    const body = { channel, email: form.email, consignment_id: form.consignment_id, concern_hub: form.concern_hub, issue_category: form.issue_category, issue_sub_category: form.issue_sub_category, issue_details: form.issue_details };
    if (isKam) body.kam_name = form.kam_name; else body.merchant_name = form.merchant_name;
    setBusy(true);
    const res = await fetch('/api/escalations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok) { setErr(j.error || 'Submit failed'); return; }
    setMsg({ id: j.data.issue_id, warn: j.duplicate_warning, kam: j.data.kam_name, zone: j.data.zone, at: j.data.submitted_at });
    setForm((f) => ({ ...f, consignment_id: '', merchant_name: '', concern_hub: '', issue_category: '', issue_sub_category: '', issue_details: '', kam_name: '' }));
    setBiz(null);
    setHubAuto(null); setHubConfirmed(false); setHubLookup({ state: 'idle', message: '' });
    lastLookup.current = '';
  }

  const idBlock = (
    <div className="idcard">
      Account: <b>{me?.display_name || me?.email || '—'}</b>{' '}
      {roleLabel && <span className="pillc" style={{ background: 'rgba(248,200,0,.18)', color: 'var(--y)' }}>{roleLabel}</span>}<br />
      Timestamp &amp; Week: <b style={{ color: 'var(--good)' }}>Server auto-stamped (Asia/Dhaka)</b>
    </div>
  );

  return (
    <>
    <PageHead
      kicker={`Form · ${channel}`}
      title={isKam ? 'New KAM escalation' : 'New MX escalation'}
      sub={`Saved to the database first. The sheet push is queued, and the issue appears in the tracker within 5 seconds. Channel is fixed to ${channel}.`}
    />
    <div className="kform-layout">
    <div className="fwrap">
      <div className="ph" style={{ padding: "18px 24px 0" }}>
        <div><h2>Issue details</h2><small>* required</small></div>
        <span className="chanpill" style={isKam ? undefined : { background: '#3B9CFF', color: '#fff' }}>CHANNEL: {channel}</span>
      </div>

      {msg && (
        <div className="box box-ok" role="status" style={{ margin: '16px 24px 0' }}>
          Submitted. Issue ID: <b>{msg.id}</b> · Zone <b>{msg.zone}</b>{!isKam && <> · KAM <b>{msg.kam}</b></>}{msg.at ? <> · {formatDhaka(msg.at)}</> : null}.
          {msg.warn && <div style={{ marginTop: 6 }}>⚠ {msg.warn}</div>}
          <div style={{ marginTop: 8 }}><a href="/">Go to Tracker →</a></div>
        </div>
      )}

      <form id="escalation-form" onSubmit={submit} noValidate>
        <div className="fbody">
          <div className="fgrid">
            <div className="full idbox">
              <h4><span>Consignment &amp; Merchant Identification (at least one required *)</span><small>Formats: CB-2026110845 or 10948271</small></h4>
              <div className="fgrid">
                <div>
                  <label className="flabel" htmlFor="consignment-id">Consignment ID {isKam ? '*' : ''}</label>
                  <div className="fctl"><input id="consignment-id" value={form.consignment_id} onChange={(e) => onConsignmentChange(e.target.value)} placeholder="e.g. CB-2026110899" aria-describedby="hub-find-hint" /></div>
                  <div id="hub-find-hint" className="hint">{findHint}</div>
                </div>
                {!isKam && (
                  <div>
                    <label className="flabel">Merchant name or business ID</label>
                    <div className="fctl"><input value={form.merchant_name} onChange={(e) => set('merchant_name', e.target.value)} placeholder="Type a business ID or name" /></div>
                    {merchantQ && (
                      <div className="hint">
                        {!bizNow && 'Looking up business…'}
                        {bizNow?.found && <>Business <b style={{ color: 'var(--ink)' }}>{bizNow.business_name}</b> · KAM <b style={{ color: 'var(--ink)' }}>{bizNow.kam_name}</b></>}
                        {bizNow && !bizNow.found && <>No business match{bizNow.input_type === 'ambiguous' ? ' (more than one business has this name)' : ''}. The KAM will be <b style={{ color: 'var(--ink)' }}>CM</b>.</>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <SearchSelect label="Concern Hub (225 master hubs, no free text)" value={form.concern_hub} onChange={(v) => { set('concern_hub', v); setHubAuto(null); setHubConfirmed(false); setHubLookup({ state: 'idle', message: '' }); }} options={hubOptions} placeholder="Type to search hub…" required emptyText="No hub matches. Try another spelling." />
            <div>
              <label className="flabel">Zone <small>(from the chosen hub)</small></label>
              <div className="fctl lk"><input value={hub?.zone || ''} readOnly aria-readonly="true" placeholder="Select a hub first" /></div>
            </div>
            {hub && <div className="full" style={{ fontSize: 12, color: 'var(--mut)', fontWeight: 600 }}>Regional lead <b style={{ color: 'var(--ink)' }}>{hub.regional_lead || '—'}</b> · Cluster lead <b style={{ color: 'var(--ink)' }}>{hub.cluster_lead || '—'}</b> · Division <b style={{ color: 'var(--ink)' }}>{hub.division || '—'}</b></div>}
            <div className="full" aria-live="polite">
              {hubLookup.state === 'loading' && <div className="hint">Finding hub…</div>}
              {hubLookup.state === 'confirm' && (
                <div className="box box-ok">
                  {/* Plain text: the hub name comes from the active hub list, never from raw HTML */}
                  {hubLookup.message}
                  <div style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-primary" onClick={confirmHub} style={{ minHeight: 44 }}>Confirm zone and hub</button>
                  </div>
                </div>
              )}
              {hubLookup.state === 'confirmed' && <div className="box box-ok">{hubLookup.message}</div>}
              {['manual', 'missing', 'error'].includes(hubLookup.state) && <div className="box box-warn" role="alert">{hubLookup.message}</div>}
            </div>

            <SearchSelect label="Issue Category *" value={form.issue_category} onChange={(v) => setForm((f) => ({ ...f, issue_category: v, issue_sub_category: '' }))} options={categoryOptions} placeholder="Select Issue Category…" required emptyText="No category matches." />
            <SearchSelect label="Issue Sub Category *" value={form.issue_sub_category} onChange={(v) => set('issue_sub_category', v)} options={subOptions} placeholder="Choose sub-category…" required disabled={!form.issue_category} hint="Choose category first" emptyText="No sub category matches." />

            <div>
              <label className="flabel">Priority <small>(set by the sub category)</small></label>
              <div className="fctl lk"><input value={priority ? `${priority} · ${subRow.issue_type}` : ''} readOnly aria-readonly="true" placeholder="Choose a sub category first" /></div>
            </div>
            {isKam ? (
              <div>
                <label className="flabel">KAM Name * <small>(typed in)</small></label>
                <div className="fctl"><input value={form.kam_name} onChange={(e) => set('kam_name', e.target.value)} placeholder="KAM name" /></div>
              </div>
            ) : (
              <div>
                <label className="flabel">Assigned KAM <small>(automatic from the business)</small></label>
                <div className="fctl lk"><input value={kamShown} readOnly aria-readonly="true" /></div>
              </div>
            )}

            <div className="full">
              <label className="flabel">Issue Details * <small>(English or Bangla, at least 20 characters)</small> <span className="count">{detLen} / 20 min chars</span></label>
              <div className="fctl" style={{ alignItems: 'flex-start' }}>
                <textarea value={form.issue_details} onChange={(e) => set('issue_details', e.target.value)} rows={4} placeholder="Describe the exact consignment issue, consignee availability, COD discrepancy, or special merchant instruction…" />
              </div>
            </div>
          </div>
        </div>

        {err && <div className="err on" role="alert" style={{ margin: '0 24px 14px' }}>{err}</div>}

      </form>
    </div>
    <aside className="kform-side" aria-label="What happens after you submit">
      <div className="kside-card">
        <h3>Account</h3>
        {idBlock}
      </div>
      <div className="kside-card">
        <h3>What happens next</h3>
        <ol className="kside-steps">
          <li><b>Saved first.</b> The escalation is written to the database before anything else.</li>
          <li><b>Sheet push queued.</b> The zone sheet is updated in the background.</li>
          <li><b>Visible in the tracker</b> within about 5 seconds, with its Issue ID.</li>
        </ol>
      </div>
      <div className="kside-card">
        <h3>Defaults on submit</h3>
        <dl className="kside-defs">
          <dt>Issue Status</dt><dd>Open</dd>
          <dt>KAM Feedback</dt><dd>Pending</dd>
          <dt>Ops Status</dt><dd>Pending</dd>
        </dl>
      </div>
      <div className="kside-card kside-note">Channel is fixed to {channel}. Times are recorded in Asia/Dhaka.</div>
      <div className="kside-card">
        <h3>Submit</h3>
        <p className="small muted" style={{ margin: '0 0 12px' }}>Writes to the database. Nothing is sent until you submit.</p>
        <button type="submit" form="escalation-form" className="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Submitting…' : `Submit ${isKam ? 'KAM' : 'MX'} Escalation`}</button>
      </div>
    </aside>
    </div>
    </>
  );
}
