// Climate "tornado": a 3D stack of yearly loops, one loop per year, oldest at the bottom, drawn on a floor disc and turning slowly.
// Design idea: Ed Hawkins' climate spiral (2016). Inspiration only: this is our own Canvas 2D implementation (own 3D projection) on our own data.
// Radius of a loop at a month = baseline radius + monthly difference from baseline x a constant (so a loop widens when the months run warmer).
// Colour = year, on a viridis-style ramp (perceptually even, colour-blind safe). The newest drawn year is brighter and thicker.
// Only a 12-month case makes full rings. A seasonal case (for example June to August) draws short arcs at the real calendar angles; nothing is stretched.
// Descriptive only: no trend, test or verdict is computed. No year is called a record.
// render(container, data, options) -> {destroy, play, pause, seek, rotate, el, stats}. Options: year (start index), autoplay (grow from the first year), rotate (false = no auto-turn), onYear(i).
import { el, tok, onTheme, sizeObserver, clamp, signed, unitText, dataTable, nextId, reducedMotion, endpoints } from "./common.js";

const NICE = [0.1, 0.2, 0.25, 0.4, 0.5, 0.8, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20];
const TAU = Math.PI * 2;
const TURN_SECONDS = 50;                        // one full turn: gentle, like a planet
const YEAR_MS = 270;                            // growth speed of "Play from <first year>"
const VIRIDIS = ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const RAMP_FROM = 0.2;                          // skip the darkest purple so the oldest loops stay visible on the dark floor
function viridis(t) {
  const u = clamp(RAMP_FROM + (1 - RAMP_FROM) * t, 0, 1) * (VIRIDIS.length - 1), i = Math.min(VIRIDIS.length - 2, Math.floor(u)), f = u - i;
  return VIRIDIS[i].map((v, k) => Math.round(v + (VIRIDIS[i + 1][k] - v) * f));
}
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lift = (c, f) => c.map((v) => Math.round(v + (255 - v) * f));
const cr = (p0, p1, p2, p3, t) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
const MONTH3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function render(container, data, options = {}) {
  const M = data.monthly, nY = M.years.length, nM = M.months.length, U = unitText(data), E = endpoints(data);
  const full = nM === 12 && M.months.every((m, i) => m === i + 1);
  const reduce = reducedMotion();
  const all = []; for (let y = 0; y < nY; y++) for (let j = 0; j < nM; j++) { const v = M.anomaly[y][j]; if (v != null) all.push(v); }
  const vMin = Math.min(0, ...all), vMax = Math.max(0, ...all);

  // ---------------------------------------------------------------- world: floor radius 1, stack height H
  const H = 0.95, FLOOR_Y = -H / 2 - 0.08, TOP_Y = H / 2, LABEL_R = 1.16;
  const R0 = 0.56, R_MIN = 0.1, R_MAX = 0.97;                          // baseline radius (the constant offset) and the allowed range
  const kUp = vMax > 0 ? (R_MAX - R0) / vMax : Infinity, kDn = vMin < 0 ? (R0 - R_MIN) / -vMin : Infinity;
  const K = Number.isFinite(Math.min(kUp, kDn)) ? Math.min(kUp, kDn) : 0.1;   // radius per data unit
  const rOf = (v) => clamp(R0 + K * v, R_MIN, R_MAX);
  const heightOf = (yi) => (nY > 1 ? -H / 2 + (H * yi) / (nY - 1) : 0);
  const stepV = NICE.find((s) => s * K >= 0.17) || NICE[NICE.length - 1];
  const TILT = (22 * Math.PI) / 180, CT = Math.cos(TILT), ST = Math.sin(TILT), D = 3.6;
  const PHI0 = -0.55;

  // ---------------------------------------------------------------- segments (built once)
  const SUB_FULL = 4, SUB_ARC = 6;
  const sx0 = [], sz0 = [], sx1 = [], sz1 = [], sY = [], sYear = [], sU = [], yStart = new Array(nY + 1).fill(0);
  for (let yi = 0; yi < nY; yi++) {
    yStart[yi] = sYear.length;
    const row = M.anomaly[yi], h = heightOf(yi), pts = [];           // pts: {a, r}
    const closed = full && row.every((v) => v != null);
    const addPoint = (a, r) => pts.push([a, r]);
    const runs = [];
    if (closed) {
      const r = row.map(rOf), run = [];
      for (let j = 0; j < 12; j++) for (let s = 0; s < SUB_FULL; s++) run.push([((j + s / SUB_FULL) / 12) * TAU, clamp(cr(r[(j + 11) % 12], r[j], r[(j + 1) % 12], r[(j + 2) % 12], s / SUB_FULL), 0.05, 0.98)]);
      run.push(run[0].slice()); run[run.length - 1][0] += TAU; runs.push(run);
    } else {
      let cur = [];
      const flush = () => { if (cur.length) runs.push(cur); cur = []; };
      for (let j = 0; j < nM; j++) {
        if (row[j] == null) { flush(); continue; }
        if (cur.length && M.months[j] - cur[cur.length - 1].m !== 1) flush();
        cur.push({ m: M.months[j], r: rOf(row[j]) });
      }
      flush();
      for (let q = 0; q < runs.length; q++) {
        const run = runs[q], n = run.length, out = [];
        for (let i = 0; i < n; i++) {
          const a = (run[i].m - 1) / 12 * TAU;
          if (i === n - 1) { out.push([a, run[i].r]); break; }
          const p0 = run[Math.max(0, i - 1)].r, p1 = run[i].r, p2 = run[i + 1].r, p3 = run[Math.min(n - 1, i + 2)].r, a2 = (run[i + 1].m - 1) / 12 * TAU;
          for (let s = 0; s < SUB_ARC; s++) out.push([a + ((a2 - a) * s) / SUB_ARC, clamp(cr(p0, p1, p2, p3, s / SUB_ARC), 0.05, 0.98)]);
        }
        runs[q] = out;
      }
    }
    void addPoint;
    let total = 0; for (const run of runs) total += Math.max(0, run.length - 1);
    let k = 0;
    for (const run of runs) for (let i = 0; i < run.length - 1; i++) {
      const [a, r] = run[i], [b, s] = run[i + 1];
      sx0.push(r * Math.sin(a)); sz0.push(r * Math.cos(a)); sx1.push(s * Math.sin(b)); sz1.push(s * Math.cos(b));
      sY.push(h); sYear.push(yi); sU.push(total ? (++k) / total : 1);
    }
  }
  yStart[nY] = sYear.length;
  const NSEG = sYear.length;
  const X0 = Float32Array.from(sx0), Z0 = Float32Array.from(sz0), X1 = Float32Array.from(sx1), Z1 = Float32Array.from(sz1), YH = Float32Array.from(sY), UU = Float32Array.from(sU);
  // flat arrays for the per-frame projection
  const PX0 = new Float32Array(NSEG), PY0 = new Float32Array(NSEG), PX1 = new Float32Array(NSEG), PY1 = new Float32Array(NSEG), DEP = new Float32Array(NSEG), SC = new Float32Array(NSEG);
  const order = new Uint32Array(NSEG), idxBuf = new Uint32Array(NSEG);

  // ---------------------------------------------------------------- data text
  const yearMean = (y) => { const a = M.anomaly[y].filter((v) => v != null); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
  const avg = (i0, i1) => { const a = []; for (let y = i0; y <= i1; y++) { const m = yearMean(y); if (m != null) a.push(m); } return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
  const nb = Math.max(1, Math.min(10, Math.floor(nY / 3))), ne = Math.max(1, Math.min(6, Math.floor(nY / 3)));
  const firstRange = [0, nb - 1], lastRange = [nY - ne, nY - 1];
  const yr = (r) => (M.years[r[0]] === M.years[r[1]] ? String(M.years[r[0]]) : `${M.years[r[0]]}–${M.years[r[1]]}`);
  function summaryText() {
    const a = avg(...firstRange), b = avg(...lastRange);
    const what = full ? "Each ring is one year of twelve months" : `Each arc is one year of ${data.season_text} (only these months are in this case, so no full ring can be drawn)`;
    let s = `Climate tornado for ${String(data.measure || "").toLowerCase()} over ${data.region_name}, ${M.years[0]}–${M.years[nY - 1]}. ${what}, oldest at the bottom, newest at the top. Distance from the centre is the month's difference from its own ${data.baseline.years[0]}–${data.baseline.years[1]} average, added to a constant offset, so the bright ring at the floor marks zero and a wider loop means ${E.hi}.`;
    if (a != null && b != null) {
      const d = b - a, how = Math.abs(d) < 0.02 * (vMax - vMin) ? "stay about the same" : d > 0 ? "widen" : "narrow";
      s += ` The loops ${how}: averaged over the months, ${yr(firstRange)} sits ${signed(a, 2)} ${U} from the baseline ring and ${yr(lastRange)} sits ${signed(b, 2)} ${U}.`;
    }
    return s;
  }
  const rows = M.years.map((y, i) => [String(y)].concat(M.anomaly[i].map((v) => (v == null ? "n/a" : signed(v, 2)))));

  // ---------------------------------------------------------------- DOM
  const summaryId = nextId("tor-sum");
  const canvas = el("canvas", { role: "img", "aria-labelledby": summaryId, class: "tor-canvas" });
  const stage = el("div", { class: "viz-stage tor-stage", tabindex: "0", role: "group", "aria-label": `Climate tornado of ${data.region_name}. Left and right arrows turn it, up and down arrows change the year, space pauses or starts the turning.` }, canvas);
  const yearOut = el("p", { class: "viz-sumline viz-num tor-year", "aria-hidden": "true" });
  const summary = el("p", { class: "viz-summary", id: summaryId }, summaryText());
  const stops = []; for (let i = 0; i <= 10; i++) stops.push(`${rgb(viridis(i / 10))} ${i * 10}%`);
  const legendNode = el("div", { class: "tor-legend" },
    el("div", { class: "tor-legend__bar", "aria-hidden": "true", style: `background:linear-gradient(90deg, ${stops.join(", ")})` }),
    el("div", { class: "tor-legend__ends viz-num" }, el("span", {}, `${M.years[0]} (bottom)`), el("span", { class: "tor-legend__mid" }, "Colour = year"), el("span", {}, `${M.years[nY - 1]} (top)`)));
  const playBtn = el("button", { type: "button", class: "viz-btn viz-btn--primary", onclick: () => onPlayClick() }, reduce ? "Show next year" : `Play from ${M.years[0]}`);
  const rotBtn = el("button", { type: "button", class: "viz-btn", onclick: () => api.rotate(!autoRot) }, "Pause turning");
  const scrubId = nextId("tor-scrub");
  const range = el("input", { type: "range", id: scrubId, min: 0, max: nY - 1, step: 1, value: nY - 1, "aria-label": "Choose the newest year shown", oninput: (e) => { growing = false; setP(+e.target.value + 1); syncUI(); kick(); } });
  const rangeOut = el("output", { class: "viz-year viz-num", for: scrubId });
  const controls = el("div", { class: "viz-controls tor-controls" }, playBtn, reduce ? null : rotBtn, el("div", { class: "viz-scrub" }, range, rangeOut));
  const note = el("p", { class: "viz-note" },
    `Design idea: Ed Hawkins' climate spiral (2016). Our own drawing and data. Each month is compared with the same month's ${data.baseline.years[0]}–${data.baseline.years[1]} average (the bright baseline ring, 0), and a constant offset keeps every loop clear of the centre. ${full ? "" : "Seasonal case: arcs sit at their real calendar angles and are never stretched into a ring; a full ring needs a 12-month record. "}${data.product_label}. Drag to turn it.`);
  const details = el("details", { class: "viz-details" }, el("summary", {}, "Monthly values (table)"), dataTable(["Year"].concat(M.labels.map((l) => `${l} (${U})`)), rows, `Monthly regional difference from baseline in ${U}`));
  const root = el("figure", { class: "viz viz-tornado" }, yearOut, stage, legendNode, controls, summary, note, details);
  container.append(root);

  // ---------------------------------------------------------------- state
  let destroyed = false, raf = 0, last = 0, W = 0, Hh = 0, dpr = 1, dprCap = 2, ctx = null, inView = true, dragging = false, dragX = 0;
  let phi = PHI0, rotVel = 0, autoRot = !reduce && options.rotate !== false, growing = false;
  let P = clamp(options.year != null ? options.year + 1 : nY, 0, nY), lastIdx = -1;
  let fit = { sc: 1, cx: 0, cy: 0, gutter: 0, silhouetteX: 0 };
  let col = null, fontUI = "Arial, sans-serif";
  const ivals = []; let slowCount = 0;
  const stats = { frames: 0, fps: () => (ivals.length > 5 ? Math.round(1000 / (ivals.reduce((a, b) => a + b, 0) / ivals.length)) : null), drawMs: 0, dpr: 1 };
  const unitRing = []; for (let i = 0; i < 90; i++) unitRing.push([Math.sin((i / 90) * TAU), Math.cos((i / 90) * TAU)]);

  function readColours() {
    col = { bg: tok("tor-bg", "#172636"), floor: tok("tor-floor", "#22364A"), floorLine: tok("tor-floor-line", "#5C7387"), grid: tok("tor-grid", "#3D5266"), base: tok("tor-base", "#FFFFFF"), text: tok("tor-text", "#F4EDDE"), muted: tok("tor-muted", "#C3CED4") };
    fontUI = tok("font-ui", "Arial, sans-serif");
  }
  const palette = []; for (let y = 0; y < nY; y++) palette.push(viridis(nY > 1 ? y / (nY - 1) : 1));

  // ---------------------------------------------------------------- projection (rotate about the vertical axis, tilt, perspective)
  let cp = 1, sp = 0;
  const proj = (x, y, z, out) => {                          // returns screen x, y, depth, scale in out
    const xr = x * cp + z * sp, zr = -x * sp + z * cp;
    const yy = y * CT + zr * ST, zz = zr * CT - y * ST, s = D / (D + zz);
    out[0] = fit.cx + xr * s * fit.sc; out[1] = fit.cy - yy * s * fit.sc; out[2] = zz; out[3] = s;
  };
  const projR = (xr, y, zr, out) => {                       // already in the turned frame (labels that stay at a fixed place on screen)
    const yy = y * CT + zr * ST, zz = zr * CT - y * ST, s = D / (D + zz);
    out[0] = fit.cx + xr * s * fit.sc; out[1] = fit.cy - yy * s * fit.sc; out[2] = zz; out[3] = s;
  };
  const tmp = [0, 0, 0, 0], tmp2 = [0, 0, 0, 0];

  function layout() {
    const cw = Math.round(stage.clientWidth || 640);
    W = clamp(cw, 280, 900); Hh = Math.round(W < 480 ? W * 0.9 : W * 0.8);
    dpr = Math.min(window.devicePixelRatio || 1, dprCap); stats.dpr = dpr;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(Hh * dpr); canvas.style.width = W + "px"; canvas.style.height = Hh + "px";
    ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // fit: project the extreme circles of the world once at unit scale (the circles look the same from every angle)
    const savedFit = fit; fit = { sc: 1, cx: 0, cy: 0 }; const savedC = [cp, sp]; cp = 1; sp = 0;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [sa, ca] of unitRing) for (const [r, y] of [[LABEL_R + 0.04, FLOOR_Y], [R_MAX, TOP_Y], [1, FLOOR_Y]]) {
      proj(r * sa, y, r * ca, tmp); x0 = Math.min(x0, tmp[0]); x1 = Math.max(x1, tmp[0]); y0 = Math.min(y0, tmp[1]); y1 = Math.max(y1, tmp[1]);
    }
    [cp, sp] = savedC; void savedFit;
    const gutter = W < 480 ? 34 : 54, padT = 12, padB = 14, padR = 10;
    const sc = Math.min((W - gutter - padR) / (x1 - x0), (Hh - padT - padB) / (y1 - y0));
    fit = { sc, cx: gutter + (W - gutter - padR) / 2 - ((x0 + x1) / 2) * sc, cy: padT + (Hh - padT - padB) / 2 - ((y0 + y1) / 2) * sc, gutter };
  }

  // ---------------------------------------------------------------- drawing
  function drawRing(r, y, stroke, lw, dash, alpha = 1) {
    ctx.beginPath();
    for (let i = 0; i <= unitRing.length; i++) { const [sa, ca] = unitRing[i % unitRing.length]; proj(r * sa, y, r * ca, tmp); i ? ctx.lineTo(tmp[0], tmp[1]) : ctx.moveTo(tmp[0], tmp[1]); }
    ctx.closePath(); ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.globalAlpha = alpha; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function label(text, x, y, { size, bold, color, align = "center", halo }) {
    ctx.font = `${bold ? "700 " : ""}${size}px ${fontUI}`; ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = halo; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  function draw() {
    if (!ctx || !col) return;
    const t0 = performance.now();
    cp = Math.cos(phi); sp = Math.sin(phi);
    const small = W < 480, fs = small ? 11.5 : 13;
    ctx.clearRect(0, 0, W, Hh);
    // floor disc
    ctx.beginPath();
    for (let i = 0; i <= unitRing.length; i++) { const [sa, ca] = unitRing[i % unitRing.length]; proj(sa, FLOOR_Y, ca, tmp); i ? ctx.lineTo(tmp[0], tmp[1]) : ctx.moveTo(tmp[0], tmp[1]); }
    ctx.closePath(); ctx.fillStyle = col.floor; ctx.fill(); ctx.strokeStyle = col.floorLine; ctx.lineWidth = 1.2; ctx.stroke();
    // reference rings: -step, +step, +2 step ... and spokes
    for (let v = stepV; R0 + K * v <= R_MAX + 1e-6; v += stepV) drawRing(R0 + K * v, FLOOR_Y, col.grid, 1, null, 0.95);
    for (let v = -stepV; R0 + K * v >= R_MIN - 1e-6; v -= stepV) drawRing(R0 + K * v, FLOOR_Y, col.grid, 1, [2, 4], 0.95);
    ctx.lineWidth = 1; ctx.strokeStyle = col.grid; ctx.globalAlpha = 0.6;
    for (let m = 0; m < 12; m++) { const a = (m / 12) * TAU; proj(0.06 * Math.sin(a), FLOOR_Y, 0.06 * Math.cos(a), tmp); proj(Math.sin(a), FLOOR_Y, Math.cos(a), tmp2); ctx.beginPath(); ctx.moveTo(tmp[0], tmp[1]); ctx.lineTo(tmp2[0], tmp2[1]); ctx.stroke(); }
    ctx.globalAlpha = 1;
    drawRing(R0, FLOOR_Y, col.base, 2.4, null, 1);           // the baseline ring
    // year axis (thin line through the middle of the stack) and its ticks on the left
    proj(0, FLOOR_Y, 0, tmp); proj(0, TOP_Y, 0, tmp2);
    ctx.strokeStyle = col.grid; ctx.globalAlpha = 0.7; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tmp[0], tmp[1]); ctx.lineTo(tmp2[0], tmp2[1]); ctx.stroke(); ctx.globalAlpha = 1;

    // loops: project the visible segments, sort far to near, draw
    const visYears = Math.min(nY, Math.ceil(P - 1e-9));
    let n = 0;
    for (let yi = 0; yi < visYears; yi++) {
      const f = Math.min(1, P - yi);
      for (let i = yStart[yi]; i < yStart[yi + 1]; i++) {
        if (UU[i] > f + 1e-6) break;
        proj(X0[i], YH[i], Z0[i], tmp); proj(X1[i], YH[i], Z1[i], tmp2);
        PX0[n] = tmp[0]; PY0[n] = tmp[1]; PX1[n] = tmp2[0]; PY1[n] = tmp2[1]; DEP[n] = (tmp[2] + tmp2[2]) / 2; SC[n] = (tmp[3] + tmp2[3]) / 2; order[n] = i; n++;
      }
    }
    const idx = idxBuf.subarray(0, n); for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort((a, b) => DEP[b] - DEP[a]);                    // far first
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const newest = visYears - 1, lw = small ? 1.05 : 1.2;
    for (let q = 0; q < n; q++) {
      const k = idx[q], seg = order[k], yi = sYear[seg], isNew = yi === newest;
      ctx.beginPath(); ctx.moveTo(PX0[k], PY0[k]); ctx.lineTo(PX1[k], PY1[k]);
      if (isNew) {
        ctx.globalAlpha = 1; ctx.strokeStyle = rgb(lift(palette[yi], 0.28)); ctx.lineWidth = (small ? 2.6 : 3.2) * SC[k]; ctx.stroke();
      } else {
        ctx.globalAlpha = 0.78; ctx.strokeStyle = rgb(palette[yi]); ctx.lineWidth = lw * SC[k]; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // labels last, with a halo, so a line passing behind never hides them
    const seasonal = new Set(M.months);
    for (let m = 1; m <= 12; m++) {
      const a = ((m - 1) / 12) * TAU; proj(LABEL_R * Math.sin(a), FLOOR_Y, LABEL_R * Math.cos(a), tmp);
      label(MONTH3[m - 1], tmp[0], tmp[1], { size: fs, bold: seasonal.has(m), color: seasonal.has(m) ? col.text : col.muted, halo: col.bg });
    }
    // ring labels at a fixed place on screen (front right of the floor)
    const beta = Math.PI - 0.5, sb = Math.sin(beta), cb = Math.cos(beta);
    const ringLab = (v, text, strong) => { const r = R0 + K * v; projR(r * sb, FLOOR_Y, r * cb, tmp); label(text, tmp[0] + 5, tmp[1], { size: fs - 0.5, bold: strong, color: strong ? col.text : col.muted, align: "left", halo: col.floor }); };
    ringLab(0, "0 = baseline", true);
    if (!small) {
      for (let v = stepV; R0 + K * v <= R_MAX + 1e-6; v += stepV) ringLab(v, `${signed(v, v % 1 ? 1 : 0)} ${U}`, false);
      for (let v = -stepV; R0 + K * v >= R_MIN - 1e-6; v -= stepV) ringLab(v, `${signed(v, v % 1 ? 1 : 0)} ${U}`, false);
    } else if (R0 + K * stepV <= R_MAX) ringLab(stepV, `${signed(stepV, stepV % 1 ? 1 : 0)} ${U}`, false);
    // year ticks in the left gutter, joined to the stack by a faint dotted guide
    const near = Math.max(2, nY / (small ? 7 : 14)), pruned = [];
    for (let y = 0; y < nY; y++) if (M.years[y] % 10 === 0 && !(small && M.years[y] % 20 !== 0 && nY > 30)) pruned.push(y);
    for (const y of [0, nY - 1]) if (!pruned.some((q) => Math.abs(q - y) < near)) pruned.push(y);
    for (const y of pruned) {
      proj(0, heightOf(y), 0, tmp); const sc = tmp[3] * fit.sc, ex = fit.cx - R_MAX * sc * 1.02;
      ctx.strokeStyle = col.grid; ctx.globalAlpha = 0.9; ctx.lineWidth = 1; ctx.setLineDash([1, 4]); ctx.beginPath(); ctx.moveTo(fit.gutter - 2, tmp[1]); ctx.lineTo(Math.max(fit.gutter, ex), tmp[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      label(String(M.years[y]), 2, tmp[1], { size: fs, bold: false, color: col.text, align: "left", halo: col.bg });
    }
    stats.drawMs = stats.drawMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  // ---------------------------------------------------------------- loop
  const canRun = () => inView && !document.hidden;
  function tick(now) {
    raf = 0; if (destroyed) return;
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    if (dt > 0) { ivals.push(dt * 1000); if (ivals.length > 120) ivals.shift(); }
    stats.frames++;
    if (growing) { setP(Math.min(nY, P + (dt * 1000) / YEAR_MS)); if (P >= nY) growing = false; syncUI(); }
    const target = autoRot && !dragging && canRun() ? TAU / TURN_SECONDS : 0;
    rotVel += (target - rotVel) * (1 - Math.exp(-dt / 0.9));
    if (target === 0 && Math.abs(rotVel) < 0.003) rotVel = 0;
    phi += rotVel * dt;
    draw();
    // degrade gracefully: if frames stay slow while turning, lower the pixel density
    if (rotVel > 0.05 && ivals.length >= 60) {
      const m = ivals.reduce((a, b) => a + b, 0) / ivals.length;
      slowCount = m > 26 ? slowCount + 1 : 0;
      if (slowCount > 90 && dprCap > 1) { dprCap = dprCap > 1.5 ? 1.5 : 1; slowCount = 0; ivals.length = 0; layout(); }
    }
    if ((growing || target > 0 || rotVel !== 0) && canRun()) raf = requestAnimationFrame(tick);
  }
  function kick() { if (destroyed || raf) return; last = performance.now(); raf = requestAnimationFrame(tick); }

  // ---------------------------------------------------------------- state changes and UI
  function setP(v) { P = clamp(v, 0, nY); }
  const idxNow = () => clamp(Math.ceil(P - 1e-9) - 1, 0, nY - 1);
  function syncUI() {
    const i = idxNow();
    if (i !== lastIdx || !yearOut.firstChild) {
      lastIdx = i;
      const m = yearMean(i);
      yearOut.textContent = String(M.years[i]);
      yearOut.append(el("small", {}, m == null ? "" : `Average of the months: ${signed(m, 2)} ${U} from baseline`));
      range.value = i; rangeOut.textContent = String(M.years[i]); range.setAttribute("aria-valuetext", String(M.years[i]));
      options.onYear && options.onYear(i);
    }
    if (!reduce) playBtn.textContent = growing ? "Pause" : P > 0 && P < nY ? "Resume" : `Play from ${M.years[0]}`;
    rotBtn.textContent = autoRot ? "Pause turning" : "Turn slowly";
  }
  function onPlayClick() {
    if (reduce) { setP(P >= nY ? 1 : Math.floor(P + 1e-9) + 1); syncUI(); kick(); return; }
    if (growing) { growing = false; syncUI(); return; }
    if (P >= nY || P <= 0) setP(0);
    growing = true; syncUI(); kick();
  }

  // ---------------------------------------------------------------- pointer and keyboard
  canvas.addEventListener("pointerdown", (e) => { dragging = true; dragX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } canvas.classList.add("is-dragging"); kick(); });
  canvas.addEventListener("pointermove", (e) => { if (!dragging) return; phi += (e.clientX - dragX) * 0.01; dragX = e.clientX; kick(); });
  const endDrag = () => { dragging = false; canvas.classList.remove("is-dragging"); kick(); };
  canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);
  stage.addEventListener("keydown", (e) => {
    const step = (10 * Math.PI) / 180;
    if (e.key === "ArrowLeft") { e.preventDefault(); phi -= step; kick(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); phi += step; kick(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); growing = false; setP(Math.min(nY, idxNow() + 2)); syncUI(); kick(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); growing = false; setP(Math.max(1, idxNow())); syncUI(); kick(); }
    else if (e.key === "Home") { e.preventDefault(); growing = false; setP(1); syncUI(); kick(); }
    else if (e.key === "End") { e.preventDefault(); growing = false; setP(nY); syncUI(); kick(); }
    else if (e.key === " " && !reduce) { e.preventDefault(); api.rotate(!autoRot); }
  });

  // ---------------------------------------------------------------- start
  const offSize = sizeObserver(stage, () => { if (!destroyed && Math.abs(clamp(Math.round(stage.clientWidth || 640), 280, 900) - W) > 1) { layout(); kick(); } });
  const offTheme = onTheme(() => { readColours(); kick(); });
  let io = null;
  if (window.IntersectionObserver) { io = new IntersectionObserver((es) => { inView = es[es.length - 1].isIntersecting; if (inView) kick(); }); io.observe(stage); }
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener("visibilitychange", onVis);

  readColours(); layout(); syncUI(); kick();
  if (options.autoplay && !reduce) onPlayClick();

  const api = {
    el: root, stats,
    play: () => { if (!growing) onPlayClick(); },
    pause: () => { growing = false; syncUI(); },
    seek: (i) => { growing = false; setP(clamp(Math.round(i), 0, nY - 1) + 1); syncUI(); kick(); },
    rotate: (on) => { autoRot = !!on && !reduce; syncUI(); kick(); },
    setAngle: (deg) => { phi = (deg * Math.PI) / 180; kick(); },
    destroy() { destroyed = true; cancelAnimationFrame(raf); offSize(); offTheme(); io && io.disconnect(); document.removeEventListener("visibilitychange", onVis); root.remove(); },
  };
  return api;
}
