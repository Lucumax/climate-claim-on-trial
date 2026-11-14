// trendtrial.js: series-level trend statistics for Detective mode (dependency-free ES module).
// Python (stats/trendtrial) is the source of truth; this is a port of its SERIES-level functions and is
// checked against it by stats/tests/test_js_parity.py. Per-cell maps, Benjamini-Hochberg and the bootstrap
// are Python-only.
//
// Missing values: use null, undefined or NaN. Times t are calendar years (numbers).
//
// API
//   olsTest(t, y, alpha = 0.05)         -> {n, slope, se, t, df, p, ciLow, ciHigh}   (slope per unit of t)
//   mannKendall(y, t, {hr = true})      -> {n, s, tau, varS0, hrFactorRaw, hrFactor, varS, z, p, slope, intercept}
//   senInterval(y, t, varS, alpha=0.05) -> [lo, hi]   (Gilbert Sen interval; pass mannKendall(...).varS for the
//                                                      Hamed-Rao one)
//   seasonalSeries(rows, {months, y0, y1, minMonthFrac = 2/3, minClimFrac = 0.6})
//        rows: [{year, month, value}] monthly values; returns {years, raw, anomaly, nMonths}
//        raw = mean of the in-season months, anomaly = mean of (value - that month's climatology over y0..y1);
//        both use the same months; a season with fewer than ceil(minMonthFrac * months) usable months is null.
//   analyzeSeries(t, y, {units, perDecade = true}) -> {ols, mk, sen, verdict}  (everything Detective mode shows)
//   detectiveVerdict(p, slope, n, units, minN = 8) -> {id, text}  (fixed templates; the author's plain framing)
//   fmtP(p), fmtG(x, 3)                 -> number formatting identical to the Python templates
//   normalCdf(x), tCdf(x, df), tQuantile(p, df)

export const VERSION = "1.2.0";
const Z975 = 1.959963984540054;
const ALPHA = 0.05;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// ------------------------------------------------------------------ special functions
function erfSeries(x) {
  // Taylor series, accurate to about 1e-13 for |x| < 3
  const x2 = x * x;
  let term = x, sum = x;
  for (let n = 1; n < 200; n++) {
    term *= -x2 / n;
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

function erfcPos(x) {
  // x >= 0
  if (x < 3) return 1 - erfSeries(x);
  // backward evaluation of the continued fraction K = x + (1/2)/(x + 1/(x + (3/2)/(x + ...)))
  let t = x;
  for (let k = 200; k >= 1; k--) t = x + (k / 2) / t;
  return Math.exp(-x * x) / Math.sqrt(Math.PI) / t;
}

export function normalCdf(x) {
  if (x >= 0) return 1 - 0.5 * erfcPos(x / Math.SQRT2);
  return 0.5 * erfcPos(-x / Math.SQRT2);
}

function lgamma(x) {
  // Lanczos (g = 7, n = 9), relative accuracy about 1e-15
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a, b, x) {
  const MAXIT = 500, EPS = 1e-16, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function betaInc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function tCdf(x, df) {
  const xx = df / (df + x * x);
  const tail = 0.5 * betaInc(df / 2, 0.5, xx);   // P(T > |x|)
  return x > 0 ? 1 - tail : tail;
}

export function tTwoSidedP(t, df) {
  if (!Number.isFinite(t)) return 0;
  const xx = df / (df + t * t);
  return betaInc(df / 2, 0.5, xx);               // = 2 * P(T > |t|)
}

export function tQuantile(p, df) {
  // bisection on the CDF, p in (0,1)
  let lo = -1e3, hi = 1e3;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-13) break;
  }
  return 0.5 * (lo + hi);
}

export function normalQuantile(p) {
  if (Math.abs(p - 0.975) < 1e-15) return Z975;
  let lo = -40, hi = 40;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (normalCdf(mid) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-14) break;
  }
  return 0.5 * (lo + hi);
}

