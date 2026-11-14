// Detective mode: the five steps from the challenge brief. 1 variable, 2 region, 3 period, 4 time series, 5 significance, then "put it on trial".
import { h, boxStr, signed, fmtP, announce, download } from "../util.js";
import { worldMap } from "../worldmap.js";
import { fetchMonthly, validateBox, LIVE_IS_STUB } from "../live.js";
import { analyze, deseasonalize, STATS_IS_STUB } from "../stats.js";
import { trendChart } from "../chart.js";
import { pWords, trendWords, stepWords, sigClass, sigLabel } from "../words.js";

const LAST_YEAR = 2025;
const state = { varKey: "t2m", presetKey: "wisconsin", box: null, y0: 2002, y1: 2025, season: "all", view: "values", result: null };

export function detective(cat) {
  const V = cat.variables, P = cat.presets, S = cat.seasons;
  if (!state.box) state.box = { ...P.find(p => p.key === state.presetKey).box };
  const root = h("div", {});
  const out = h("div", { id: "det-out", "aria-live": "polite" });
  const curVar = () => V.find(v => v.key === state.varKey);

  // ---- Step 1: variable
  const s1 = h("section", { class: "card", "aria-labelledby": "s1-h" }, h("p", { class: "eyebrow" }, "Step 1"), h("h2", { id: "s1-h" }, "Choose what to investigate"), h("p", { class: "muted" }, "Each clue is a NASA Earth measurement. Pick one."));
  const varBox = h("fieldset", { class: "choice" }, h("legend", { class: "sr-only" }, "Variable"));
  function drawVars() {
    varBox.replaceChildren(h("legend", { class: "sr-only" }, "Variable"), ...V.map(v => h("label", {}, h("input", { type: "radio", name: "variable", value: v.key, checked: v.key === state.varKey, onchange: () => { state.varKey = v.key; clampYears(); drawVars(); drawPeriod(); } }),
      h("span", { class: "opt" }, h("strong", {}, v.name), h("span", { class: "muted small", style: "display:block;margin:2px 0 6px" }, v.one_line), h("span", { class: "chip " + (v.kind === "model_reanalysis" ? "warn" : "neutral") }, v.kind === "model_reanalysis" ? "Model output" : "Satellite observation"), h("span", { class: "muted small", style: "display:block;margin-top:6px" }, `Record starts ${v.since}`)))));
  }
  s1.append(varBox);

  // ---- Step 2: region
  const s2 = h("section", { class: "card", "aria-labelledby": "s2-h" }, h("p", { class: "eyebrow" }, "Step 2"), h("h2", { id: "s2-h" }, "Choose a region"), h("p", { class: "muted" }, "Start from a preset, drag a box on the map, or type the edges. The whole world is allowed."));
  const sel = h("select", { id: "preset", onchange: e => { const p = P.find(q => q.key === e.target.value); if (p) { state.presetKey = p.key; setBox({ ...p.box }); } } },
    ...P.map(p => h("option", { value: p.key }, p.name)), h("option", { value: "custom" }, "Custom box"));
  const inputs = {}; const err = h("p", { class: "small", style: "color:var(--bad);min-height:1.4em", role: "alert" });
  const boxRow = h("div", { class: "boxrow" }, ...[["n", "North edge (latitude)"], ["s", "South edge (latitude)"], ["w", "West edge (longitude)"], ["e", "East edge (longitude)"]].map(([k, lab]) => {
    const i = h("input", { type: "number", step: "0.5", id: "box-" + k, value: state.box[k], onchange: () => { const b = { ...state.box, [k]: parseFloat(i.value) }; setBox(b, true); } });
    inputs[k] = i; return h("label", { for: "box-" + k }, lab, i);
  }));
  const wm = worldMap({ box: state.box, onChange: b => { state.presetKey = "custom"; setBox(b); } });
  const boxLabel = h("p", { class: "muted small" });
  function setBox(b, fromInput) {
    const errs = validateBox(b); err.textContent = errs.join(" ");
    if (!errs.length) { state.box = b; wm.setBox(b); }
    for (const k of "nswe") if (!fromInput || errs.length === 0) inputs[k].value = state.box[k];
    const match = P.find(p => JSON.stringify(p.box) === JSON.stringify(state.box)); sel.value = match ? match.key : "custom";
    boxLabel.textContent = "Selected: " + boxStr(state.box);
  }
  s2.append(h("div", { class: "field" }, h("label", { for: "preset" }, "Preset"), sel), wm.node, h("p", { class: "muted small" }, "Drag on the map to draw a box. The map shows land only; boxes are rectangles of latitude and longitude."), boxRow, err, boxLabel);

  // ---- Step 3: period
  const s3 = h("section", { class: "card", "aria-labelledby": "s3-h" }, h("p", { class: "eyebrow" }, "Step 3"), h("h2", { id: "s3-h" }, "Choose the time period"));
  const periodBody = h("div", {});
  function clampYears() { const v = curVar(); state.y0 = Math.max(state.y0, v.since); if (state.y1 < state.y0) state.y1 = state.y0; }
  function drawPeriod() {
    const v = curVar(), warn = h("p", { class: "small muted", id: "period-note" });
    const upd = () => { const n = state.y1 - state.y0 + 1; warn.textContent = n < 10 ? `That is ${n} years. Short records make trend tests weak.` : `${n} years selected.`; };
    const y0 = h("input", { type: "number", id: "y0", min: v.since, max: LAST_YEAR, value: state.y0, onchange: e => { state.y0 = Math.min(LAST_YEAR, Math.max(v.since, +e.target.value || v.since)); e.target.value = state.y0; upd(); } });
    const y1 = h("input", { type: "number", id: "y1", min: v.since, max: LAST_YEAR, value: state.y1, onchange: e => { state.y1 = Math.min(LAST_YEAR, Math.max(v.since, +e.target.value || LAST_YEAR)); e.target.value = state.y1; upd(); } });
    const season = h("select", { id: "season", onchange: e => { state.season = e.target.value; } }, ...S.map(x => h("option", { value: x.key, selected: x.key === state.season }, x.name)));
    upd();
    periodBody.replaceChildren(h("div", { class: "boxrow" }, h("label", { for: "y0" }, "First year", y0), h("label", { for: "y1" }, "Last year", y1), h("label", { for: "season" }, "Season (optional)", season)), warn, h("p", { class: "muted small" }, `${v.name} is available from ${v.since}. A season keeps only those months each year.`));
  }
  s3.append(periodBody);

  // ---- Step 4 and 5 trigger
  const runBtn = h("button", { class: "btn", type: "button", onclick: run }, "Make the time series");
  const runRow = h("div", { class: "flow-nav" }, runBtn, h("span", { class: "muted small", style: "align-self:center" }, "Everything is computed in this page."));

  async function run() {
    const errs = validateBox(state.box); if (errs.length) { err.textContent = errs.join(" "); return; }
    const v = curVar(), season = S.find(x => x.key === state.season);
    runBtn.disabled = true; out.replaceChildren(h("p", { class: "loading muted" }, "Fetching the series."));
    try {
      const data = await fetchMonthly({ variable: v, box: state.box, startYear: state.y0, endYear: state.y1 });
      const rows = data.rows.filter(r => season.months.includes(r.month));
      if (rows.length < 8) { out.replaceChildren(h("p", { class: "callout" }, "Too few values to test. Choose a longer period or more months.")); return; }
      state.result = { v, season, data, rows, box: { ...state.box }, y0: state.y0, y1: state.y1 };
      drawResult();
      announce("Results ready. Time series and significance tests are below.");
      const t = document.getElementById("res-h"); if (t) t.focus();
    } catch (e) {
      out.replaceChildren(h("p", { class: "callout" }, "Could not get the series: " + (e && e.message || e)));
    } finally { runBtn.disabled = false; }
  }

  function drawResult() {
    const R = state.result; if (!R) return;
    const t = R.rows.map(r => r.year + (r.month - 0.5) / 12), months = R.rows.map(r => r.month), raw = R.rows.map(r => r.value);
    const anom = deseasonalize(months, raw);
    const A_raw = analyze(t, raw), A_an = analyze(t, anom);
    const shown = state.view === "values" ? { y: raw, A: A_raw, word: "value" } : { y: anom, A: A_an, word: "anomaly" };
    const u = R.v.units;
    const fitLine = (A) => t.map(x => A.sen.intercept + A.sen.slope_per_decade / 10 * x);
    const olsLine = (A) => t.map(x => A.ols.intercept + A.ols.slope_per_decade / 10 * x);
    const chart = trendChart({
      x: t, y: shown.y, units: u, band: null, ptR: 2.2, fmtX: v2 => { const yr = Math.floor(v2), m = Math.round((v2 - yr) * 12 + 0.5); return `${yr}-${String(Math.min(12, Math.max(1, m))).padStart(2, "0")}`; },
      lines: [{ label: "Sen trend", cls: "sen", lbl: "lbl-sen", y: fitLine(shown.A) }, { label: "Least squares", cls: "olsl", lbl: "lbl-ols", y: olsLine(shown.A) }],
      yLabel: (state.view === "values" ? "" : "Anomaly: ") + `${R.v.name} (${u})`, pointWord: shown.word,
      describe: `${R.v.name}, ${boxStr(R.box)}, ${R.season.name}, ${R.y0} to ${R.y1}, ${R.rows.length} monthly values. Sen trend ${signed(shown.A.sen.slope_per_decade, 3)} ${u} per decade.`,
      keyItems: [["k-pt", "Monthly value"], ["k-sen", "Sen trend (robust line)"], ["k-ols", "Ordinary least squares line"]],
    });
    const toggle = h("div", { class: "seg", role: "radiogroup", "aria-label": "Series shown" }, [["values", "Values as measured"], ["anom", "Seasonal cycle removed"]].map(([k, l]) =>
      h("label", {}, h("input", { type: "radio", name: "view", value: k, checked: state.view === k, onchange: () => { state.view = k; drawResult(); document.getElementById("view-" + k)?.focus(); } }), h("span", { id: "view-" + k }, l))));
    const A = A_raw;
    const olsCard = h("div", { class: "baseline" }, h("h3", {}, "The familiar test: straight line and t-test"),
      h("p", { class: "muted small" }, "A least-squares line with a t-test is the version most people learn first. It is shown for context."),
      h("p", {}, h("b", {}, signed(A.ols.slope_per_decade, 3)), ` ${u} per decade, 95% range ${signed(A.ols.lo, 3)} to ${signed(A.ols.hi, 3)}.`),
      h("p", {}, h("span", { class: "chip " + sigClass(A.ols.p) }, sigLabel(A.ols.p)), ` t = ${A.ols.t.toFixed(2)}, p = ${fmtP(A.ols.p)}`),
      h("p", { class: "small" }, pWords(A.ols.p)));
    const mkCard = h("div", { class: "baseline" }, h("h3", {}, "A sturdier test: Mann-Kendall and Sen slope"),
      h("p", { class: "muted small" }, "Mann-Kendall asks whether later values tend to be higher or lower than earlier ones. It needs no straight-line assumption. The Sen slope is the matching rate of change."),
      h("p", {}, h("b", {}, signed(A.sen.slope_per_decade, 3)), ` ${u} per decade, 95% range ${signed(A.sen.lo, 3)} to ${signed(A.sen.hi, 3)}.`),
      h("p", {}, h("span", { class: "chip " + sigClass(A.mk.p) }, sigLabel(A.mk.p)), ` tau = ${A.mk.tau.toFixed(3)}, p = ${fmtP(A.mk.p)}`),
      h("p", { class: "small" }, pWords(A.mk.p)));
    // the ladder
    const rungs = [
      { n: 1, name: "Raw values, Mann-Kendall", what: "Start. Every monthly value is treated as an independent draw, seasonal cycle left in.", p: A_raw.mk.p, slope: A_raw.sen.slope_per_decade, lo: A_raw.sen.lo, hi: A_raw.sen.hi },
      { n: 2, name: "Seasonal cycle removed", what: "Each value is compared with the typical value for its own calendar month, so the yearly swing no longer hides or fakes a trend.", p: A_an.mk.p, slope: A_an.sen.slope_per_decade, lo: A_an.sen.lo, hi: A_an.sen.hi },
      { n: 3, name: "Autocorrelation corrected (Hamed-Rao)", what: "Neighbouring months resemble each other, which makes a trend look more certain than it is. The test is widened to allow for that.", p: A_an.hr.p, slope: A_an.sen.slope_per_decade, lo: A_an.sen.lo, hi: A_an.sen.hi, extra: `Variance factor ${A_an.hr.vif.toFixed(2)}` },
    ];
    const trial = h("div", { class: "card" }, h("p", { class: "eyebrow" }, "Put it on trial"), h("h3", {}, "Does the answer survive tougher questions?"),
      h("p", { class: "muted" }, "Each step changes one thing. We report what happened, whichever way the p-value moves. A step that makes the result weaker is not a failure of the method; it is the point."),
      h("div", { class: "scroll", style: "max-height:none" }, h("table", { class: "data" }, h("thead", {}, h("tr", {}, ["Step", "Slope per decade", "p-value", "Result at 0.05", "What this step did"].map(x => h("th", { scope: "col" }, x)))),
        h("tbody", {}, rungs.map((r, i) => h("tr", {}, h("td", { style: "text-align:left" }, h("b", {}, `${r.n}. ${r.name}`), h("div", { class: "muted small", style: "max-width:22rem" }, r.what, r.extra ? " " + r.extra + "." : "")),
          h("td", {}, signed(r.slope, 3)), h("td", {}, fmtP(r.p)), h("td", { style: "text-align:left" }, h("span", { class: "chip " + sigClass(r.p) }, sigLabel(r.p))), h("td", { style: "text-align:left;max-width:16rem" }, stepWords(rungs[i - 1], r))))))));
    const stub = [];
    if (R.data.stub) stub.push(h("p", { class: "callout" }, h("b", {}, "Preview numbers. "), R.data.note));
    if (STATS_IS_STUB) stub.push(h("p", { class: "callout info small" }, "Preview statistics: standard formulas in this page. The final version uses the project's tested statistics module."));
    const csv = () => download(`detective_${R.v.key}_${R.y0}-${R.y1}.csv`, "year,month,value,anomaly\n" + R.rows.map((r, i) => `${r.year},${r.month},${r.value},${anom[i].toFixed(5)}`).join("\n"), "text/csv");
    out.replaceChildren(
      h("section", { "aria-labelledby": "res-h" },
        h("div", { class: "casehead" }, h("h2", { id: "res-h", tabindex: "-1" }, "Your time series"), h("span", { class: "chip warn" }, "Your own exploration, not pre-registered")),
        h("p", { class: "meta" }, h("span", {}, h("b", {}, "Variable: "), R.v.name), h("span", {}, h("b", {}, "Region: "), boxStr(R.box)), h("span", {}, h("b", {}, "Period: "), `${R.season.name}, ${R.y0} to ${R.y1}`), h("span", {}, h("b", {}, "Values: "), String(R.rows.length)), h("span", {}, h("b", {}, "Source: "), R.v.source)),
        ...stub,
        h("div", { class: "card" }, h("p", { class: "eyebrow" }, "Step 4"), h("h3", {}, "Look at the series. Does it look like a trend?"), toggle, h("div", { style: "margin-top:12px" }, chart.node)),
        h("p", { class: "eyebrow", style: "margin-top:24px" }, "Step 5"), h("h3", {}, "Is the trend significant?"),
        h("p", { class: "muted" }, trendWords(R.v.name, A.sen.slope_per_decade, A.sen.lo, A.sen.hi, u)),
        h("div", { class: "grid g2" }, mkCard, olsCard),
        h("div", { style: "margin-top:16px" }, trial),
        h("div", { class: "flow-nav" }, h("button", { class: "btn-quiet", type: "button", onclick: csv }, "Download this series (CSV)"), h("a", { class: "btn-quiet", href: "#/cases" }, "See a registered case file"))));
  }

  root.append(
    h("p", { class: "crumb" }, h("a", { href: "#/" }, "Home"), " / Detective"),
    h("h1", { id: "page-title", tabindex: "-1" }, "Detective mode"),
    h("p", { class: "lede" }, "Five steps: choose a clue, a region and a period, look at the time series, then test whether the trend is real."),
    h("div", { class: "stack", style: "margin-top:20px" }, s1, s2, s3, runRow), out);
  drawVars(); drawPeriod(); setBox(state.box);
  if (state.result) drawResult();
  return { node: root, title: "Detective mode" };
}
