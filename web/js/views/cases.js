// Case files: one docket page per registered claim. Order of hearings (the ladder), Exhibit A (map), Exhibit B (regional record), the ruling.
// Every number about the regional test, interval and band comes from c.regional.test / .interval / band_lo (see data.js pickRegional): the SHIPPED test and SELECTED interval.
import { h, s, pct, signed, fmtP, fmtPx, boxStr, download } from "../util.js";
import { renderMap, legend } from "../map.js";
import { seriesChart } from "../chart.js";
import { KIND, tone, withheldNote, regionThumb, gavelIcon, honestNull } from "./common.js";
import { sigClass, sigLabel } from "../words.js";

const NA = () => h("span", { class: "muted" }, "Not in this bundle yet.");
const NOT_SHOWN = "Not shown: failed its coverage check.";
const caseNo = id => id.replace("-", "–");
const fac = t => (t && t.factor != null ? t.factor.toFixed(2) : "n/a");

export function caseList(b) {
  return { title: "Case files", node: h("div", {},
    h("p", { class: "crumb" }, h("a", { href: "#/" }, "Home"), " / Case files"),
    h("h1", { id: "page-title", tabindex: "-1" }, "Case files"),
    h("p", { class: "lede" }, "Claims we registered before looking at any data, then tested on NASA data with the four-hearing ladder and a map of every grid cell. You cannot edit these. That is what makes them a fair test."),
    h("div", { class: "grid cases-grid", style: "margin-top:20px" }, b.claims.map(c => h("article", { class: "panel case-card" },
      regionThumb(c.region.box, `Map showing where ${c.region.name} is; the box used is outlined.`),
      h("p", { class: "eyebrow brass", style: "margin-top:12px" }, "Case " + caseNo(c.id)), h("h2", { style: "font-size:1.2rem" }, "“" + c.claim_text + ".”"),
      h("p", { class: "muted small" }, `${c.region.name} · ${c.season}, ${c.period.start} to ${c.period.end} · ${KIND[c.data_kind]}`),
      h("div", { class: "flow-nav" }, h("a", { class: "btn", href: `#/case/${c.id}` }, "Open the docket"))))),
    h("p", { class: "muted small", style: "margin-top:16px" }, "More cases are being processed and will appear here once their data bundle is ready.")) };
}

