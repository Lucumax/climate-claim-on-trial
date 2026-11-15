// Live data provider for Detective mode: NASA POWER monthly API, called straight from the browser (no key, no server).
// Facts from data/POWER_LIVE_NOTES.md (probed Nov 14): CORS allows any origin on success and on errors; a preflight (OPTIONS) is
// refused, so we send NO custom headers; regional requests need 2 to 10 degrees on each axis and take ONE parameter; the point
// endpoint takes a single location. Boxes are tiled in 10 degree pieces, at most 4 requests at a time.
//
// Contract (stable):  planBox(box) -> { kind, tiles, message, ... }
//                     fetchMonthly({ variable, box, startYear, endYear, onProgress, signal }) -> { stub:false, source, units, rows:[{year,month,value}], note, method, n_tiles, n_cells }
export const LIVE_IS_STUB = false;
export const MAX_TILES = 20;         // about 25 s at 4 at a time; up to 40 x 50 degrees
const MAX_LAT_DEG = 40, MAX_LON_DEG = 50, TILE_DEG = 10, MIN_DEG = 2, CONCURRENCY = 4, FILL = -999;
const BASE = "https://power.larc.nasa.gov/api/temporal/monthly/";
const cache = new Map(); // url -> parsed JSON, for this page session only

export function validateBox(b) {
  const errs = [];
  if (![b.s, b.n, b.w, b.e].every(Number.isFinite)) return ["Enter all four numbers."];
  if (b.s < -90 || b.n > 90) errs.push("Latitude must be between -90 and 90.");
  if (b.w < -180 || b.e > 180) errs.push("Longitude must be between -180 and 180.");
  if (b.s >= b.n) errs.push("The south edge must be below the north edge.");
  if (b.w >= b.e) errs.push("The west edge must be left of the east edge.");
  return errs;
}

function split(lo, hi) { const n = Math.max(1, Math.ceil((hi - lo) / TILE_DEG - 1e-9)), step = (hi - lo) / n; return [...Array(n)].map((_, i) => [+(lo + i * step).toFixed(4), +(lo + (i + 1) * step).toFixed(4)]); }

// How a box will be served. kind: "point" | "regional" | "too_big"
export function planBox(b) {
  const dLat = b.n - b.s, dLon = b.e - b.w;
  if (dLat < MIN_DEG || dLon < MIN_DEG) {
    const c = { lat: +((b.s + b.n) / 2).toFixed(3), lon: +((b.w + b.e) / 2).toFixed(3) };
    return { kind: "point", tiles: 1, point: c, message: `This box is under ${MIN_DEG} degrees on at least one side, which NASA POWER's area service does not accept. We will use the single grid cell at the center of the box (${c.lat}, ${c.lon}) instead, so the result is for that one cell, not the whole box.` };
  }
  const nTiles = Math.ceil(dLat / TILE_DEG - 1e-9) * Math.ceil(dLon / TILE_DEG - 1e-9);
  if (nTiles > MAX_TILES) {
    const world = dLat >= 170 && dLon >= 340;
    const tiles = nTiles;
    const cx = (b.w + b.e) / 2, cy = (b.s + b.n) / 2, h = Math.min(dLat, MAX_LAT_DEG) / 2, w = Math.min(dLon, MAX_LON_DEG) / 2;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const alt = { s: clamp(cy - h, -90, 90 - 2 * h), n: 0, w: clamp(cx - w, -180, 180 - 2 * w), e: 0 };
    alt.s = +alt.s.toFixed(2); alt.n = +(alt.s + 2 * h).toFixed(2); alt.w = +alt.w.toFixed(2); alt.e = +(alt.w + 2 * w).toFixed(2);
    return { kind: "too_big", tiles, alt, message: (world ? "A whole-world view is not supported. " : "This box is too large. ") + `NASA POWER live requests are limited to regional boxes: this one would need about ${tiles} requests of roughly 3 MB each, too slow for a browser. Live mode handles up to ${MAX_TILES} requests, roughly a ${MAX_LAT_DEG} by ${MAX_LON_DEG} degree box. Choose a smaller box, a preset region, or use the largest allowed box around the center of your selection.` };
  }
  const tiles = []; for (const la of split(b.s, b.n)) for (const lo of split(b.w, b.e)) tiles.push({ s: la[0], n: la[1], w: lo[0], e: lo[1] });
  return { kind: "regional", tiles, message: tiles.length === 1 ? "One request to NASA POWER." : `${tiles.length} requests to NASA POWER, up to ${CONCURRENCY} at a time.` };
}

