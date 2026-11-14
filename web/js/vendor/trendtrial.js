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

export const VERSION = "1.0.0";
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
export function mannKendall(y, t, opts = {}) {
  const hr = opts.hr !== false;
  const [x, tc] = compact(y, t);
  const n = x.length;
  const out = { n, s: null, tau: null, varS0: null, hrFactorRaw: null, hrFactor: null, varS: null, z: null, p: null, slope: null, intercept: null };
  if (n < 3) return out;
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
  // ties
  let tieTerm = 0;
  for (let i = 0; i < n; i++) {
    let ti = 0;
    for (let j = 0; j < n; j++) if (x[j] === x[i]) ti++;
    tieTerm += (ti - 1) * (2 * ti + 5);
  }
  const nf = n;
  const var0 = (nf * (nf - 1) * (2 * nf + 5) - tieTerm) / 18;
  slopes.sort((a, b) => a - b);
  const slope = median(slopes);
  const xs = x.slice().sort((a, b) => a - b), ts = tc.slice().sort((a, b) => a - b);
  const intercept = median(xs) - slope * median(ts);
  let raw = 1;
  if (hr) {
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
      if (Math.abs(rk) > bound) sni += (nf - k) * (nf - k - 1) * (nf - k - 2) * rk;
    }
    raw = 1 + (2 / (nf * (nf - 1) * (nf - 2))) * sni;
  }
  const factor = hr ? Math.max(raw, 1) : 1;
  const varS = var0 * factor;
  const sd = Math.sqrt(varS);
  const z = S > 0 ? (S - 1) / sd : S < 0 ? (S + 1) / sd : 0;
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { n, s: S, tau: S / (0.5 * nf * (nf - 1)), varS0: var0, hrFactorRaw: hr ? raw : 1, hrFactor: factor, varS, z, p, slope, intercept };
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
export function seasonalSeries(rows, opts) {
  const months = opts.months.slice().sort((a, b) => a - b);
  const y0 = opts.y0, y1 = opts.y1;
  const minMonthFrac = opts.minMonthFrac ?? 2 / 3, minClimFrac = opts.minClimFrac ?? 0.6;
  const years = [];
  for (let y = y0; y <= y1; y++) years.push(y);
  const Y = years.length, M = months.length;
  const grid = years.map(() => new Array(M).fill(null));
  for (const r of rows) {
    const yi = r.year - y0, mi = months.indexOf(r.month);
    if (yi >= 0 && yi < Y && mi >= 0 && isNum(r.value)) grid[yi][mi] = r.value;
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
  return { years, raw, anomaly, nMonths };
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
    "Significant means the rise is unlikely to be chance alone; it does not say why it rose or what comes next.",
  significant_down:
    "The trend is statistically significant (p {p}, below 0.05): the series falls by about {abs_slope} {units} per decade. " +
    "Significant means the fall is unlikely to be chance alone; it does not say why it fell or what comes next.",
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

// ------------------------------------------------------------------ convenience
export function analyzeSeries(t, y, opts = {}) {
  const units = opts.units ?? "units";
  const k = opts.perDecade === false ? 1 : 10;
  const ols = olsTest(t, y);
  const mk = mannKendall(y, t, { hr: true });
  const mk0 = mannKendall(y, t, { hr: false });
  const ci = mk.n >= 3 ? senInterval(y, t, mk.varS) : [null, null];
  const slopeDec = mk.slope === null ? null : mk.slope * k;
  const sen = { slopePerDecade: slopeDec, intervalPerDecade: ci[0] === null ? null : [ci[0] * k, ci[1] * k],
    intervalNote: "analytic Sen interval with Hamed-Rao variance; exploratory (not validated for this series)" };
  return {
    ols: ols.slope === null ? ols : { ...ols, slopePerDecade: ols.slope * k, ciPerDecade: [ols.ciLow * k, ols.ciHigh * k] },
    mk, mkIndependent: { p: mk0.p, z: mk0.z }, sen,
    verdict: detectiveVerdict(mk.p, slopeDec, mk.n, units),
  };
}