export function caseDocket(b, c) {
  let sel = c.ladder.length - 1, mode = "claimed";
  const ak = () => (mode === "any" ? "flagged_fraction_any" : "flagged_fraction_claimed"), ck = () => (mode === "any" ? "cell_frac_any" : "cell_frac_claimed"), nk = () => (mode === "any" ? "n_flagged_any" : "n_flagged_claimed");
  const L = c.ladder, v = c.verdict, f = c.finding, r = c.regional, u = r.units, t = r.test, iv = r.interval;
  const rail = h("aside", { class: "hearings", "aria-labelledby": "hearings-h" });
  const exA = h("section", { class: "panel exh-a", "aria-labelledby": "exa-h" });

  function drawRail() {
    const list = h("ol", { class: "hearing-list" }, L.map((q, i) => {
      const prev = L[i - 1], d = prev ? q[nk()] - prev[nk()] : 0;
      const delta = !prev ? "baseline" : d === 0 ? "no change" : `${d > 0 ? "+" : "−"}${Math.abs(d)} cells ${d > 0 ? "↑" : "↓"}`;
      const status = i === sel ? "● On the bench" : "✓ Heard";
      return h("li", {}, h("button", { type: "button", class: "hearing", "aria-current": i === sel ? "step" : null, onclick: () => { sel = i; drawRail(); drawA(); const bt = rail.querySelectorAll("button.hearing")[i]; if (bt) bt.focus(); } },
        h("span", { class: "hearing-top" }, h("span", {}, "Rung " + q.rung), h("span", { class: "status" }, status)),
        h("h3", {}, q.label), h("p", { class: "explain" }, q.changes),
        h("span", { class: "hearing-result" }, h("strong", {}, pct(q[ck()], 1)), h("span", { class: "mini-bar", "aria-hidden": "true" }, h("i", { style: `width:${Math.min(100, q[ck()] * 100)}%` })), h("span", { class: "delta" }, delta)),
        h("span", { class: "hearing-sub" }, `${q[nk()]} of ${q.n_cells} cells; ${pct(q[ak()], 1)} of the area`)));
    }));
    rail.replaceChildren(h("div", { class: "hearings-head" }, h("p", { class: "eyebrow" }, "Four steps, one change each"), h("h2", { id: "hearings-h" }, "Order of hearings")), list,
      h("p", { class: "hearing-note" }, "Big number: share of grid cells flagged. Beneath it: the same flags as a share of the area, weighted by latitude. Each step can raise, lower or leave the count unchanged, and we show whichever happens."));
  }

  // What each rung changes, honest in both directions. Rung 4 is a different question, not simply a tougher test.
  function rungNote(q, i) {
    const prev = L[i - 1], alpha = c.alpha, name = c.cell_test_name || (t ? t.name : "the chosen correction");
    if (q.rung === 1) return `A cell is flagged when its raw Mann-Kendall p-value is below ${alpha}, treating every year as independent.`;
    if (q.rung === 2) return q.note;
    if (q.rung === 3) return `A cell is flagged when its autocorrelation-corrected p-value (${name}) is below ${alpha}. This step has no adjustment for testing many cells at once.` + (q.registered_hr && c.cell_test_key !== "hr_registered" ? ` Context: the Hamed-Rao version we registered first would flag ${q.registered_hr.cells} cells (${pct(q.registered_hr.area)} of the area).` : "");
    if (q.rung === 4 && prev) {
      const a = prev[nk()], z = q[nk()], d = z - a;
      return `Rung 3 flags a cell when its corrected p-value is below ${alpha}. Rung 4 instead applies the Benjamini-Hochberg false-discovery step at q = ${c.bh_q} to those same corrected p-values. It asks a different question: what share of the flagged cells would we expect to be false alarms? Because q = ${c.bh_q} is not the same cut as ${alpha}, this step can add flags as well as remove them. Here the count went from ${a} to ${z} cells (${d > 0 ? `${d} added` : d < 0 ? `${-d} removed` : "no change"}). It is not simply a tougher test.`;
    }
    return null;
  }

  function drawA() {
    const q = L[sel];
    if (!c.gate.cells) { exA.replaceChildren(h("div", { class: "exhibit-header" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit A"), h("h2", { id: "exa-h" }, "The cell-by-cell evidence"))), withheldNote(c)); return; }
    const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Count flagged cells" }, [["claimed", `Claimed direction (${c.direction})`], ["any", "Either direction"]].map(([k, l]) =>
      h("label", {}, h("input", { type: "radio", name: "mode", value: k, checked: mode === k, onchange: () => { mode = k; drawRail(); drawA(); const x = exA.querySelector(`input[value="${k}"]`); if (x) x.focus(); } }), h("span", {}, l))));
    const m = renderMap(c, q, { id: `map-${c.id}-${q.rung}` });
    const note = rungNote(q, sel);
    exA.replaceChildren(
      h("div", { class: "exhibit-header" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit A"), h("h2", { id: "exa-h" }, "The cell-by-cell evidence")), h("span", { class: "tag" }, `Rung ${q.rung} of ${L.length}: ${q.label}`)),
      h("div", { class: "map-summary" }, h("span", {}, `${q[nk()]} of ${q.n_cells} cells (${pct(q[ck()])}); ${pct(q[ak()])} of the area, weighted by latitude` + (q.cells_changed != null ? `; ${q.cells_changed} changed status from the previous rung` : "")), h("strong", {}, pct(q[ck()]), " ", h("span", {}, "of cells flagged"))),
      ...(note ? [h("p", { class: "rung-note" }, note)] : []), seg, h("div", { style: "margin-top:12px" }, m.node), legend(),
      ...(c.region.note ? [h("p", { class: "muted small", style: "margin:10px 0 0" }, h("b", {}, "About this region. "), c.region.note)] : []),
      h("p", { class: "muted small", style: "margin:10px 0 0" }, "Cells are drawn at their true latitude and longitude. The cell share counts every grid cell once. The area share weights each cell by the cosine of its latitude, because cells near the pole cover less ground. Neither is the chance that the claim is true, and neither says which single cell is right."));
  }

  const chart = seriesChart(c);
  const ivLine = iv ? `Sen slope ${signed(r.sen.slope_per_decade, 2)} ${u} per decade; ${iv.label} ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)}` : `Sen slope ${signed(r.sen.slope_per_decade, 2)} ${u} per decade; 95% interval ${NOT_SHOWN.toLowerCase()}`;
  const exB = h("section", { class: "panel exh-b", "aria-labelledby": "exb-h" },
    h("div", { class: "exhibit-header" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit B"), h("h2", { id: "exb-h" }, "The regional record")), h("span", { class: "tag" }, "One value per year")),
    h("p", { class: "muted small", style: "margin:0 0 8px" }, `Area-weighted mean anomaly for ${c.region.name}: the difference from this series' own average (${r.baseline}).`), chart.node,
    h("p", { class: "slope-label", style: "margin:10px 0 0" }, ivLine),
    h("details", { style: "margin-top:8px" }, h("summary", {}, "What the interval and the band are"),
      h("p", { class: "muted small" }, iv ? `${iv.label}. How often such intervals contain the true slope was measured on synthetic series. It is not a range for individual years.` : `Interval: ${NOT_SHOWN}`),
      h("p", { class: "muted small" }, r.band_lo ? r.band_meaning : `Band: ${NOT_SHOWN}`)));

  const testLine = t ? `${t.title}: p = ${fmtPx(t.p)}, variance factor ${fac(t)}` : "regional test not shown (it did not pass its calibration check)";
  const text = [v.scoped, v.headline, ...v.sentences,
    `${f.place}; ${f.variable}; ${f.period}; ${f.change_per_decade.text}; ${iv ? `${iv.label} ${iv.lo} to ${iv.hi}` : "interval not shown: failed its coverage check"}; ${testLine}; ${f.product.name} ${f.product.version} ${f.product.doi}; run ${f.run_id}; ledger ${f.ledger_ref || "n/a"}`,
    c.region.note || "", f.selection_disclosure || ""].filter(Boolean).join("\n");
  const copy = h("button", { class: "btn-quiet", type: "button", onclick: e => { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => { e.target.textContent = "Copied"; }, () => download(`finding_${c.id}.txt`, text, "text/plain")); } }, "Copy the finding as text");
  const withheld = v.branch === "withheld";
  const gavel = gavelIcon();
  const th = c.thresholds || { breadth: 0.25, local: 0.05 };
  const ruling = h("section", { class: "panel ruling", role: "status", "aria-labelledby": "ruling-h" },
    h("div", { class: "ruling-head" }, h("p", { class: "eyebrow" }, "The ruling"), gavel),
    h("h2", { id: "ruling-h" }, v.scoped), h("div", { class: "stamp" }, withheld ? "Checks did not pass" : `Final, after rung ${L.length}`),
    h("p", {}, h("b", {}, v.headline)), v.sentences.map(x => h("p", {}, x)),
    withheld ? null : h("p", { class: "caveat" }, h("b", {}, "How to read this. "), `The map and the regional series come from the same data, so they are not independent evidence. The ${pct(th.breadth, 0)} and ${pct(th.local, 0)} area thresholds that separate "supported" from "partly supported" are conventions we chose before seeing results, not a calibrated scale.`),
    h("p", { class: "caveat" }, h("b", {}, "Caveat. "), f.not_supported ? f.not_supported.join(" ") : "A trend alone does not say what caused it or what comes next."),
    h("small", {}, iv ? `${iv.label}. ${f.interval ? f.interval.meaning : ""}` : `Interval ${NOT_SHOWN.toLowerCase()}`));
  const checks = h("section", { class: "panel record", "aria-labelledby": "chk-h" }, h("h3", { id: "chk-h" }, "Evidence checklist"), h("ul", { class: "ticks" }, v.checklist.map(i => h("li", { class: i.ok ? "yes" : "no" }, h("span", { class: "mark", "aria-hidden": "true" }, i.ok ? "✓" : "–"), h("span", {}, i.text, i.link ? [" ", h("a", { href: i.link[0] }, i.link[1])] : null, h("span", { class: "sr-only" }, i.ok ? " (yes)" : " (no)"))))));
  const honest = honestNull();

  const stat = (k, val, sub) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, val), h("div", { class: "s" }, sub));
  const field = (k, ...kids) => [h("dt", {}, k), h("dd", {}, ...kids)];
  const ctx = r.ctx || {};
  const ctxRows = [
    ctx.hr && t && t.method !== "hr_registered" ? `Registered Hamed-Rao version: p = ${fmtPx(ctx.hr.p)}, variance factor ${ctx.hr.factor != null ? ctx.hr.factor.toFixed(2) : "n/a"} (the first method we registered; replaced before results, see the Method page).` : null,
    ctx.raw ? `Raw Mann-Kendall, years treated as independent: p = ${fmtPx(ctx.raw.p)}.` : null,
  ].filter(Boolean);
  const stats = h("section", { style: "margin-top:20px", "aria-labelledby": "stats-h" }, h("h2", { id: "stats-h" }, "The regional test"),
    withheldNote(c),
    h("div", { class: "statgrid" },
      stat("Sen slope per decade", `${signed(r.sen.slope_per_decade, 2)} ${u}`, iv ? `${iv.label}: ${signed(iv.lo, 2)} to ${signed(iv.hi, 2)}` : `95% interval: ${NOT_SHOWN.toLowerCase()}`),
      t ? stat(t.title, `p = ${fmtPx(t.p)}`, `${sigLabel(t.p)}. A pattern this strong would be rare if there were no trend.`) : stat("Regional test", "Not shown", "It did not pass its calibration check, so no significance statement is made."),
      t ? stat("Variance factor", fac(t), "Above 1.00 means neighbouring years resemble each other, and the test widens to allow for it") : null),
    t ? h("p", { class: "small muted", style: "margin:10px 0 0" }, t.label + ". " + (t.method === "mk_independent" ? "No autocorrelation correction was chosen here: simulations on synthetic series with this series' persistence showed this test keeps false alarms near 5%. " : "p-values from series whose years resemble each other tend to be too small, which is why this correction is applied. ") + "The test was chosen by simulation on synthetic series, not by looking at this result.") : null,
    ctxRows.length ? h("div", { class: "baseline", style: "margin-top:14px" }, h("h3", {}, "Context, not the ruling"), ctxRows.map(x => h("p", { class: "muted small", style: "margin:0 0 4px" }, x))) : null,
    h("div", { class: "baseline", style: "margin-top:14px" }, h("h3", {}, "The familiar baseline: least squares and t-test"), h("p", { class: "muted small" }, `Context only. The ruling rests on the Sen slope and the regional test above.`),
      h("p", { style: "margin:0" }, h("b", {}, `${signed(r.ols.slope_per_decade, 2)} ${u} per decade`), `, 95% range ${signed(r.ols.ci_lo, 2)} to ${signed(r.ols.ci_hi, 2)}; `, h("span", { class: "chip " + sigClass(r.ols.p) }, sigLabel(r.ols.p)), ` t = ${r.ols.t}, p = ${fmtPx(r.ols.p)}`)));
  const fields = h("section", { class: "panel", style: "margin-top:20px", "aria-labelledby": "fields-h" }, h("div", { class: "fieldstitle" }, h("h2", { id: "fields-h" }, "The publishable finding"), h("div", { class: "flow-nav", style: "margin:0" }, copy, h("a", { class: "btn-quiet", href: "#/evidence" }, "Download the evidence"))),
    h("dl", { class: "fields" },
      field("Place", f.place, c.region.note ? h("span", { class: "muted", style: "display:block" }, c.region.note) : null), field("Variable", f.variable), field("Period", f.period), field("Change per decade", f.change_per_decade.text),
      field("Interval", iv ? [`${signed(iv.lo, 2)} to ${signed(iv.hi, 2)}. ${iv.label}. `, h("span", { class: "muted" }, f.interval ? f.interval.meaning : "")] : NOT_SHOWN),
      field("Regional test", t ? `${t.title}: p = ${fmtPx(t.p)}, variance factor ${fac(t)}.` : "Not shown: it did not pass its calibration check."),
      field("NASA product", `${f.product.name}, version ${f.product.version}, DOI ${f.product.doi}`),
      field("This number is for", f.scope_text || NA()),
      field("What the evidence does not support", f.not_supported ? h("ul", {}, f.not_supported.map(x => h("li", {}, x))) : NA()),
      field("Selection disclosure", f.selection_disclosure || NA(), " ", h("a", { href: "#/method/registration" }, "Registration and amendments")),
      field("Run ID", h("span", { class: "mono" }, f.run_id)), field("Ledger reference", f.ledger_ref ? h("span", { class: "mono" }, f.ledger_ref) : NA())));

  drawRail(); drawA();
  return { title: `Case ${c.id}`, node: h("div", { class: "case-page" },
    h("p", { class: "crumb" }, h("a", { href: "#/cases" }, "Case files"), " / ", c.id),
    h("section", { class: "case-heading", "aria-labelledby": "page-title" },
      h("div", { class: "case-number" }, h("strong", {}, caseNo(c.id)), h("span", {}, "Trial docket")),
      h("div", {}, h("p", { class: "eyebrow" }, "The registered claim"), h("h1", { id: "page-title", tabindex: "-1" }, "“" + c.claim_text + "”"),
        h("p", { class: "definition" }, h("b", {}, c.variable.name + ": "), c.variable.plain)),
      h("div", { class: "case-meta" }, h("b", {}, c.product.name), `${c.season} · ${c.period.start} to ${c.period.end}`, h("br"), c.region.name, h("br"), h("span", { class: "muted" }, boxStr(c.region.box)), h("br"),
        c.region.note ? h("span", { class: "muted" }, "Box includes water cells; no land mask.") : null, c.region.note ? h("br") : null,
        h("span", { class: "chip " + (c.data_kind === "model_reanalysis" ? "warn" : "neutral") }, c.data_kind === "model_reanalysis" ? "Model data" : "Satellite data"), c.synthetic ? h("span", { class: "chip warn" }, "Synthetic test case") : null)),
    h("div", { class: "workspace" }, rail, h("div", { class: "exhibits" }, exA, exB), h("div", { class: "ruling-column" }, ruling, checks, honest)),
    stats, fields) };
}
