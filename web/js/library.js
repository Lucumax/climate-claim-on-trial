// NASA data library for Investigate (satellite observations and NASA model output, labeled by the manifest "kind"): precomputed 1-degree monthly grids, read straight from the page (no server).
// Format (data/library/manifest.json): 30 x 30 degree tiles, each gunzipped to [all high bytes][all low bytes] of int16 values,
// layout [month][30 rows north to south][30 columns west to east], value = int16 * scale + offset, -32768 = no data.
// Tiles that are entirely no-data are not written. We load only the tiles that intersect the box and keep them for the visit.
//
// Contract (stable):
//   loadLibrary()                                 -> [variable] (those listed in the manifest; empty if the manifest cannot be read)
//   libraryPlan(variable, box)                    -> { whole, tiles, cells, mb } or { whole, tiles:0, cells:0, empty:true }
//   libraryRegional({ variable, box, onProgress, signal }) -> { rows:[{year,month,value}], note, n_cells, n_tiles, first_year, last_year, gaps:[...], whole }
//   completeSeasons(rows, months, y0, y1)         -> { rows, skipped:[season-year labels] }   (gaps break the series: incomplete or wholly absent seasons are dropped and listed, never filled)
const BASE = "data/library/", NODATA = -32768, T = 30;
let manifestP = null;
const tileCache = new Map(), globalCache = new Map();

export const WORLD = { s: -90, n: 90, w: -180, e: 180 };
export const isWorld = b => b.s <= -89.5 && b.n >= 89.5 && b.w <= -179.5 && b.e >= 179.5;

const pad = n => String(n).padStart(2, "0");
const ym = s => { const [y, m] = String(s).split("-").map(Number); return { y, m }; };

// Short names for the picker. The manifest names are long (they carry the product); the picker wants a plain word.
const PICK = {
  precip_imerg: { name: "Rainfall and snow", group: "Water" },
  tws_grace: { name: "Water stored on land", group: "Water" },
  airs_tair: { name: "Surface air temperature", group: "Temperature" },
  airs_h2o: { name: "Water vapor in the air", group: "Water" },
  soil_gldas: { name: "Soil moisture, top 10 cm", group: "Water" },
  et_gldas: { name: "Evapotranspiration", group: "Water" },
  lst_day_myd11: { name: "Land surface temperature", group: "Temperature" },
  snow_mod10cm: { name: "Snow cover", group: "Snow and ice" },
  aod_myd08: { name: "Smoke and haze", group: "Air" },
};

// Optional "quality_end" ("YYYY-MM") in the manifest marks the last month a product can be trusted for trends. Months after it are flagged,
// left out of default periods and never given a verdict. goodLast is the last year that lies wholly on the good side.
function quality(v, last) {
  const q = /^(\d{4})-(\d{1,2})$/.exec(String(v.quality_end || ""));
  if (!q) return {};
  const y = +q[1], m = +q[2], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const goodLast = m === 12 ? y : y - 1;
  if (goodLast >= last.y) return {};
  return { qualityEnd: { y, m }, qualityEndText: `${MON[m - 1]} ${y}`, qualityLabel: v.quality_label || "Flagged: unreliable for trends", qualityReason: v.quality_reason || "", goodLast };
}
export const pastQuality = (v, y1) => !!(v && v.goodLast != null && y1 > v.goodLast);

// One visible line on what each product cannot see, so the type of evidence is clear before any result (the full notes stay in the manifest caveats).
const LIMITS = {
  lst_day_myd11: "Clear-sky satellite estimate: cloudy days are not sampled, and this is skin temperature, not air temperature.",
  snow_mod10cm: "Clear-sky satellite estimate: clouds hide the ground, and polar night has no data.",
  airs_tair: "Satellite estimate, not a station reading: very cloudy scenes are under-sampled.",
  airs_h2o: "Satellite estimate: very cloudy scenes are under-sampled.",
  tws_grace: "Gravity sensing at about 300 km resolution: total water, not groundwater alone.",
  precip_imerg: "Satellite estimate adjusted using rain-gauge measurements: weaker at high latitudes, over snow and in steep terrain.",
  soil_gldas: "Model output: it follows the model's weather inputs, which changed over time.",
  et_gldas: "Model output: it follows the model's weather inputs, which changed over time.",
};

