// "Second witness" panel for the dockets C-A, C-B and C-C: the case series and a second, differently made record on one axis.
// Exploratory check: it does not change any ruling. Every number is read from the witness JSON (data/witness/C-A_esa.json, C-B_knmi.json, C-C_knmi.json); none is typed here.
// Not a new kind of chart: one line chart in the same hand-SVG style as the Witness check.
// render(container, data) -> {destroy, el}
import { el, sv, tok, onTheme, sizeObserver, clamp, signed, plain, dataTable, nextId } from "./common.js";

const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const fp = (p) => (p == null ? "n/a" : p < 0.001 ? "< 0.001" : String(+p.toPrecision(2)));
const r2 = (r) => (Math.round(r * 100) / 100).toFixed(2);
const unitWord = (u) => (u === "degC" ? "°C" : u);

// One shape for the three cases, built from the file (so the chart and the words cannot drift apart).
function adapt(d, extra) {
  const id = d.claim_id;
  if (id === "C-A") {
    const out = adaptA(d, extra);
    return out;
  }
  return adaptKnmi(d);
}
// Third series on the C-A overlay: CRU TS 4.10 station-based daily maximum air temperature (2 m), a different quantity from land surface (skin) temperature.
function addStation(A, d, extra) {
  const st = extra.stats, u = A.u, ix = d.years.map((y) => extra.years.indexOf(y));
  if (ix.some((i) => i < 0)) return;
  const k = st.knmi_tmx_2001_2024, esa = st.esa_2001_2024, mod = st.modis_same_footprint_2001_2024, gap = st.difference_knmi_minus_modis_same_footprint;
  const res = (extra.divergence_from_2021 || {}).residual_modis_on_knmi, ry = res ? Object.keys(res.residuals_later_years).map(Number).sort((a, b) => a - b) : [];
  const sigWord = [k.p_hamed_rao_registered, esa.p_hamed_rao_registered].every((p) => p > 0.05) ? "neither is significant" : "see the p-values";
  A.thirdS = { label: "CRU TS station air temperature (2 m daily maximum)", short: "CRU air", v: ix.map((i) => extra.series.knmi_cru_tmx_jja_anomaly_degC[i]), slope: k.sen_per_decade, p: k.p_hamed_rao_registered };
  A.r3 = { modis: st.agreement_knmi_vs_modis_same_footprint.pearson_r, esa: st.agreement_knmi_vs_esa.pearson_r };
  A.words.push(
    `Station air temperature and the ESA record both lean up (${signed(k.sen_per_decade, 2)} and ${signed(esa.sen_per_decade, 2)} ${u} per decade; ${sigWord}) while MODIS Terra leans down (${signed(mod.sen_per_decade, 2)}). The gap between MODIS and the air temperature grows through the record (station minus MODIS: ${signed(gap.sen_per_decade, 2)} ${u} per decade)` +
    (ry.length ? `, and most of all in the early 2020s: the registered MODIS series sits colder than its ${res.fit_years[0]}\u2013${res.fit_years[1]} relation to air temperature predicts, by ${plain(Math.abs(res.residuals_later_years[ry[0]]), 2)} ${u} in ${ry[0]} and ${plain(Math.abs(res.residuals_later_years[ry[ry.length - 1]]), 2)} ${u} in ${ry[ry.length - 1]}. ` : ". ") +
    "The comparison records do not show the same cooling trend.");
  A.kind3 = "The third line is station-based 2 m air temperature (CRU TS 4.10 daily maximum, via KNMI Climate Explorer), not land surface skin temperature, so compare changes, not levels. Station records share no input with MODIS or ESA. It is a cross-check, not ground truth, and it does not show which satellite series is right.";
  A.links.push(["CRU TS station data on KNMI Climate Explorer", extra.witness.page_url]);
}
function adaptA(d, extra) {
  const id = d.claim_id;
  {
    const u = unitWord(d.units.temperature), t = d.trend, ag = d.agreement.esa_vs_modis, sc = d.sensor_changes;
    const terra = (sc.era_mean_difference.find((e) => /Terra MODIS/.test(e.era)) || {}).years || [];
    const lateKey = Object.keys(sc).find((k) => /^mean_diff_\d{4}_\d{4}$/.test(k) && k !== "mean_diff_2001_2020") || "mean_diff_2021_2024";
    const earlyKey = Object.keys(sc).find((k) => /^mean_diff_\d{4}_\d{4}$/.test(k) && k !== lateKey);
    const [late0, late1] = lateKey.match(/\d{4}/g).map(Number), [early0, early1] = (earlyKey || "").match(/\d{4}/g).map(Number);
    const first = d.years[0], last = d.years[d.years.length - 1];
    const A = {
      id, years: d.years, u, per: u + " per decade",
      caseS: { label: "MODIS Terra (the case series)", short: "MODIS Terra", v: d.series.modis_terra_jja_anomaly_degC, slope: t.modis_terra_same_footprint_2001_2024.sen_per_decade, p: t.modis_terra_same_footprint_2001_2024.p_hamed_rao_registered },
      witS: { label: "ESA multi-sensor record", short: "ESA", v: d.series.esa_jja_anomaly_degC, slope: t.esa.sen_per_decade, p: t.esa.p_hamed_rao_registered },
      r: ag.pearson_r, n: ag.n_years,
      band: terra.length === 2 ? { a: terra[0], b: terra[1], label: "ESA uses Terra MODIS" } : null,
      mark: { year: late0, label: `${late0}: Terra's overpass moves earlier` },
      kind: "A European multi-sensor satellite record (ESA Land Surface Temperature CCI), which itself uses Terra MODIS for " + (terra.length === 2 ? `${terra[0]}–${terra[1]}` : "part of the record") + ".",
      words: [
        `ESA's multi-sensor record tracks MODIS Terra year by year (r ${r2(ag.pearson_r)}) and agrees until ${early1}, then runs warmer from ${late0}, the years Terra's overpass time moved earlier. The mean difference (ESA minus MODIS) is ${signed(sc[earlyKey], 2)} ${u} for ${early0}–${early1} and ${signed(sc[lateKey], 2)} ${u} for ${late0}–${late1}.`,
        `Over ${first}–${last} ESA shows no cooling (${signed(t.esa.sen_per_decade, 2)} vs ${signed(t.modis_terra_same_footprint_2001_2024.sen_per_decade, 2)} ${u} per decade; neither is significant, p ${fp(t.esa.p_hamed_rao_registered)} and ${fp(t.modis_terra_same_footprint_2001_2024.p_hamed_rao_registered)}). The claim stays withheld. This does not show that the drift is the cause.`,
      ],
      caveat: `Because ESA's record is built from Terra MODIS in ${terra.length === 2 ? `${terra[0]}–${terra[1]}` : "part of the record"}, it is not a separate witness for those years. ESA also averages clear-sky observations only, and its sensors change over the record.`,
      links: [["ESA LST CCI data (DOI)", "https://doi.org/" + d.provenance.esa_doi], ["Product page (CEDA)", d.provenance.esa_product_page], ["Product user guide (PDF)", d.provenance.pug]],
      prov: `Data: ${d.witness.name}. Box ${d.case.box.lat_min}–${d.case.box.lat_max}°N, June–August, fixed footprint of ${d.footprint.cells_fixed_footprint.toLocaleString("en-US")} cells (0.25°), anomalies against each cell's own ${first}–${last} mean. Script: ${d.provenance.script}.`,
    };
    if (extra && extra.claim_id === "C-A") addStation(A, d, extra);
    return A;
  }
}
function adaptKnmi(d) {
  const id = d.claim_id;
  // C-B and C-C: station-based CRU TS 4.10 from KNMI Climate Explorer
  const ks = Object.keys(d.stats), wKey = ks.find((k) => /^knmi/.test(k) && !/difference/.test(k)), cKey = ks.find((k) => /^our_/.test(k)), dKey = ks.find((k) => /^difference/.test(k));
  const sk = Object.keys(d.series), wSeries = sk.find((k) => /^knmi.*anomaly/.test(k)), cSeries = sk.find((k) => /^our_.*anomaly/.test(k));
  const u = unitWord(Object.values(d.units)[0]), ws = d.stats[wKey], cs = d.stats[cKey], df = d.stats[dKey], ag = d.stats.agreement;
  const first = d.years[0], last = d.years[d.years.length - 1];
  const rain = id === "C-B", caseName = rain ? "IMERG satellite rainfall" : "MERRA-2 air temperature", pick = (s) => (s.mk_p_registered_method != null ? s.mk_p_registered_method : s.mk_p_independent_years);
  const dir = ws.sen_per_decade * cs.sen_per_decade > 0 ? "the same direction as" : "the opposite direction to";
  const slower = Math.abs(ws.sen_per_decade) < Math.abs(cs.sen_per_decade) ? "slightly slower" : "slightly faster";
  const sig = df && df.mk_p_independent_years < 0.05;
  return {
    id, years: d.years, u, per: u + " per decade",
    caseS: { label: `${caseName} (the case series)`, short: rain ? "IMERG" : "MERRA-2", v: d.series[cSeries], slope: cs.sen_per_decade, p: pick(cs) },
    witS: { label: "CRU TS station-based record", short: "CRU TS", v: d.series[wSeries], slope: ws.sen_per_decade, p: pick(ws) },
    r: ag.pearson_r, n: ag.n_years, band: null, mark: null,
    kind: `CRU TS 4.10, a ${rain ? "rain-gauge" : "weather-station"} record gridded at 0.5 degrees and served by KNMI Climate Explorer. It is a different kind of measurement from the ${rain ? "satellite" : "reanalysis model"}, but it is not ground truth.`,
    words: [
      `The station-based record shows ${signed(ws.sen_per_decade, 2)} ${u} per decade over ${first}–${last} (p ${fp(pick(ws))}), in ${dir} the case series' ${signed(cs.sen_per_decade, 2)} (p ${fp(pick(cs))}). The two series track each other year by year (r ${r2(ag.pearson_r)}).`,
      rain ? `It agrees on direction; its interval ${ws.sen_ci95_per_decade[0] < 0 ? "reaches below zero" : "stays above zero"}, so it does not settle the claim by itself. The ruling below is unchanged.`
        : `It also shows warming, ${slower} than the case series; the difference between the two slopes is ${sig ? "" : "not "}significant (p ${fp(df.mk_p_independent_years)}). The ruling below is unchanged.`,
    ],
    caveat: d.caveat,
    links: [["Data on KNMI Climate Explorer", d.witness.page_url], ["CRU TS 4.10 (Harris et al. 2020)", "https://doi.org/10.1038/s41597-020-0453-3"]],
    prov: `Data: ${d.witness.dataset}. ${d.witness.citation}. Accessed ${d.witness.accessed}. Saved copy in the repository: ${d.witness.saved_copy}.`,
  };
}

