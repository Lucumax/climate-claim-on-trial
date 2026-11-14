// Climate spiral of a case region (idea: Ed Hawkins' climate spirals; this version is animated, colour-coded by difference from baseline
// and drawn in the app's type). One loop per year, one point per month, distance from the centre = difference from the baseline ring.
// Question it answers: HOW did each season change over time?
// Seasonal cases (for example June to September) loop through their own months only: the clock has one spoke per month in the record.
// render(container, data, options) -> {destroy, play, pause, seek, el, timeline}. Options: year (start index), onYear(i).
// No year is ever called a record: the graphic only shows each month against its own baseline.
import { el, sv, tok, onTheme, makeScale, legend, timeline, controls, sizeObserver, clamp, signed, plain, unitText, dataTable, nextId, reducedMotion } from "./common.js";

const NICE = [0.1, 0.2, 0.25, 0.4, 0.5, 0.8, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20];
const trim = (v) => String(parseFloat(v.toFixed(2)));
const sgn = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + trim(Math.abs(v));

export async function render(container, data, options = {}) {
  const M = data.monthly, nY = M.years.length, nM = M.months.length, N = nY * nM, U = unitText(data);
  // flat list of points in time order
  const vals = []; for (let y = 0; y < nY; y++) for (let j = 0; j < nM; j++) vals.push(M.anomaly[y][j]);
  const abs = vals.filter((v) => v != null).map(Math.abs).sort((a, b) => a - b);
  const maxAbs = abs.length ? abs[abs.length - 1] : 1;
  const RM = NICE.find((v) => v >= maxAbs) || Math.ceil(maxAbs);            // outer range, printed on the rings and legend
  const step = RM / 2;
  const dataM = { ...data, scale: { max: RM } };
  let scale = makeScale(dataM);
  const mean = (y) => { const a = M.anomaly[y].filter((v) => v != null); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; };
  const CAP = `Monthly difference from baseline in ${U}. Each month is compared with the same month's ${data.baseline.years[0]}–${data.baseline.years[1]} average. Beyond ±${RM} ${U}: none.`;
  let destroyed = false, S = 0, geom = null, drawn = -1, head = null, curT = options.year != null ? options.year : nY - 1;

  const summaryId = nextId("viz-sum");
  const svg = sv("svg", { role: "img", "aria-labelledby": summaryId, focusable: "false", style: "display:block;margin:0 auto;max-width:100%" });
  const stage = el("div", { class: "viz-stage", tabindex: "0", role: "group", "aria-label": `Climate spiral of ${data.region_name}. Arrow keys change the year, space plays or pauses.` }, svg);
  const readout = el("p", { class: "viz-readout viz-num" }, "Point at the spiral or tap a line to read a month.");
  const summary = el("p", { class: "viz-summary", id: summaryId, "aria-live": "polite" });
  const tl = timeline({ n: nY, stepMs: reducedMotion() ? 700 : 520, ease: false, start: curT, onFrame: (tv) => { curT = tv; update(); }, onState, onIndex: () => ctl.sync() });
  const ctl = controls(tl, { n: nY, labelFn: (i) => String(M.years[i]), name: "year" });
  const rows = M.years.map((y, i) => [String(y)].concat(M.anomaly[i].map((v) => (v == null ? "n/a" : signed(v, 2)))));
  const details = el("details", { class: "viz-details" }, el("summary", {}, "Monthly values (table)"), dataTable(["Year"].concat(M.labels.map((l) => l + " (" + U + ")")), rows, `Monthly regional difference from baseline in ${U}`));
  const note = el("p", { class: "viz-note" }, `Each month is compared with the same month's average over ${data.baseline.years[0]}–${data.baseline.years[1]} (the baseline ring, 0). Regional, area-weighted. ${nM < 12 ? "Only the months of this case's season are in the record, so the clock shows those months." : ""} ${data.product_label}.`);
  const root = el("figure", { class: "viz viz-spiral" }, stage, ctl.node, legend(dataM, scale, { caption: CAP }), readout, summary, details, note);
  container.append(root);

  // ---------------------------------------------------------------- geometry
  function build() {
    S = clamp(Math.round(stage.clientWidth || 560), 280, 640);
    const cx = S / 2, cy = S / 2, labelR = S < 420 ? 30 : 34, R = S / 2 - labelR - 8, r0 = R * 0.58, k = (R - r0) / RM, kIn = (r0 - R * 0.16) / RM;
    const rOf = (v) => r0 + (v >= 0 ? v * k : v * kIn);
    const ang = (idx) => -Math.PI / 2 + (2 * Math.PI * (idx % nM)) / nM;
    const pts = [];
    for (let i = 0; i < N; i++) { const v = vals[i], a = ang(i), r = rOf(v == null ? 0 : v); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), v, yi: Math.floor(i / nM), j: i % nM }); }
    return (geom = { cx, cy, R, r0, k, kIn, rOf, ang, pts, labelR });
  }
  const bez = (p0, p1, p2, p3, t = 0.5) => {            // Catmull-Rom to cubic bezier
    const c1x = p1.x + ((p2.x - p0.x) / 6) * t * 2, c1y = p1.y + ((p2.y - p0.y) / 6) * t * 2, c2x = p2.x - ((p3.x - p1.x) / 6) * t * 2, c2y = p2.y - ((p3.y - p1.y) / 6) * t * 2;
    return `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)}C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  };
  let segEls = [];
  function draw() {
    const g = build(), { cx, cy, R, r0, pts } = g;
    svg.replaceChildren(); svg.setAttribute("width", S); svg.setAttribute("height", S); svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
    const ink = tok("ink", "#192D40"), muted = tok("muted", "#56616A"), grid = tok("viz-grid", "#B8B3A4"), surface = tok("surface", "#FFFDF7"), ringC = tok("viz-ring", "#192D40");
    // rings
    const rings = [];
    for (let v = step; v <= RM + 1e-9; v += step) rings.push(v, -v);
    for (const v of rings) svg.append(sv("circle", { cx, cy, r: g.rOf(v), fill: "none", stroke: grid, "stroke-width": 1, "stroke-dasharray": v < 0 ? "2 4" : "none", opacity: v < 0 ? 0.8 : 0.9 }));
    svg.append(sv("circle", { cx, cy, r: r0, fill: "none", stroke: ringC, "stroke-width": 1.5, opacity: 0.7 }));
    // spokes and month labels
    for (let j = 0; j < nM; j++) {
      const a = g.ang(j), c = Math.cos(a), s = Math.sin(a);
      svg.append(sv("line", { x1: cx + R * 0.14 * c, y1: cy + R * 0.14 * s, x2: cx + R * c, y2: cy + R * s, stroke: grid, "stroke-width": 1, opacity: 0.55 }));
      const lx = cx + (R + 14) * c, ly = cy + (R + 14) * s + 4;
      svg.append(sv("text", { x: lx, y: ly, "text-anchor": Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end", "font-size": 13, class: "t-muted num" }, M.labels[j]));
    }
    // ring labels along the 12 o'clock spoke (with a halo so lines passing behind stay readable)
    const halo = { "paint-order": "stroke", stroke: surface, "stroke-width": 4, "stroke-linejoin": "round" };
    const lab = (v, txt, strong) => svg.append(sv("text", { x: cx + 4, y: v >= RM - 1e-9 ? cy - g.rOf(v) + 14 : cy - g.rOf(v) - 3, "font-size": 12, class: (strong ? "" : "t-muted ") + "num", ...halo }, txt));
    lab(0, `0 baseline`, true);
    for (const v of rings) if (Math.abs(v) <= RM + 1e-9 && (S >= 420 || v === RM)) lab(v, `${sgn(v)} ${U}`, false);
    // segments
    const segG = sv("g", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" });
    segEls = [];
    for (let i = 0; i < N - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a.v == null || b.v == null) { segEls.push(null); continue; }
      const p0 = pts[Math.max(0, i - 1)], p3 = pts[Math.min(N - 1, i + 2)];
      const e = sv("path", { d: bez(p0, a, b, p3), stroke: scale.css((a.v + b.v) / 2, 0.22), "stroke-width": 1.4, pathLength: 1, visibility: "hidden" });
      segG.append(e); segEls.push(e);
    }
    svg.append(segG);
    head = sv("circle", { r: 5, fill: ink, stroke: surface, "stroke-width": 2, visibility: "hidden" });
    svg.append(head);
    // centre label
    svg.append(sv("text", { id: "sp-year", x: cx, y: cy + (S < 420 ? 4 : 6), "text-anchor": "middle", "font-size": S < 420 ? 30 : 40, class: "t-serif num", ...halo }, ""),
      sv("text", { id: "sp-val", x: cx, y: cy + (S < 420 ? 24 : 30), "text-anchor": "middle", "font-size": S < 420 ? 11 : 13, class: "t-muted num", ...halo }, ""));
    drawn = -1; update(true);
    void muted; void ink; void halo;
  }

  // ---------------------------------------------------------------- animation state
  function update(force) {
    if (!geom || destroyed) return;
    const t = curT, pos = t * nM + (nM - 1);                  // progress in points
    const full = Math.floor(pos), frac = pos - full, headYear = Math.round(t);
    for (let i = 0; i < segEls.length; i++) {
      const e = segEls[i]; if (!e) continue;
      let vis = i < full ? "visible" : "hidden", dash = null;
      if (i === full && frac > 0.001) { vis = "visible"; dash = `${frac.toFixed(3)} 1`; }
      if (vis === "visible") {
        const age = headYear - Math.floor(i / nM), cur = Math.floor(i / nM) === headYear;
        e.setAttribute("stroke-opacity", cur ? 1 : Math.max(0.18, 0.7 - Math.max(0, age) * 0.04).toFixed(2));
        e.setAttribute("stroke-width", cur ? 2.6 : 1.1);
      }
      e.setAttribute("visibility", vis);
      if (dash) e.setAttribute("stroke-dasharray", dash); else e.removeAttribute("stroke-dasharray");
    }
    // head dot at the interpolated end of the drawn line
    const i0 = clamp(full, 0, N - 1), i1 = clamp(full + 1, 0, N - 1), a = geom.pts[i0], b = geom.pts[i1], f = i0 === i1 ? 0 : frac;
    head.setAttribute("cx", (a.x + (b.x - a.x) * f).toFixed(1)); head.setAttribute("cy", (a.y + (b.y - a.y) * f).toFixed(1));
    const hv = a.v != null && b.v != null ? a.v + (b.v - a.v) * f : a.v; head.setAttribute("fill", hv == null ? tok("ink") : scale.css(hv, 0.22)); head.setAttribute("visibility", "visible");
    const yearTxt = svg.querySelector("#sp-year"), valTxt = svg.querySelector("#sp-val");
    const yi = clamp(headYear, 0, nY - 1); const m = mean(yi);
    yearTxt.textContent = String(M.years[yi]); valTxt.textContent = m == null ? "" : `average ${signed(m, 2)} ${U}`;
    if (force) void 0;
  }

  // ---------------------------------------------------------------- reading a point
  function readAt(cx, cy) {
    if (!geom) return; const r = svg.getBoundingClientRect(), x = (cx - r.left) * (S / r.width), y = (cy - r.top) * (S / r.height);
    const visibleTo = Math.floor(curT * nM + (nM - 1)); let best = -1, bd = 22 * 22;
    for (let i = 0; i <= Math.min(visibleTo, N - 1); i++) { const p = geom.pts[i]; if (p.v == null) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; } }
    if (best >= 0) { const p = geom.pts[best]; readout.textContent = `${M.labels[p.j]} ${M.years[p.yi]}: ${signed(p.v, 2)} ${U} from this month's baseline.`; }
  }
  svg.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") readAt(e.clientX, e.clientY); });
  svg.addEventListener("pointerdown", (e) => readAt(e.clientX, e.clientY));
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); tl.seek(tl.index + 1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); tl.seek(tl.index - 1); }
    else if (e.key === " " || e.key === "Enter") { e.preventDefault(); tl.toggle(); }
    else if (e.key === "Home") { e.preventDefault(); tl.seek(0); } else if (e.key === "End") { e.preventDefault(); tl.seek(1e9); }
  });

  function onState() {
    ctl.sync();
    const yi = tl.index, m = mean(yi), first = mean(0);
    summary.textContent = `Climate spiral for ${data.measure.toLowerCase()} over ${data.region_name}, ${M.years[0]}–${M.years[nY - 1]}, ${nM === 12 ? "all twelve months" : data.season_text}. Distance from the centre shows each month's difference from its own ${data.baseline.years[0]}–${data.baseline.years[1]} average; the thick ring is zero. ${M.years[yi]}: average ${m == null ? "n/a" : signed(m, 2) + " " + U}${yi > 0 && m != null && first != null ? ` (${M.years[0]}: ${signed(first, 2)} ${U})` : ""}. Range on the rings: ±${RM} ${U}.`;
    options.onYear && options.onYear(yi);
  }

  draw(); onState();
  const offSize = sizeObserver(stage, () => { if (!destroyed && Math.abs(clamp(Math.round(stage.clientWidth || 560), 280, 640) - S) > 1) draw(); });
  const offTheme = onTheme(() => { scale = makeScale(dataM); const lg = root.querySelector(".viz-legend"); if (lg) lg.replaceWith(legend(dataM, scale, { caption: CAP })); draw(); });
  if (options.autoplay && !reducedMotion()) tl.play();
  void plain;
  return { el: root, play: () => tl.play(), pause: () => tl.pause(), seek: (i) => tl.seek(i), timeline: tl, destroy() { destroyed = true; tl.destroy(); offSize(); offTheme(); root.remove(); } };
}
