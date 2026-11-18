'use client';
import { useRef, useState } from 'react';

// The Status control on each tracker card.
// Press Status: the button goes away and the Hive order status shows in its place.
// Press the status: it goes away and the Status button comes back.
// The lookup goes through the CarryBee Hive extension, the only place with the user's Hive login.
// Nothing is saved. The result is kept only in this card's state.

const PING_MS = 1500;      // is the extension answering?
const REQUEST_MS = 30000;  // Hive lookups can take a few seconds

const MESSAGES = {
  'no-extension': 'CarryBee Hive extension is not active in this Chrome. Turn it on and reload this page.',
  'timeout': 'Hive did not respond in time.',
  'not-found': 'Not found on Hive.',
  'login': 'Log in to Hive in this Chrome first.',
  'network': 'Could not reach Hive. Check the connection.',
  'shape-changed': 'Hive returned an unexpected page.',
  'status-missing': 'Hive row has no status.',
  'no-id': 'No Consignment ID.',
  'extension-error': 'The Hive helper hit an error. Reload the extension.'
};

function messageFor(error) {
  if (MESSAGES[error]) return MESSAGES[error];
  if (/^http-\d+$/.test(error || '')) return 'Hive returned an error (' + error.slice(5) + ').';
  return 'Hive lookup failed.';
}

// Posts a request to the page bridge and waits for the matching reply. Resolves null if none arrives.
function ask(sendType, replyType, payload, ms) {
  return new Promise(function (resolve) {
    var requestId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    var done = false;
    var timer = null;
    function finish(value) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(value);
    }
    function onMessage(ev) {
      if (ev.source !== window || ev.origin !== window.location.origin) return;
      var d = ev.data;
      if (!d || typeof d !== 'object' || d.requestId !== requestId || d.type !== replyType) return;
      finish(d);
    }
    window.addEventListener('message', onMessage);
    timer = setTimeout(function () { finish(null); }, ms);
    window.postMessage(Object.assign({ type: sendType, requestId: requestId }, payload), window.location.origin);
  });
}

async function lookupStatus(consignmentId) {
  var ping = await ask('CARRYBEE_STATUS_PING', 'CARRYBEE_STATUS_PONG', {}, PING_MS);
  if (!ping) return { ok: false, error: 'no-extension' };
  var reply = await ask('CARRYBEE_STATUS_REQUEST', 'CARRYBEE_STATUS_RESPONSE', { consignmentId: consignmentId }, REQUEST_MS);
  if (!reply) return { ok: false, error: 'timeout' };
  return reply.result || { ok: false, error: 'extension-error' };
}

function formatTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
  return 'Updated ' + s.replace(',', '');
}

var PILL = {
  display: 'inline-block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  borderRadius: 999, padding: '4px 10px', fontSize: 12, lineHeight: '18px', boxSizing: 'border-box'
};
var PILL_OK = Object.assign({}, PILL, { background: '#FFCC00', color: '#111', fontWeight: 700, border: '1px solid #E0B000' });
var PILL_ERR = Object.assign({}, PILL, { background: '#FDECEC', color: '#B42318', fontWeight: 700, border: '1px solid #F5C2C0' });
var PILL_BUSY = Object.assign({}, PILL, { background: '#EEF0F3', color: '#4B5563', fontWeight: 600, border: '1px solid #D9DDE3' });

function StatusView({ result, onBack }) {
  var pill = PILL_BUSY;
  var text = 'Checking Hive…';
  var sub = '';
  var tip = 'Checking Hive…';
  if (result) {
    if (result.ok) {
      pill = PILL_OK;
      text = result.orderStatus || 'No status';
      tip = result.orderStatus || 'No status';
      sub = formatTime(result.statusUpdatedAt);
    } else {
      pill = PILL_ERR;
      text = messageFor(result.error);
      tip = text;
    }
  }
  return (
    <button
      type="button"
      onClick={onBack}
      title={tip + '\nClick to show the Status button'}
      aria-label={'Hive status: ' + tip + '. Click to show the Status button.'}
      style={{
        display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3,
        background: 'none', border: 0, padding: 0, cursor: 'pointer', maxWidth: 220, font: 'inherit', color: 'inherit'
      }}
    >
      <span style={pill}>{text}</span>
      {sub && <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{sub}</span>}
    </button>
  );
}

export default function HiveStatus({ consignmentId }) {
  var id = String(consignmentId || '').trim();
  var [showStatus, setShowStatus] = useState(false);
  var [result, setResult] = useState(null); // null while checking
  var run = useRef(0);                      // ignores replies that arrive after the user has hidden the status

  function onCheck(ev) {
    ev.stopPropagation();
    var mine = ++run.current;
    setResult(null);
    setShowStatus(true);
    lookupStatus(id).then(function (r) {
      if (run.current === mine) setResult(r);
    });
  }

  function onBack(ev) {
    ev.stopPropagation();
    run.current++;
    setShowStatus(false);
  }

  if (!showStatus) {
    return (
      <button
        type="button"
        className="btn sm"
        style={{ height: 28, fontSize: 12 }}
        onClick={onCheck}
        disabled={!id}
        title={id ? 'Check the Hive order status' : 'No consignment ID on this issue'}
        aria-label={'Status for ' + (id || 'this issue')}
      >
        Status
      </button>
    );
  }
  return <StatusView result={result} onBack={onBack} />;
}
