// Witness check for C-A ("Cross-examine the witness"): when did the satellite look, and what did that do to its readings?
// Two panels from data/witness/C-A.json: (a) local solar time of the MODIS Terra daytime overpass by year;
// (b) daytime land surface temperature against two independent NASA POWER (MERRA-2) records, with the gap between the satellite and the skin temperature.
// Exploratory check, not the registered test: nothing here replaces the case's ruling. Hand SVG, no dependencies.
// render(container, data) -> {destroy, el}
import { el, sv, tok, onTheme, sizeObserver, clamp, signed, plain, dataTable, nextId } from "./common.js";

const SOURCE = "https://science.nasa.gov/science-research/earth-science/terra-the-end-of-an-era/";
const hm = (h) => { const m = Math.round(h * 60); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`; };
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

export async function render(container, data) {
  const Y = data.years, n = Y.length, S = data.series, sm = data.summary, ad = sm.view_time_adjusted_lst;
  const T = S.view_time_local_solar_h, LST = S.lst_day_degC, TS = S.power_ts_degC, T2 = S.power_t2m_degC, GAP = S.lst_minus_ts_degC;
  const pre = data.years.map((y, i) => i).filter((i) => Y[i] <= 2019), gapPre = mean(pre.map((i) => GAP[i]));
  let yi = n - 1, destroyed = false, W = 0;

  const summaryId = nextId("viz-sum");
  const svgA = sv("svg", { role: "img", "aria-labelledby": summaryId, focusable: "false", style: "display:block;max-width:100%" });
  const svgB = sv("svg", { role: "img", "aria-labelledby": summaryId, focusable: "false", style: "display:block;max-width:100%" });
  const svgC = sv("svg", { role: "img", "aria-labelledby": summaryId, focusable: "false", style: "display:block;max-width:100%" });
  const readout = el("p", { class: "viz-readout viz-num", "aria-live": "polite" });
  const wrap = el("div", { class: "viz-wit", tabindex: "0", role: "group", "aria-describedby": summaryId, "aria-label": "Witness check charts. Left and right arrow keys move between years." },
    el("div", {}, el("h3", {}, "(a) When Terra looked"), el("p", {}, "Local solar time of the daytime overpass, summer average, by year"), svgA),
    el("div", {}, el("h3", {}, "(b) What it read, against two independent records"), el("p", {}, "Daytime land surface temperature, summer average, with NASA POWER skin and air temperature"), svgB,
      el("h3", { style: "margin-top:16px" }, "The gap: satellite minus POWER skin temperature"), svgC));
  const link = el("a", { href: SOURCE, target: "_blank", rel: "noopener" }, "NASA Science, “Terra: The End of An Era”, 2025");
  const lstGap = sm.sen_per_decade.lst_minus_ts, p = lstGap.mann_kendall_p;
  const text = el("div", { class: "viz-wit__text" },
    el("p", {}, "NASA stopped adjusting Terra's orbit in 2020 and it now passes earlier in the morning (", link, "). Its daytime readings cooled relative to independent records by about ", plain(Math.abs(lstGap.per_decade), 2), " °C per decade (p = ", p < 0.01 ? p.toFixed(3) : p.toFixed(2), "), in step with the overpass time. After allowing for the drift, the record shows no clear trend either way (two adjustment methods disagree on sign)."),
    el("p", { class: "viz-note" }, `The two adjustments give ${signed(ad.ols_with_view_time.slope_year_per_decade, 2)} °C per decade (regression on overpass time, 95% range ${signed(ad.ols_with_view_time.slope_ci95_per_decade[0], 2)} to ${signed(ad.ols_with_view_time.slope_ci95_per_decade[1], 2)}) and ${signed(ad.alternative_correction.sen.per_decade, 2)} (correction from the gap, 95% range ${signed(ad.alternative_correction.sen.ci95_low, 2)} to ${signed(ad.alternative_correction.sen.ci95_high, 2)}); both ranges include zero. The overpass time and the year move together, so this shows size and direction, not an exact correction.`),
    el("p", { class: "viz-note" }, "POWER skin (TS) and air (T2M) temperatures are MERRA-2 model output, not observations. MODIS sees clear skies only, so a steady offset from POWER is expected; a changing one is what panel (b) looks at. Exploratory check, not the registered test: the registered result and the withheld ruling above stay as they are."));
  const rows = Y.map((y, i) => [String(y), hm(T[i]), LST[i].toFixed(2), TS[i].toFixed(2), T2[i].toFixed(2), GAP[i].toFixed(2)]);
  const details = el("details", { class: "viz-details" }, el("summary", {}, "Values by year (table)"),
    dataTable(["Year", "Overpass, local solar time", "Satellite day LST (°C)", "POWER skin TS (°C)", "POWER air T2M (°C)", "Satellite minus skin (°C)"], rows, "Terra overpass time and temperatures by year, summer average"));
  const summary = el("p", { class: "viz-summary sr-only", id: summaryId, "aria-live": "off" }, `Terra's daytime overpass was near ${hm(mean(pre.map((i) => T[i])))} local solar time from ${Y[0]} to 2019 and fell to ${hm(T[n - 1])} by ${Y[n - 1]}. The satellite minus skin temperature gap fell from ${gapPre.toFixed(2)} °C (${Y[0]}–2019 average) to ${GAP[n - 1].toFixed(2)} °C in ${Y[n - 1]}.`);
  const root = el("figure", { class: "viz viz-witness" }, el("p", { class: "viz-note", style: "margin:0 0 12px" }, el("span", { class: "chip" }, "Exploratory check, not the registered test")), wrap, readout, text, summary, details);
  container.append(root);

  // ---------------------------------------------------------------- charts
  function chart(svg, { w, h, yDom, yTicks, yFmt, xLabels = true, series, extras, ml = 54, mr = 22, mt = 14, mb = xLabels ? 28 : 10 }) {
    const pw = w - ml - mr, ph = h - mt - mb, X = (y) => ml + ((y - Y[0]) / (Y[n - 1] - Y[0])) * pw, V = (v) => mt + ph - ((v - yDom[0]) / (yDom[1] - yDom[0])) * ph;
    svg.replaceChildren(); svg.setAttribute("width", w); svg.setAttribute("height", h); svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const grid = tok("viz-grid", "#B8B3A4"), ink = tok("ink", "#192D40"), surface = tok("surface", "#FFFDF7"), halo = { "paint-order": "stroke", stroke: surface, "stroke-width": 4, "stroke-linejoin": "round" };
    for (const t of yTicks) { svg.append(sv("line", { x1: ml, x2: ml + pw, y1: V(t), y2: V(t), stroke: grid, opacity: 0.45 }), sv("text", { x: ml - 8, y: V(t) + 5, "text-anchor": "end", "font-size": 14, class: "t-muted num" }, yFmt(t))); }
    if (xLabels) for (const y of [2005, 2010, 2015, 2020, 2025]) svg.append(sv("text", { x: X(y), y: h - 6, "text-anchor": "middle", "font-size": 14, class: "t-muted num" }, String(y)));
    svg.append(sv("line", { x1: X(2020), x2: X(2020), y1: mt, y2: mt + ph, stroke: ink, "stroke-width": 1.2, "stroke-dasharray": "2 4", opacity: 0.7 }));
    for (const s of series) {
      svg.append(sv("path", { d: "M" + s.v.map((v, i) => X(Y[i]).toFixed(1) + " " + V(v).toFixed(1)).join("L"), fill: "none", stroke: s.color, "stroke-width": s.w || 2.2, "stroke-dasharray": s.dash || "none", "stroke-linejoin": "round", "stroke-linecap": "round" }));
      if (s.dots) for (let i = 0; i < n; i++) svg.append(sv("circle", { cx: X(Y[i]), cy: V(s.v[i]), r: 3, fill: s.color }));
    }
    if (extras) extras({ X, V, ink, surface, halo, ml, pw, mt, ph });
    const cur = sv("g", { class: "cur" }); svg.append(cur);
    svg._draw = (i) => { cur.replaceChildren(sv("line", { x1: X(Y[i]), x2: X(Y[i]), y1: mt, y2: mt + ph, stroke: ink, "stroke-width": 1.5, opacity: 0.55 }), ...series.map((s) => sv("circle", { cx: X(Y[i]), cy: V(s.v[i]), r: 5, fill: s.color, stroke: surface, "stroke-width": 2 }))); };
    svg._x = (clientX) => { const r = svg.getBoundingClientRect(), x = (clientX - r.left) * (w / r.width); return clamp(Math.round(Y[0] + ((x - ml) / pw) * (Y[n - 1] - Y[0])) - Y[0], 0, n - 1); };
  }
  function draw() {
    W = clamp(Math.round(el_(svgA.parentNode).clientWidth || 420), 260, 720);
    const warm = tok("viz-warm-3", "#B9601F"), cool = tok("viz-cool-3", "#3F7FB0"), ghost = tok("viz-ghost", "#7C878D"), ink = tok("ink", "#192D40");
    const lab = (o, x, y, txt, anchor = "start", color) => o.surface && sv("text", { x, y, "text-anchor": anchor, "font-size": 14, class: "num", fill: color, ...o.halo }, txt);
    chart(svgA, { w: W, h: 320, yDom: [9.5, 11.25], yTicks: [9.5, 10, 10.5, 11], yFmt: hm, series: [{ v: T, color: ink, dots: true, w: 2.4 }],
      extras: (o) => { svgA.append(sv("text", { x: o.X(2020) - 6, y: o.mt + 14, "text-anchor": "end", "font-size": 14, class: "t-muted", ...o.halo }, "2020: orbit"), sv("text", { x: o.X(2020) - 6, y: o.mt + 30, "text-anchor": "end", "font-size": 14, class: "t-muted", ...o.halo }, "adjustments stop"), lab(o, o.X(Y[n - 1]) - 4, o.V(T[n - 1]) + 24, hm(T[n - 1]) + " in " + Y[n - 1], "end"), lab(o, o.X(2002), o.V(T[0]) - 12, "about " + hm(mean(pre.map((i) => T[i]))) + " until 2019")); } });
    chart(svgB, { w: W, h: 250, yDom: [23, 32], yTicks: [24, 26, 28, 30], yFmt: (v) => v + "°", xLabels: false,
      series: [{ v: LST, color: warm, w: 2.6 }, { v: TS, color: cool, w: 2 }, { v: T2, color: ghost, w: 2, dash: "6 4" }],
      extras: (o) => { svgB.append(lab(o, o.X(2001.2), o.V(31.5), "Satellite, daytime surface temperature", "start", ink), lab(o, o.X(2001.2), o.V(23.6), "POWER skin (TS), solid blue", "start", ink), lab(o, o.X(2013), o.V(23.6), "POWER air (T2M), dashed", "start", ink)); } });
    chart(svgC, { w: W, h: 170, yDom: [0, 3.6], yTicks: [0, 1, 2, 3], yFmt: (v) => v + "°", series: [{ v: GAP, color: ink, w: 2.4, dots: true }],
      extras: (o) => { svgC.append(sv("line", { x1: o.ml, x2: o.ml + o.pw, y1: o.V(gapPre), y2: o.V(gapPre), stroke: ink, "stroke-dasharray": "6 4", opacity: 0.6 }), lab(o, o.X(2001.2), o.V(0.45), `dashed line: ${Y[0]}–2019 average, ${gapPre.toFixed(1)}°`), lab(o, o.X(Y[n - 1]) - 4, o.V(GAP[n - 1]) - 12, GAP[n - 1].toFixed(1) + "° in " + Y[n - 1], "end")); } });
    mark(yi);
  }
  const el_ = (x) => x;
  function mark(i) {
    yi = clamp(i, 0, n - 1);
    for (const s of [svgA, svgB, svgC]) s._draw && s._draw(yi);
    readout.textContent = `${Y[yi]}: Terra looked at ${hm(T[yi])} local solar time. Satellite ${LST[yi].toFixed(1)} °C, POWER skin ${TS[yi].toFixed(1)} °C, POWER air ${T2[yi].toFixed(1)} °C; satellite minus skin ${GAP[yi].toFixed(2)} °C.`;
  }
  for (const s of [svgA, svgB, svgC]) { s.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") mark(s._x(e.clientX)); }); s.addEventListener("pointerdown", (e) => mark(s._x(e.clientX))); }
  wrap.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); mark(yi + 1); } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); mark(yi - 1); } else if (e.key === "Home") { e.preventDefault(); mark(0); } else if (e.key === "End") { e.preventDefault(); mark(n - 1); } });
  draw();
  const offSize = sizeObserver(wrap, () => { if (destroyed) return; const w = clamp(Math.round(svgA.parentNode.clientWidth || 420), 260, 720); if (Math.abs(w - W) > 1) draw(); });
  const offTheme = onTheme(() => draw());
  return { el: root, destroy() { destroyed = true; offSize(); offTheme(); root.remove(); } };
}
