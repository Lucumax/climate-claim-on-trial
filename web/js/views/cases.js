// Case files. Index: one compact row per registered case. Docket: claim, then the ruling summary, then the regional record (Exhibit A),
// then the map by hearing (Exhibit B), then collapsible Statistics, Limits and Provenance.
// Every number about the regional test, interval and band comes from c.regional.test / .interval / band_lo (see data.js pickRegional): the SHIPPED test and SELECTED interval.
import { h, pct, signed, fmtNum, fmtPx, boxStr, announce, U, range } from "../util.js";
import { renderMap } from "../map.js";
import { seriesChart } from "../chart.js";
import { KIND, WITHHELD_LINE, scopeParts, withheldNote, regionThumb, copyButton, clinicSlot, disc, datasetName, kindChip } from "./common.js";
import { sigClass, sigLabel } from "../words.js";
import { clinicStrip, whoActs } from "./clinic.js";
import { exhibit } from "./exhibit.js";
import { caseFrame } from "../viz/anomaly-map.js";
import { METHOD_NAME } from "../data.js";
import { hasNote, plainReason as no2Reason, whyBlock, mapBanner, limits as no2Limits } from "./no2.js";
import { briefLimits, exploratoryPanel, moreLimits, indexNote } from "./disclosure.js";

const NA = () => h("span", { class: "muted" }, "Not in this bundle yet.");
const NOT_SHOWN = "Not shown: failed its coverage check.";
const caseNo = id => id.replace("-", "–");
const fac = t => (t && t.factor != null ? t.factor.toFixed(2) : "n/a");
const cap = s_ => s_.charAt(0).toUpperCase() + s_.slice(1);
const HEARING_WORD = { 3: "three", 4: "four" };
const HEARING_SHORT = { 1: "Raw test", 2: "Seasonal cycle", 3: "Memory correction", 4: "False discovery" };
// A withheld case is a deliberate outcome. The reason is the bundle's own text, rendered as is (no web copy second-guesses the diagnosis).
function plainReason(c) {
  if (hasNote(c)) return no2Reason(c);   // the registered NO2 pair has its own plain-English reason (views/no2.js)
  const rs = (c.verdict.withheld_reasons && c.verdict.withheld_reasons.length ? c.verdict.withheld_reasons : c.gate.reasons) || [];
  const why = rs.map(x => String(x).trim().replace(/\.$/, "")).filter(Boolean).join("; ");
  return (why ? `Why: ${why}.` : "The checks that a verdict depends on did not pass for this record.") + " The record did not pass our validation checks, so we withhold the ruling.";
}
// Calibration lines from the bundle (validation.display, or built from validation.adaptive); empty when the bundle has neither.
const calLines = (c, withheld) => c.display ? [c.display.interval, withheld ? null : c.display.falsePositive].filter(Boolean) : [];
// Persistence is always said the same way: the bundle's lag-1 autocorrelation is computed after removing the linear trend; the raw one is shown beside it.
const lag1 = y => { const a = y.slice(0, -1), b = y.slice(1), m = x => x.reduce((p, q) => p + q, 0) / x.length, ma = m(a), mb = m(b); let n = 0, da = 0, db = 0; a.forEach((v, i) => { n += (v - ma) * (b[i] - mb); da += (v - ma) ** 2; db += (b[i] - mb) ** 2; }); return n / Math.sqrt(da * db); };
export const persistenceText = c => c.phi_hat == null ? null : `after removing the linear trend (${signed(c.phi_hat, 2)}; raw ${signed(lag1(c.regional.anomaly.filter(v => v != null)), 2)})`;

export function caseList(b) {
  return { title: "Case files", node: h("div", {},
    h("header", { class: "page-head" }, h("h1", { id: "page-title", tabindex: "-1" }, "Case files"),
      h("p", { class: "lede" }, "We examine specific trend claims for a stated measurement, place and period. Questions registered before each claim's data were downloaded, then tested with NASA data. The questions cannot be edited. The methods were amended and disclosed, and the final gate is frozen."), indexNote()),
    h("div", { class: "case-rows" }, b.claims.map(c => {
      const r = c.regional, iv = r.interval, u = U(r.units);
      return h("article", { class: "case-row", "aria-labelledby": "ct-" + c.id },
        h("div", { class: "locator" }, regionThumb(c.region.box, `Map showing where ${c.region.name} is; the box used is outlined.`)),
        h("div", {}, h("p", { class: "eyebrow brass" }, "Case " + caseNo(c.id)), h("h2", { id: "ct-" + c.id }, "“" + c.claim_text + ".”"),
          h("p", { class: "meta-line" }, `${cap(c.region.name)} · ${c.season.toLowerCase()}, ${range(c.period.start, c.period.end)} · ${datasetName(c)} · ${KIND[c.data_kind].split(",")[0]}`),
          h("p", { class: "finding-line" }, h("b", {}, c.verdict.branch === "withheld" ? "Withheld" : (c.verdict.scoped || c.verdict.label)), c.verdict.branch === "withheld" ? ": the evidence did not pass the court's own checks, so no verdict is given. " + WITHHELD_LINE : `: ${signed(r.sen.slope_per_decade, 2)} ${u} per decade${iv ? ` (nominal 95% interval ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)})` : ""}`)),
        h("a", { class: "btn", href: `#/case/${c.id}`, "aria-label": `Open case file ${caseNo(c.id)}` }, "Open case file"));
    }))) };
}