// ------------------------------------------------------------------ helpers
function rint(x) {
  // round half to even, like numpy
  const r = Math.round(x);
  if (Math.abs(x % 1) === 0.5) return 2 * Math.round(x / 2);
  return r;
}

function median(sortedAsc) {
  const m = sortedAsc.length;
  if (m === 0) return NaN;
  return m % 2 ? sortedAsc[(m - 1) / 2] : 0.5 * (sortedAsc[m / 2 - 1] + sortedAsc[m / 2]);
}

function compact(y, t) {
  const yy = [], tt = [];
  for (let i = 0; i < y.length; i++) {
    if (isNum(y[i])) { yy.push(y[i]); tt.push(t[i]); }
  }
  return [yy, tt];
}

function averageRanks(v) {
  const n = v.length;
  const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b] || a - b);
  const r = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && v[idx[j + 1]] === v[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k]] = avg;
    i = j + 1;
  }
  return r;
}

// ------------------------------------------------------------------ OLS
export function olsTest(t, y, alpha = ALPHA) {
  const [yy, tt] = compact(y, t);
  const n = yy.length;
  const nan = { n, slope: null, se: null, t: null, df: n - 2, p: null, ciLow: null, ciHigh: null };
  if (n < 3) return nan;
  const tm = tt.reduce((a, b) => a + b, 0) / n, ym = yy.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (tt[i] - tm) ** 2; sxy += (tt[i] - tm) * (yy[i] - ym); }
  const b = sxy / sxx, a = ym - b * tm;
  let rss = 0;
  for (let i = 0; i < n; i++) rss += (yy[i] - a - b * tt[i]) ** 2;
  const se = Math.sqrt(rss / (n - 2) / sxx);
  const tt_ = se > 0 ? b / se : (b === 0 ? 0 : Infinity * Math.sign(b));
  const p = tTwoSidedP(tt_, n - 2);
  const q = tQuantile(1 - alpha / 2, n - 2);
  return { n, slope: b, se, t: tt_, df: n - 2, p, ciLow: b - q * se, ciHigh: b + q * se };
}

// ------------------------------------------------------------------ Mann-Kendall, Sen, Hamed-Rao
export const CORRECTIONS = {
  none: { name: "No correction", note: "Years are assumed to be independent of each other." },
  hr: { name: "Hamed-Rao correction (screened lags)",
    note: "Years that follow warm years tend to be warm too, which makes a trend look more certain than it is. This correction uses the year-to-year links that are strong enough to measure and makes the test more cautious." },
  hr_all: { name: "Hamed-Rao correction (all lags up to n/3)",
    note: "Years that follow warm years tend to be warm too, which makes a trend look more certain than it is. This correction counts every short-range year-to-year link, not only the strong ones, and makes the test more cautious." },
  yw: { name: "Yue-Wang correction (lag-1)",
    note: "Years that follow warm years tend to be warm too, which makes a trend look more certain than it is. This correction measures how strongly one year follows the last and counts the series as having fewer independent years." },
  tfpw: { name: "Trend-free pre-whitening",
    note: "Years that follow warm years tend to be warm too. This step removes that year-to-year carry-over from the series, keeps the trend, and then runs the Mann-Kendall test." },
};

export const LADDER_STEPS = [
  { id: "raw", name: "Raw Mann-Kendall",
    note: "The trend test on the raw seasonal values, treating every year as an independent draw." },
  { id: "anomaly", name: "Seasonal anomalies",
    note: "Each month is compared with its own average first, so a changing mix of months cannot fake a trend." },
  { id: "autocorr", name: "Autocorrelation correction",
    note: "Neighbouring years are not independent, so the test is made more cautious. The method used is named on the result (correctionName)." },
];

