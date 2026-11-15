'use client';
import { useState } from 'react';

// Copies text to the clipboard. Stops the click from reaching the row (the row opens the issue drawer).
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the fallback */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

export default function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  if (!text) return null;
  const onClick = async (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    const ok = await copyText(String(text));
    if (ok) { setDone(true); setTimeout(() => setDone(false), 1400); }
  };
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={onClick}
      onKeyDown={(ev) => ev.stopPropagation()}
      title={`${label}: ${text}`}
      aria-label={`${label}: ${text}`}
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}