// opts.preview: the compact Home version: the overlay chart, readout, key, the first sentence and the qualification, and the table.
export async function render(container, data, opts = {}) {
  const preview = !!opts.preview;
  const A = adapt(data, opts.extra), Y = A.years, n = Y.length, C = A.caseS, Wt = A.witS, T3 = A.thirdS || null;
  const lo = Math.min(...C.v, ...Wt.v, ...(T3 ? T3.v : [])), hi = Math.max(...C.v, ...Wt.v, ...(T3 ? T3.v : [])), pad = (hi - lo) * 0.08 || 1;
  const nice = (span) => { const raw = span / 5, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p; };
  const step = nice(hi - lo + 2 * pad), y0 = Math.floor((lo - pad) / step) * step, y1 = Math.ceil((hi + pad) / step) * step;
  const ticks = []; for (let t = y0; t <= y1 + 1e-9; t += step) ticks.push(+t.toFixed(6));
  const dec = step < 0.1 ? 2 : step < 1 ? 1 : 0;
  let yi = n - 1, destroyed = false, W = 0;
  const sumId = nextId("viz-sum");
  const svg = sv("svg", { role: "img", "aria-labelledby": sumId, focusable: "false", style: "display:block;max-width:100%" });
  const readout = el("p", { class: "viz-readout viz-num", "aria-live": "polite" });
  const wrap = el("div", { class: "viz-w2", tabindex: "0", role: "group", "aria-describedby": sumId, "aria-label": "Second witness chart. Left and right arrow keys move between years." }, svg);
  const intercept = (s) => median(s.v.map((v, i) => v - (s.slope / 10) * Y[i]));
  const summary = el("p", { class: "viz-summary sr-only", id: sumId }, `Line chart, ${Y[0]} to ${Y[n - 1]}, difference from each record's own average in ${A.u}. ${C.label}: Sen slope ${signed(C.slope, 2)} ${A.per}. ${Wt.label}: Sen slope ${signed(Wt.slope, 2)} ${A.per}.${T3 ? ` ${T3.label}: Sen slope ${signed(T3.slope, 2)} ${A.per}.` : ""} ${C.short} and ${Wt.short} correlate at r ${r2(A.r)} over ${A.n} years. A table of every value follows the chart.`);

  const legend = el("ul", { class: "viz-w2-legend" },
    el("li", {}, el("span", { class: "w2-key w2-key-case", "aria-hidden": "true" }), `${C.label}: ${signed(C.slope, 2)} ${A.per} (p ${fp(C.p)})`),
    el("li", {}, el("span", { class: "w2-key w2-key-wit", "aria-hidden": "true" }), `${Wt.label}: ${signed(Wt.slope, 2)} ${A.per} (p ${fp(Wt.p)})`),
    T3 ? el("li", {}, el("span", { class: "w2-key w2-key-t3", "aria-hidden": "true" }), `${T3.label}: ${signed(T3.slope, 2)} ${A.per} (p ${fp(T3.p)})`) : null,
    el("li", {}, `Correlation between ${C.short} and ${Wt.short}: r ${r2(A.r)} (${A.n} years)` + (T3 ? `. Station air temperature with ${C.short}: r ${r2(A.r3.modis)}; with ${Wt.short}: r ${r2(A.r3.esa)}.` : "")));
  const words = el("div", { class: "viz-w2-text" }, ...(preview ? A.words.slice(0, 1) : A.words).map((t) => el("p", {}, t)),
    el("p", { class: "viz-note" }, "What the second record is. ", A.kind, " ", A.caveat, T3 ? " " + A.kind3 : ""),
    preview ? null : el("p", { class: "viz-note" }, "Dashed lines are each record's Sen trend. Each series is shown as the difference from its own average over the same years, so only the changes are compared, not the levels."));
  const links = el("p", { class: "viz-note" }, A.prov, " Links: ", ...A.links.flatMap(([t, u], i) => [i ? " · " : "", el("a", { href: u, target: "_blank", rel: "noopener" }, t)]));
  const rows = Y.map((y, i) => [String(y), plain(C.v[i], 2), plain(Wt.v[i], 2), plain(Wt.v[i] - C.v[i], 2), ...(T3 ? [plain(T3.v[i], 2)] : [])]);
  const details = el("details", { class: "viz-details" }, el("summary", {}, "Values by year (table)"),
    dataTable(["Year", `${C.short} (${A.u})`, `${Wt.short} (${A.u})`, `${Wt.short} minus ${C.short} (${A.u})`, ...(T3 ? [`${T3.short} (${A.u}, 2 m air)`] : [])], rows, `${C.label}, ${Wt.label}${T3 ? " and " + T3.label : ""}, difference from each record's own average, by year`));
  const root = el("figure", { class: "viz viz-witness2" }, el("p", { class: "viz-note", style: "margin:0 0 12px" }, el("span", { class: "chip" }, "Exploratory check, not the registered test"), " It does not change any ruling."),
    wrap, readout, legend, words, preview ? null : links, summary, details);
  container.append(root);

  function draw() {
    W = clamp(Math.round(wrap.clientWidth || 640), 260, 900);
    const h = W < 420 ? 280 : 340, ml = 52, mr = 16, mt = 16, mb = 30, pw = W - ml - mr, ph = h - mt - mb;
    const X = (y) => ml + ((y - Y[0]) / (Y[n - 1] - Y[0])) * pw, V = (v) => mt + ph - ((v - y0) / (y1 - y0)) * ph;
    const grid = tok("viz-grid", "#B8B3A4"), ink = tok("ink", "#192D40"), surface = tok("surface", "#FFFDF7"), warm = tok("viz-warm-3", "#B9601F"), band = tok("viz-ghost", "#7C878D");
    const halo = { "paint-order": "stroke", stroke: surface, "stroke-width": 4, "stroke-linejoin": "round" };
    svg.replaceChildren(); svg.setAttribute("width", W); svg.setAttribute("height", h); svg.setAttribute("viewBox", `0 0 ${W} ${h}`);
    if (A.band) svg.append(sv("rect", { x: X(A.band.a), y: mt, width: X(A.band.b) - X(A.band.a), height: ph, fill: band, opacity: 0.16 }), sv("text", { x: X(A.band.a) + 4, y: mt + 14, "font-size": 13, class: "t-muted", ...halo }, A.band.label));
    for (const t of ticks) svg.append(sv("line", { x1: ml, x2: ml + pw, y1: V(t), y2: V(t), stroke: grid, opacity: t === 0 ? 0.9 : 0.4, "stroke-dasharray": t === 0 ? "none" : "2 3" }), sv("text", { x: ml - 8, y: V(t) + 5, "text-anchor": "end", "font-size": 14, class: "t-muted num" }, plain(t, dec)));
    const xt = (Y[n - 1] - Y[0]) > 30 ? 10 : 5; for (let y = Math.ceil(Y[0] / xt) * xt; y <= Y[n - 1]; y += xt) svg.append(sv("text", { x: X(y), y: h - 8, "text-anchor": "middle", "font-size": 14, class: "t-muted num" }, String(y)));
    if (A.mark) svg.append(sv("line", { x1: X(A.mark.year), x2: X(A.mark.year), y1: mt, y2: mt + ph, stroke: ink, "stroke-width": 1.2, "stroke-dasharray": "2 4", opacity: 0.7 }), sv("text", { x: X(A.mark.year) - 6, y: mt + (A.band ? 30 : 14), "text-anchor": "end", "font-size": 13, class: "t-muted", ...halo }, A.mark.label));
    const line = (s, color, wd, shape) => {
      svg.append(sv("path", { d: "M" + s.v.map((v, i) => X(Y[i]).toFixed(1) + " " + V(v).toFixed(1)).join("L"), fill: "none", stroke: color, "stroke-width": wd, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      for (let i = 0; i < n; i++) svg.append(shape === "dia" ? sv("polygon", { points: `${X(Y[i])},${V(s.v[i]) - 4.5} ${X(Y[i]) + 4.5},${V(s.v[i])} ${X(Y[i])},${V(s.v[i]) + 4.5} ${X(Y[i]) - 4.5},${V(s.v[i])}`, fill: color }) : shape === "sq" ? sv("rect", { x: X(Y[i]) - 3, y: V(s.v[i]) - 3, width: 6, height: 6, fill: color }) : sv("circle", { cx: X(Y[i]), cy: V(s.v[i]), r: 3, fill: color }));
      const b = intercept(s), a = s.slope / 10; svg.append(sv("line", { x1: X(Y[0]), y1: V(a * Y[0] + b), x2: X(Y[n - 1]), y2: V(a * Y[n - 1] + b), stroke: color, "stroke-width": 1.8, "stroke-dasharray": "7 5", opacity: 0.9 }));
    };
    if (T3) line(T3, tok("viz-cool-3", "#3F7FB0"), 2, "dia");
    line(C, ink, 2, "ci"); line(Wt, warm, 2, "sq");
    const cur = sv("g"); svg.append(cur);
    svg._draw = (i) => cur.replaceChildren(sv("line", { x1: X(Y[i]), x2: X(Y[i]), y1: mt, y2: mt + ph, stroke: ink, "stroke-width": 1.5, opacity: 0.55 }), sv("circle", { cx: X(Y[i]), cy: V(C.v[i]), r: 5, fill: ink, stroke: surface, "stroke-width": 2 }), sv("circle", { cx: X(Y[i]), cy: V(Wt.v[i]), r: 5, fill: warm, stroke: surface, "stroke-width": 2 }), ...(T3 ? [sv("circle", { cx: X(Y[i]), cy: V(T3.v[i]), r: 5, fill: tok("viz-cool-3", "#3F7FB0"), stroke: surface, "stroke-width": 2 })] : []));
    svg._x = (cx) => { const r = svg.getBoundingClientRect(), x = (cx - r.left) * (W / r.width); return clamp(Math.round(Y[0] + ((x - ml) / pw) * (Y[n - 1] - Y[0])) - Y[0], 0, n - 1); };
    mark(yi);
  }
  function mark(i) {
    yi = clamp(i, 0, n - 1); svg._draw && svg._draw(yi);
    readout.textContent = `${Y[yi]}: ${C.short} ${signed(C.v[yi], 2)} ${A.u}, ${Wt.short} ${signed(Wt.v[yi], 2)} ${A.u}${T3 ? `, ${T3.short} ${signed(T3.v[yi], 2)} ${A.u}` : ""} (difference from each record's own average).`;
  }
  svg.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") mark(svg._x(e.clientX)); });
  svg.addEventListener("pointerdown", (e) => mark(svg._x(e.clientX)));
  wrap.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); mark(yi + 1); } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); mark(yi - 1); }
    else if (e.key === "Home") { e.preventDefault(); mark(0); } else if (e.key === "End") { e.preventDefault(); mark(n - 1); }
  });
  draw();
  const offSize = sizeObserver(wrap, () => { if (destroyed) return; const w = clamp(Math.round(wrap.clientWidth || 640), 260, 900); if (Math.abs(w - W) > 1) draw(); });
  const offTheme = onTheme(() => draw());
  return { el: root, destroy() { destroyed = true; offSize(); offTheme(); root.remove(); } };
}
