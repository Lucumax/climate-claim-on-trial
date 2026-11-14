// PLACEHOLDER bundle generator. Output is SYNTHETIC random data used only to build the front end before the real
// stats bundle exists. Nothing here is a NASA measurement or a result. Usage: node make_placeholder_bundle.mjs > ../data/placeholder_bundle.json
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()); }
const erf = x => { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
const pnorm2 = z => 1 - erf(Math.abs(z) / Math.SQRT2);
function mk(y) { const n = y.length; let S = 0; for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]); const v = n * (n - 1) * (2 * n + 5) / 18; const z = S === 0 ? 0 : (S - Math.sign(S)) / Math.sqrt(v); return { S, z, p: pnorm2(z) }; }
function sen(y) { const sl = []; for (let i = 0; i < y.length - 1; i++) for (let j = i + 1; j < y.length; j++) sl.push((y[j] - y[i]) / (j - i)); sl.sort((a, b) => a - b); const m = sl.length >> 1; return sl.length % 2 ? sl[m] : (sl[m - 1] + sl[m]) / 2; }
function ac1(y) { const n = y.length, m = y.reduce((a, b) => a + b) / n; let a = 0, b = 0; for (let i = 0; i < n; i++) { b += (y[i] - m) ** 2; if (i) a += (y[i] - m) * (y[i - 1] - m); } return a / b; }
function ols(x, y) { const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n; let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } const b = sxy / sxx, a = my - b * mx; let sse = 0; for (let i = 0; i < n; i++) sse += (y[i] - a - b * x[i]) ** 2; const se = Math.sqrt(sse / (n - 2) / sxx); const t = b / se; return { slope: b, se, t, p: pnorm2(t) * 1.0 }; }
function bh(ps, q) { const idx = ps.map((p, i) => [p, i]).filter(a => a[0] != null).sort((a, b) => a[0] - b[0]); const m = idx.length; let k = -1; idx.forEach((a, r) => { if (a[0] <= (r + 1) / m * q) k = r; }); const out = new Set(); for (let r = 0; r <= k; r++) out.add(idx[r][1]); return out; }

const CLAIMS = [
  { id: "C-A", seed: 11, claim: "Summer daytime land surface temperature over the Southeastern United States has risen", var: { key: "lst_day", name: "Land surface temperature, daytime", short: "Heat of the ground", unit: "deg C", plain: "How hot the ground and the tops of plants and buildings are, as seen from space in the early afternoon. It is not the same as the air temperature a thermometer reads in the shade." }, product: { name: "MODIS Terra LST Day, monthly 0.05 deg CMG (MOD11C3)", version: "061", doi: "PLACEHOLDER-DOI" }, region: { name: "Southeastern United States", box: { s: 30, n: 37, w: -90, e: -75.5 } }, season: "Summer (June to August)", years: [2001, 2025], grid: { dlat: 0.5, dlon: 0.5 }, trend: 0.5, noise: 0.9, rho: 0.3, direction: "increase", model: false },
  { id: "C-B", seed: 29, claim: "Wet-season rainfall over the central Sahel has increased", var: { key: "precip", name: "Rainfall, monthly total", short: "Rainfall", unit: "mm/day", plain: "How much rain fell, estimated by combining satellite microwave and infrared readings with rain gauges. Shown as the average amount per day during the wet season." }, product: { name: "GPM IMERG Final Run monthly (GPM_3IMERGM)", version: "V07", doi: "PLACEHOLDER-DOI" }, region: { name: "Central Sahel", box: { s: 10, n: 18, w: -17, e: 25 } }, season: "Wet season (June to September)", years: [2001, 2025], grid: { dlat: 1, dlon: 1 }, trend: 0.03, noise: 0.45, rho: 0.15, direction: "increase", model: false },
  { id: "C-C", seed: 47, claim: "Near-surface air temperature over interior and western Alaska has risen", var: { key: "t2m", name: "Air temperature at 2 m above ground", short: "Air temperature", unit: "deg C", plain: "The temperature of the air about two metres above the ground, the height of a weather station thermometer. This one comes from a computer model that blends many observations (a reanalysis), so it is model output, not a direct measurement." }, product: { name: "MERRA-2 2 m air temperature (T2M) via NASA POWER", version: "PLACEHOLDER-VERSION", doi: "PLACEHOLDER-DOI" }, region: { name: "Interior and western Alaska", box: { s: 60, n: 70, w: -165, e: -140 } }, season: "Annual mean", years: [1981, 2025], grid: { dlat: 0.5, dlon: 0.625 }, trend: 0.75, noise: 1.2, rho: 0.25, direction: "increase", model: true },
  { id: "C-D", seed: 61, claim: "Summer smoke and haze (aerosol optical depth) over Wisconsin has been increasing", var: { key: "aod", name: "Smoke and haze (aerosol optical depth)", short: "Smoke and haze", unit: "unitless", plain: "How much smoke, dust and haze blocks sunlight in the air column. Higher means hazier skies. Wildfire smoke drifting from Canada adds to it." }, product: { name: "MODIS Aqua aerosol optical depth, monthly", version: "PLACEHOLDER-VERSION", doi: "PLACEHOLDER-DOI" }, region: { name: "Wisconsin (box around the state)", box: { s: 42.5, n: 47.1, w: -92.9, e: -86.8 } }, season: "Summer (June to August)", years: [2003, 2025], grid: { dlat: 0.25, dlon: 0.25 }, trend: 0.3, noise: 0.5, rho: 0.2, direction: "increase", model: false },
];

