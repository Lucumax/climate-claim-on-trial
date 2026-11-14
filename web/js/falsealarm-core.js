// False-Alarm Planet: the computation, with no DOM. Runs in the browser and in Node (for timing and validation checks).
// A synthetic planet with NO trend anywhere: every cell is an AR(1) series with unit variance and persistence phi,
// driven by spatially smoothed noise (same recipe as the validation fields in stats/trendtrial/synth.py:
// Gaussian smoothing of the innovations, sigma = 2 grid cells, renormalised to unit variance).
// Statistics come from the shipped module (js/vendor/trendtrial.js): rung A naive Mann-Kendall (no correction),
// rung B Yue-Wang corrected Mann-Kendall (the shipped correction), rung C Benjamini-Hochberg q = 0.10 on rung B.
import { mannKendall, normalCdf } from "./vendor/trendtrial.js";

export const ALPHA = 0.05;
export const BH_Q = 0.10;
export const N_CELLS = 2500;
export const MAX_YEARS = 60;
export const SIGMA_CELLS = 2.0;

// ---------------------------------------------------------------- seeded random numbers
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normalSource(rand) {
  let spare = null;
  return function () {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0; while (u === 0) u = rand();
    const v = rand();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

// ---------------------------------------------------------------- Fibonacci lattice and smoothing weights
const latticeCache = new Map();
export function makeLattice(N = N_CELLS, sigmaCells = SIGMA_CELLS) {
  const key = N + ":" + sigmaCells;
  if (latticeCache.has(key)) return latticeCache.get(key);
  const lat = new Float64Array(N), lon = new Float64Array(N);
  const x = new Float64Array(N), y = new Float64Array(N), z = new Float64Array(N);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const zi = 1 - 2 * (i + 0.5) / N;
    const la = Math.asin(zi);
    let lo = (i * golden) % (2 * Math.PI);
    if (lo > Math.PI) lo -= 2 * Math.PI;
    lat[i] = la * 180 / Math.PI; lon[i] = lo * 180 / Math.PI;
    x[i] = Math.cos(la) * Math.cos(lo); y[i] = Math.cos(la) * Math.sin(lo); z[i] = zi;
  }
  // one grid cell is about the spacing of the lattice: sqrt(4 pi / N) radians
  const spacing = Math.sqrt(4 * Math.PI / N);
  const sig = sigmaCells * spacing, cut = 3 * sig;
  const cosCut = Math.cos(cut);
  const start = new Int32Array(N + 1);
  const idx = [], wt = [];
  for (let i = 0; i < N; i++) {
    let sumSq = 0;
    const from = idx.length;
    for (let j = 0; j < N; j++) {
      const dot = x[i] * x[j] + y[i] * y[j] + z[i] * z[j];
      if (dot < cosCut) continue;
      const ang = Math.acos(Math.min(1, dot));
      const w = Math.exp(-(ang * ang) / (2 * sig * sig));
      idx.push(j); wt.push(w); sumSq += w * w;
    }
    const norm = 1 / Math.sqrt(sumSq);          // unit variance of the smoothed white noise
    for (let k = from; k < wt.length; k++) wt[k] *= norm;
    start[i + 1] = idx.length;
  }
  const L = { N, lat, lon, x, y, z, start, idx: Int32Array.from(idx), wt: Float64Array.from(wt), spacingDeg: spacing * 180 / Math.PI };
  latticeCache.set(key, L);
  return L;
}

// Spatially smoothed unit-variance noise, year-major for each cell: out[i * nY + t].
// Same seed gives the same planet for any persistence and any record length (shorter records use the first years).
export function makeNoise(seed, L, nY = MAX_YEARS) {
  const { N, start, idx, wt } = L;
  const norm = normalSource(mulberry32(seed));
  const out = new Float32Array(N * nY);
  const white = new Float64Array(N);
  for (let t = 0; t < nY; t++) {
    for (let i = 0; i < N; i++) white[i] = norm();
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = start[i]; k < start[i + 1]; k++) s += wt[k] * white[idx[k]];
      out[i * nY + t] = s;
    }
  }
  return { noise: out, N, nY, seed };
}

// AR(1) in time with unit marginal variance, stationary from the first year: x0 = e0, x_t = phi x_{t-1} + sqrt(1-phi^2) e_t.
export function arSeries(nz, phi, n) {
  const { noise, N, nY } = nz;
  const out = new Float64Array(N * n);
  const s = Math.sqrt(1 - phi * phi);
  for (let i = 0; i < N; i++) {
    let prev = noise[i * nY];
    out[i * n] = prev;
    for (let t = 1; t < n; t++) { prev = phi * prev + s * noise[i * nY + t]; out[i * n + t] = prev; }
  }
  return out;
}

// ---------------------------------------------------------------- Benjamini-Hochberg
export function benjaminiHochberg(p, q = BH_Q) {
  const m = p.length;
  const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => p[a] - p[b]);
  const adj = new Float64Array(m);
  let kmax = 0;
  for (let r = 0; r < m; r++) if (p[order[r]] <= q * (r + 1) / m) kmax = r + 1;
  let run = 1;
  for (let r = m - 1; r >= 0; r--) { run = Math.min(run, p[order[r]] * m / (r + 1)); adj[order[r]] = run; }
  const reject = new Uint8Array(m);
  for (let r = 0; r < kmax; r++) reject[order[r]] = 1;
  return { reject, adj, count: kmax };
}