function mkSums(x, tc) {
  // S, tie-corrected Var(S), Sen slope and intercept for a compact series
  const n = x.length;
  let S = 0;
  const slopes = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = x[j] - x[i];
      S += d > 0 ? 1 : d < 0 ? -1 : 0;
      const dt = tc[j] - tc[i];
      if (dt !== 0) { const s = d / dt; if (Number.isFinite(s)) slopes.push(s); }
    }
  }
  let tieTerm = 0;
  for (let i = 0; i < n; i++) {
    let ti = 0;
    for (let j = 0; j < n; j++) if (x[j] === x[i]) ti++;
    tieTerm += (ti - 1) * (2 * ti + 5);
  }
  const var0 = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  slopes.sort((a, b) => a - b);
  const slope = median(slopes);
  const xs = x.slice().sort((a, b) => a - b), ts = tc.slice().sort((a, b) => a - b);
  return { S, var0, slope, intercept: median(xs) - slope * median(ts) };
}

function zAndP(S, varS) {
  const sd = Math.sqrt(varS);
  const z = S > 0 ? (S - 1) / sd : S < 0 ? (S + 1) / sd : 0;
  return { z, p: 2 * (1 - normalCdf(Math.abs(z))) };
}

function lag1Detrended(x, tc, slope) {
  const n = x.length;
  const res = x.map((v, i) => v - slope * tc[i]);
  const m = res.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) den += (res[i] - m) ** 2;
  for (let i = 0; i < n - 1; i++) num += (res[i] - m) * (res[i + 1] - m);
  return { r1: den > 0 ? num / den : 0, res };
}

// opts: {corr: "none" | "hr" | "hr_all" | "yw" | "tfpw"} (default "hr"); legacy {hr: false} means "none".
export function mannKendall(y, t, opts = {}) {
  const corr = opts.corr ?? (opts.hr === false ? "none" : "hr");
  const meta = CORRECTIONS[corr];
  const [x, tc] = compact(y, t);
  const n = x.length;
  const out = { n, s: null, tau: null, varS0: null, hrFactorRaw: null, hrFactor: null, varS: null, z: null, p: null,
    slope: null, intercept: null, correctionId: corr, correctionName: meta.name, correctionNote: meta.note };
  if (n < 3) return out;
  const { S, var0, slope, intercept } = mkSums(x, tc);
  const nf = n;
  let raw = 1;
  let S_use = S, var_use = var0, factor = 1;
  if (corr === "tfpw") {
    const { r1: r, res } = lag1Detrended(x, tc, slope);
    const r1 = Math.min(0.95, Math.max(-0.95, r));
    const W = [], Tw = [];
    let sc = 0;
    for (const v of x) sc = Math.max(sc, Math.abs(v));
    if (!(sc > 0)) sc = 1;
    for (let i = 0; i < n - 1; i++) {
      const w0 = res[i + 1] - r1 * res[i] + slope * tc[i + 1];
      W.push((rint((w0 / sc) * 1e9) / 1e9) * sc);   // exact ties must not depend on float rounding
      Tw.push(tc[i + 1]);
    }
    const w = mkSums(W, Tw);
    S_use = w.S; var_use = w.var0; factor = 1; raw = 1;
  } else if (corr === "yw") {
    const { r1: r } = lag1Detrended(x, tc, slope);
    const r1 = Math.min(0.95, Math.max(-0.95, r));
    raw = 1;
    for (let k = 1; k < n; k++) raw += 2 * (1 - k / n) * Math.pow(r1, k);
    factor = Math.max(raw, 1);
  } else if (corr === "hr" || corr === "hr_all") {
    const resid = x.map((v, i) => v - slope * tc[i]);
    let scale = 0;
    for (const v of x) scale = Math.max(scale, Math.abs(v));
    if (!(scale > 0)) scale = 1;
    const rr = resid.map((v) => rint((v / scale) * 1e9) / 1e9);
    const I = averageRanks(rr);
    const mean = I.reduce((a, b) => a + b, 0) / n;
    const yv = I.map((v) => v - mean);
    let denom = 0;
    for (const v of yv) denom += v * v;
    const bound = Z975 / Math.sqrt(nf);
    let sni = 0;
    for (let k = 1; k < n; k++) {
      let num = 0;
      for (let i = 0; i < n - k; i++) num += yv[i] * yv[i + k];
      const rk = denom > 0 ? num / denom : 0;
      const use = corr === "hr_all" ? k <= Math.floor(nf / 3) : Math.abs(rk) > bound;
      if (use) sni += (nf - k) * (nf - k - 1) * (nf - k - 2) * rk;
    }
    raw = 1 + (2 / (nf * (nf - 1) * (nf - 2))) * sni;
    factor = Math.max(raw, 1);
  }
  const varS = corr === "tfpw" ? var_use : var0 * factor;
  const { z, p } = zAndP(S_use, varS);
  return { ...out, s: S, tau: S / (0.5 * nf * (nf - 1)), varS0: var0, hrFactorRaw: raw, hrFactor: factor, varS, z, p, slope, intercept };
}

