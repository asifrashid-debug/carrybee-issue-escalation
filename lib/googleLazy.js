// Loads the googleapis SDK on first use instead of when a module is imported.
// Loading it takes most of a second on a cold start, and most API routes (the header badges, the list, the analytics)
// never touch Google. Only the routes that write to a sheet or Drive call this.
let googlePromise = null;

export function loadGoogle() {
  if (!googlePromise) googlePromise = import('googleapis').then((m) => m.google);
  return googlePromise;
}
