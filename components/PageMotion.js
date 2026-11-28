'use client';
import { usePathname } from 'next/navigation';

// Wraps every page's content. Keyed on the route, so each page replays its entrance motion when you navigate to it.
// Styling lives in app/cw-live.css (the "page motion" block, under .page-motion).
export default function PageMotion({ children }) {
  const pathname = usePathname();
  return <div key={pathname} className="page-motion">{children}</div>;
}