export function senInterval(y, t, varS, alpha = ALPHA) {
  const [x, tc] = compact(y, t);
  const n = x.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
    const s = (x[j] - x[i]) / (tc[j] - tc[i]);
    if (Number.isFinite(s)) d.push(s);
  }
  d.sort((a, b) => a - b);
  const N = d.length;
  if (N === 0) return [null, null];
  const C = normalQuantile(1 - alpha / 2) * Math.sqrt(varS);
  const m1 = (N - C) / 2, m2 = (N + C) / 2 + 1;
  const interp = (rank) => {
    const pos = Math.min(Math.max(rank - 1, 0), N - 1);
    const i0 = Math.floor(pos), i1 = Math.min(i0 + 1, N - 1);
    return d[i0] + (d[i1] - d[i0]) * (pos - i0);
  };
  return [interp(m1), interp(m2)];
}

// ------------------------------------------------------------------ seasonal subset and anomalies
export function seasonWraps(months) {
  return months.length > 1 && months[0] > months[months.length - 1];
}

export function seasonalSeries(rows, opts) {
  // months in SEASON ORDER. A season that wraps the year (e.g. [12, 1, 2]) takes December from the previous calendar
  // year and is labelled by the Jan-Feb year; the first season is dropped if none of its previous-year months exist.
  const wrap = seasonWraps(opts.months);
  const months = wrap ? opts.months.slice() : opts.months.slice().sort((a, b) => a - b);
  const y0 = opts.y0, y1 = opts.y1;
  const minMonthFrac = opts.minMonthFrac ?? 2 / 3, minClimFrac = opts.minClimFrac ?? 0.6;
  const years = [];
  for (let y = y0; y <= y1; y++) years.push(y);
  const Y = years.length, M = months.length;
  const grid = years.map(() => new Array(M).fill(null));
  for (const r of rows) {
    const mi = months.indexOf(r.month);
    if (mi < 0 || !isNum(r.value)) continue;
    const label = wrap && r.month >= months[0] ? r.year + 1 : r.year;
    const yi = label - y0;
    if (yi >= 0 && yi < Y) grid[yi][mi] = r.value;
  }
  if (wrap && Y > 0) {
    let any = false;
    for (let m = 0; m < M; m++) if (months[m] >= months[0] && grid[0][m] !== null) any = true;
    if (!any) for (let m = 0; m < M; m++) grid[0][m] = null;
  }
  const clim = new Array(M).fill(null);
  for (let m = 0; m < M; m++) {
    let cnt = 0, sum = 0;
    for (let y = 0; y < Y; y++) if (grid[y][m] !== null) { cnt++; sum += grid[y][m]; }
    clim[m] = cnt >= Math.ceil(minClimFrac * Y) ? sum / cnt : null;
  }
  const need = Math.ceil(minMonthFrac * M - 1e-9);
  const raw = [], anomaly = [], nMonths = [];
  for (let y = 0; y < Y; y++) {
    let nv = 0, sr = 0, sa = 0;
    for (let m = 0; m < M; m++) {
      if (grid[y][m] !== null && clim[m] !== null) { nv++; sr += grid[y][m]; sa += grid[y][m] - clim[m]; }
    }
    nMonths.push(nv);
    if (nv >= need) { raw.push(sr / nv); anomaly.push(sa / nv); } else { raw.push(null); anomaly.push(null); }
  }
  return { years, raw, anomaly, nMonths, wrap };
}