export function caseDocket(b, c, query = "") {
  let sel = c.ladder.length - 1, mode = "claimed", showOls = false;
  const ak = () => (mode === "any" ? "flagged_fraction_any" : "flagged_fraction_claimed"), ck = () => (mode === "any" ? "cell_frac_any" : "cell_frac_claimed"), nk = () => (mode === "any" ? "n_flagged_any" : "n_flagged_claimed");
  const L = c.ladder, v = c.verdict, f = c.finding, r = c.regional, u = U(r.units), t = r.test, iv = r.interval, nL = L.length;
  const withheld = v.branch === "withheld", th = c.thresholds || { breadth: 0.25, local: 0.05 };
  const finalQ = L[nL - 1];

  // ---------------------------------------------------------------- the ruling summary (final; the map selector never changes it)
  const why = withheld ? plainReason(c) : [t ? `The regional trend is ${t.p < (t.alpha || 0.05) ? "significant" : "not significant"} at ${t.alpha || 0.05} (p = ${fmtPx(t.p)}).` : "The regional test is not shown because it did not pass its calibration check.",
    c.gate.cells ? `${pct(finalQ.flagged_fraction_claimed, 1)} of the mapped area is flagged in the claimed direction after hearing ${nL}.` : null,
    v.id === "partly_supported" && c.id === "C-B" ? "Partly supported: the regional increase passes both regional tests (p = 0.030 and p = 0.004). The \"partly\" comes from the map, which flags a small share of the area, and a 25-season map has low power, so a small share does not mean a narrow change." : null,
    v.id === "not_supported" ? "Not supported means the record does not show the claimed change at the registered bar." + (c.conservative && c.conservative.length ? " The test is conservative for this record, so this is not evidence that the change did not happen." : " It is not proof that nothing changed.") : null].filter(Boolean).join(" ");
  // A round-3 rule change made after the results: show the round-2 numbers beside the current ones (round-2 numbers: data/round2_reference.json, matched to run.supersedes).
  const ruleNote = h("section", { class: "callout rule-change", role: "note", hidden: true, "aria-label": "Rule change after the results" });
  (async () => {
    try {
      const all = await fetch("data/round2_reference.json").then(r => (r.ok ? r.json() : null)), ref = all && all[c.id];
      if (!ref || !(c.supersedes || []).some(x => x.run_id === ref.run_id)) return;
      const area = f => `${(f * 100).toFixed(1)}%`;
      const link = h("a", { href: "#/data/registration" }, "Addendum 4");
      const lead = h("b", {}, "Rule change after the results. ");
      if (ref.verdict_id === "withheld") {
        ruleNote.append(lead, `Under the round 2 rules this case was withheld (run ${ref.run_id}). The round 3 rules, written after outside review and after the round 2 bundles had been seen, simulate negative persistence and match the noise shape to the record. Under them the court now gives a ruling: ${v.label.toLowerCase()}. Both runs stay on record. `, link, ".");
      } else if (ref.p != null && t && iv) {
        const before = ref.regional_test === "mk_independent" ? "plain Mann-Kendall, no correction" : (METHOD_NAME[ref.regional_test] || ref.regional_test);
        ruleNote.append(lead, `Round 2 rule (${before}): p ${fmtPx(ref.p)}, interval ${signed(ref.interval[0], 2)} to ${signed(ref.interval[1], 2)} ${u} per decade, ${area(ref.area_in_direction)} of the area flagged in the claimed direction. Round 3 rule, after outside review, now simulates negative persistence (${t.title}): p ${fmtPx(t.p)}, interval ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)}, ${area(finalQ.flagged_fraction_claimed)} flagged. The ruling is ${v.label.toLowerCase()} in both rounds. Read both p-values together: the round 2 test was already valid for this series, only cautious, so the change bought power, not validity. The round 2 numbers stay on record. `, link, ".");
      } else return;
      ruleNote.hidden = false;
    } catch (e) { /* the note is an addition; the ruling stands without it */ }
  })();
  const essential = withheld ? "The record and the map are shown below for reading. They are a description, not a basis for a verdict. The technical reasons are under Limits of this finding." :
    c.data_kind === "model_reanalysis" ? "This is model output, not a direct measurement, and a trend does not say why it changed." : (f.not_supported && f.not_supported[0]) || "A trend alone does not say why it changed or what comes next.";
  const text = () => [withheld ? "Withheld: the court cannot rule on this evidence. " + plainReason(c) + " " + WITHHELD_LINE : v.scoped, v.headline, ...v.sentences,
    `Claim: ${c.claim_text}. Scope: ${scopeText} Change: ${signed(r.sen.slope_per_decade, 2)} ${u} per decade (Sen slope); ${iv ? `${iv.label} ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)}` : "interval not shown: failed its coverage check"}.${calLines(c, withheld).length ? " " + calLines(c, withheld).join(". ") + "." : ""} Regional test: ${t ? `${t.title}, p = ${fmtPx(t.p)}, variance factor ${fac(t)}` : "not shown (it did not pass its calibration check)"}. Dataset: ${f.product.name}, version ${f.product.version}, DOI ${f.product.doi}. Run ${f.run_id}; ledger ${f.ledger_ref || "n/a"}.`,
    c.region.note || "", f.selection_disclosure || ""].filter(Boolean).join("\n");
  const sp = scopeParts(c, range), scopeText = `${sp.variable}; ${sp.where}; ${sp.years}; ${sp.src} (${datasetName(c)}). Cannot establish: ${sp.cannot}.`;
  const scopeEl = h("p", { class: "scope-line" }, h("b", {}, "Scope. "), `${sp.variable} · ${sp.where} · ${sp.years} · ${sp.src} (${datasetName(c)}). `, h("b", {}, "Cannot establish: "), sp.cannot + ".");
  const chipsEl = h("div", { class: "chips" }, h("span", { class: "chip" }, withheld ? "Withheld" : "Regional ruling: final"), c.synthetic ? h("span", { class: "chip warn" }, "Synthetic test case") : h("a", { class: "chip", href: "#/data/registration" }, "Question registered; methods amended"), kindChip(c.data_kind));
  const numEl = [h("p", { class: "est-label" }, "Registered case: Sen estimate"), h("p", { class: "verdict-num" }, signed(r.sen.slope_per_decade, 2), " ", h("small", {}, `${u} per decade (Sen slope${withheld ? ", descriptive only" : ""})`)),
    h("p", { class: "small muted", style: "margin:4px 0 0" }, "The Sen slope estimates the rate of change from the median slope between pairs of years."),
    iv ? h("p", { class: "verdict-iv" }, `Nominal 95% interval ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)} ${u} per decade`, h("span", { class: "small muted", style: "display:block" }, "95% is the method's stated level. The measured coverage in simulations is given below.")) : h("p", { class: "verdict-iv" }, withheld ? "No interval and no significance statement are given for this record." : "95% interval not shown: it failed its coverage check, so only the point estimate is given."),
    ...calLines(c, withheld).map(x => h("p", { class: "small muted cal-line", style: "margin:4px 0 0" }, x.charAt(0).toUpperCase() + x.slice(1) + "."))];
  const actionsEl = h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => ex.select("hearings", { scroll: true }) }, withheld ? "See the evidence by hearing" : "Explore the hearings"),
    copyButton("Copy finding", text, `finding_${c.id}.txt`));
  const notesEl = h("div", { class: "verdict-notes" },
    whoActs(c) ? h("p", { class: "verdict-who" }, h("b", {}, "Who acts on this? "), whoActs(c)) : null,
    h("p", { class: "verdict-caveat" }, h("b", {}, "Essential caveat. "), essential));
  // A withheld ruling reads in one fixed order: what the record shows, what the tool can conclude, why the distinction matters.
  const ruling = withheld
    ? h("section", { class: "surface verdict withheld", role: "status", "aria-labelledby": "ruling-h" },
      h("div", {}, h("p", { class: "eyebrow" }, "The ruling"), h("h2", { id: "ruling-h", class: "verdict-word" }, "Withheld"), h("p", { class: "verdict-scope" }, "The court cannot rule on this evidence."), scopeEl, chipsEl),
      h("div", { class: "verdict-step" }, h("p", { class: "eyebrow" }, "1. What the record shows"), numEl),
      h("div", { class: "verdict-step" }, h("p", { class: "eyebrow" }, "2. What the tool can conclude"), h("p", { class: "verdict-scope" }, why)),
      h("div", { class: "verdict-step" }, h("p", { class: "eyebrow" }, "3. Why the distinction matters"), h("p", { class: "verdict-scope withheld-line" }, WITHHELD_LINE), actionsEl),
      notesEl)
    : h("section", { class: "surface verdict", role: "status", "aria-labelledby": "ruling-h" },
      h("div", {}, h("p", { class: "eyebrow" }, "The ruling"), h("h2", { id: "ruling-h", class: "verdict-word" }, v.label), scopeEl, why ? h("p", { class: "verdict-scope" }, why) : null, chipsEl),
      h("div", {}, h("p", { class: "eyebrow" }, "Regional change"), numEl, actionsEl),
      notesEl);

  // ---------------------------------------------------------------- the exhibit area: one View selector, one mounted view at a time
  let anomYear, distPeriod, mapHost = null, infoHost = null;
  const jsonCache = {}, getJson = u => jsonCache[u] || (jsonCache[u] = fetch(u).then(r => { if (!r.ok) throw new Error("Could not load " + u); return r.json(); }));
  const cellsFrame = env => caseFrame({ region_box: c.region.box }, env.plotW);

  // View 1: the regional record
  function mountRecord(body) {
    const chartHost = h("div", { class: "ex-record" }), baselineNote = h("p", { class: "note", style: "margin:8px 0 0" });
    const drawChart = () => {
      chartHost.replaceChildren(seriesChart(c, { ols: showOls }).node);
      baselineNote.textContent = showOls ? `Baseline fit (least squares, shown for comparison): ${signed(r.ols.slope_per_decade, 2)} ${u} per decade, 95% range ${signed(r.ols.ci_lo, 2)} to ${signed(r.ols.ci_hi, 2)}.` : "";
    };
    const olsBox = h("input", { type: "checkbox", checked: showOls, onchange: e => { showOls = e.target.checked; drawChart(); } });
    body.append(h("p", { class: "chart-sub" }, `${cap(c.season.toLowerCase())}, one value per year, ${range(c.period.start, c.period.end)}. Difference from the series' own average (${r.baseline}).`),
      h("div", { class: "chart-tools" }, h("label", { class: "check" }, olsBox, "Compare baseline fit (least squares)")), chartHost, baselineNote);
    drawChart();
    return { destroy() {} };
  }

  // View 3: the map by hearing (same frame as "Values over time")
  const picker = h("fieldset", { class: "hearing-pick" }, h("legend", {}, "Choose a hearing"));
  const modeSeg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Count flagged cells" }, [["claimed", `Claimed direction (${c.direction})`], ["any", "Either direction"]].map(([k, l]) =>
    h("label", {}, h("input", { type: "radio", name: "mode", value: k, checked: mode === k, onchange: () => { mode = k; drawPicker(); drawMap(true); } }), h("span", {}, l))));
  function drawPicker() {
    picker.replaceChildren(h("legend", {}, "Choose a hearing"), ...L.map((q, i) => h("label", { class: "hp" },
      h("input", { type: "radio", name: "hearing", value: i, checked: i === sel, onchange: () => { sel = i; drawPicker(); drawMap(true); announceHearing(); const x = picker.querySelector(`input[value="${i}"]`); if (x) x.focus(); } }),
      h("span", { class: "hp-in" }, h("span", { class: "hp-n" }, `Hearing ${i + 1}`), h("span", { class: "hp-name" }, HEARING_SHORT[q.rung] || q.label), h("span", { class: "hp-pct num" }, pct(q[ak()], 1))))));
  }
  const announceHearing = () => { const q = L[sel]; announce(`Hearing ${sel + 1} of ${nL}. ${pct(q[ak()], 1)} of mapped area flagged. The regional ruling is unchanged.`); };

  // What each hearing changes, honest in both directions. Hearing 4 is a different question, not simply a tougher test.
  function hearingNote(q, i) { const n = hearingNote0(q, i); return n && q.threshold_text && q.rung !== 2 ? `${n} Rule used: ${q.threshold_text}.` : n; }
  function hearingNote0(q, i) {
    const prev = L[i - 1], alpha = c.alpha, name = c.cell_test_name || (t ? t.name : "the chosen correction");
    if (q.rung === 1) return `A cell is flagged when its raw Mann-Kendall p-value is below ${alpha}, treating every year as independent.`;
    if (q.rung === 2) return q.note;
    if (q.rung === 3) return `A cell is flagged when its autocorrelation-corrected p-value (${name}) is below ${alpha}. This step has no adjustment for testing many cells at once.` + (q.registered_hr && c.cell_test_key !== "hr_registered" ? ` Context: the Hamed-Rao version we registered first would flag ${q.registered_hr.cells} cells (${pct(q.registered_hr.area)} of the area).` : "");
    if (q.rung === 4 && prev) {
      const a = prev[nk()], z = q[nk()], d = z - a;
      return `Hearing 3 flags a cell when its corrected p-value is below ${alpha}. Hearing 4 applies the Benjamini-Hochberg false-discovery step at q = ${c.bh_q} to those same corrected p-values. It asks a different question: what share of the flagged cells would we expect to be false alarms? Because q = ${c.bh_q} is not the same cut as ${alpha}, this step can add flags as well as remove them. Here the count went from ${a} to ${z} cells (${d > 0 ? `${d} added` : d < 0 ? `${-d} removed` : "no change"}). It is not simply a tougher test.`;
    }
    return null;
  }
  let hearingView = null;
  function drawMap(fade) {
    if (!mapHost) return;
    const q = L[sel];
    const descriptive = !c.gate.cells && hasNote(c) && L.length > 0;   // NO2 pair: the map is shown for reading, labeled unadjusted and descriptive
    if (!c.gate.cells && !descriptive) { mapHost.replaceChildren(withheldNote(c)); infoHost.replaceChildren(); return; }
    const m = renderMap(c, q, { id: `map-${c.id}-${q.rung}`, label: `Map for hearing ${sel + 1} of ${nL}: ${q.label}`, view: hearingView });
    const note = hearingNote(q, sel);
    mapHost.replaceChildren(m.node);
    infoHost.replaceChildren(...[
      descriptive ? mapBanner(c) : null,
      h("div", { class: "measure" }, h("strong", { class: "num" }, pct(q[ak()], 1), " of mapped area flagged"),
        h("span", { class: "num" }, `${q[nk()]} of ${q.n_cells} cells (${pct(q[ck()], 1)})` + (q.cells_changed != null ? `; ${q.cells_changed} changed status from the previous hearing` : ""))),
      h("p", { class: "hearing-line" }, h("b", {}, q.label + ". "), q.changes),
      note ? h("details", { class: "quiet" }, h("summary", {}, "Why this count changed"), h("p", { class: "rung-note", style: "margin-top:8px" }, note)) : null,
      c.id === "C-B" ? h("p", { class: "callout map-mismatch", role: "note" }, h("b", {}, "Caution for this map. "), "The regional series has year-to-year memory near −0.67, but the middle cell is near −0.16 and about a fifth of cells are above zero. The cell test was checked at memories like the region's, so the map is partly outside the range it was checked at (details under the exploratory checks, below).") : null,
      h("p", { class: "small muted hearing-reuse" }, `The ${HEARING_WORD[nL] || nL} hearings reuse one dataset: they are ${HEARING_WORD[nL] || nL} ways to read the same data, not ${HEARING_WORD[nL] || nL} independent confirmations.`),
      h("p", { class: "map-null" }, "Not flagged means too little evidence, not no change." + (c.region.note ? " " + c.region.note : ""))].filter(Boolean));
    if (fade) { infoHost.classList.remove("ruling-fade"); void infoHost.offsetWidth; infoHost.classList.add("ruling-fade"); }
  }
  function mountHearings(body, env) {
    hearingView = cellsFrame(env);
    mapHost = h("div", { class: "viz-col-a", style: `width:${hearingView.W}px` }); infoHost = h("div", { class: "ex-info", "aria-live": "off" });
    body.append(h("div", { class: "viz-split" }, mapHost, h("div", { class: "viz-col-b" }, picker, modeSeg, infoHost)));
    drawPicker(); drawMap(false);
    return { destroy() { mapHost = null; infoHost = null; } };
  }

  // Views 2 and 4 (and 5 for C-A) are the visual modules: loaded on first use, disposed when another view is chosen.
  async function mountAnomaly(body, env) {
    const [mod, data] = await Promise.all([import("../viz/anomaly-map.js"), getJson(`data/viz/${c.id}.json`)]);
    return mod.render(body, data, { view: caseFrame(data, env.plotW), year: anomYear, onYear: i => { anomYear = i; } });
  }
  async function mountDistribution(body) {
    const [mod, data] = await Promise.all([import("../viz/distribution.js"), getJson(`data/viz/${c.id}.json`)]);
    const hnd = await mod.render(body, data, { year: distPeriod, onYear: i => { distPeriod = i; }, table: false });
    hnd.el.append(h("p", { class: "viz-note" }, "Numbers for every period: ", h("button", { class: "btn-text", type: "button", onclick: () => openStatistics() }, "Statistics")));
    return hnd;
  }

  async function mountWitness(body) {
    const [mod, data] = await Promise.all([import("../viz/witness.js"), getJson("data/witness/C-A.json")]);
    return mod.render(body, data);
  }
  // Second witness (C-A, C-B, C-C): a differently made record on the same axis. Exploratory; it never changes a ruling.
  const WIT2 = { "C-A": { file: "C-A_esa", ask: "Does a European multi-sensor satellite record agree with MODIS Terra, and where do they part?" },
    "C-B": { file: "C-B_knmi", ask: "Does a station-based rain-gauge record agree with the satellite rainfall?" },
    "C-C": { file: "C-C_knmi", ask: "Does a station-based temperature record agree with the reanalysis?" } }[c.id];
  async function mountWitness2(body) {
    const [mod, data, extra] = await Promise.all([import("../viz/witness2.js"), getJson(`data/witness/${WIT2.file}.json`), c.id === "C-A" ? getJson("data/witness/C-A_knmi.json").catch(() => null) : null]);
    return mod.render(body, data, { extra });
  }
  async function mountYearly3d(body) {
    const [mod, data] = await Promise.all([import("../viz/cycle.js"), getJson(`data/viz/${c.id}.json`)]);
    return mod.renderCycle(body, data, {});
  }
  const rulingNote = withheld ? "The regional ruling below is withheld. Changing the view changes what you see, never the ruling." : "The regional ruling below is final. Changing the view changes what you see, never the ruling.";
  const views = [
    { key: "record", label: "Regional record", title: "The regional record", ask: "What did the region's value do, year by year?", mount: mountRecord },
    { key: "anomaly", label: "Values over time", title: "Values over time", ask: "What changed, and when? Every grid cell, year by year, on one fixed color scale.", mount: mountAnomaly, frame: true },
    { key: "hearings", label: "Evidence by hearing", title: "Evidence by hearing", ask: withheld ? "Which cells pass each hearing? A description of the tests, not a basis for a verdict." : "Where do the tests flag evidence? Each hearing asks a different question of the same cells.", mount: mountHearings, frame: true },
    ...(WIT2 ? [{ key: "witness2", label: "Second witness", title: "Second witness", ask: WIT2.ask, mount: mountWitness2 }] : []),
    ...(c.id === "C-C" ? [{ key: "yearly3d", more: true, label: "Year by year (3D)", title: "Year by year (3D)", ask: "How did each month change over the years? Every month of every year, wound around the baseline; a descriptive view.", mount: mountYearly3d }] : []),
    ...(c.id === "C-A" ? [{ key: "witness", label: "Witness check: when did the satellite look?", title: "Witness check: when did the satellite look?", ask: "Did the satellite's observing time change, and did its readings follow?", mount: mountWitness }] : []),
    { key: "distribution", more: true, label: "Distribution", title: "Distribution", ask: "Is the whole distribution moving, or only the average? All cells and years in each period.", mount: mountDistribution },
  ];
  views.sort((a, b) => (a.key === "witness") - (b.key === "witness"));
  const wanted = new URLSearchParams(query).get("view");   // ?view=witness or ?view=witness2 opens that exhibit view; anything not in this docket's list is ignored
  const ex = exhibit({ views, initial: views.some(v => v.key === wanted) ? wanted : "record", rulingNote, tag: h("span", { class: "tag" }, withheld ? "Withheld" : "Regional ruling: final") });
  const openStatistics = () => { statistics.open = true; statistics.scrollIntoView({ block: "start", behavior: "smooth" }); };

  // ---------------------------------------------------------------- collapsible detail: Statistics, Limits of this finding, Provenance
  const stat = (k, val, sub) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v num" }, val), h("div", { class: "s" }, sub));
  const ctx = r.ctx || {};
  const ctxRows = [
    ctx.hr && t && t.method !== "hr_registered" ? `Registered Hamed-Rao version: p = ${fmtPx(ctx.hr.p)}, variance factor ${ctx.hr.factor != null ? ctx.hr.factor.toFixed(2) : "n/a"} (the first method we registered; replaced before results).` : null,
    ctx.raw ? `Raw Mann-Kendall, years treated as independent: p = ${fmtPx(ctx.raw.p)}.` : null,
  ].filter(Boolean);
  const distTable = h("div", { class: "dist-table" }, h("p", { class: "muted small" }, "Opens with this section."));
  const statistics = disc("Statistics",
    h("p", {}, h("b", {}, v.headline), " ", v.sentences.join(" ")),
    h("div", { class: "statgrid" },
      stat("Sen slope per decade", `${signed(r.sen.slope_per_decade, 2)} ${u}`, iv ? `${iv.label}: ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)}` : `Interval: ${NOT_SHOWN.toLowerCase()}`),
      t ? stat(t.title, `p = ${fmtPx(t.p)}`, t.p < (t.alpha || 0.05) ? `${sigLabel(t.p)}. A pattern this strong would be rare if there were no trend.` : `${sigLabel(t.p)}. This result is not significant under the stated test.`) : stat("Regional test", withheld ? "Withheld" : "Not shown", withheld ? (c.id === "C-E1" ? "No test was validated for this much year-to-year memory at 21 years, so no significance statement is made." : "No test kept its false-alarm rate near 5% on records like this one, so no significance statement is made.") : "It did not pass its calibration check, so no significance statement is made."),
      c.phi_hat != null ? stat("Persistence (lag-1)", signed(c.phi_hat, 2), `Year-to-year memory, ${persistenceText(c)}. ${c.phi_hat < -0.1 ? "Negative: a high year tends to be followed by a lower one." : c.phi_hat > 0.1 ? "Positive: a high year tends to be followed by another high one." : "Near zero: neighboring years barely resemble each other."}`) : null,
      t ? stat("Variance factor", fac(t), "Above 1.00 means neighboring years resemble each other, and the test widens to allow for it") : null),
    h("div", { class: "baseline" }, h("h3", {}, "Pooled distribution by period"),
      h("p", { class: "muted small" }, "Every grid cell in every year of each period, each against its own baseline, unweighted. One cell-year is one grid cell in one year, and every cell-year counts equally. It describes the data; it is not a test."),
      distTable, h("p", { style: "margin:8px 0 0" }, h("button", { class: "btn-text", type: "button", onclick: () => ex.select("distribution", { scroll: true }) }, "Inspect distribution"))),
    t ? h("p", { class: "small muted", style: "margin:12px 0 0" }, t.label + ". " + (t.method === "mk_independent" ? "No autocorrelation correction was chosen here: in our simulations, which include negative persistence, this test kept false alarms nearest 5% for series with year-to-year memory similar to this record's " + (persistenceText(c) || "") + ". " : /^boot_mk/.test(t.method) ? "The p-value comes from a moving-block bootstrap, which keeps the year-to-year memory of this record (" + (persistenceText(c) || "") + ") instead of assuming a correction. " : "p-values from series whose years resemble each other tend to be too small, which is why this correction is applied. ") + "The test was chosen by simulation on synthetic series, not by looking at this result.") : null,
    h("p", { class: "small muted" }, iv ? `${iv.label}. How often such intervals contain the true slope was measured on synthetic series; it is not a range for individual years. ${calLines(c, withheld).join(". ")}${calLines(c, withheld).length ? ". " : ""}` : `Interval: ${NOT_SHOWN} `, r.band_lo ? r.band_meaning : `Band: ${NOT_SHOWN}`),
    ctxRows.length ? h("div", { class: "baseline" }, h("h3", {}, "Context, not the ruling"), ctxRows.map(x => h("p", { class: "muted small", style: "margin:0 0 4px" }, x))) : null,
    h("div", { class: "baseline" }, h("h3", {}, "The familiar baseline: least squares and t-test"), h("p", { class: "muted small" }, "Context only. The ruling rests on the Sen slope and the regional test above."),
      h("p", { style: "margin:0" }, h("b", {}, `${signed(r.ols.slope_per_decade, 2)} ${u} per decade`), `, 95% range ${signed(r.ols.ci_lo, 2)} to ${signed(r.ols.ci_hi, 2)}; `, h("span", { class: "chip " + sigClass(r.ols.p) }, sigLabel(r.ols.p)), ` t = ${r.ols.t}, p = ${fmtPx(r.ols.p)}`)));

  let distLoaded = false;
  statistics.addEventListener("toggle", async () => {
    if (!statistics.open || distLoaded) return; distLoaded = true;
    try { const [mod, data] = await Promise.all([import("../viz/distribution.js"), getJson(`data/viz/${c.id}.json`)]); const hnd = await mod.render(h("div", {}), data, { tableOnly: true }); distTable.replaceChildren(hnd.el); }
    catch (e) { distLoaded = false; distTable.replaceChildren(h("p", { class: "muted small" }, "The table could not be loaded.")); }
  });
  const limits = disc("Limits of this finding",
    withheld ? h("p", {}, h("b", {}, "Why the ruling is withheld. "), (v.withheld_reasons && v.withheld_reasons.length ? v.withheld_reasons : c.gate.reasons).join(" "), " ", h("a", { href: "#/method" }, "How the checks work")) : withheldNote(c),
    hasNote(c) ? no2Limits(c) : null,
    moreLimits(c),
    c.gate.adaptive_notes && c.gate.adaptive_notes.length ? c.gate.adaptive_notes.map(x => h("p", { class: "muted small" }, h("b", {}, "Calibration note. "), x)) : null,
    !iv && !withheld && c.gate.reasons_interval && c.gate.reasons_interval.length ? h("p", { class: "muted small" }, h("b", {}, "Why no interval. "), c.gate.reasons_interval.join(" ")) : null,
    f.scope_text ? h("p", {}, h("b", {}, "What this number describes. "), f.scope_text) : null,
    f.not_supported ? [h("p", {}, h("b", {}, "What the evidence does not support")), h("ul", {}, f.not_supported.map(x => h("li", {}, x)))] : null,
    c.conservative && c.conservative.length ? h("p", {}, h("b", {}, "The test is conservative here. "), c.conservative.join(" ")) : null,
    withheld ? null : h("p", {}, h("b", {}, "How to read the ruling. "), `The map and the regional series come from the same data, so they are not independent evidence. The ${pct(th.breadth, 0)} and ${pct(th.local, 0)} area thresholds that separate "supported" from "partly supported" are conventions we chose before seeing results, not a calibrated scale. Flagged-area percentages are shares of the tested area, not the chance that the claim is true. "Partly supported" can mean that the regional average changed significantly while few cells did: it combines two questions, whether the average moved and how widespread the change is across the map. A small flagged share is also limited by what a map this size can see: at 25 seasons it finds only a small fraction of the cells that truly change, so it is not evidence that the change is narrow.`),
    h("p", {}, h("b", {}, "Values over time. "), "Each square is one grid cell against its own baseline, with no smoothing in space. Colors blend between years only while the animation plays."),
    h("p", {}, h("b", {}, "Distribution. "), "This view pools every cell in every year of a 10-year period (the last period can be shorter), unweighted, so its mean differs from the area-weighted regional record. Neighboring cells and years are correlated, so these curves describe the data and are not independent observations. A small share of extreme values can fall outside the drawn range (the figure says how many). None of these views is a test, and none changes the ruling."),
    c.id === "C-A" ? h("p", {}, h("b", {}, "Changing observation time may affect the record. "), "Terra's daytime overpass has been getting earlier since NASA stopped adjusting its orbit in 2020 (", h("a", { href: "https://science.nasa.gov/science-research/earth-science/terra-the-end-of-an-era/", target: "_blank", rel: "noopener" }, "NASA Science, 2025"), "), so its readings now come from earlier in the morning. The Witness check finds that the satellite's daytime readings track overpass time closely (the correlation is given there), which is consistent with an earlier pass reading cooler. It does not show that the drift caused the ruling. The registered reason this claim is withheld is failed calibration under year-to-year dependence, and the Witness check is exploratory, not the registered test.") : null,
    c.id === "C-D" ? h("p", {}, h("b", {}, "Changing observation time may affect the record. "), "Aqua's orbit has drifted to later afternoon overpasses since 2021 (", h("a", { href: "https://nsidc.org/data/user-resources/data-announcements/ongoing-changes-terra-and-aqua-orbits-impacting-modis-snow-and-sea-ice-products", target: "_blank", rel: "noopener" }, "NSIDC, 2021"), "). We did not test what this does to the snow record, so it is context, not a finding.") : null,
    h("p", {}, h("b", {}, "Cell share and area share. "), "The cell share counts every grid cell once. The area share weights each cell by the cosine of its latitude, because cells near the pole cover less ground. Neither is the chance that the claim is true, and neither says which single cell is right."),
    h("p", {}, h("b", {}, "An honest null belongs here. "), "Not flagged means too little evidence, not no change. A result that is not significant is still a finding and can be reported."),
    f.selection_disclosure ? h("p", {}, h("b", {}, "Selection disclosure. "), f.selection_disclosure, " ", h("a", { href: "#/data/registration" }, "Registration and amendments")) : null);

  const field = (k, ...kids) => [h("dt", {}, k), h("dd", {}, ...kids)];
  const provenance = disc("Provenance",
    h("dl", { class: "fields" },
      field("Place", f.place, c.region.note ? h("span", { class: "muted", style: "display:block" }, c.region.note) : null, h("span", { class: "muted", style: "display:block" }, boxStr(c.region.box))),
      field("Variable", f.variable), field("Period", f.period),
      field("NASA product", `${f.product.name}, version ${f.product.version}, DOI ${f.product.doi}`),
      field("Run ID", h("span", { class: "mono" }, f.run_id)), field("Ledger reference", f.ledger_ref ? h("span", { class: "mono" }, f.ledger_ref) : NA())),
    h("h3", { style: "margin-top:16px" }, "Evidence checklist"),
    h("ul", { class: "ticks" }, v.checklist.map(i => h("li", { class: i.ok ? "yes" : "no" }, h("span", { class: "mark", "aria-hidden": "true" }, i.ok ? "✓" : "–"), h("span", {}, i.text, i.link ? [" ", h("a", { href: i.link[0].replace("#/method/registration", "#/data/registration") }, i.link[1])] : null, h("span", { class: "sr-only" }, i.ok ? " (yes)" : " (no)"))))),
    h("p", { style: "margin-top:16px" }, h("a", { class: "btn-text", href: `#/data/${c.id}` }, "Files and reproduction steps for this case")));

  return { title: `Case ${c.id}`, node: h("div", { class: "case-page" },
    h("p", { class: "crumb" }, h("a", { href: "#/cases" }, "Case files"), " / ", caseNo(c.id)),
    h("header", { class: "case-head" },
      h("p", { class: "eyebrow brass" }, "Case " + caseNo(c.id) + " · the registered claim"), h("h1", { id: "page-title", tabindex: "-1" }, "“" + c.claim_text + "”"),
      h("p", { class: "definition" }, h("b", {}, c.variable.name.replace(/^[A-Za-z0-9]+ \((.*)\)$/, (m, x) => cap(x)) + ": "), c.variable.plain)),
    ex.node, ruling, hasNote(c) ? whyBlock(c) : null, ruleNote, briefLimits(c), exploratoryPanel(c),
    (() => { const slot = clinicSlot(c.id), strip = clinicStrip(c); if (strip) slot.append(strip); return slot; })(),
    h("div", { class: "docket-more" }, statistics, limits, provenance)),
    afterMount: () => ex.start(), dispose: () => ex.dispose() };
}