export function loadLibrary() {
  if (!manifestP) manifestP = fetch(BASE + "manifest.json").then(r => { if (!r.ok) throw new Error("no manifest"); return r.json(); }).then(m => (m.variables || []).filter(v => v && v.id && v.period && v.tiles && v.tiles.length).map(v => {
    const a = ym(v.period.first_month), b = ym(v.period.last_month), meta = PICK[v.id] || { name: v.name.replace(/\s*\(.*\)$/, ""), group: "Other" }, model = !/^satellite/i.test(String(v.kind || ""));
    return {
      key: v.id, src: "library", name: meta.name, group: meta.group, one_line: v.definition, units: String(v.units).replace(/\s*\(equivalent water height\)$/, ""), since: a.y, last: b.y, lastMonth: b.m, firstMonth: a.m, t0: v.period.t0, nAxis: v.period.n_months_axis,
      missing: v.period.months_all_missing || [], kind: model ? "model_output" : "satellite_observation", chip: model ? `Model (NASA ${/GLDAS/i.test(v.product) ? "GLDAS" : "model"}, precomputed)` : /retrieval/i.test(String(v.kind)) ? "Satellite retrieval (NASA, precomputed)" : "Satellite (NASA, precomputed)", chipShort: model ? "Model" : "Satellite", limit: LIMITS[v.id] || null,
      ...quality(v, b), source: `${v.product} (${v.agency})`, product: v.product, doi: v.doi, caveats: v.caveats, scale: v.scale, offset: v.offset || 0,
      tileSet: new Set(v.tiles.map(([r, c]) => r + "_" + c)), full: v.name,
    };
  })).catch(() => []);
  return manifestP;
}

// "Record 2002-04 to 2026-09; 33 months missing (2017-07 to 2018-05 is the GRACE / GRACE-FO gap)". Built from the manifest, not typed by hand.
export function gapRuns(v) {
  const idx = s => { const { y, m } = ym(s); return y * 12 + m - 1; };
  const all = v.missing.map(idx).sort((a, b) => a - b), runs = [];
  for (const i of all) { const last = runs[runs.length - 1]; if (last && i === last[1] + 1) last[1] = i; else runs.push([i, i]); }
  const lab = i => `${Math.floor(i / 12)}-${pad(i % 12 + 1)}`;
  return runs.map(([a, b]) => ({ from: lab(a), to: lab(b), n: b - a + 1 }));
}
export function periodNote(v) {
  const runs = gapRuns(v), total = runs.reduce((s, r) => s + r.n, 0), long = runs.filter(r => r.n >= 3).sort((a, b) => b.n - a.n)[0];
  const mon = (s) => { const { y, m } = ym(s); return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] + " " + y; };
  let t = `${v.name} is available from ${mon(`${v.since}-${pad(v.firstMonth)}`)} to ${mon(`${v.last}-${pad(v.lastMonth)}`)}.`;
  if (total) t += ` ${total} month${total === 1 ? " is" : "s are"} missing` + (long ? `, including a long gap from ${mon(long.from)} to ${mon(long.to)}` : "") + `. A year with a missing month in your season is left out, never filled in.`;
  return t;
}

// ------------------------------------------------------------------ tiles
async function gunzip(buf) {
  const u = new Uint8Array(buf);
  if (!(u[0] === 0x1f && u[1] === 0x8b)) return u; // the host already decompressed it
  const ds = new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(ds).arrayBuffer());
}
async function getTile(v, r, c, signal) {
  const key = `${v.key}/${r}_${c}`;
  if (tileCache.has(key)) return tileCache.get(key);
  const p = (async () => {
    const res = await fetch(`${BASE}${v.key}/tile_${r}_${c}.bin.gz`, { signal });
    if (!res.ok) throw new Error(`Could not read a library tile (${res.status}).`);
    const raw = await gunzip(await res.arrayBuffer()), n = T * T * v.nAxis;
    if (raw.length !== 2 * n) throw new Error("A library tile had an unexpected size.");
    const out = new Int16Array(n);
    for (let i = 0; i < n; i++) out[i] = (raw[i] << 8) | raw[n + i]; // high plane, then low plane; the shift to int16 keeps the sign
    return out;
  })();
  tileCache.set(key, p); p.catch(() => tileCache.delete(key));
  while (tileCache.size > 110) tileCache.delete(tileCache.keys().next().value); // keep memory bounded (about 110 tiles)
  return p;
}