// ------------------------------------------------------------------ formatting and verdict (fixed templates)
export function fmtG(x, prec = 3) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "n/a";
  if (x === 0) return "0";
  const e = x.toExponential(prec - 1);
  const exp = parseInt(e.split("e")[1], 10);
  if (exp < -4 || exp >= prec) {
    let [m, ex] = e.split("e");
    if (m.includes(".")) m = m.replace(/0+$/, "").replace(/\.$/, "");
    const sign = ex[0] === "-" ? "-" : "+";
    let digits = ex.replace(/^[+-]/, "");
    if (digits.length < 2) digits = "0" + digits;
    return `${m}e${sign}${digits}`;
  }
  let s = x.toFixed(Math.max(0, prec - 1 - exp));
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

function fmtNum(x, nd = 3) {
  if (x === null || x === undefined) return "n/a";
  const ax = Math.abs(x);
  if (ax !== 0 && (ax < 0.001 || ax >= 1e5)) {
    const e = x.toExponential(2);
    let [m, ex] = e.split("e");
    const sign = ex[0] === "-" ? "-" : "+";
    let digits = ex.replace(/^[+-]/, "");
    if (digits.length < 2) digits = "0" + digits;
    return `${m}e${sign}${digits}`;
  }
  return fmtG(x, nd);
}

export function fmtP(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return "n/a";
  if (p < 0.001) return "< 0.001";
  return `= ${p.toFixed(3)}`;
}

export const DETECTIVE_TEMPLATES = {
  significant_up:
    "The trend is statistically significant (p {p}, below 0.05): the series rises by about {abs_slope} {units} per decade. " +
    "Significant means a pattern this strong would be rare if there were no trend (p < 0.05); it does not say why it rose or what comes next.",
  significant_down:
    "The trend is statistically significant (p {p}, below 0.05): the series falls by about {abs_slope} {units} per decade. " +
    "Significant means a pattern this strong would be rare if there were no trend (p < 0.05); it does not say why it fell or what comes next.",
  not_significant:
    "The trend is not statistically significant (p {p}, above 0.05). A p-value above 0.05 does not mean there is no trend " +
    "or that it is unimportant, and a longer series can help.",
  too_short:
    "There are too few valid points ({n}) to test a trend. Choose a longer period or a wider region.",
};

export function detectiveVerdict(p, slope, n, units = "units", minN = 8) {
  const fill = (tpl, o) => tpl.replace(/\{(\w+)\}/g, (_, k) => o[k]);
  if (n === null || n === undefined || n < minN || p === null || p === undefined || Number.isNaN(p)) {
    return { id: "too_short", text: fill(DETECTIVE_TEMPLATES.too_short, { n: String(n) }) };
  }
  let id;
  if (p < ALPHA && slope > 0) id = "significant_up";
  else if (p < ALPHA && slope < 0) id = "significant_down";
  else id = "not_significant";
  return { id, text: fill(DETECTIVE_TEMPLATES[id], { p: fmtP(p), abs_slope: fmtNum(Math.abs(slope)), units }) };
}

