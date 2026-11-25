'use client';
import { getMe } from './cw/meClient';
import { useEffect, useMemo, useRef, useState } from 'react';
import SearchSelect from './SearchSelect';
import {
  isValidParcelId, matchActiveHub, requestHubLookup, serverHubLookupClient, isIOSDevice, isMobileAgent,
  COOLDOWN_MS, TIMEOUT_MESSAGE, NO_UNIQUE_MATCH_MESSAGE, NO_HUB_SUGGESTION_MESSAGE,
  DESKTOP_NO_HUB_SUGGESTION_MESSAGE,
} from '../lib/hubLookup.mjs';
import { priorityForIssueType } from '../lib/priority';
import { formatDhaka } from '../lib/time';
import { isIrOnlyRoute } from '../lib/irEscalation.mjs';

const CM = 'CM';

// KAM and MX intake form (demo layout). Zone comes from the chosen hub. KAM is looked up from the business (MX only).
// Priority comes from the sub category, so requesters never choose it. Server stamps time, email and week.
export default function EscalationForm({ channel }) {
  const isKam = channel === 'KAM';
  const [masters, setMasters] = useState({ hubs: [], categories: [], ir_categories: [] });
  const [me, setMe] = useState(null);
  const [form, setForm] = useState({ email: '', consignment_id: '', merchant_name: '', concern_hub: '', issue_category: '', issue_sub_category: '', issue_details: '', kam_name: '' });
  const [biz, setBiz] = useState(null); // { q, found, business_name, kam_name, input_type } for the merchant box
  const [routes, setRoutes] = useState({ hub: false, ir: false, sort_tnl: false }); // KAM: where the issue goes (HUB / IR / Sort-TNL)
  const [mailSubject, setMailSubject] = useState(''); // KAM IR: optional mail subject line
  const [files, setFiles] = useState([]);             // KAM IR: attachments, zipped on the server
  const [fileKey, setFileKey] = useState(0);          // changes after a submit, so the file picker clears
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  // "Find current hub in Hive". state: idle | loading | found | manual | error
  const [hubLookup, setHubLookup] = useState({ state: 'idle', message: '' });
  const [hubAuto, setHubAuto] = useState(null);      // { hub_name } filled from Hive; cleared if the Consignment ID changes
  const hubReq = useRef(null);                        // the only lookup allowed to update the form
  const lastLookup = useRef('');                      // the Consignment ID most recently sent to Hive (each ID is looked up once)
  const consRef = useRef('');
  consRef.current = form.consignment_id.trim();

  useEffect(() => { fetch('/api/masters', { cache: 'no-store' }).then((r) => r.json()).then(setMasters); }, []);
  useEffect(() => {
    getMe().then((m) => {
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

  // IR box ticked alone: the IR category list. Otherwise the requester list (HUB, or HUB + IR).
  const irOnly = isKam && isIrOnlyRoute(routes);
  const reqCats = masters.categories.filter((c) => c.side === 'requester');
  const catRows = irOnly ? (masters.ir_categories || []) : reqCats;
  const categoryOptions = useMemo(() => [...new Set(catRows.map((c) => c.category))].sort().map((c) => ({ value: c, label: c })), [masters.categories, masters.ir_categories, irOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const subOptions = useMemo(() => catRows.filter((c) => c.category === form.issue_category).map((c) => ({ value: c.sub_category, label: c.sub_category, hint: c.issue_type || '' })), [masters.categories, masters.ir_categories, irOnly, form.issue_category]); // eslint-disable-line react-hooks/exhaustive-deps
  const subRow = catRows.find((c) => c.category === form.issue_category && c.sub_category === form.issue_sub_category);
  const priority = subRow ? priorityForIssueType(subRow.issue_type) : null;
  const hubOptions = useMemo(() => masters.hubs.map((h) => ({ value: h.hub_name, label: h.hub_name, hint: `${h.zone} · ${h.division || '—'}` })), [masters.hubs]);
  const hub = masters.hubs.find((h) => h.hub_name === form.concern_hub);
  const bizNow = biz && biz.q === merchantQ ? biz : null;
  const kamShown = !isKam && merchantQ ? (bizNow ? (bizNow.found ? bizNow.kam_name : CM) : 'Checking…') : CM;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Ticking or unticking a box. Moving between the IR list and the requester list clears the category, so a
  // category from the wrong list cannot be submitted.
  function toggleRoute(k, checked) {
    const next = { ...routes, [k]: checked };
    if (isIrOnlyRoute(routes) !== isIrOnlyRoute(next)) setForm((f) => ({ ...f, issue_category: '', issue_sub_category: '' }));
    setRoutes(next);
  }

  // Short note shown when a hub was filled automatically.
  function hubFoundNote(source, historyAt) {
    if (source === 'hive') return 'Hub filled from Hive.';
    if (source === 'history' && historyAt) return `Hub filled from the last escalation for this Consignment ID on ${formatDhaka(historyAt)}.`;
    return 'Hub filled automatically.';
  }

  // Looks up the hub for one Consignment ID and preselects it. Nothing is submitted here.
  // 1. The CarryBee Hive helper extension (laptops, no change).
  // 2. The tracker server (/api/hub-lookup): Hive when configured, otherwise the last escalation
  //    for the same Consignment ID. This is what makes auto hub-fill work on iPhone and Android.
  async function findHub(parcel) {
    const token = {};
    hubReq.current = token;
    lastLookup.current = parcel;
    setHubLookup({ state: 'loading', message: 'Finding hub…' });
    // iPhones and iPads cannot run the Chrome extension, so skip its ping (1.5 s) and go straight
    // to the server. Everywhere else (laptop, Android Chrome) the extension is asked first.
    let r = isIOSDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
      ? { kind: 'missing' }
      : await requestHubLookup(parcel, { win: window, origin: window.location.origin });
    if (hubReq.current !== token) return; // a newer lookup replaced this one
    if (consRef.current !== parcel) { setHubLookup({ state: 'idle', message: '' }); return; } // the ID changed while waiting
    if (r.kind !== 'hub') {
      // Extension is not there (iPhone) or failed: ask the tracker server.
      const s = await serverHubLookupClient(parcel);
      if (hubReq.current !== token) return;
      if (consRef.current !== parcel) { setHubLookup({ state: 'idle', message: '' }); return; }
      if (s.kind === 'hub') r = s;
      else if (s.kind === 'error' && (r.kind === 'missing' || r.kind === 'timeout')) r = s;
    }
    if (r.kind === 'hub') {
      // The hub text (Hive, history or server) is only compared with the active list. It is never written into the form as-is.
      const m = matchActiveHub(r.hub, masters.hubs);
      if (m.status === 'unique') {
        set('concern_hub', m.hub.hub_name);
        setHubAuto({ hub_name: m.hub.hub_name });
        setHubLookup({ state: 'found', message: hubFoundNote(r.source, r.history_at) });
      } else {
        setHubLookup({ state: 'manual', message: NO_UNIQUE_MATCH_MESSAGE });
      }
    } else if (r.kind === 'missing') {
      // No extension answer and the server found no hub for this ID: nothing to suggest yet.
      const mobile = isMobileAgent(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
      const message = mobile ? NO_HUB_SUGGESTION_MESSAGE : DESKTOP_NO_HUB_SUGGESTION_MESSAGE;
      setHubLookup({ state: 'manual', message });
    } else if (r.kind === 'timeout') {
      setHubLookup({ state: 'manual', message: TIMEOUT_MESSAGE });
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
    }
    if (hubLookup.state !== 'loading') setHubLookup({ state: 'idle', message: '' });
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
    if (isKam && !routes.hub && !routes.ir && !routes.sort_tnl) { setErr('Tick at least one box: HUB, IR or Sort/TNL.'); return; }
    if (isKam && files.length && !routes.ir) { setErr('Attachments are only accepted when the IR box is ticked.'); return; }
    if (isKam && files.length > 10) { setErr('Attach at most 10 files.'); return; }
    if (isKam && files.reduce((n, f) => n + f.size, 0) > 20 * 1024 * 1024) { setErr('Attachments are larger than 20 MB in total.'); return; }
    if (!hub) { setErr('Select a Concern Hub from the list.'); return; }
    if (!form.issue_category || !form.issue_sub_category) { setErr('Select an Issue Category and Sub Category.'); return; }
    if (isKam && !form.consignment_id.trim()) { setErr('Consignment ID is required.'); return; }
    if (!isKam && !form.consignment_id.trim() && !form.merchant_name.trim()) { setErr('Consignment ID and Merchant name cannot both be empty. Provide at least one.'); return; }
    if (form.issue_details.trim().length < 20) { setErr('Issue Details must be at least 20 characters.'); return; }
    // Zone and KAM are set by the server. The KAM name comes from the signed-in account; MX form sends the merchant only.
    const body = { channel, email: form.email, consignment_id: form.consignment_id, concern_hub: form.concern_hub, issue_category: form.issue_category, issue_sub_category: form.issue_sub_category, issue_details: form.issue_details };
    if (!isKam) body.merchant_name = form.merchant_name;
    if (isKam) { body.route_hub = routes.hub; body.route_ir = routes.ir; body.route_sort_tnl = routes.sort_tnl; if (routes.ir) body.mail_subject = mailSubject; }
    setBusy(true);
    let res;
    if (files.length) {
      const fd = new FormData(); fd.append('payload', JSON.stringify(body)); files.forEach((f) => fd.append('attachments', f, f.name));
      res = await fetch('/api/escalations', { method: 'POST', body: fd });
    } else {
      res = await fetch('/api/escalations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }
    const j = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok) { setErr(j.error || 'Submit failed'); return; }
    setMsg({ id: j.data.issue_id, warn: j.duplicate_warning, kam: j.data.kam_name, zone: j.data.zone, at: j.data.submitted_at });
    setForm((f) => ({ ...f, consignment_id: '', merchant_name: '', concern_hub: '', issue_category: '', issue_sub_category: '', issue_details: '', kam_name: '' }));
    setBiz(null);
    setHubAuto(null); setHubLookup({ state: 'idle', message: '' });
    lastLookup.current = '';
    setRoutes({ hub: false, ir: false, sort_tnl: false }); setMailSubject(''); setFiles([]); setFileKey((k) => k + 1);
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
    <div className="ph">
      <div>
        <div className="kicker">{`Form · ${channel}`}</div>
        <h1>{isKam ? 'New KAM escalation' : 'New MX escalation'}</h1>
        <p className="sub">{`Saved to the database first. The sheet push is queued, and the issue appears in the tracker within 5 seconds. Channel is fixed to ${channel}.`}</p>
      </div>
    </div>
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

            {isKam && (
              <div className="full" style={{ display: 'grid', gap: 10 }}>
                <label className="flabel">Send this issue to * <small>(tick one or more)</small></label>
                <div role="group" aria-label="Where to send this issue" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                  {[['hub', 'HUB'], ['ir', 'IR'], ['sort_tnl', 'Sort/TNL']].map(([k, label]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <input type="checkbox" checked={routes[k]} onChange={(e) => toggleRoute(k, e.target.checked)} /> {label}
                    </label>
                  ))}
                </div>
                {routes.sort_tnl && <div className="hint">Sort/TNL routing is not set up yet. The issue is saved to the database only.</div>}
                {irOnly && <div className="hint">IR categories are shown because only the IR box is ticked.</div>}
                {routes.ir && (
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div>
                      <label className="flabel" htmlFor="ir-mail-subject">Mail Subject Line <small>(optional)</small></label>
                      <div className="fctl"><input id="ir-mail-subject" value={mailSubject} maxLength={200} onChange={(e) => setMailSubject(e.target.value)} placeholder="Subject for the IR mail" /></div>
                    </div>
                    <div>
                      <label className="flabel" htmlFor="ir-attachments">Attachments <small>(optional. Zipped on save. Up to 10 files, 20 MB total)</small></label>
                      <input key={fileKey} id="ir-attachments" type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
                      {files.length > 0 && <div className="hint">{files.length} file{files.length === 1 ? '' : 's'} will be zipped on save.</div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            <SearchSelect label="Concern Hub (225 master hubs, no free text)" value={form.concern_hub} onChange={(v) => { set('concern_hub', v); setHubAuto(null); setHubLookup({ state: 'idle', message: '' }); }} options={hubOptions} placeholder="Type to search hub…" required emptyText="No hub matches. Try another spelling." />
            <div>
              <label className="flabel">Zone <small>(from the chosen hub)</small></label>
              <div className="fctl lk"><input value={hub?.zone || ''} readOnly aria-readonly="true" placeholder="Select a hub first" /></div>
            </div>
            {hub && <div className="full" style={{ fontSize: 12, color: 'var(--mut)', fontWeight: 600 }}>Regional lead <b style={{ color: 'var(--ink)' }}>{hub.regional_lead || '—'}</b> · Cluster lead <b style={{ color: 'var(--ink)' }}>{hub.cluster_lead || '—'}</b> · Division <b style={{ color: 'var(--ink)' }}>{hub.division || '—'}</b></div>}
            <div className="full" aria-live="polite">
              {hubLookup.state === 'loading' && <div className="hint">Finding hub…</div>}
              {hubLookup.state === 'found' && <div className="box box-ok" role="status">{hubLookup.message}</div>}
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
                <label className="flabel">KAM Name <small>(from your account)</small></label>
                <div className="fctl lk"><input value={me?.display_name || me?.email || ''} readOnly aria-readonly="true" placeholder="Loading your name…" /></div>
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
        <button type="submit" form="escalation-form" className={'submit' + (busy ? ' lg-busy' : '')} disabled={busy} style={{ width: '100%' }}>{busy ? <span className="lg-loading"><svg className="lg-bee-fly" viewBox="0 0 60 40" aria-hidden="true"><ellipse className="lg-wing" cx="26" cy="11" rx="8" ry="6" fill="currentColor" opacity=".85" /><ellipse className="lg-wing lg-wing-b" cx="36" cy="10" rx="8" ry="6" fill="currentColor" opacity=".6" /><path d="M14 22c6-1 12 0 18 2 9 3 14 0 16 4-1 6-12 10-22 8-6-1-10-6-12-14z" fill="currentColor" /><path d="M22 22v9M30 23v8M38 24v6" stroke="var(--bee)" strokeWidth="2.4" strokeLinecap="round" /></svg>Submitting…</span> : `Submit ${isKam ? 'KAM' : 'MX'} Escalation`}</button>
      </div>
    </aside>
    </div>
    </>
  );
}