// Which 1-degree cells have their center inside the box, grouped by tile. A box that holds no cell center uses the one cell that holds its center.
function cellsIn(v, box) {
  const list = []; let fallback = false;
  const scan = b => {
    list.length = 0;
    const r0 = Math.max(0, Math.floor((90 - b.n) / T)), r1 = Math.min(5, Math.floor((90 - b.s - 1e-9) / T)), c0 = Math.max(0, Math.floor((b.w + 180) / T)), c1 = Math.min(11, Math.floor((b.e + 180 - 1e-9) / T));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (!v.tileSet.has(r + "_" + c)) continue;
      const cells = [];
      for (let i = 0; i < T; i++) { const lat = 90 - T * r - i - 0.5; if (lat < b.s || lat > b.n) continue;
        for (let j = 0; j < T; j++) { const lon = -180 + T * c + j + 0.5; if (lon < b.w || lon > b.e) continue; cells.push({ k: i * T + j, w: Math.max(0.01, Math.cos(lat * Math.PI / 180)) }); } }
      if (cells.length) list.push({ r, c, cells });
    }
  };
  scan(box);
  if (!list.length) { // smaller than one cell, or only empty (no-data) tiles
    const cx = (box.w + box.e) / 2, cy = (box.s + box.n) / 2, la = Math.floor(cy) + 0.5, lo = Math.floor(cx) + 0.5;
    scan({ s: la - 0.5, n: la + 0.5, w: lo - 0.5, e: lo + 0.5 }); fallback = list.length > 0;
  }
  return { tiles: list, fallback };
}

export function libraryPlan(v, box) {
  if (isWorld(box)) return { whole: true, tiles: v.tileSet.size, cells: 0, mb: v.tileSet.size * 0.12 };
  const { tiles, fallback } = cellsIn(v, box), cells = tiles.reduce((s, t) => s + t.cells.length, 0);
  if (!tiles.length) return { whole: false, tiles: 0, cells: 0, empty: true };
  return { whole: false, tiles: tiles.length, cells, fallback, mb: tiles.length * 0.12 };
}