function build(c) {
  const r = rng(c.seed);
  const { s, n, w, e } = c.region.box;
  const nlat = Math.round((n - s) / c.grid.dlat), nlon = Math.round((e - w) / c.grid.dlon);
  const years = []; for (let y = c.years[0]; y <= c.years[1]; y++) years.push(y);
  const T = years.length;
  const lat = [...Array(nlat)].map((_, i) => +(s + (i + 0.5) * c.grid.dlat).toFixed(4));
  const lon = [...Array(nlon)].map((_, i) => +(w + (i + 0.5) * c.grid.dlon).toFixed(4));
  // smooth spatial trend pattern + a fake "ocean" blob of no-data cells
  const ph1 = r() * 6, ph2 = r() * 6;
  const cells = []; const series = [];
  const ar = c.rho;
  for (let i = 0; i < nlat; i++) for (let j = 0; j < nlon; j++) {
    const fy = i / nlat, fx = j / nlon;
    const coast = (fx < 0.12 && fy > 0.55) || (Math.hypot(fx - 0.95, fy - 0.1) < 0.18);
    if (coast) { cells.push(null); series.push(null); continue; }
    const pat = 0.6 + 0.9 * Math.sin(3 * fx + ph1) * Math.cos(2.4 * fy + ph2) + 0.5 * (r() - 0.5);
    const tr = c.trend * pat / 10; // per year
    const y = []; let prev = 0;
    for (let t = 0; t < T; t++) { prev = ar * prev + Math.sqrt(1 - ar * ar) * gauss(r) * c.noise; y.push(tr * t + prev); }
    series.push(y); cells.push(1);
  }
  const rungs = [[], [], [], []]; const slopes = [], pvals = [[], [], []];
  const x = years.map((_, t) => t);
  const valid = []; series.forEach((y, k) => { if (y) valid.push(k); });
  const p1 = Array(series.length).fill(null), p2 = Array(series.length).fill(null), p3 = Array(series.length).fill(null), sl = Array(series.length).fill(null);
  for (const k of valid) {
    const y = series[k], m = mk(y); sl[k] = sen(y) * 10;
    p1[k] = m.p;
    p2[k] = m.p; // after seasonal aggregation, per-cell anomalies against own climatology leave MK ranks unchanged here (no-op rung, shown as measured)
    const rho = Math.max(0, ac1(y)); const vif = Math.max(1, (1 + rho) / (1 - rho) * 0.6 + 0.4);
    p3[k] = pnorm2(m.z / Math.sqrt(vif));
  }
  const sign = k => Math.sign(sl[k]);
  const bhset = bh(p3, 0.10);
  const flagsFor = (p, set) => series.map((y, k) => !y ? null : ((set ? set.has(k) : p[k] < 0.05) ? sign(k) : 0));
  const f1 = flagsFor(p1), f2 = flagsFor(p2), f3 = flagsFor(p3), f4 = flagsFor(p3, bhset);
  const frac = (f, dir) => { let a = 0, b = 0; f.forEach(v => { if (v == null) return; b++; if (dir ? v === 1 : v !== 0) a++; }); return +(a / b).toFixed(4); };
  const cnt = f => f.filter(v => v != null).length;
  // regional area-weighted mean anomaly
  const wts = lat.map(l => Math.cos(l * Math.PI / 180));
  const reg = years.map((_, t) => { let a = 0, b = 0; for (let i = 0; i < nlat; i++) for (let j = 0; j < nlon; j++) { const y = series[i * nlon + j]; if (!y) continue; a += y[t] * wts[i]; b += wts[i]; } return a / b; });
  const base = reg.reduce((a, b) => a + b) / reg.length; const anom = reg.map(v => +(v - base).toFixed(3));
  const senSlope = sen(anom), icept = [...anom].sort((a, b) => a - b)[anom.length >> 1] - senSlope * (T / 2);
  const resid = anom.map((v, t) => v - (icept + senSlope * t));
  const boots = []; const rb = rng(c.seed + 100);
  for (let b = 0; b < 400; b++) { const yy = anom.map((_, t) => icept + senSlope * t + resid[Math.floor(rb() * T)]); const sb = sen(yy); const ib = [...yy].sort((a, b2) => a - b2)[T >> 1] - sb * (T / 2); boots.push([sb, ib]); }
  const slB = boots.map(v => v[0] * 10).sort((a, b) => a - b);
  const lo = slB[Math.floor(0.025 * slB.length)], hi = slB[Math.floor(0.975 * slB.length)];
  const bandLo = [], bandHi = [];
  for (let t = 0; t < T; t++) { const v = boots.map(b => b[1] + b[0] * t).sort((a, b2) => a - b2); bandLo.push(+v[Math.floor(0.025 * v.length)].toFixed(3)); bandHi.push(+v[Math.floor(0.975 * v.length)].toFixed(3)); }
  const mkr = mk(anom); const rho = Math.max(0, ac1(anom)); const vif = Math.max(1, (1 + rho) / (1 - rho) * 0.6 + 0.4); const pHR = pnorm2(mkr.z / Math.sqrt(vif));
  const o = ols(x, anom); const tcrit = 2.0687;
  const f4c = frac(f4, true);
  const dir = c.direction;
  const sig = pHR < 0.05 && senSlope > 0;
  const fmt = v => (v >= 0 ? "+" : "-") + Math.abs(v).toFixed(2);
  const label = sig ? "Supported by this data" : "Not supported by this data";
  const ladder = [
    { rung: 1, key: "raw_mk", label: "Raw Mann-Kendall", changes: "Start. Each cell tested on its own raw seasonal series, assuming the years are independent.", flags: f1 },
    { rung: 2, key: "anomaly_mk", label: "Seasonal anomalies", changes: "Each cell compared with its own typical value for the same season before testing.", flags: f2 },
    { rung: 3, key: "hamed_rao", label: "Hamed-Rao correction", changes: "The test now allows for neighbouring years resembling each other (autocorrelation).", flags: f3 },
    { rung: 4, key: "bh_q10", label: "Benjamini-Hochberg, q = 0.10", changes: "Controls the expected share of false alarms among the flagged cells, declared in advance.", flags: f4 },
  ].map(L => ({ ...L, n_cells: cnt(L.flags), flagged_fraction_any: frac(L.flags), flagged_fraction_claimed: frac(L.flags, true), n_flagged_any: L.flags.filter(v => v).length, n_flagged_claimed: L.flags.filter(v => v === 1).length }));
  return {
    id: c.id, claim_text: c.claim, direction: dir, variable: c.var, product: c.product, region: { name: c.region.name, box: c.region.box }, season: c.season, period: { start: c.years[0], end: c.years[1], n: T },
    data_kind: c.model ? "model_reanalysis" : "satellite_observation",
    grid: { lat, lon, dlat: c.grid.dlat, dlon: c.grid.dlon, n_lat: nlat, n_lon: nlon },
    cell_slope_per_decade: sl.map(v => v == null ? null : +v.toFixed(4)),
    ladder,
    regional: { years, anomaly: anom, band_lo: bandLo, band_hi: bandHi, band_method: "PLACEHOLDER: pointwise 95% band from a residual bootstrap of the Sen fit (independent residuals). The real method is decided by the stats worker.", units: c.var.unit, baseline: "Mean of the series, " + c.years[0] + " to " + c.years[1],
      sen: { slope_per_decade: +(senSlope * 10).toFixed(3), ci_lo: +lo.toFixed(3), ci_hi: +hi.toFixed(3), ci_level: 0.95 },
      mk_hr: { tau: +(mkr.S / (T * (T - 1) / 2)).toFixed(3), z: +mkr.z.toFixed(3), p_independent: +mkr.p.toFixed(4), p_hamed_rao: +pHR.toFixed(4), vif: +vif.toFixed(2) },
      ols: { slope_per_decade: +(o.slope * 10).toFixed(3), ci_lo: +((o.slope - tcrit * o.se) * 10).toFixed(3), ci_hi: +((o.slope + tcrit * o.se) * 10).toFixed(3), p: +o.p.toFixed(4), t: +o.t.toFixed(2) } },
    verdict: { branch: sig ? "supported" : "not_supported", label, headline: "PLACEHOLDER SENTENCE. " + (sig ? "In this synthetic placeholder the claim passes the regional test." : "In this synthetic placeholder the claim does not pass the regional test."),
      sentences: ["PLACEHOLDER template sentence one: what was tested, in plain words.", "PLACEHOLDER template sentence two: the size of the change per decade and its interval.", "PLACEHOLDER template sentence three: what the evidence does not show."],
      checklist: [{ text: "PLACEHOLDER: record is long enough for a trend test", ok: true }, { text: "PLACEHOLDER: regional test run once, as registered", ok: true }, { text: "PLACEHOLDER: map flags counted in the claimed direction only", ok: true }] },
    finding: { place: c.region.name, variable: c.var.name, period: c.season + ", " + c.years[0] + " to " + c.years[1], change_per_decade: { value: +(senSlope * 10).toFixed(3), unit: c.var.unit + " per decade", text: fmt(senSlope * 10) + " " + c.var.unit + " per decade (Sen slope)" }, interval: { lo: +lo.toFixed(3), hi: +hi.toFixed(3), level: 0.95, meaning: "PLACEHOLDER: a 95% bootstrap interval for the regional slope. It is not adjusted for the choice of headline." },
      product: c.product, not_supported: ["PLACEHOLDER: does not show what caused the change", "PLACEHOLDER: does not forecast future change"], selection_disclosure: "PLACEHOLDER: this region and claim were registered before any data were downloaded; the interval is not adjusted for selection.", scope: "area", scope_text: "This number is for the whole region, not for any single hotspot cell.", run_id: "PLACEHOLDER-RUN-" + c.id, ledger_ref: "PLACEHOLDER-LEDGER-" + c.id },
  };
}
const bundle = { schema_version: "PLACEHOLDER-0", placeholder: true, synthetic: true, notice: "PLACEHOLDER SYNTHETIC DATA. Random numbers made to test the page layout. Not NASA data and not a result.", run_id: "PLACEHOLDER-RUN", generated_at: "PLACEHOLDER", declared_q: 0.10, alpha: 0.05, claims: CLAIMS.map(build) };
process.stdout.write(JSON.stringify(bundle));