class PowerError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function getJson(url, signal) {
  if (cache.has(url)) return cache.get(url);
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { signal }); // no headers on purpose: any custom header would trigger a refused preflight
      if (r.ok) { const j = await r.json(); cache.set(url, j); return j; }
      let detail = ""; try { const j = await r.json(); detail = (j.messages && j.messages.join(" ")) || j.message || ""; } catch (e) { /* no body */ }
      if (r.status === 429 || r.status >= 500) { lastErr = new PowerError(`NASA POWER is busy right now (error ${r.status}).`, r.status); await new Promise(res => setTimeout(res, 1500)); continue; }
      throw new PowerError(r.status === 422 ? `NASA POWER did not accept this request${detail ? ": " + detail : "."}` : `NASA POWER returned error ${r.status}${detail ? ": " + detail : "."}`, r.status);
    } catch (e) {
      if (e.name === "AbortError") throw e;
      if (e instanceof PowerError && e.status < 500 && e.status !== 429) throw e;
      lastErr = e instanceof PowerError ? e : new PowerError("Could not reach NASA POWER. Check your internet connection and try again.", 0);
    }
  }
  throw lastErr;
}

async function pool(items, n, worker) {
  const out = new Array(items.length); let next = 0, failed = null;
  await Promise.all([...Array(Math.min(n, items.length))].map(async () => {
    while (!failed) { const i = next++; if (i >= items.length) return; try { out[i] = await worker(items[i], i); } catch (e) { failed = failed || e; } }
  }));
  if (failed) throw failed;
  return out;
}

export async function fetchMonthly({ variable, box, startYear, endYear, onProgress, signal }) {
  const plan = planBox(box);
  if (plan.kind === "too_big") throw new PowerError(plan.message, 0);
  if (!variable.power_param) throw new PowerError(variable.not_live_note || "This variable is not available live.", 0);
  const P = variable.power_param, yrs = `&start=${startYear}&end=${endYear}&community=RE&format=JSON`;
  const prog = (done, total) => { if (onProgress) onProgress({ done, total }); };
  const cells = new Map(); // "lat,lon" -> { lat, series: {YYYYMM: value} } (cells repeat across tile edges, so de-duplicate)
  if (plan.kind === "point") {
    prog(0, 1);
    const j = await getJson(`${BASE}point?parameters=${P}&latitude=${plan.point.lat}&longitude=${plan.point.lon}${yrs}`, signal);
    cells.set("p", { lat: plan.point.lat, series: j.properties.parameter[P] }); prog(1, 1);
  } else {
    let done = 0; prog(0, plan.tiles.length);
    await pool(plan.tiles, CONCURRENCY, async t => {
      const j = await getJson(`${BASE}regional?parameters=${P}&latitude-min=${t.s}&latitude-max=${t.n}&longitude-min=${t.w}&longitude-max=${t.e}${yrs}`, signal);
      for (const f of j.features || []) { const [lon, lat] = f.geometry.coordinates; cells.set(lat + "," + lon, { lat, series: f.properties.parameter[P] }); }
      prog(++done, plan.tiles.length);
    });
  }
  // area-weighted (cos latitude) mean of the cells that have a value that month; month code 13 is POWER's own annual value, skipped
  const sum = new Map(), wsum = new Map();
  for (const c of cells.values()) {
    const w = Math.max(0.01, Math.cos(c.lat * Math.PI / 180));
    for (const [k, v] of Object.entries(c.series)) { if (k.endsWith("13") || v === FILL || v == null) continue; sum.set(k, (sum.get(k) || 0) + v * w); wsum.set(k, (wsum.get(k) || 0) + w); }
  }
  const rows = [...sum.keys()].sort().map(k => ({ year: +k.slice(0, 4), month: +k.slice(4), value: +(sum.get(k) / wsum.get(k)).toFixed(4) }));
  if (!rows.length) throw new PowerError("NASA POWER returned no values for this variable, place and period.", 0);
  const first = rows[0].year, last = rows[rows.length - 1].year;
  let note = plan.kind === "point" ? plan.message + " " : `Average of ${cells.size} NASA POWER grid squares in the box; squares nearer the poles count a little less because they cover less ground. `;
  if (first > startYear || last < endYear) note += `Data exist only from ${first} to ${last} here, so that is the period used. `;
  note += "NASA POWER series for this variable are model-based, so a trend can reflect changes in the data sources as well as the climate.";
  return { stub: false, source: variable.source, units: variable.units, rows, note, method: plan.kind, n_tiles: plan.tiles.length || 1, n_cells: cells.size, first_year: first, last_year: last };
}
