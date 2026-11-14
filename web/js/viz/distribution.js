// Distribution view: one foreground curve that moves from period to period over the first period's outline.
// Population: every grid cell in every year of the period, each cell against its own baseline ("pooled cell-year anomalies, unweighted").
// Axes never change: the zero line, the horizontal range and the density scale are fixed for all periods, so a curve that moves, widens or narrows
// does so on its own densities. Nothing here promises that a distribution shifts or broadens; the text line reports what the numbers do.
// Question it answers: is the WHOLE distribution moving, not just the average?
// Idea: NASA SVS 5613 (shifting distribution). render(container, data, options) -> {destroy, play, pause, seek, el, timeline}.
// Options: year (start index = period), onYear(i), groupSize.
import { el, sv, tok, onTheme, makeScale, timeline, controls, stageKeys, sizeObserver, clamp, signed, plain, unitText, dataTable, nextId, prepare, reducedMotion } from "./common.js";

function groupsOf(years, size) {
  const g = [];
  for (let i = 0; i < years.length; i += size) { const ix = []; for (let k = i; k < Math.min(years.length, i + size); k++) ix.push(k); g.push(ix); }
  if (g.length > 1 && g[g.length - 1].length < 3) { const last = g.pop(); g[g.length - 1] = g[g.length - 1].concat(last); }   // avoid a tiny final group
  return g;
}
const NICE = (() => { const a = []; for (const k of [0.01, 0.1, 1, 10]) for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8]) a.push(m * k); return a; })();
const nice = (v) => NICE.find((x) => x >= v) || Math.ceil(v);
const num = (n) => n.toLocaleString("en-US");