// BEGIN GATE_TABLE (generated by stats/scripts/make_gate_table.py; do not edit)
export const GATE_TABLE = {
 "source": "synthetic validation, STATS_LOG run B (Yue-Wang size, 4000 series per row) and round 2 (adaptive procedure, seed family 2026)",
 "correction": "yw",
 "correction_name": "Mann-Kendall with Yue-Wang effective-sample-size correction",
 "nominal_size": 0.05,
 "rows": [
  {
   "n": 23,
   "phi": 0.0,
   "size": 0.0345,
   "se": 0.0029,
   "passes": true,
   "power": 0.116,
   "adaptive_size": 0.04,
   "adaptive_release": 0.768,
   "adaptive_size_given_release": 0.052
  },
  {
   "n": 23,
   "phi": 0.1,
   "size": 0.0408,
   "se": 0.0031,
   "passes": true,
   "power": 0.13,
   "adaptive_size": 0.0445,
   "adaptive_release": 0.654,
   "adaptive_size_given_release": 0.068
  },
  {
   "n": 23,
   "phi": 0.2,
   "size": 0.0638,
   "se": 0.0039,
   "passes": false,
   "power": 0.138,
   "adaptive_size": 0.0525,
   "adaptive_release": 0.521,
   "adaptive_size_given_release": 0.1007
  },
  {
   "n": 23,
   "phi": 0.3,
   "size": 0.078,
   "se": 0.0042,
   "passes": false,
   "power": 0.136,
   "adaptive_size": 0.0542,
   "adaptive_release": 0.371,
   "adaptive_size_given_release": 0.1462
  },
  {
   "n": 23,
   "phi": 0.45,
   "size": 0.103,
   "se": 0.0048,
   "passes": false,
   "power": 0.15,
   "adaptive_size": 0.0498,
   "adaptive_release": 0.196,
   "adaptive_size_given_release": 0.2545
  },
  {
   "n": 23,
   "phi": 0.6,
   "size": 0.1242,
   "se": 0.0052,
   "passes": false,
   "power": 0.161,
   "adaptive_size": 0.0302,
   "adaptive_release": 0.085,
   "adaptive_size_given_release": 0.3569
  },
  {
   "n": 25,
   "phi": 0.0,
   "size": 0.039,
   "se": 0.0031,
   "passes": true,
   "power": 0.15,
   "adaptive_size": 0.0375,
   "adaptive_release": 0.773,
   "adaptive_size_given_release": 0.0485
  },
  {
   "n": 25,
   "phi": 0.1,
   "size": 0.0495,
   "se": 0.0034,
   "passes": true,
   "power": 0.159,
   "adaptive_size": 0.043,
   "adaptive_release": 0.634,
   "adaptive_size_given_release": 0.0678
  },
  {
   "n": 25,
   "phi": 0.2,
   "size": 0.0665,
   "se": 0.0039,
   "passes": false,
   "power": 0.161,
   "adaptive_size": 0.053,
   "adaptive_release": 0.494,
   "adaptive_size_given_release": 0.1072
  },
  {
   "n": 25,
   "phi": 0.3,
   "size": 0.0785,
   "se": 0.0043,
   "passes": false,
   "power": 0.159,
   "adaptive_size": 0.0447,
   "adaptive_release": 0.346,
   "adaptive_size_given_release": 0.1293
  },
  {
   "n": 25,
   "phi": 0.45,
   "size": 0.102,
   "se": 0.0048,
   "passes": false,
   "power": 0.166,
   "adaptive_size": 0.039,
   "adaptive_release": 0.17,
   "adaptive_size_given_release": 0.2294
  },
  {
   "n": 25,
   "phi": 0.6,
   "size": 0.1278,
   "se": 0.0053,
   "passes": false,
   "power": 0.168,
   "adaptive_size": 0.0253,
   "adaptive_release": 0.07,
   "adaptive_size_given_release": 0.3594
  },
  {
   "n": 45,
   "phi": 0.0,
   "size": 0.0473,
   "se": 0.0034,
   "passes": true,
   "power": 0.662,
   "adaptive_size": 0.039,
   "adaptive_release": 0.826,
   "adaptive_size_given_release": 0.0472
  },
  {
   "n": 45,
   "phi": 0.1,
   "size": 0.0563,
   "se": 0.0036,
   "passes": true,
   "power": 0.627,
   "adaptive_size": 0.0413,
   "adaptive_release": 0.628,
   "adaptive_size_given_release": 0.0657
  },
  {
   "n": 45,
   "phi": 0.2,
   "size": 0.0635,
   "se": 0.0039,
   "passes": false,
   "power": 0.543,
   "adaptive_size": 0.039,
   "adaptive_release": 0.389,
   "adaptive_size_given_release": 0.1004
  },
  {
   "n": 45,
   "phi": 0.3,
   "size": 0.07,
   "se": 0.004,
   "passes": false,
   "power": 0.482,
   "adaptive_size": 0.0248,
   "adaptive_release": 0.178,
   "adaptive_size_given_release": 0.139
  },
  {
   "n": 45,
   "phi": 0.45,
   "size": 0.0838,
   "se": 0.0044,
   "passes": false,
   "power": 0.393,
   "adaptive_size": 0.0085,
   "adaptive_release": 0.038,
   "adaptive_size_given_release": 0.2237
  },
  {
   "n": 45,
   "phi": 0.6,
   "size": 0.1042,
   "se": 0.0048,
   "passes": false,
   "power": 0.308,
   "adaptive_size": 0.003,
   "adaptive_release": 0.005,
   "adaptive_size_given_release": 0.5455
  }
 ],
 "gaps": {
  "n": 25,
  "phi": 0.3,
  "size": 0.0777
 },
 "skewed": {
  "n": 25,
  "phi": 0.3,
  "size": 0.079
 },
 "rules": {
  "n_min": 20,
  "n_max": 50,
  "skew_max": 0.8,
  "phi_max": 0.6
 }
};
// END GATE_TABLE

