// Shifting distribution (idea: NASA SVS 5613 "shifting distribution", redrawn as quiet ridgelines).
// One ridge per period (5 years, or 10 years for records longer than 30 years): the density of every cell-year anomaly in that period.
// The first period is the reference and is outlined. One annotation reports how far the mean moved and how the spread changed.
// Question it answers: is the WHOLE distribution moving, not just the average?
// render(container, data, options) -> {destroy, play, pause, seek, el, timeline}. Options: year (start index = group), onYear(i), groupSize.
import { el, sv, tok, onTheme, makeScale, timeline, controls, sizeObserver, clamp, signed, plain, unitText, dataTable, nextId, prepare, reducedMotion, tickDecimals } from "./common.js";

function groupsOf(years, size) {
  const g = [];
  for (let i = 0; i < years.length; i += size) { const ix = []; for (let k = i; k < Math.min(years.length, i + size); k++) ix.push(k); g.push(ix); }
  if (g.length > 1 && g[g.length - 1].length < 3) { const last = g.pop(); g[g.length - 1] = g[g.length - 1].concat(last); }   // avoid a tiny final group
  return g;
}
const labelOf = (years, ix) => { const a = years[ix[0]], b = years[ix[ix.length - 1]]; return a === b ? String(a) : `${a}–${String(b).slice(String(a).length === 4 && String(b).slice(0, 2) === String(a).slice(0, 2) ? 2 : 0)}`; };