// ---------------------------------------------------------------- the three rungs, computed in chunks
const tick = () => new Promise((r) => setTimeout(r, 0));
// Rung A, the naive test: the same Mann-Kendall z and p that mannKendall(y, t, {corr: "none"}) returns (S and the
// independence variance varS0 from the same call, continuity-corrected). One call instead of two halves the work;
// selfCheck() below proves the two routes agree.
export function naiveP(mk) {
  const sd = Math.sqrt(mk.varS0);
  const z = mk.s > 0 ? (mk.s - 1) / sd : mk.s < 0 ? (mk.s + 1) / sd : 0;
  return 2 * (1 - normalCdf(Math.abs(z)));
}
export function selfCheck(count = 300, n = 25, phi = 0.45) {
  const nz = normalSource(mulberry32(5)), t = Array.from({ length: n }, (_, i) => i);
  let worst = 0;
  for (let k = 0; k < count; k++) {
    const y = []; let prev = nz();
    for (let i = 0; i < n; i++) { prev = i ? phi * prev + Math.sqrt(1 - phi * phi) * nz() : prev; y.push(prev); }
    const direct = mannKendall(y, t, { corr: "none" }).p, viaYW = naiveP(mannKendall(y, t, { corr: "yw" }));
    worst = Math.max(worst, Math.abs(direct - viaYW));
  }
  return worst;   // expected: below 1e-12
}
export async function runTrial(series, N, n, { chunk = 300, onProgress = null, signal = null } = {}) {
  const t = Array.from({ length: n }, (_, i) => i);
  const pA = new Float64Array(N), pB = new Float64Array(N), dir = new Int8Array(N), factor = new Float32Array(N);
  const y = new Array(n);
  for (let i0 = 0; i0 < N; i0 += chunk) {
    const i1 = Math.min(N, i0 + chunk);
    for (let i = i0; i < i1; i++) {
      for (let k = 0; k < n; k++) y[k] = series[i * n + k];
      const b = mannKendall(y, t, { corr: "yw" });       // Yue-Wang: S, Var(S) under independence and the correction factor
      pA[i] = naiveP(b); pB[i] = b.p; dir[i] = b.s > 0 ? 1 : b.s < 0 ? -1 : 0; factor[i] = b.hrFactor;
    }
    if (onProgress) onProgress(i1 / N);
    if (signal && signal.cancelled) return null;
    if (i1 < N) await tick();
  }
  const bh = benjaminiHochberg(pB, BH_Q);
  const A = new Uint8Array(N), B = new Uint8Array(N), C = new Uint8Array(N);
  let nA = 0, nB = 0, nC = 0, nAup = 0, nAdown = 0, nBgrow = 0, nCnotB = 0;
  for (let i = 0; i < N; i++) {
    A[i] = pA[i] < ALPHA ? 1 : 0; B[i] = pB[i] < ALPHA ? 1 : 0; C[i] = bh.reject[i];
    nA += A[i]; nB += B[i]; nC += C[i];
    if (A[i] && dir[i] > 0) nAup++; if (A[i] && dir[i] < 0) nAdown++;
    if (B[i] && !A[i]) nBgrow++;
    if (C[i] && !B[i]) nCnotB++;
  }
  return { N, n, pA, pB, padj: bh.adj, dir, factor, flags: [A, B, C], counts: [nA, nB, nC], nAup, nAdown, nBnewlyFlagged: nBgrow, nCnotB };
}

// One call: build the planet and run all three rungs.
export async function falseAlarmPlanet({ seed, phi, n, N = N_CELLS, onProgress, signal }) {
  const L = makeLattice(N);
  const nz = makeNoise(seed, L, MAX_YEARS);
  const series = arSeries(nz, phi, n);
  const res = await runTrial(series, N, n, { onProgress, signal });
  return res ? { L, seed, phi, n, ...res } : null;
}

// ---------------------------------------------------------------- replicate the validation design (many small planets)
// Same design as the published validation fields: 400 cells, spatial smoothing sigma 2 cells, no trend anywhere.
// Returns the mean flagged share per rung over R planets, its standard error across planets, and how many planets had
// at least one Benjamini-Hochberg survivor.
export async function ensembleCheck({ phi, n, R = 30, N = 400, seed0 = 7001, onProgress = null, signal = null }) {
  const L = makeLattice(N);
  const a = [], b = [];
  let anyC = 0, done = 0;
  for (let r = 0; r < R; r++) {
    const nz = makeNoise(seed0 + r, L, n);
    const res = await runTrial(arSeries(nz, phi, n), N, n, { chunk: 400, signal });
    if (!res) return null;
    a.push(res.counts[0] / N); b.push(res.counts[1] / N);
    if (res.counts[2] > 0) anyC++;
    done++;
    if (onProgress) onProgress(done / R);
    await tick();
  }
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const se = (v) => { const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)) / Math.sqrt(v.length); };
  return { R, N, phi, n, naive: mean(a), naiveSE: se(a), corrected: mean(b), correctedSE: se(b), anyC };
}
