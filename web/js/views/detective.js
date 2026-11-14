// Detective mode: the five steps from the challenge brief. 1 variable, 2 region, 3 period, 4 time series, 5 significance, then "put it on trial".
import { h, boxStr, signed, fmtP, announce, download } from "../util.js";
import { worldMap } from "../worldmap.js";
import { fetchMonthly, validateBox, planBox } from "../live.js";
import { analyzeRows, stepInfo, STATS_VERSION } from "../stats.js";
import { trendChart } from "../chart.js";
import { tip } from "./common.js";
import { pWords, trendWords, stepWords, sigClass, sigLabel } from "../words.js";

const LAST_YEAR = 2025;
const state = { varKey: "t2m", presetKey: "wisconsin", box: null, y0: 1981, y1: 2025, season: "all", view: "values", result: null, last: null };

export function detective(cat) {
  const V = cat.variables, P = cat.presets, S = cat.seasons;
  if (!state.box) state.box = { ...P.find(p => p.key === state.presetKey).box };
  const root = h("div", {});
  const out = h("div", { id: "det-out", "aria-live": "polite" });
  const curVar = () => V.find(v => v.key === state.varKey);

  // ---- Step 1: variable
  const s1 = h("section", { class: "card", id: "s1", "aria-labelledby": "s1-h" }, h("p", { class: "eyebrow" }, "Step 1"), h("h2", { id: "s1-h" }, "Choose what to investigate"), h("p", { class: "muted" }, "Each clue is a NASA Earth measurement. Pick one."), tip("Start with something you can picture, like the air temperature where you live. “Model-based” means a computer model blended many measurements to fill the whole map."));
  const varBox = h("fieldset", { class: "choice" }, h("legend", { class: "sr-only" }, "Variable"));
  function drawVars() {
    varBox.replaceChildren(h("legend", { class: "sr-only" }, "Variable"), ...V.map(v => v.live === false ? h("div", {}, h("div", { class: "off" }, h("strong", {}, v.name), h("span", { class: "muted small", style: "display:block;margin:2px 0 6px" }, v.one_line), h("span", { class: "chip neutral" }, "Case files only"), h("span", { class: "small", style: "display:block;margin-top:6px" }, v.not_live_note + " ", h("a", { href: v.case_link }, "Open case C-D")))) : h("label", {}, h("input", { type: "radio", name: "variable", value: v.key, checked: v.key === state.varKey, onchange: () => { state.varKey = v.key; clampYears(); drawVars(); drawPeriod(); } }),
      h("span", { class: "opt" }, h("strong", {}, v.name), h("span", { class: "muted small", style: "display:block;margin:2px 0 6px" }, v.one_line), h("span", { class: "chip " + (v.kind === "model_reanalysis" ? "warn" : "neutral") }, v.kind === "model_reanalysis" ? "Model-based" : "Satellite observation"), h("span", { class: "muted small", style: "display:block;margin-top:6px" }, `Unit: ${v.units}. Record starts ${v.since}`)))));
  }
  s1.append(varBox);

  // ---- Step 2: region
  const s2 = h("section", { class: "card", id: "s2", "aria-labelledby": "s2-h" }, h("p", { class: "eyebrow" }, "Step 2"), h("h2", { id: "s2-h" }, "Choose a region"), h("p", { class: "muted" }, "Start from a preset, drag a box on the map, or type the edges."), tip("A box about the size of a state or a small country works well. A tiny box can be jumpy, and a very large one is slow to fetch."));
  const sel = h("select", { id: "preset", onchange: e => { const p = P.find(q => q.key === e.target.value); if (p) { state.presetKey = p.key; setBox({ ...p.box }); } } },
    ...P.map(p => h("option", { value: p.key }, p.name)), h("option", { value: "custom" }, "Custom box"));
  const inputs = {}; const err = h("p", { class: "small", style: "color:var(--bad);min-height:1.4em", role: "alert" });
  const boxRow = h("div", { class: "boxrow" }, ...[["n", "North edge (latitude)"], ["s", "South edge (latitude)"], ["w", "West edge (longitude)"], ["e", "East edge (longitude)"]].map(([k, lab]) => {
    const i = h("input", { type: "number", step: "0.5", id: "box-" + k, value: state.box[k], onchange: () => { const b = { ...state.box, [k]: parseFloat(i.value) }; setBox(b, true); } });
    inputs[k] = i; return h("label", { for: "box-" + k }, lab, i);
  }));
  const wm = worldMap({ box: state.box, onChange: b => { state.presetKey = "custom"; setBox(b); } });
  const boxLabel = h("p", { class: "muted small" });
  const planNote = h("div", { class: "small", "aria-live": "polite" });
  function setBox(b, fromInput) {
    const errs = validateBox(b); err.textContent = errs.join(" ");
    if (!errs.length) { state.box = b; wm.setBox(b); }
    for (const k of "nswe") if (!fromInput || errs.length === 0) inputs[k].value = state.box[k];
    const match = P.find(p => JSON.stringify(p.box) === JSON.stringify(state.box)); sel.value = match ? match.key : "custom";
    boxLabel.textContent = "Selected: " + boxStr(state.box);
    if (!validateBox(state.box).length) {
      const pl = planBox(state.box); planNote.replaceChildren(h("p", { class: pl.kind === "regional" ? "muted" : "callout" }, pl.message));
      if (pl.kind === "too_big") planNote.append(h("div", { class: "flow-nav", style: "margin-top:0" }, h("button", { class: "btn-quiet", type: "button", onclick: () => { state.presetKey = "custom"; setBox({ ...pl.alt }); } }, `Use the largest allowed box (${boxStr(pl.alt)})`), h("span", { class: "muted small", style: "align-self:center" }, "or pick a preset region above")));
    } else planNote.replaceChildren();
  }
  s2.append(h("div", { class: "field" }, h("label", { for: "preset" }, "Preset"), sel), wm.node, h("p", { class: "muted small" }, "Drag on the map to draw a box. Boxes are rectangles of latitude and longitude. On a phone, typing the four edges is easier than dragging."), boxRow, err, boxLabel, planNote);

  // ---- Step 3: period
  const s3 = h("section", { class: "card", id: "s3", "aria-labelledby": "s3-h" }, h("p", { class: "eyebrow" }, "Step 3"), h("h2", { id: "s3-h" }, "Choose the time period"), tip("Longer records give the test more to work with. Ten years or fewer can show a trend by chance alone. Twenty-five years or more is a better start."));
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
    const errs = validateBox(state.box); if (errs.length) { err.textContent = errs.join(" "); return false; }
    const v = curVar(), season = S.find(x => x.key === state.season);
    if (planBox(state.box).kind === "too_big") { out.replaceChildren(h("p", { class: "callout" }, planBox(state.box).message)); return false; }
    runBtn.disabled = true;
    const bar = h("progress", { max: 1, value: 0, style: "width:100%;height:14px", "aria-label": "Download progress" }), cap = h("p", { class: "muted small" }, "Contacting NASA POWER.");
    out.replaceChildren(h("div", { class: "card" }, h("p", {}, h("b", {}, "Getting " + v.name.toLowerCase() + " from NASA POWER.")), bar, cap));
    try {
      const data = await fetchMonthly({ variable: v, box: state.box, startYear: state.y0, endYear: state.y1, onProgress: ({ done, total }) => { bar.value = total ? done / total : 0; cap.textContent = `${done} of ${total} request${total === 1 ? "" : "s"} done.`; } });
      const rows = data.rows.filter(r => season.months.includes(r.month));
      if (rows.length < 8) { out.replaceChildren(h("p", { class: "callout" }, "Too few values to test. Choose a longer period or more months.")); return false; }
      state.result = { v, season, data, rows, box: { ...state.box }, y0: state.y0, y1: state.y1 };
      drawResult();
      announce("Results ready. Time series and significance tests are below.");
      if (!demo) { const t = document.getElementById("res-h"); if (t) t.focus(); }
      return true;
    } catch (e) {
      out.replaceChildren(h("p", { class: "callout", role: "alert" }, "Could not get the series. " + (e && e.message || e))); return false;
    } finally { runBtn.disabled = false; }
  }

  function drawResult() {
    const R = state.result; if (!R) return;
    const season = R.season, u = R.v.units;
    const W = analyzeRows(R.data.rows, { months: season.months, y0: R.y0, y1: R.y1, units: u });
    const stub = [];
    if (R.data.stub) stub.push(h("p", { class: "callout" }, h("b", {}, "Preview numbers. "), R.data.note));
    else stub.push(h("p", { class: "callout info small" }, h("b", {}, "About this data. "), R.data.note));
    const head = h("div", { class: "casehead" }, h("h2", { id: "res-h", tabindex: "-1" }, "Your time series"), h("span", { class: "chip warn" }, "Your own exploration, not pre-registered"));
    const meta = h("p", { class: "meta" }, h("span", {}, h("b", {}, "Variable: "), R.v.name), h("span", {}, h("b", {}, "Region: "), boxStr(R.box)), h("span", {}, h("b", {}, "Period: "), `${season.name}, ${R.y0} to ${R.y1}`), h("span", {}, h("b", {}, "Years with a value: "), String(W.n)), h("span", {}, h("b", {}, "Source: "), R.v.source));
    if (W.tooShort) { state.last = null; out.replaceChildren(h("section", { "aria-labelledby": "res-h" }, head, meta, ...stub, h("p", { class: "callout" }, W.verdict.text))); return; }
    const showAn = state.view === "anom", y = showAn ? W.anomaly : W.raw, A = showAn ? W.A_an : W.A_raw, ols0 = showAn ? W.olsInterceptAn : W.olsIntercept;
    const senLine = W.years.map(t => A.mk.intercept + A.mk.slope * t), olsLine = W.years.map(t => ols0 + A.ols.slope * t);
    const chart = trendChart({
      x: W.years, y, units: u, band: null, ptR: 3.4, fmtX: v2 => String(v2), xTickStep: W.years.length > 30 ? 10 : 5,
      lines: [{ label: "Sen trend", cls: "sen", lbl: "lbl-sen", y: senLine }, { label: "Least squares", cls: "olsl", lbl: "lbl-ols", y: olsLine }],
      yLabel: (showAn ? "Anomaly: " : "") + `${R.v.name} (${u})`, pointWord: showAn ? "anomaly" : "season mean",
      describe: `${R.v.name}, ${boxStr(R.box)}, ${season.name}, one value per year, ${R.y0} to ${R.y1}. Sen trend ${signed(A.sen.slopePerDecade, 3)} ${u} per decade.`,
      keyItems: [["k-pt", "Season average for one year"], ["k-sen", "Sen trend (robust line)"], ["k-ols", "Ordinary least squares line"]],
    });
    const toggle = h("div", { class: "seg", role: "radiogroup", "aria-label": "Series shown" }, [["values", "Season mean per year"], ["anom", "Seasonal cycle removed"]].map(([k, l]) =>
      h("label", {}, h("input", { type: "radio", name: "view", value: k, checked: state.view === k, onchange: () => { state.view = k; drawResult(); document.getElementById("view-" + k)?.focus(); } }), h("span", { id: "view-" + k }, l))));
    const R_ = W.A_raw, olsCard = h("div", { class: "baseline" }, h("h3", {}, "The familiar test: straight line and t-test"),
      h("p", { class: "muted small" }, "A least-squares line with a t-test is the version most people learn first. It is shown for context."),
      h("p", {}, h("b", {}, signed(R_.ols.slopePerDecade, 3)), ` ${u} per decade, 95% range ${signed(R_.ols.ciPerDecade[0], 3)} to ${signed(R_.ols.ciPerDecade[1], 3)}.`),
      h("p", {}, h("span", { class: "chip " + sigClass(R_.ols.p) }, sigLabel(R_.ols.p)), ` t = ${R_.ols.t.toFixed(2)}, p = ${fmtP(R_.ols.p)}`),
      h("p", { class: "small" }, pWords(R_.ols.p)));
    const corr = stepInfo("autocorr", W.A_an.mk);
    const mkCard = h("div", { class: "baseline" }, h("h3", {}, "A sturdier test: Mann-Kendall and Sen slope"),
      h("p", { class: "muted small" }, "Mann-Kendall asks whether later values tend to be higher or lower than earlier ones. It needs no straight-line assumption. The Sen slope is the matching rate of change."),
      h("p", {}, h("b", {}, signed(R_.sen.slopePerDecade, 3)), ` ${u} per decade, 95% range ${signed(R_.sen.intervalPerDecade[0], 3)} to ${signed(R_.sen.intervalPerDecade[1], 3)}.`),
      h("p", { class: "muted small", style: "margin-top:-.5em" }, R_.sen.intervalNote + "."),
      h("p", {}, h("span", { class: "chip " + sigClass(R_.mk.p) }, sigLabel(R_.mk.p)), ` tau = ${R_.mk.tau.toFixed(3)}, p ${fmtP(R_.mk.p)} with the correction (${corr.name}); p ${fmtP(R_.mkIndependent.p)} without it`));
    const rungs = [
      { n: 1, ...stepInfo("raw"), p: W.A_raw.mkIndependent.p, slope: W.A_raw.sen.slopePerDecade },
      { n: 2, ...stepInfo("anomaly"), p: W.A_an.mkIndependent.p, slope: W.A_an.sen.slopePerDecade },
      { n: 3, ...corr, extra: `Variance factor ${W.A_an.mk.hrFactor.toFixed(2)}`, p: W.A_an.mk.p, slope: W.A_an.sen.slopePerDecade },
    ];
    const trial = h("div", { class: "card", id: "det-trial" }, h("p", { class: "eyebrow" }, "Put it on trial"), h("h3", {}, "Does the answer survive tougher questions?"),
      h("p", { class: "muted" }, "Each step changes one thing. We report what happened, whichever way the p-value moves. A step that makes the result weaker is not a failure of the method; it is the point."),
      h("div", { class: "scroll", style: "max-height:none" }, h("table", { class: "data" }, h("thead", {}, h("tr", {}, ["Step", "Slope per decade", "p-value", "Result at 0.05", "What this step did"].map(x => h("th", { scope: "col" }, x)))),
        h("tbody", {}, rungs.map((r, i) => h("tr", {}, h("td", { style: "text-align:left" }, h("b", {}, `${r.n}. ${r.name}`), h("div", { class: "muted small", style: "max-width:24rem" }, r.note, r.extra ? " " + r.extra + "." : "")),
          h("td", {}, signed(r.slope, 3)), h("td", {}, fmtP(r.p)), h("td", { style: "text-align:left" }, h("span", { class: "chip " + sigClass(r.p) }, sigLabel(r.p))), h("td", { style: "text-align:left;max-width:16rem" }, stepWords(rungs[i - 1], r))))))));
    const csv = () => download(`detective_${R.v.key}_${R.y0}-${R.y1}.csv`, "year,season_mean,anomaly\n" + W.years.map((yr, i) => `${yr},${W.raw[i].toFixed(5)},${W.anomaly[i].toFixed(5)}`).join("\n"), "text/csv");
    state.last = { W, R, rungs };
    out.replaceChildren(
      h("section", { "aria-labelledby": "res-h" }, head, meta, ...stub,
        h("div", { class: "card", id: "det-chart" }, h("p", { class: "eyebrow" }, "Step 4"), h("h3", {}, "Look at the series. Does it look like a trend?"), tip("Each dot is the average for your chosen season in one year. Does the pattern climb or fall over time, or does it wander? " + (season.months.length === 12 ? "You chose the whole year, so the seasonal cycle is already averaged out within each year." : "Switch on “Seasonal cycle removed” to see each year compared with the normal for its own months.")), toggle, h("div", { style: "margin-top:12px" }, chart.node)),
        h("div", { id: "det-test" }, h("p", { class: "eyebrow", style: "margin-top:24px" }, "Step 5"), h("h3", {}, "Is the trend significant?"), tip("A p-value below 0.05 is called significant. A p-value above 0.05 does not mean there is no trend. It means this record is not clear enough yet."),
          h("p", {}, W.verdict.text), h("p", { class: "muted" }, trendWords(R.v.name, R_.sen.slopePerDecade, R_.sen.intervalPerDecade[0], R_.sen.intervalPerDecade[1], u)),
          h("div", { class: "grid g2" }, mkCard, olsCard)),
        h("div", { style: "margin-top:16px" }, trial),
        h("p", { class: "muted small" }, `Statistics: trendtrial ${STATS_VERSION}, checked against the Python reference.`),
        h("div", { class: "flow-nav" }, h("button", { class: "btn-quiet", type: "button", onclick: csv }, "Download this series (CSV)"), h("a", { class: "btn-quiet", href: "#/cases" }, "See a registered case file"))));
  }

  // ---- Watch a demo: replays two fixed examples with the same controls, step by step, on live NASA POWER data
  const DEMOS = [
    { id: "wi", title: "Wisconsin summer air temperature", varKey: "t2m", preset: "wisconsin", y0: 1981, y1: 2025, season: "jja",
      s1: "We start with something familiar: how warm the air is in summer. This is the temperature a weather station reads, about 2 metres up. It comes from a NASA model that blends many measurements, so we call it model-based.",
      s2: "Wisconsin is a good size: big enough to average out a single hot town, small enough that one summer's weather still shows up. The box is a rectangle around the state.",
      s3: "1981 to 2025 is 45 summers. We keep only June, July and August so that winter does not drown out the summer signal. Longer records make a real trend easier to see." },
    { id: "sahel", title: "Sahel wet-season rainfall", varKey: "precip", preset: "sahel", y0: 1981, y1: 2025, season: "jjas",
      s1: "Next, rainfall. Here it means rain and melted snow reaching the ground, averaged per day. Like the air temperature, it is model-based: NASA blends satellite and rain gauge data.",
      s2: "The Sahel is the dry belt south of the Sahara. Its rain comes in one season, so the region is wide: a strip of NASA grid cells averaged together, fetched in five requests.",
      s3: "We keep June to September, the wet season, for 1981 to 2025. Rain swings a lot from year to year, so a long record matters even more here." },
  ];
  const demoCard = h("section", { class: "card", id: "demo", "aria-labelledby": "demo-h" });
  let demo = null; // { d, k }
  const FOCUS = ["", "s1", "s2", "s3", "det-chart", "det-test", "det-trial"];
  function applyDemo(d) {
    state.varKey = d.varKey; state.y0 = d.y0; state.y1 = d.y1; state.season = d.season; state.presetKey = d.preset; state.view = "values";
    const p = P.find(q => q.key === d.preset);
    drawVars(); drawPeriod(); setBox({ ...p.box });
  }
  function drawDemoCard() {
    if (!demo) {
      demoCard.replaceChildren(h("div", { class: "fieldstitle" }, h("div", {}, h("p", { class: "eyebrow brass" }, "New here?"), h("h2", { id: "demo-h", tabindex: "-1" }, "Watch a demo")),
        h("div", { class: "flow-nav", style: "margin:0" }, DEMOS.map(d => h("button", { class: "btn-quiet", type: "button", onclick: () => startDemo(d) }, d.title)))),
        h("p", { class: "muted", style: "margin:6px 0 0" }, "We fill in the five steps for you, one at a time, on real NASA POWER data, and explain each one in plain words. Pick an example."));
      return;
    }
    const { d, k } = demo, R = state.result, L = state.last;
    const captions = [
      null, d.s1, d.s2, d.s3,
      () => L ? `We fetched the data and took the ${R.season.name.toLowerCase()} average for each year. Each dot is one year. The brown line is the Sen trend, a robust straight line through the dots: it ${L.W.A_raw.sen.slopePerDecade >= 0 ? "rises" : "falls"} by ${Math.abs(L.W.A_raw.sen.slopePerDecade).toFixed(2)} ${R.v.units} per decade. The dashed line is the ordinary least-squares line most people learn first. Do the dots follow the line, or do they scatter?` : "Fetching the data from NASA POWER.",
      () => L ? `Now the test. ${L.W.verdict.text} The Mann-Kendall test gives p ${fmtP(L.W.A_raw.mk.p)} and the familiar t-test gives p ${fmtP(L.W.A_raw.ols.p)}. They can differ a little. That is normal.` : "",
      () => L ? `Finally we put the result on trial. Each step changes one thing: ${L.rungs.map(r => `step ${r.n} gives p ${fmtP(r.p)}`).join("; ")}. A step can make the result weaker, stronger or leave it alone. That is the whole detective loop. Now try your own clue and place.` : "",
    ];
    const total = 6, cap = typeof captions[k] === "function" ? captions[k]() : captions[k];
    const titles = ["", "Step 1: choose a clue", "Step 2: choose a region", "Step 3: choose the period", "Step 4: look at the series", "Step 5: test the trend", "Put it on trial"];
    demoCard.replaceChildren(h("div", { class: "fieldstitle" }, h("div", {}, h("p", { class: "eyebrow brass" }, `Demo: ${d.title}`), h("h2", { id: "demo-h", tabindex: "-1" }, `${titles[k]} (${k} of ${total})`)),
      h("button", { class: "btn-quiet", type: "button", onclick: exitDemo }, "Exit demo")),
      h("p", { id: "demo-cap", "aria-live": "polite", style: "font-size:1.05rem;max-width:56rem" }, cap),
      h("div", { class: "flow-nav", style: "margin-top:8px" }, h("button", { class: "btn-quiet", type: "button", disabled: k <= 1, onclick: () => goDemo(k - 1) }, "Back"), h("button", { class: "btn", type: "button", disabled: k >= total, onclick: () => goDemo(k + 1) }, k >= total ? "Done" : "Next")));
  }
  function focusDemo(k) {
    for (const id of FOCUS) if (id) document.getElementById(id)?.classList.remove("demo-focus");
    const el = k >= 1 && document.getElementById(FOCUS[k]); if (el) { el.classList.add("demo-focus"); el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  }
  async function goDemo(k) {
    demo.k = k;
    const L = state.last, ok0 = L && L.R.v.key === demo.d.varKey && L.R.season.key === demo.d.season && L.R.y0 === demo.d.y0;
    if (k >= 4 && !ok0) { drawDemoCard(); const ok = await run(); if (!ok) { demo.k = 3; drawDemoCard(); return; } }
    drawDemoCard(); focusDemo(k);
    document.getElementById("demo-h")?.focus({ preventScroll: true });
  }
  function startDemo(d) { demo = { d, k: 1 }; state.result = null; state.last = null; out.replaceChildren(); applyDemo(d); drawDemoCard(); focusDemo(1); document.getElementById("demo-h")?.focus({ preventScroll: true }); }
  function exitDemo() { demo = null; focusDemo(0); drawDemoCard(); document.getElementById("demo-h")?.focus(); }

  root.append(
    h("p", { class: "crumb" }, h("a", { href: "#/" }, "Home"), " / Detective"),
    h("h1", { id: "page-title", tabindex: "-1" }, "Detective mode"),
    h("p", { class: "lede" }, "Five steps: choose a clue, a region and a period, look at the time series, then test whether the trend is real."),
    demoCard,
    h("div", { class: "stack", style: "margin-top:20px" }, s1, s2, s3, runRow), out);
  drawDemoCard(); drawVars(); drawPeriod(); setBox(state.box);
  if (state.result) drawResult();
  return { node: root, title: "Detective mode" };
}