export async function render(container, data, options = {}) {
  const P = prepare(data), U = unitText(data), years = data.years;
  const size = options.groupSize || (years.length > 30 ? 10 : 5), groups = groupsOf(years, size), nG = groups.length;
  const xm = data.scale.max, BINS = 360;
  // ---- densities: histogram on a fixed grid, smoothed with one shared Gaussian (Silverman bandwidth of the pooled sample)
  const pooled = []; for (let i = 0; i < P.A.length; i++) if (!Number.isNaN(P.A[i])) pooled.push(P.A[i]);
  const mu = (a) => a.reduce((s, v) => s + v, 0) / a.length, sd = (a, m) => Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
  const sorted = Float64Array.from(pooled).sort(), q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
  const hBw = Math.max(0.22 * sd(pooled, mu(pooled)), (2 * xm) / BINS * 2);   // gentle shared smoothing: the cells in a year move together, so fine detail is not evidence
  const stats = groups.map((ix) => {
    const s = []; for (const y of ix) for (let c = 0; c < P.nC; c++) { const v = P.A[y * P.nC + c]; if (!Number.isNaN(v)) s.push(v); }
    const m = mu(s), so = Float64Array.from(s).sort(), pq = (p) => so[Math.floor(p * (so.length - 1))];
    const hist = new Float64Array(BINS); for (const v of s) { const b = Math.floor(((v + xm) / (2 * xm)) * BINS); if (b >= 0 && b < BINS) hist[b]++; }
    const sig = hBw / ((2 * xm) / BINS), kr = Math.ceil(sig * 4), ker = []; for (let k = -kr; k <= kr; k++) ker.push(Math.exp(-0.5 * (k / sig) ** 2));
    const ks = ker.reduce((a, b) => a + b, 0), dens = new Float64Array(BINS);
    for (let i = 0; i < BINS; i++) { let a = 0; for (let k = -kr; k <= kr; k++) { const j = i + k; if (j >= 0 && j < BINS) a += hist[j] * ker[k + kr]; } dens[i] = a / ks / (s.length * ((2 * xm) / BINS)); }
    return { label: labelOf(years, ix), n: s.length, mean: m, sd: sd(s, m), p10: pq(0.1), p90: pq(0.9), dens };
  });
  const dmax = Math.max(...stats.map((s) => Math.max(...s.dens)));
  const first = stats[0], lastG = stats[nG - 1];

  let scale = makeScale(data), destroyed = false, S = 0, G = null, cur = options.year != null ? options.year : nG - 1, ridgeEls = [], annot = null, tickEls = [];
  const summaryId = nextId("viz-sum");
  const svg = sv("svg", { role: "img", "aria-labelledby": summaryId, focusable: "false", style: "display:block;max-width:100%" });
  const stage = el("div", { class: "viz-stage", tabindex: "0", role: "group", "aria-label": `Shifting distribution for ${data.region_name}. Arrow keys change the period, space plays or pauses.` }, svg);
  const readout = el("p", { class: "viz-readout viz-num" }, "Point at a ridge to read its period.");
  const summary = el("p", { class: "viz-summary", id: summaryId, "aria-live": "polite" });
  const tl = timeline({ n: nG, stepMs: 1100, ease: false, start: cur, onFrame: (tv) => { cur = Math.round(tv); apply(); }, onState });
  const ctl = controls(tl, { n: nG, labelFn: (i) => stats[i].label, name: "period", wide: true });
  const rows = stats.map((s) => [s.label, signed(s.mean, 2), plain(s.sd, 2), signed(s.p10, 2), signed(s.p90, 2), s.n.toLocaleString("en-US")]);
  const details = el("details", { class: "viz-details" }, el("summary", {}, "Summary numbers by period (table)"), dataTable(["Period", `Mean (${U})`, `Spread, SD (${U})`, "10th percentile", "90th percentile", "Cell-years"], rows, "Distribution summary by period"));
  const note = el("p", { class: "viz-note" }, `Each ridge pools every cell-year anomaly in the period (${first.n.toLocaleString("en-US")} to ${Math.max(...stats.map((s) => s.n)).toLocaleString("en-US")} values), against each cell's own ${data.baseline.years[0]}–${data.baseline.years[1]} average, so the reference period is not centred on zero by construction. Densities are drawn between ±${(xm).toFixed(1)} ${U}. ${data.product_label}.`);
  const root = el("figure", { class: "viz viz-distribution" }, stage, ctl.node, readout, summary, details, note);
  container.append(root);

  // ---------------------------------------------------------------- drawing
  function draw() {
    S = clamp(Math.round(stage.clientWidth || 640), 300, 1100);
    const narrow = S < 520, ML = narrow ? 70 : 104, MR = narrow ? 24 : 28, MT = narrow ? 64 : 58, MB = 54;
    const rowH = narrow ? 56 : 66, peak = rowH * 1.55, H = MT + (nG - 1) * rowH + peak + MB, pw = S - ML - MR;
    const X = (v) => ML + ((v + xm) / (2 * xm)) * pw, base = (g) => MT + peak + g * rowH;
    G = { ML, MT, pw, rowH, peak, X, base, H, narrow };
    svg.replaceChildren(); svg.setAttribute("width", S); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${S} ${H}`);
    const ink = tok("ink", "#192D40"), grid = tok("viz-grid", "#B8B3A4"), ghost = tok("viz-ghost", "#9AA3A8"), surface = tok("surface", "#FFFDF7"), ringC = tok("viz-ring", "#192D40");
    const halo = { "paint-order": "stroke", stroke: surface, "stroke-width": 4, "stroke-linejoin": "round" };
    const dec = tickDecimals(data), tickStep = data.scale.max / 2;
    // vertical grid + axis
    const axisY = base(nG - 1) + 14;
    for (let v = -2 * tickStep; v <= 2 * tickStep + 1e-9; v += tickStep) {
      svg.append(sv("line", { x1: X(v), x2: X(v), y1: MT - 6, y2: axisY, stroke: grid, "stroke-width": v === 0 ? 0 : 1, opacity: 0.6 }));
      svg.append(sv("text", { x: X(v), y: axisY + 18, "text-anchor": "middle", "font-size": 12, class: "t-muted num" }, v === 0 ? "0" : signed(v, dec)));
    }
    svg.append(sv("line", { x1: X(0), x2: X(0), y1: MT - 10, y2: axisY, stroke: ringC, "stroke-width": 1.5, opacity: 0.7 }));
    svg.append(sv("text", { x: ML + pw / 2, y: axisY + 38, "text-anchor": "middle", "font-size": 12, class: "t-muted" }, narrow ? `Difference from baseline (${U})` : `Difference from baseline, ${U} (0 = each cell's own average)`));
    // ridges
    ridgeEls = []; tickEls = [];
    const fillFor = (g) => {
      if (g === nG - 1) { const sh = lastG.mean - first.mean; return Math.abs(sh) > 0.04 * data.scale.max ? scale.css(Math.sign(sh) * data.scale.max * 0.55) : ghost; }
      return ghost;
    };
    for (let g = 0; g < nG; g++) {
      const s = stats[g], y0 = base(g), pts = [];
      for (let i = 0; i < BINS; i++) pts.push([X(-xm + ((i + 0.5) / BINS) * 2 * xm), y0 - (s.dens[i] / dmax) * peak]);
      const line = "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L");
      const grp = sv("g", { class: "viz-ridge", "data-g": g });
      grp.append(sv("path", { d: `${line}L${pts[BINS - 1][0].toFixed(1)} ${y0}L${pts[0][0].toFixed(1)} ${y0}Z`, fill: fillFor(g), "fill-opacity": g === nG - 1 ? 0.62 : 0.28 + 0.1 * (g / Math.max(1, nG - 1)), stroke: "none" }));
      grp.append(sv("path", { d: line, fill: "none", stroke: ink, "stroke-width": g === 0 ? 2 : 1.1, "stroke-opacity": g === 0 ? 0.95 : 0.55, "stroke-dasharray": g === 0 ? "none" : "none", "stroke-linejoin": "round" }));
      grp.append(sv("line", { x1: ML, x2: ML + pw, y1: y0, y2: y0, stroke: grid, "stroke-width": 1, opacity: 0.5 }));
      // mean tick
      grp.append(sv("path", { d: `M${X(s.mean).toFixed(1)} ${y0 + 1}l-4 7h8z`, fill: ink, opacity: 0.85 }));
      // label
      grp.append(sv("text", { x: ML - 10, y: y0 - 4, "text-anchor": "end", "font-size": narrow ? 12 : 13, class: "num", "font-weight": g === 0 ? 700 : 400 }, s.label), g === 0 ? sv("text", { x: ML - 10, y: y0 + 11, "text-anchor": "end", "font-size": 11, class: "t-muted" }, "reference") : null);
      svg.append(grp); ridgeEls.push(grp);
    }
    // annotation group (bracket between the reference mean and the current mean)
    annot = sv("g", { class: "viz-ridge", "aria-hidden": "true" });
    svg.append(annot);
    void halo; apply();
  }

  function annotate() {
    annot.replaceChildren();
    if (cur === 0) { annot.setAttribute("data-hidden", "true"); return; }
    annot.setAttribute("data-hidden", "false");
    const s = stats[cur], ink = tok("ink", "#192D40"), surface = tok("surface", "#FFFDF7");
    const x1 = G.X(first.mean), x2 = G.X(s.mean), y = G.MT - 20, shift = s.mean - first.mean;
    annot.append(sv("path", { d: `M${x1} ${y + 8}V${y}H${x2}V${y + 8}`, fill: "none", stroke: ink, "stroke-width": 1.5 }));
    const left = Math.min(x1, x2), mid = (x1 + x2) / 2, anchorEnd = mid > G.ML + G.pw * 0.62;
    const tx = G.narrow ? G.ML : clamp(anchorEnd ? Math.max(x1, x2) : left, G.ML, G.ML + G.pw);
    const t1 = sv("text", { x: tx, y: y - 22, "text-anchor": anchorEnd && !G.narrow ? "end" : "start", "font-size": G.narrow ? 12 : 14, class: "num", "paint-order": "stroke", stroke: surface, "stroke-width": 4 }, `Mean ${signed(shift, 2)} ${U} since ${first.label.split("–")[0]}`);
    const t2 = sv("text", { x: tx, y: y - 7, "text-anchor": anchorEnd && !G.narrow ? "end" : "start", "font-size": 12, class: "t-muted num", "paint-order": "stroke", stroke: surface, "stroke-width": 4 }, `Spread (SD) ${plain(first.sd, 2)} → ${plain(s.sd, 2)} ${U}`);
    annot.append(t1, t2);
  }

  function apply() {
    if (!G) return;
    ridgeEls.forEach((e, g) => {
      e.setAttribute("data-hidden", g > cur ? "true" : "false");
      e.style.opacity = g > cur ? "" : (g === cur || g === 0 ? "1" : "0.72");
    });
    annotate();
    ctl.sync();
  }

  function onState() {
    ctl.sync();
    const s = stats[cur], shift = s.mean - first.mean;
    summary.textContent = `Distribution of ${data.measure.toLowerCase()} anomalies over ${data.region_name}, by ${size}-year period, ${years[0]}–${years[years.length - 1]}. ${cur === 0 ? `${s.label} is the reference period: mean ${signed(s.mean, 2)} ${U}, spread (standard deviation) ${plain(s.sd, 2)} ${U}.` : `${s.label}: mean ${signed(s.mean, 2)} ${U}, ${signed(shift, 2)} ${U} from ${first.label}; spread ${plain(s.sd, 2)} ${U} against ${plain(first.sd, 2)} ${U}; 10th to 90th percentile ${signed(s.p10, 2)} to ${signed(s.p90, 2)} ${U}.`} Each value is one cell in one year, against that cell's own baseline.`;
    options.onYear && options.onYear(cur);
  }

  function readAt(cy) {
    if (!G) return; const r = svg.getBoundingClientRect(), y = (cy - r.top) * (G.H / r.height);
    let g = Math.round((y - G.MT - G.peak) / G.rowH); g = clamp(g, 0, cur);
    const s = stats[g]; readout.textContent = `${s.label}: mean ${signed(s.mean, 2)} ${U}, spread (SD) ${plain(s.sd, 2)} ${U}, 10th to 90th percentile ${signed(s.p10, 2)} to ${signed(s.p90, 2)} ${U}.`;
  }
  svg.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") readAt(e.clientY); });
  svg.addEventListener("pointerdown", (e) => readAt(e.clientY));
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); tl.seek(tl.index + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); tl.seek(tl.index - 1); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); tl.toggle(); }
    else if (e.key === "Home") { e.preventDefault(); tl.seek(0); } else if (e.key === "End") { e.preventDefault(); tl.seek(1e9); }
  });

  draw(); onState();
  const offSize = sizeObserver(stage, () => { if (!destroyed && Math.abs(clamp(Math.round(stage.clientWidth || 640), 300, 1100) - S) > 1) draw(); });
  const offTheme = onTheme(() => { scale = makeScale(data); draw(); });
  if (options.autoplay && !reducedMotion()) { cur = 0; tl.seek(0); tl.play(); }
  void tickEls; void nextId;
  return { el: root, play: () => tl.play(), pause: () => tl.pause(), seek: (i) => tl.seek(i), timeline: tl, destroy() { destroyed = true; tl.destroy(); offSize(); offTheme(); root.remove(); } };
}
