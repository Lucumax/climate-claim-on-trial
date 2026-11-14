// Bundle loader. Tries the real stats bundle first, then falls back to the clearly marked placeholder.
// All shape knowledge lives in normalize() so a schema change is a one-place edit.
const SOURCES = ["data/example_bundle.json", "data/placeholder_bundle.json"];
let cache = null;

export async function loadBundle() {
  if (cache) return cache;
  let lastErr;
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (!r.ok) { lastErr = new Error(url + " " + r.status); continue; }
      const raw = await r.json();
      cache = { ...normalize(raw), _source: url, _raw: raw };
      return cache;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("no bundle");
}

export function normalize(raw) {
  // Current shape = my PLACEHOLDER contract. Replace this function body when stats/SCHEMA.md lands.
  const b = { ...raw };
  b.placeholder = !!raw.placeholder;
  b.synthetic = !!(raw.synthetic || raw.placeholder);
  b.claims = (raw.claims || []).map(c => ({ ...c }));
  return b;
}

export const claimById = (b, id) => b.claims.find(c => c.id === id);
export function cellIndex(c, i, j) { return i * c.grid.n_lon + j; }
// 1 flagged increase, -1 flagged decrease, 0 not flagged, null no data
export function categoryCounts(flags) {
  let up = 0, down = 0, nf = 0, nd = 0;
  for (const v of flags) { if (v == null) nd++; else if (v > 0) up++; else if (v < 0) down++; else nf++; }
  return { up, down, nf, nd, n: up + down + nf };
}
