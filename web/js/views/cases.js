// Case files. Index: one compact row per registered case. Docket: claim, then the ruling summary, then the regional record (Exhibit A),
// then the map by hearing (Exhibit B), then collapsible Statistics, Limits and Provenance.
// Every number about the regional test, interval and band comes from c.regional.test / .interval / band_lo (see data.js pickRegional): the SHIPPED test and SELECTED interval.
import { h, pct, signed, fmtNum, fmtPx, boxStr, announce, U, range } from "../util.js";
import { renderMap } from "../map.js";
import { seriesChart } from "../chart.js";
import { KIND, withheldNote, regionThumb, copyButton, clinicSlot, disc, datasetName, kindChip } from "./common.js";
import { sigClass, sigLabel } from "../words.js";

const NA = () => h("span", { class: "muted" }, "Not in this bundle yet.");
const NOT_SHOWN = "Not shown: failed its coverage check.";
const caseNo = id => id.replace("-", "–");
const fac = t => (t && t.factor != null ? t.factor.toFixed(2) : "n/a");
const cap = s_ => s_.charAt(0).toUpperCase() + s_.slice(1);
const HEARING_SHORT = { 1: "Raw test", 2: "Seasonal cycle", 3: "Memory correction", 4: "False discovery" };
// A withheld case is a deliberate outcome, explained in plain words. The bundle's technical reasons stay in "Limits of this finding".
function plainReason(c) {
  const why = ((c.verdict.withheld_reasons && c.verdict.withheld_reasons.length ? c.verdict.withheld_reasons : c.gate.reasons) || []).join(" ").toLowerCase();
  const lead = /skew|lopsided/.test(why) ? "This record is strongly lopsided: a few extreme years pull on its average, and in our simulations every significance test raised false alarms too often on records shaped like it."
    : /persist|false-positive/.test(why) ? "Neighbouring years in this record resemble each other strongly, and in our simulations no significance test kept its false-alarm rate near 5% on records like it."
    : "The checks that a verdict depends on did not pass for this record.";
  return lead + " A ruling here would not be honest, so we withhold it.";
}
const scopeLine = c => [cap(c.region.name), c.season.toLowerCase(), range(c.period.start, c.period.end), datasetName(c)].join(" · ");

export function caseList(b) {
  return { title: "Case files", node: h("div", {},
    h("header", { class: "page-head" }, h("h1", { id: "page-title", tabindex: "-1" }, "Case files"),
      h("p", { class: "lede" }, "Claims we registered before looking at any data, then tested on NASA data. You cannot edit them, which is what makes them a fair test.")),
    h("div", { class: "case-rows" }, b.claims.map(c => {
      const r = c.regional, iv = r.interval, u = U(r.units);
      return h("article", { class: "case-row", "aria-labelledby": "ct-" + c.id },
        h("div", { class: "locator" }, regionThumb(c.region.box, `Map showing where ${c.region.name} is; the box used is outlined.`)),
        h("div", {}, h("p", { class: "eyebrow brass" }, "Case " + caseNo(c.id)), h("h2", { id: "ct-" + c.id }, "“" + c.claim_text + ".”"),
          h("p", { class: "meta-line" }, `${cap(c.region.name)} · ${c.season.toLowerCase()}, ${range(c.period.start, c.period.end)} · ${datasetName(c)} · ${KIND[c.data_kind].split(",")[0]}`),
          h("p", { class: "finding-line" }, h("b", {}, c.verdict.branch === "withheld" ? "Ruling withheld" : c.verdict.label), c.verdict.branch === "withheld" ? ": the evidence did not pass the court's own checks, so no verdict is given." : `: ${signed(r.sen.slope_per_decade, 2)} ${u} per decade${iv ? ` (95% interval ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)})` : ""}`)),
        h("a", { class: "btn", href: `#/case/${c.id}`, "aria-label": `Open docket ${caseNo(c.id)}` }, "Open docket"));
    }))) };
}

