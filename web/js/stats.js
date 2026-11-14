// STUB statistics adapter. The shipped statistics come from stats/js/trendtrial.js (written by the stats worker and
// checked against pymannkendall). Until that file exists this module offers the same questions with a small, standard
// implementation so the Detective screens can be built and tested. The page labels results from this stub as
// "preview statistics". When trendtrial.js lands, replace the bodies below with calls into it; callers do not change.
export const STATS_IS_STUB = true;

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

// ---- distributions ----
function lgamma(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const v of c) s += v / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-30) d = 1e-30; d = 1 / d; let h = d; for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30; c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
function ibeta(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
export function tTwoSidedP(t, df) { return ibeta(df / 2, 0.5, df / (df + t * t)); }
function tCrit(df, p = 0.975) { let lo = 0, hi = 50; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; (1 - tTwoSidedP(mid, df) / 2 < p) ? lo = mid : hi = mid; } return (lo + hi) / 2; }
const erf = x => { const sg = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); return sg * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
export const normTwoSidedP = z => 1 - erf(Math.abs(z) / Math.SQRT2);

// ---- helpers ----
export function deseasonalize(months, v) { // subtract each calendar month's own mean
  const sum = Array(13).fill(0), cnt = Array(13).fill(0);
  v.forEach((x, i) => { sum[months[i]] += x; cnt[months[i]]++; });
  return v.map((x, i) => x - sum[months[i]] / cnt[months[i]]);
}
function ranks(a) { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const rk = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = rk; i = j + 1; } return r; }
function acfAt(x, lag) { const n = x.length, m = mean(x); let a = 0, b = 0; for (let i = 0; i < n; i++) { b += (x[i] - m) ** 2; if (i + lag < n) a += (x[i] - m) * (x[i + lag] - m); } return a / b; }

// ---- tests ----
export function ols(t, y) { // slope per unit of t, with t-test and 95% CI
  const n = t.length, mt = mean(t), my = mean(y); let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (t[i] - mt) * (y[i] - my); sxx += (t[i] - mt) ** 2; }
  const b = sxy / sxx, a = my - b * mt; let sse = 0; for (let i = 0; i < n; i++) sse += (y[i] - a - b * t[i]) ** 2;
  const df = n - 2, se = Math.sqrt(sse / df / sxx), tv = b / se, tc = tCrit(df);
  return { n, slope: b, intercept: a, se, t: tv, df, p: tTwoSidedP(tv, df), lo: b - tc * se, hi: b + tc * se };
}
export function mannKendall(y) { // S, tie-corrected variance, no autocorrelation correction
  const n = y.length; let S = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) S += Math.sign(y[j] - y[i]);
  const counts = new Map(); y.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  let tie = 0; for (const c of counts.values()) if (c > 1) tie += c * (c - 1) * (2 * c + 5);
  const varS = (n * (n - 1) * (2 * n + 5) - tie) / 18;
  const z = S === 0 ? 0 : (S - Math.sign(S)) / Math.sqrt(varS);
  return { n, S, varS, z, p: normTwoSidedP(z), tau: S / (n * (n - 1) / 2) };
}
export function senSlope(t, y) { // median pairwise slope with the rank-based interval
  const n = y.length, sl = [];
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) if (t[j] !== t[i]) sl.push((y[j] - y[i]) / (t[j] - t[i]));
  sl.sort((a, b) => a - b);
  const N = sl.length, med = N % 2 ? sl[(N - 1) / 2] : (sl[N / 2 - 1] + sl[N / 2]) / 2;
  const intercept = (() => { const r = y.map((v, i) => v - med * t[i]).sort((a, b) => a - b), m = r.length >> 1; return r.length % 2 ? r[m] : (r[m - 1] + r[m]) / 2; })();
  return { slope: med, intercept, sorted: sl, N };
}
export function senCI(sl, N, varS, level = 0.95) {
  const z = level === 0.95 ? 1.959964 : 1.645, C = z * Math.sqrt(varS);
  const m1 = Math.max(0, Math.floor((N - C) / 2)), m2 = Math.min(N - 1, Math.ceil((N + C) / 2));
  return { lo: sl[m1], hi: sl[m2] };
}
export function hamedRaoFactor(t, y) { // variance inflation n/n*, floored at 1 (stub of the Hamed-Rao 1998 correction)
  const n = y.length, s = senSlope(t, y), res = y.map((v, i) => v - s.slope * t[i]), r = ranks(res);
  const maxLag = Math.min(Math.floor(n / 3), 24), crit = 1.959964 / Math.sqrt(n); let sum = 0;
  for (let k = 1; k <= maxLag; k++) { const rk = acfAt(r, k); if (Math.abs(rk) > crit) sum += (n - k) * (n - k - 1) * (n - k - 2) * rk; }
  return Math.max(1, 1 + 2 / (n * (n - 1) * (n - 2)) * sum);
}

// One call for the Detective: all tests on one series. t in decimal years; result slopes are per decade.
export function analyze(t, y) {
  const o = ols(t, y), mk = mannKendall(y), sn = senSlope(t, y), f = hamedRaoFactor(t, y);
  const ci = senCI(sn.sorted, sn.N, mk.varS * f);
  const zhr = mk.z / Math.sqrt(f);
  return {
    n: y.length,
    ols: { slope_per_decade: o.slope * 10, lo: o.lo * 10, hi: o.hi * 10, p: o.p, t: o.t, df: o.df, intercept: o.intercept, se: o.se * 10 },
    mk: { S: mk.S, z: mk.z, p: mk.p, tau: mk.tau },
    sen: { slope_per_decade: sn.slope * 10, lo: ci.lo * 10, hi: ci.hi * 10, intercept: sn.intercept },
    hr: { vif: f, z: zhr, p: normTwoSidedP(zhr) },
  };
}
