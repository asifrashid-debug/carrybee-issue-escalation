'use client';
import { useEffect } from 'react';

// Phone layout for data tables. On screens under 700px every `table.tbl` becomes a stacked card list
// (CSS in design-v3.css section 21 and demo.css). Each cell is labelled from its column header, so the
// pages do not need a data-label on every cell. Desktop markup is not changed.
//
// Runs after every DOM change (MutationObserver) so tables that load later are covered too.
// It only writes when something is missing, so it cannot loop on its own updates.
function labelTables(root) {
  root.querySelectorAll('table.tbl').forEach((table) => {
    if (!table.classList.contains('tbl-stack')) table.classList.add('tbl-stack');
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((tr) => {
      if (!tr.classList.contains('rw')) tr.classList.add('rw');
      let col = 0;
      Array.from(tr.children).forEach((td) => {
        const span = td.colSpan || 1;
        if (span === 1 && heads[col] && !td.hasAttribute('data-label')) td.setAttribute('data-label', heads[col]);
        col += span;
      });
    });
  });
}

export default function MobileTables() {
  useEffect(() => {
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => labelTables(document.body));
    };
    run();
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return null;
}