export async function render(container, data, options = {}) {
  const P = prepare(data), U = unitText(data), years = data.years;
  const size = options.groupSize || (years.length > 30 ? 10 : 5), groups = groupsOf(years, size), nG = groups.length;
  const perUnit = /unitless/.test(U) ? "per unit of AOD" : `per ${U}`;
  const BINS = 300;
  const pooled = []; for (let i = 0; i < P.A.length; i++) if (!Number.isNaN(P.A[i])) pooled.push(P.A[i]);
  const mu = (a) => a.reduce((s, v) => s + v, 0) / a.length, sd = (a, m) => Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1));
  const sorted = Float64Array.from(pooled).sort(), q = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
  // fixed horizontal range: symmetric about zero, wide enough for 99.8% of all cell-years; the rest is disclosed, not hidden
  const D = nice(Math.max(Math.abs(q(0.001)), Math.abs(q(0.999)), 0.05));
  const outside = pooled.filter((v) => Math.abs(v) > D).length;
  const dec = D >= 2 ? 1 : D >= 0.5 ? 2 : 2;
  const binW = (2 * D) / BINS, bw = Math.max(0.22 * sd(pooled, mu(pooled)), binW * 2);   // one shared bandwidth: cells in a year move together, so fine detail is not evidence
  const stats = groups.map((ix) => {
    const s = []; for (const y of ix) for (let c = 0; c < P.nC; c++) { const v = P.A[y * P.nC + c]; if (!Number.isNaN(v)) s.push(v); }
    const m = mu(s), so = Float64Array.from(s).sort(), pq = (p) => so[Math.floor(p * (so.length - 1))];
    const hist = new Float64Array(BINS); for (const v of s) { const b = Math.floor(((v + D) / (2 * D)) * BINS); if (b >= 0 && b < BINS) hist[b]++; }
    const sig = bw / binW, kr = Math.ceil(sig * 4), ker = []; for (let k = -kr; k <= kr; k++) ker.push(Math.exp(-0.5 * (k / sig) ** 2));
    const ks = ker.reduce((a, b) => a + b, 0), dens = new Float64Array(BINS);
    for (let i = 0; i < BINS; i++) { let a = 0; for (let k = -kr; k <= kr; k++) { const j = i + k; if (j >= 0 && j < BINS) a += hist[j] * ker[k + kr]; } dens[i] = a / ks / (s.length * binW); }
    const y0 = years[ix[0]], y1 = years[ix[ix.length - 1]];
    return { label: y0 === y1 ? String(y0) : `${y0}–${y1}`, nYears: ix.length, partial: ix.length < size, n: s.length, mean: m, sd: sd(s, m), p10: pq(0.1), p90: pq(0.9), dens };
  });
  const dmax = Math.max(...stats.map((s) => Math.max(...s.dens))) * 1.08;     // one density scale for every period
  const first = stats[0], periodText = (s) => `${s.label}${s.partial ? ` (partial: ${s.nYears} of ${size} years)` : ""}`;

  if (options.tableOnly) {            // the docket's Statistics section owns the numbers: same stats, no chart
    const rowsT = stats.map((s) => [s.label + (s.partial ? " (partial)" : ""), String(s.nYears), num(s.n), signed(s.mean, 2), plain(s.sd, 2), signed(s.p10, 2), signed(s.p90, 2)]);
    const node = dataTable(["Period", "Years", "Cell-years", `Mean, ${U}`, `Spread (SD), ${U}`, "10th percentile", "90th percentile"], rowsT, "Distribution summary by period; pooled cell-year anomalies, unweighted");
    return { el: node, destroy() { node.remove(); } };
  }
  let scale = makeScale(data), destroyed = false, S = 0, G = null, cur = clamp(options.year != null ? options.year : nG - 1, 0, nG - 1), fT = cur;
  const summaryId = nextId("viz-sum");
  const svg = sv("svg", { role: "img", "aria-labelledby": summaryId, focusable: "false", style: "display:block;max-width:100%" });
  const stage = el("div", { class: "viz-stage", tabindex: "0", role: "group", "aria-label": `Shifting distribution for ${data.region_name}. Arrow keys change the period, space plays or pauses.` }, svg);
  const line = el("p", { class: "viz-dist__line", "aria-hidden": "true" });
  const summary = el("p", { class: "viz-summary", id: summaryId, "aria-live": "polite" });
  const tl = timeline({ n: nG, stepMs: 1100, ease: true, start: cur, onFrame: (tv) => { fT = tv; apply(); }, onState, onIndex: (i) => { cur = i; sayLine(); } });
  const ctl = controls(tl, { n: nG, labelFn: (i) => stats[i].label + (stats[i].partial ? " (partial)" : ""), name: "period", wide: true, play: false });
  const rows = stats.map((s) => [s.label + (s.partial ? " (partial)" : ""), String(s.nYears), num(s.n), signed(s.mean, 2), plain(s.sd, 2), signed(s.p10, 2), signed(s.p90, 2)]);
  const details = options.table === false ? null : el("details", { class: "viz-details" }, el("summary", {}, "Summary numbers by period (table)"),
    dataTable(["Period", "Years", "Cell-years", `Mean, ${U}`, `Spread (SD), ${U}`, "10th percentile", "90th percentile"], rows, "Distribution summary by period; pooled cell-year anomalies, unweighted"));
  const note = el("p", { class: "viz-note" }, `Population: pooled cell-year anomalies, unweighted. Every grid cell counts once for every year, each against its own ${data.baseline.years[0]}–${data.baseline.years[1]} baseline, so a period's mean here differs from the area-weighted regional record. Neighbouring cells and the years in a period are correlated, so the curves describe the data and are not independent observations; no test is run on them. ${outside ? `The horizontal range is ±${D} ${U}; ${num(outside)} of ${num(pooled.length)} values (${(100 * outside / pooled.length).toFixed(2)}%) lie beyond it and are not drawn.` : `The horizontal range is ±${D} ${U} and holds every value.`} Curves use one shared smoothing width of ${bw.toFixed(2)} ${U}. ${data.product_label}.`);
  const root = el("figure", { class: "viz viz-distribution" }, line, stage, ctl.node, summary, details, note);
  container.append(root);

  // One large, plain message: how far the mean moved and what the spread did, against the reference period. Smaller line: period, years, counts.
  function sayLine() {
    const s = stats[cur]; line.innerHTML = "";
    if (cur === 0) { line.append(el("span", { class: "viz-dist__big" }, `${first.label} is the reference: mean ${signed(s.mean, 2)} ${U}, spread ${plain(s.sd, 2)} ${U}.`), el("span", { class: "viz-dist__sub" }, `${periodText(s)} · ${num(s.nYears)} years · ${num(s.n)} cell-years. Press the slider or arrow keys to compare later periods.`)); return; }
    const shift = s.mean - first.mean, r = s.sd / first.sd;
    const moved = Math.abs(shift) < 0.05 * first.sd ? "The average barely moved" : `The average moved ${signed(shift, 2)} ${U}`;
    const spread = r > 1.05 ? "the spread widened" : r < 0.95 ? "the spread narrowed" : "the spread stayed about the same";
    line.append(el("span", { class: "viz-dist__big" }, `${moved}, and ${spread} (${plain(first.sd, 2)} → ${plain(s.sd, 2)} ${U}).`), el("span", { class: "viz-dist__sub" }, `${periodText(s)} compared with the reference ${first.label} · ${num(s.n)} cell-years.`));
  }

  // ---------------------------------------------------------------- drawing
  let fgFill = null, fgLine = null, fgMean = null, fgLab = null, outlines = [];
  function draw() {
    S = clamp(Math.round(stage.clientWidth || 640), 300, 1100);
    const narrow = S < 520, ML = narrow ? 56 : 64, MR = 16, MT = 28, MB = 62, H = narrow ? 300 : 360, pw = S - ML - MR, ph = H - MT - MB;
    const X = (v) => ML + ((v + D) / (2 * D)) * pw, Y = (d) => MT + ph - (d / dmax) * ph;
    G = { ML, MT, pw, ph, X, Y, H, narrow };
    svg.replaceChildren(); svg.setAttribute("width", S); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${S} ${H}`);
    const grid = tok("viz-grid", "#B8B3A4"), ringC = tok("viz-ring", "#192D40"), ghost = tok("viz-ghost", "#7C878D"), ink = tok("ink", "#192D40"), surface = tok("surface", "#FFFDF7");
    const stepX = D <= 1 ? 0.25 : D <= 2 ? 0.5 : D <= 5 ? 1 : 2;
    for (let v = -Math.floor(D / stepX) * stepX; v <= D + 1e-9; v += stepX) {
      if (Math.abs(v) < 1e-9) continue;
      svg.append(sv("line", { x1: X(v), x2: X(v), y1: MT, y2: MT + ph, stroke: grid, "stroke-width": 1, opacity: 0.45 }));
      svg.append(sv("text", { x: X(v), y: MT + ph + 20, "text-anchor": "middle", "font-size": 14, class: "t-muted num" }, signed(v, dec > 1 ? 2 : 1).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")));
    }
    // density axis (same scale in every period)
    const yStep = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5].find((s) => dmax / s <= 5) || 5;
    for (let d = 0; d <= dmax * 0.97; d += yStep) {
      svg.append(sv("line", { x1: ML, x2: ML + pw, y1: Y(d), y2: Y(d), stroke: grid, "stroke-width": 1, opacity: d === 0 ? 0.9 : 0.35 }));
      svg.append(sv("text", { x: ML - 8, y: Y(d) + 5, "text-anchor": "end", "font-size": 14, class: "t-muted num" }, String(+d.toFixed(2))));
    }
    svg.append(sv("text", { x: 14, y: MT + ph / 2, "text-anchor": "middle", transform: `rotate(-90 14 ${MT + ph / 2})`, "font-size": 14, class: "t-muted" }, narrow ? "Share of cell-years" : `Share of cell-years, ${perUnit}`));
    svg.append(sv("text", { x: ML + pw / 2, y: H - 10, "text-anchor": "middle", "font-size": 14, class: "t-muted" }, `Difference from each cell's own baseline (${U})`));
    // fixed zero line
    svg.append(sv("line", { x1: X(0), x2: X(0), y1: MT - 6, y2: MT + ph, stroke: ringC, "stroke-width": 1.8, opacity: 0.8 }));
    svg.append(sv("text", { x: X(0), y: MT + ph + 20, "text-anchor": "middle", "font-size": 14, class: "num", "font-weight": 700 }, "0"));
    svg.append(sv("text", { x: X(0) + 6, y: MT - 10, "font-size": 14, class: "t-muted", "paint-order": "stroke", stroke: surface, "stroke-width": 4 }, "baseline"));
    // faint outlines of the periods passed, reference outline, then the moving foreground curve
    const path = (d) => { let p = ""; for (let i = 0; i < BINS; i++) p += (i ? "L" : "M") + X(-D + (i + 0.5) * binW).toFixed(1) + " " + Y(d[i]).toFixed(1); return p; };
    outlines = [];
    for (let g = 1; g < nG; g++) { const o = sv("path", { d: path(stats[g].dens), fill: "none", stroke: ghost, "stroke-width": 1, opacity: 0.4, "stroke-linejoin": "round", visibility: "hidden" }); svg.append(o); outlines.push(o); }
    svg.append(sv("path", { d: path(first.dens), fill: "none", stroke: ink, "stroke-width": 2, "stroke-dasharray": "7 4", opacity: 0.9, "stroke-linejoin": "round" }));
    fgFill = sv("path", { fill: "currentColor", "fill-opacity": 0.5, stroke: "none" }); fgLine = sv("path", { fill: "none", stroke: ink, "stroke-width": 2.4, "stroke-linejoin": "round" });
    fgMean = sv("path", { fill: ink }); fgLab = sv("text", { "font-size": 14, class: "num", "text-anchor": "middle", "paint-order": "stroke", stroke: surface, "stroke-width": 4 });
    svg.append(fgFill, fgLine, fgMean, fgLab);
    svg.append(sv("path", { d: `M${X(first.mean).toFixed(1)} ${MT + ph}l-5 9h10z`, fill: "none", stroke: ink, "stroke-width": 1.4 }));
    const refLab = sv("text", { "font-size": 14, class: "t-muted", "paint-order": "stroke", stroke: surface, "stroke-width": 4 }, "dashed: reference period " + first.label);
    refLab.setAttribute("x", narrow ? ML + 8 : ML + 12); refLab.setAttribute("y", MT + 16); svg.append(refLab);
    apply();
  }

  function apply() {
    if (!G) return;
    const t = clamp(fT, 0, nG - 1), i0 = Math.floor(t), i1 = Math.min(nG - 1, i0 + 1), f = t - i0, a = stats[i0], b = stats[i1];
    const d = new Float64Array(BINS); for (let k = 0; k < BINS; k++) d[k] = a.dens[k] * (1 - f) + b.dens[k] * f;
    let p = ""; for (let k = 0; k < BINS; k++) p += (k ? "L" : "M") + G.X(-D + (k + 0.5) * binW).toFixed(1) + " " + G.Y(d[k]).toFixed(1);
    const y0 = G.Y(0);
    fgLine.setAttribute("d", p);
    fgFill.setAttribute("d", `${p}L${G.X(D).toFixed(1)} ${y0}L${G.X(-D).toFixed(1)} ${y0}Z`);
    const m = a.mean * (1 - f) + b.mean * f;
    fgFill.style.color = scale.css(m, 0.1); fgFill.setAttribute("fill", scale.css(m, 0.1));
    const mx = G.X(m); fgMean.setAttribute("d", `M${mx.toFixed(1)} ${y0 + 1}l-6 10h12z`);
    fgLab.textContent = `mean ${signed(m, 2)}`; fgLab.setAttribute("x", clamp(mx, G.ML + 44, G.ML + G.pw - 44)); fgLab.setAttribute("y", y0 + 32);
    outlines.forEach((o, k) => o.setAttribute("visibility", k + 1 < Math.round(t) ? "visible" : "hidden"));   // periods already passed stay as faint outlines
    ctl.sync();
  }

  function onState() {
    ctl.sync();
    const s = stats[tl.index], shift = s.mean - first.mean;
    summary.textContent = `Distribution of ${data.measure.toLowerCase()} anomalies over ${data.region_name}, by ${size}-year period, ${years[0]}–${years[years.length - 1]}; pooled cell-year anomalies, unweighted. ${tl.index === 0 ? `${periodText(s)} is the reference period: mean ${signed(s.mean, 2)} ${U}, spread (standard deviation) ${plain(s.sd, 2)} ${U}.` : `${periodText(s)}: mean ${signed(s.mean, 2)} ${U}, ${signed(shift, 2)} ${U} from ${first.label}; spread ${plain(s.sd, 2)} ${U} against ${plain(first.sd, 2)} ${U}; 10th to 90th percentile ${signed(s.p10, 2)} to ${signed(s.p90, 2)} ${U}.`}`;
    cur = tl.index; sayLine();
    options.onYear && options.onYear(cur);
  }

  draw(); onState(); stageKeys(stage, tl);
  const offSize = sizeObserver(stage, () => { if (!destroyed && Math.abs(clamp(Math.round(stage.clientWidth || 640), 300, 1100) - S) > 1) draw(); });
  const offTheme = onTheme(() => { scale = makeScale(data); draw(); });
  // Animate once, automatically, the first time the chart scrolls into view; it settles on the last period against the reference outline.
  // Reduced motion (or no IntersectionObserver) shows that final state at once. The slider and arrow keys stay available.
  const finalI = nG - 1; let io = null;
  if (!reducedMotion() && "IntersectionObserver" in window && options.animate !== false) {
    tl.seek(0);
    io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); io = null; if (!destroyed && tl.index === 0 && !tl.playing) tl.play(); } }, { threshold: 0.5 });
    io.observe(stage);
  } else tl.seek(finalI);
  return { el: root, play: () => tl.play(), pause: () => tl.pause(), seek: (i) => tl.seek(i), timeline: tl, destroy() { destroyed = true; if (io) io.disconnect(); tl.destroy(); offSize(); offTheme(); root.remove(); } };
}