// ------------------------------------------------------------------ exploratory gate (Detective mode, STATS_LOG R2-6)
// Is the Yue-Wang-corrected test calibrated for THIS series? Looks up the shipped table (synthetic validation) by the
// series' length and estimated persistence and returns a plain caveat made of fixed templates. Port of trendtrial/exploratory.py.
export const GATE_LABEL = "your own exploration, not pre-registered";
const GATE_GRID = [0, 0.1, 0.2, 0.3, 0.45, 0.6];
const GATE_NS = [23, 25, 45];
const GATE_CAVEATS = {
  ok: "Calibration check: for series like yours ({n} points, year-to-year persistence near {phi}), the correction used here " +
    "called a trend in {size}% of trendless synthetic series, close to the intended 5%.",
  size_liberal: "Caution: for series like yours ({n} points, year-to-year persistence near {phi}), the correction used here " +
    "called a trend in {size}% of trendless synthetic series instead of the intended 5%, so this p-value is " +
    "probably too small.",
  persistence_above_range: "Caution: year-to-year persistence in your series ({phi}) is above the range we tested (0.6), so we " +
    "cannot say how reliable this p-value is.",
  gaps: "Caution: your series has missing years; the calibration checks used complete series.",
  skewed: "Caution: your series is strongly lopsided (skewness {skew}); the calibration checks used roughly symmetric noise " +
    "and the test was too liberal when the noise was lopsided.",
  length: "Caution: your series has {n} valid points; the calibration checks cover 20 to 50 points.",
};
const GATE_END = " This is your own exploration, not a pre-registered test, and a p-value is not the probability that the trend is real.";

function olsLag1(x) {
  const n = x.length;
  if (n < 5) return 0;
  const tm = (n - 1) / 2;
  let sx = 0;
  for (const v of x) sx += v;
  const xm = sx / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (i - tm) * (i - tm); sxy += (i - tm) * (x[i] - xm); }
  const b = sxy / sxx, a = xm - b * tm;
  const r = x.map((v, i) => v - (a + b * i));
  const rm = r.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { const c = r[i] - rm; den += c * c; if (i < n - 1) num += c * (r[i + 1] - rm); }
  return den > 0 ? num / den : 0;
}

function skewness(x) {
  const n = x.length;
  if (n <= 3) return 0;
  const m = x.reduce((s, v) => s + v, 0) / n;
  let m2 = 0, m3 = 0;
  for (const v of x) { const d = v - m; m2 += d * d; m3 += d * d * d; }
  m2 /= n; m3 /= n;
  return m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
}

