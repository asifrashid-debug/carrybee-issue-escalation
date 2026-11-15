'use client';
import { useId, useMemo, useRef, useState } from 'react';

// Searchable single-select. Type to filter, arrow keys + Enter to choose, Escape to close.
// options: [{ value, label, hint? }]. `hint` is also searched (e.g. zone or division for hubs).
export default function SearchSelect({ label, value, onChange, options, placeholder = 'Search…', disabled = false, required = false, emptyText = 'No match found', maxResults = 150, hint }) {
  const uid = useId();
  const inputId = `ss-${uid.replace(/:/g, '')}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrap = useRef(null);
  const selected = options.find((o) => o.value === value) || null;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => `${o.label} ${o.hint || ''}`.toLowerCase().includes(q)) : options;
    return list.slice(0, maxResults);
  }, [options, query, maxResults]);

  function choose(opt) {
    onChange(opt.value);
    setQuery('');
    setOpen(false);
  }
  function onKeyDown(e) {
    if (disabled) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && shown[active]) { e.preventDefault(); choose(shown[active]); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
  }
  function onBlur(e) {
    if (wrap.current && wrap.current.contains(e.relatedTarget)) return;
    setOpen(false);
    setQuery('');
  }

  const display = open ? query : (selected ? selected.label : '');
  return (
    <div className="combo" ref={wrap}>
      <label className="field" htmlFor={inputId}>
        {label}
        <input
          id={inputId}
          className="inp"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required || undefined}
          autoComplete="off"
          placeholder={disabled ? hint || 'Not available yet' : placeholder}
          value={display}
          disabled={disabled}
          required={required && !value}
          onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); setActive(0); } }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
      </label>
      {open && !disabled && (
        <ul id={listId} role="listbox" className="combo-list" aria-label={label}>
          {shown.length === 0 && <li className="combo-empty">{emptyText}</li>}
          {shown.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`combo-opt${i === active ? ' is-active' : ''}${o.value === value ? ' is-selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{o.label}</span>
              {o.hint && <span className="combo-hint">{o.hint}</span>}
            </li>
          ))}
          {options.length > shown.length && query.trim() === '' && <li className="combo-empty">Showing {shown.length} of {options.length}. Type to narrow down.</li>}
        </ul>
      )}
    </div>
  );
}