// ------------------------------------------------------------------ regional series
// Footprint-proof regional series. Each cell is first turned into an anomaly against ITS OWN calendar-month average over the chosen years,
// then the anomalies are area-averaged (cosine of latitude), then a fixed baseline (the area average of the cell climatologies) is added back
// so the series keeps its units. A cell that drops out (cloud, polar night, a GRACE gap) therefore cannot create or hide a trend. A month needs
// valid data in at least COVER of the box's usable area, or it is dropped (and counted).
const COVER = 0.8, CLIM_FRAC = 0.6;
function allCells(v) { // whole world: every cell of every tile that exists
  const out = [];
  for (const key of v.tileSet) { const [r, c] = key.split("_").map(Number), cells = [];
    for (let i = 0; i < T; i++) { const lat = 90 - T * r - i - 0.5, w = Math.max(0.01, Math.cos(lat * Math.PI / 180)); for (let j = 0; j < T; j++) cells.push({ k: i * T + j, w }); }
    out.push({ r, c, cells }); }
  return out;
}
export async function libraryRegional({ variable: v, box, y0, y1, onProgress, signal }) {
  const prog = (done, total) => { if (onProgress) onProgress({ done, total }); };
  const whole = isWorld(box);
  const plan = whole ? { tiles: allCells(v), fallback: false } : cellsIn(v, box), nTiles = plan.tiles.length, fallback = plan.fallback;
  if (!nTiles) throw new Error("There is no data inside this box. Some measurements cover land only, so a box over open ocean is empty.");
  let done = 0; prog(0, nTiles);
  const data = await Promise.all(plan.tiles.map(async t => { const d = await getTile(v, t.r, t.c, signal); prog(++done, nTiles); return d; }));
  const n = v.nAxis, yr = new Int16Array(n), cal = new Int8Array(n);
  for (let m = 0; m < n; m++) { const m0 = v.t0[1] - 1 + m; yr[m] = v.t0[0] + Math.floor(m0 / 12); cal[m] = m0 % 12; }
  const Y = Math.max(1, y1 - y0 + 1), need = Math.ceil(CLIM_FRAC * Y);
  const win = []; for (let m = 0; m < n; m++) if (yr[m] >= y0 - 1 && yr[m] <= y1) win.push(m); // y0-1 is kept only so a winter season can take its December
  const A = new Float64Array(n), WA = new Float64Array(n), CW = new Float64Array(12), CWt = new Float64Array(12), cs = new Float64Array(12), cn = new Int32Array(12), cv = new Float64Array(12);
  let footW = 0, nCells = 0;
  plan.tiles.forEach((t, ti) => { const d = data[ti];
    for (const cell of t.cells) {
      cs.fill(0); cn.fill(0); let any = false;
      for (const m of win) { const x = d[m * T * T + cell.k]; if (x === NODATA) continue; any = true; if (yr[m] >= y0) { cs[cal[m]] += x * v.scale + v.offset; cn[cal[m]]++; } }
      if (!any) continue;
      footW += cell.w; nCells++;
      for (let c = 0; c < 12; c++) if (cn[c] >= need) { cv[c] = cs[c] / cn[c]; CW[c] += cell.w * cv[c]; CWt[c] += cell.w; } else cn[c] = 0;
      for (const m of win) { const x = d[m * T * T + cell.k]; if (x === NODATA || !cn[cal[m]]) continue; A[m] += cell.w * (x * v.scale + v.offset - cv[cal[m]]); WA[m] += cell.w; }
    } });
  if (!nCells) throw new Error("There is no data inside this box. Some measurements cover land only, so a box over open ocean is empty.");
  const rows = []; let dropped = 0;
  for (const m of win) {
    if (WA[m] < COVER * footW || !CWt[cal[m]]) { if (yr[m] >= y0) dropped++; continue; }
    rows.push({ year: yr[m], month: cal[m] + 1, value: +(CW[cal[m]] / CWt[cal[m]] + A[m] / WA[m]).toFixed(5) });
  }
  if (!rows.length) throw new Error("The library returned no values for this measurement and place.");
  const note = (whole ? `Every 1-degree cell in the library (${nCells.toLocaleString("en-US")} with data)` : `${nCells} one-degree cells inside the box`) + `, each compared with its own monthly average over ${y0}–${y1}, then averaged with weight proportional to area (cosine of latitude). Comparing each cell with its own average reduces one coverage problem, a cell that drops out of view; it does not remove bias from sampling that changes over time. A month counts only if at least 80% of the usable area has a value` + (dropped ? `; ${dropped} month${dropped === 1 ? " was" : "s were"} dropped for that reason` : "") + (fallback ? ". The box is smaller than one cell, so the cell that holds its center is used" : "") + ".";
  return { stub: false, library: true, source: v.source, units: v.units, rows, note, method: whole ? "world" : "regional", n_tiles: nTiles, n_cells: nCells, first_year: rows[0].year, last_year: rows[rows.length - 1].year, whole, fallback, dropped };
}

// Gaps break the series. A season-year counts only if every month of the season is present. Returns the kept rows and the labels of the years left out.
export function completeSeasons(rows, months, y0, y1) {
  const wrap = months.some((m, i) => i > 0 && m < months[i - 1]), first = months[0];
  const label = r => (wrap && r.month >= first ? r.year + 1 : r.year);
  const count = new Map();
  for (const r of rows) if (months.includes(r.month)) { const k = label(r); count.set(k, (count.get(k) || 0) + 1); }
  // Every season-year in the asked period that is not complete, including years with no month at all (they are absent from `count`).
  const skipped = []; for (let k = y0; k <= y1; k++) if ((count.get(k) || 0) < months.length) skipped.push(k);
  return { rows: rows.filter(r => months.includes(r.month) && count.get(label(r)) === months.length), skipped: skipped.sort((a, b) => a - b) };
}