// exploratoryGate(t, y) -> {phiHat, skew, nValid, hasGaps, nGov, phiGov, correction, correctionName, sizeAtBucket, calibrated,
//                           reasons[], caveat, label}. Always show `caveat` and `label` next to a Detective p-value.
export function exploratoryGate(t, y) {
  const vals = [];
  let hasGaps = false;
  for (const v of y) { if (isNum(v)) vals.push(v); else hasGaps = true; }
  const n = vals.length, R = GATE_TABLE.rules;
  const phiHat = olsLag1(vals), skew = skewness(vals);
  let nGov = GATE_NS[0];
  for (const m of GATE_NS) if (Math.abs(m - n) < Math.abs(nGov - n)) nGov = m;
  const above = GATE_GRID.filter((p) => p >= Math.max(phiHat, 0) - 1e-12);
  const phiGov = above.length ? above[0] : null;
  const row = phiGov === null ? null : (GATE_TABLE.rows.find((r) => r.n === nGov && r.phi === phiGov) ?? null);
  const reasons = [];
  if (phiGov === null) reasons.push("persistence_above_range");
  else if (!row.passes) reasons.push("size_liberal");
  if (hasGaps) reasons.push("gaps");
  if (Math.abs(skew) > R.skew_max) reasons.push("skewed");
  if (n < R.n_min || n > R.n_max) reasons.push("length");
  const vars = { n: String(n), phi: phiHat.toFixed(2), skew: skew.toFixed(2), size: row ? (100 * row.size).toFixed(1) : "" };
  const fill = (tpl) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
  const parts = reasons.length ? reasons.map((r) => fill(GATE_CAVEATS[r])) : [fill(GATE_CAVEATS.ok)];
  return {
    phiHat, skew, nValid: n, hasGaps, nGov, phiGov, correction: GATE_TABLE.correction, correctionName: GATE_TABLE.correction_name,
    sizeAtBucket: row ? { size: row.size, se: row.se, power: row.power, adaptiveSize: row.adaptive_size, adaptiveRelease: row.adaptive_release } : null,
    calibrated: reasons.length === 0, reasons, caveat: parts.join(" ") + GATE_END, label: GATE_LABEL,
  };
}

// ------------------------------------------------------------------ convenience
export function analyzeSeries(t, y, opts = {}) {
  const units = opts.units ?? "units";
  const k = opts.perDecade === false ? 1 : 10;
  const ols = olsTest(t, y);
  // Default correction for user-chosen series: Yue-Wang (lag-1). In the synthetic validation (STATS_LOG run B) it was the
  // best-calibrated candidate at every tested persistence and length, still too liberal once persistence is about 0.2 or
  // more. Pass {corr: "hr"} etc. to use another one.
  const corr = opts.corr ?? "yw";
  const mk = mannKendall(y, t, { corr });
  const mk0 = mannKendall(y, t, { corr: "none" });
  const mkReg = mannKendall(y, t, { corr: "hr" });
  const ci = mk.n >= 3 ? senInterval(y, t, mk.varS) : [null, null];
  const slopeDec = mk.slope === null ? null : mk.slope * k;
  const sen = { slopePerDecade: slopeDec, intervalPerDecade: ci[0] === null ? null : [ci[0] * k, ci[1] * k],
    intervalNote: "analytic Sen interval using the corrected variance; exploratory (not validated for this series)" };
  return {
    ols: ols.slope === null ? ols : { ...ols, slopePerDecade: ols.slope * k, ciPerDecade: [ols.ciLow * k, ols.ciHigh * k] },
    mk, mkIndependent: { p: mk0.p, z: mk0.z }, mkRegistered: { p: mkReg.p, z: mkReg.z, factor: mkReg.hrFactor }, sen,
    verdict: detectiveVerdict(mk.p, slopeDec, mk.n, units),
  };
}