export function caseDocket(b, c) {
  let sel = c.ladder.length - 1, mode = "claimed", showOls = false;
  const ak = () => (mode === "any" ? "flagged_fraction_any" : "flagged_fraction_claimed"), ck = () => (mode === "any" ? "cell_frac_any" : "cell_frac_claimed"), nk = () => (mode === "any" ? "n_flagged_any" : "n_flagged_claimed");
  const L = c.ladder, v = c.verdict, f = c.finding, r = c.regional, u = U(r.units), t = r.test, iv = r.interval, nL = L.length;
  const withheld = v.branch === "withheld", th = c.thresholds || { breadth: 0.25, local: 0.05 };
  const finalQ = L[nL - 1];

  // ---------------------------------------------------------------- the ruling summary (final; the map selector never changes it)
  const why = withheld ? plainReason(c) : [t ? `The regional trend is ${t.p < (t.alpha || 0.05) ? "significant" : "not significant"} at ${t.alpha || 0.05} (p = ${fmtPx(t.p)}).` : "The regional test is not shown because it did not pass its calibration check.",
    c.gate.cells ? `${pct(finalQ.flagged_fraction_claimed, 1)} of the mapped area is flagged in the claimed direction after hearing ${nL}.` : null].filter(Boolean).join(" ");
  const essential = withheld ? "The record and the map are shown below for reading. They are a description, not a basis for a verdict. The technical reasons are under Limits of this finding." :
    c.data_kind === "model_reanalysis" ? "This is model output, not a direct measurement, and a trend does not say why it changed." : (f.not_supported && f.not_supported[0]) || "A trend alone does not say why it changed or what comes next.";
  const text = () => [withheld ? "The court cannot rule on this evidence (ruling withheld). " + plainReason(c) : v.scoped, v.headline, ...v.sentences,
    `Claim: ${c.claim_text}. Scope: ${scopeLine(c)}. Change: ${signed(r.sen.slope_per_decade, 2)} ${u} per decade (Sen slope); ${iv ? `${iv.label} ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)}` : "interval not shown: failed its coverage check"}. Regional test: ${t ? `${t.title}, p = ${fmtPx(t.p)}, variance factor ${fac(t)}` : "not shown (it did not pass its calibration check)"}. Dataset: ${f.product.name}, version ${f.product.version}, DOI ${f.product.doi}. Run ${f.run_id}; ledger ${f.ledger_ref || "n/a"}.`,
    c.region.note || "", f.selection_disclosure || ""].filter(Boolean).join("\n");
  const ruling = h("section", { class: "surface verdict" + (withheld ? " withheld" : ""), role: "status", "aria-labelledby": "ruling-h" },
    h("div", {}, h("p", { class: "eyebrow" }, "The ruling"), h("h2", { id: "ruling-h", class: "verdict-word" }, withheld ? "The court cannot rule on this evidence" : v.label),
      h("p", { class: "verdict-scope" }, scopeLine(c)),
      why ? h("p", { class: "verdict-scope" }, why) : null,
      h("div", { class: "chips" }, h("span", { class: "chip" }, withheld ? "Ruling withheld" : "Regional ruling: final"), c.synthetic ? h("span", { class: "chip warn" }, "Synthetic test case") : h("a", { class: "chip", href: "#/data/registration" }, "Question registered; methods amended"), kindChip(c.data_kind))),
    h("div", {}, h("p", { class: "eyebrow" }, withheld ? "What the record shows" : "Regional change"), h("p", { class: "verdict-num" }, signed(r.sen.slope_per_decade, 2), " ", h("small", {}, `${u} per decade (Sen slope${withheld ? ", descriptive only" : ""})`)),
      iv ? h("p", { class: "verdict-iv" }, `95% interval ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)} ${u} per decade`) : h("p", { class: "verdict-iv" }, withheld ? "No interval and no significance statement are given for this record." : "95% interval not shown: it failed its coverage check, so only the point estimate is given."),
      h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => { const x = document.getElementById("exhibit-map"); if (x) { x.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); x.focus({ preventScroll: true }); } } }, withheld ? "See the map by hearing" : "Explore the hearings"),
        copyButton("Copy finding", text, `finding_${c.id}.txt`))),
    h("p", { class: "verdict-caveat" }, h("b", {}, "Essential caveat. "), essential));

  // ---------------------------------------------------------------- Exhibit A: the regional record
  const chartHost = h("div", {});
  const baselineNote = h("p", { class: "note", style: "margin:8px 0 0" });
  function drawChart() {
    chartHost.replaceChildren(seriesChart(c, { ols: showOls }).node);
    baselineNote.textContent = showOls ? `Baseline fit (least squares, shown for comparison): ${signed(r.ols.slope_per_decade, 2)} ${u} per decade, 95% range ${signed(r.ols.ci_lo, 2)} to ${signed(r.ols.ci_hi, 2)}.` : "";
  }
  const olsBox = h("input", { type: "checkbox", onchange: e => { showOls = e.target.checked; drawChart(); } });
  const exRecord = h("section", { class: "surface rec", "aria-labelledby": "exa-h" },
    h("div", { class: "exhibit-head" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit A"), h("h2", { id: "exa-h" }, "The regional record")), h("span", { class: "tag" }, withheld ? "Ruling withheld" : "Regional ruling: final")),
    h("p", { class: "chart-sub" }, `${cap(c.season.toLowerCase())}, one value per year, ${range(c.period.start, c.period.end)}. Difference from the series' own average (${r.baseline}).`),
    h("div", { class: "chart-tools" }, h("label", { class: "check" }, olsBox, "Compare baseline fit (least squares)")),
    chartHost, baselineNote);

  // ---------------------------------------------------------------- Exhibit B: the map, by hearing
  const mapBody = h("div", { "aria-live": "off" });
  const picker = h("fieldset", { class: "hearing-pick" }, h("legend", {}, "Choose a hearing"));
  const modeSeg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Count flagged cells" }, [["claimed", `Claimed direction (${c.direction})`], ["any", "Either direction"]].map(([k, l]) =>
    h("label", {}, h("input", { type: "radio", name: "mode", value: k, checked: mode === k, onchange: () => { mode = k; drawPicker(); drawMap(true); } }), h("span", {}, l))));
  const mapTag = h("span", { class: "tag" });
  function drawPicker() {
    picker.replaceChildren(h("legend", {}, "Choose a hearing"), ...L.map((q, i) => h("label", { class: "hp" },
      h("input", { type: "radio", name: "hearing", value: i, checked: i === sel, onchange: () => { sel = i; drawPicker(); drawMap(true); announceHearing(); const x = picker.querySelector(`input[value="${i}"]`); if (x) x.focus(); } }),
      h("span", { class: "hp-in" }, h("span", { class: "hp-n" }, `Hearing ${i + 1}`), h("span", { class: "hp-name" }, HEARING_SHORT[q.rung] || q.label), h("span", { class: "hp-pct num" }, pct(q[ak()], 1))))));
  }
  const announceHearing = () => { const q = L[sel]; announce(`Map: hearing ${sel + 1} of ${nL}. ${pct(q[ak()], 1)} of mapped area flagged. The regional ruling is unchanged.`); };

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
  function drawMap(fade) {
    const q = L[sel], h0 = mapBody.offsetHeight;
    mapTag.textContent = `Map: hearing ${sel + 1} of ${nL}`;
    if (!c.gate.cells) { mapBody.replaceChildren(withheldNote(c)); return; }
    const m = renderMap(c, q, { id: `map-${c.id}-${q.rung}`, label: `Map for hearing ${sel + 1} of ${nL}: ${q.label}` });
    const note = hearingNote(q, sel);
    if (h0) mapBody.style.minHeight = h0 + "px";
    mapBody.replaceChildren(...[
      h("div", { class: "measure" }, h("strong", { class: "num" }, pct(q[ak()], 1), " of mapped area flagged"),
        h("span", { class: "num" }, `${q[nk()]} of ${q.n_cells} cells (${pct(q[ck()], 1)})` + (q.cells_changed != null ? `; ${q.cells_changed} changed status from the previous hearing` : ""))),
      h("p", { class: "hearing-line" }, h("b", {}, q.label + ". "), q.changes),
      note ? h("details", { class: "quiet" }, h("summary", {}, "Why this count changed"), h("p", { class: "rung-note", style: "margin-top:8px" }, note)) : null,
      h("div", { style: "margin-top:16px" }, m.node),
      h("p", { class: "map-null" }, "Not flagged means too little evidence, not no change." + (c.region.note ? " " + c.region.note : ""))].filter(Boolean));
    if (fade) { mapBody.classList.remove("ruling-fade"); void mapBody.offsetWidth; mapBody.classList.add("ruling-fade"); }
    setTimeout(() => { mapBody.style.minHeight = ""; }, 220);
  }
  const exMap = h("section", { class: "surface map-ex", id: "exhibit-map", tabindex: "-1", "aria-labelledby": "exb-h" },
    h("div", { class: "exhibit-head" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit B"), h("h2", { id: "exb-h" }, "The map, by hearing")), mapTag),
    h("p", { class: "map-scope" }, withheld ? "Choosing a hearing changes this map only. The regional ruling is withheld, so the map describes which cells pass each hearing and is not a basis for a verdict." : "Choosing a hearing changes this map only. The regional ruling above is final."),
    picker, modeSeg, mapBody);

  // ---------------------------------------------------------------- collapsible detail: Statistics, Limits of this finding, Provenance
  const stat = (k, val, sub) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v num" }, val), h("div", { class: "s" }, sub));
  const ctx = r.ctx || {};
  const ctxRows = [
    ctx.hr && t && t.method !== "hr_registered" ? `Registered Hamed-Rao version: p = ${fmtPx(ctx.hr.p)}, variance factor ${ctx.hr.factor != null ? ctx.hr.factor.toFixed(2) : "n/a"} (the first method we registered; replaced before results).` : null,
    ctx.raw ? `Raw Mann-Kendall, years treated as independent: p = ${fmtPx(ctx.raw.p)}.` : null,
  ].filter(Boolean);
  const statistics = disc("Statistics",
    h("p", {}, h("b", {}, v.headline), " ", v.sentences.join(" ")),
    h("div", { class: "statgrid" },
      stat("Sen slope per decade", `${signed(r.sen.slope_per_decade, 2)} ${u}`, iv ? `${iv.label}: ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)}` : `95% interval: ${NOT_SHOWN.toLowerCase()}`),
      t ? stat(t.title, `p = ${fmtPx(t.p)}`, `${sigLabel(t.p)}. A pattern this strong would be rare if there were no trend.`) : stat("Regional test", withheld ? "Withheld" : "Not shown", withheld ? "No test kept its false-alarm rate near 5% on records like this one, so no significance statement is made." : "It did not pass its calibration check, so no significance statement is made."),
      t ? stat("Variance factor", fac(t), "Above 1.00 means neighbouring years resemble each other, and the test widens to allow for it") : null),
    t ? h("p", { class: "small muted", style: "margin:12px 0 0" }, t.label + ". " + (t.method === "mk_independent" ? "No autocorrelation correction was chosen here: simulations on synthetic series with this series' persistence showed this test keeps false alarms near 5%. " : "p-values from series whose years resemble each other tend to be too small, which is why this correction is applied. ") + "The test was chosen by simulation on synthetic series, not by looking at this result.") : null,
    h("p", { class: "small muted" }, iv ? `${iv.label}. How often such intervals contain the true slope was measured on synthetic series. It is not a range for individual years. ` : `Interval: ${NOT_SHOWN} `, r.band_lo ? r.band_meaning : `Band: ${NOT_SHOWN}`),
    ctxRows.length ? h("div", { class: "baseline" }, h("h3", {}, "Context, not the ruling"), ctxRows.map(x => h("p", { class: "muted small", style: "margin:0 0 4px" }, x))) : null,
    h("div", { class: "baseline" }, h("h3", {}, "The familiar baseline: least squares and t-test"), h("p", { class: "muted small" }, "Context only. The ruling rests on the Sen slope and the regional test above."),
      h("p", { style: "margin:0" }, h("b", {}, `${signed(r.ols.slope_per_decade, 2)} ${u} per decade`), `, 95% range ${signed(r.ols.ci_lo, 2)} to ${signed(r.ols.ci_hi, 2)}; `, h("span", { class: "chip " + sigClass(r.ols.p) }, sigLabel(r.ols.p)), ` t = ${r.ols.t}, p = ${fmtPx(r.ols.p)}`)));

  const limits = disc("Limits of this finding",
    withheld ? h("p", {}, h("b", {}, "Why the ruling is withheld. "), (v.withheld_reasons && v.withheld_reasons.length ? v.withheld_reasons : c.gate.reasons).join(" "), " ", h("a", { href: "#/method" }, "How the checks work")) : withheldNote(c),
    c.gate.adaptive_notes && c.gate.adaptive_notes.length ? c.gate.adaptive_notes.map(x => h("p", { class: "muted small" }, h("b", {}, "Calibration note. "), x)) : null,
    !iv && !withheld && c.gate.reasons_interval && c.gate.reasons_interval.length ? h("p", { class: "muted small" }, h("b", {}, "Why no interval. "), c.gate.reasons_interval.join(" ")) : null,
    f.scope_text ? h("p", {}, h("b", {}, "This number is for. "), f.scope_text) : null,
    f.not_supported ? [h("p", {}, h("b", {}, "What the evidence does not support")), h("ul", {}, f.not_supported.map(x => h("li", {}, x)))] : null,
    withheld ? null : h("p", {}, h("b", {}, "How to read the ruling. "), `The map and the regional series come from the same data, so they are not independent evidence. The ${pct(th.breadth, 0)} and ${pct(th.local, 0)} area thresholds that separate "supported" from "partly supported" are conventions we chose before seeing results, not a calibrated scale.`),
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

  drawPicker(); drawMap(false); drawChart();
  return { title: `Case ${c.id}`, node: h("div", { class: "case-page" },
    h("p", { class: "crumb" }, h("a", { href: "#/cases" }, "Case files"), " / ", caseNo(c.id)),
    h("header", { class: "case-head" },
      h("p", { class: "eyebrow brass" }, "Case " + caseNo(c.id) + " · the registered claim"), h("h1", { id: "page-title", tabindex: "-1" }, "“" + c.claim_text + "”"),
      h("p", { class: "definition" }, h("b", {}, c.variable.name + ": "), c.variable.plain)),
    clinicSlot(c.id), ruling,
    h("div", { class: "docket-grid" }, exRecord, exMap, h("div", { class: "docket-more" }, statistics, limits, provenance))) };
}
