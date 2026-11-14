// Case files: one docket page per registered claim. Order of hearings (the ladder), Exhibit A (map), Exhibit B (regional record), the ruling.
import { h, s, pct, signed, fmtP, boxStr, download } from "../util.js";
import { renderMap, legend } from "../map.js";
import { seriesChart } from "../chart.js";
import { KIND, tone, withheldNote, regionThumb } from "./common.js";
import { sigClass, sigLabel } from "../words.js";

const NA = () => h("span", { class: "muted" }, "Not in this bundle yet.");
const caseNo = id => id.replace("-", "–");

export function caseList(b) {
  return { title: "Case files", node: h("div", {},
    h("p", { class: "crumb" }, h("a", { href: "#/" }, "Home"), " / Case files"),
    h("h1", { id: "page-title", tabindex: "-1" }, "Case files"),
    h("p", { class: "lede" }, "Claims we registered before looking at any data, then tested on NASA data with the four-hearing ladder and a map of every grid cell. You cannot edit these. That is what makes them a fair test."),
    h("div", { class: "grid g3", style: "margin-top:20px" }, b.claims.map(c => h("article", { class: "panel" },
      regionThumb(c.region.box, "Map of " + c.region.name),
      h("p", { class: "eyebrow brass", style: "margin-top:12px" }, "Case " + caseNo(c.id)), h("h2", { style: "font-size:1.2rem" }, "“" + c.claim_text + ".”"),
      h("p", { class: "muted small" }, `${c.region.name} · ${c.season}, ${c.period.start} to ${c.period.end} · ${KIND[c.data_kind]}`),
      h("div", { class: "flow-nav" }, h("a", { class: "btn", href: `#/case/${c.id}` }, "Open the docket")))))) };
}

export function caseDocket(b, c) {
  let sel = c.ladder.length - 1, mode = "claimed";
  const key = () => (mode === "any" ? "flagged_fraction_any" : "flagged_fraction_claimed");
  const L = c.ladder, v = c.verdict, f = c.finding, r = c.regional, u = r.units;
  const rail = h("aside", { class: "hearings", "aria-labelledby": "hearings-h" });
  const exA = h("section", { class: "panel", "aria-labelledby": "exa-h" });

  function drawRail() {
    const list = h("ol", { class: "hearing-list" }, L.map((q, i) => {
      const prev = L[i - 1], d = prev ? (q[key()] - prev[key()]) * 100 : 0;
      const delta = !prev ? "baseline" : Math.abs(d) < 0.05 ? "no change" : `${signed(d, 1)} pts ${d > 0 ? "↑" : "↓"}`;
      const status = i === sel ? "● On the bench" : "✓ Heard";
      return h("li", {}, h("button", { type: "button", class: "hearing", "aria-current": i === sel ? "step" : null, onclick: () => { sel = i; drawRail(); drawA(); const bt = rail.querySelectorAll("button.hearing")[i]; if (bt) bt.focus(); } },
        h("span", { class: "hearing-top" }, h("span", {}, "Rung " + q.rung), h("span", { class: "status" }, status)),
        h("h3", {}, q.label), h("p", { class: "explain" }, q.changes),
        h("span", { class: "hearing-result" }, h("strong", {}, pct(q[key()], 0)), h("span", { class: "mini-bar", "aria-hidden": "true" }, h("i", { style: `width:${Math.min(100, q[key()] * 100)}%` })), h("span", { class: "delta" }, delta))));
    }));
    rail.replaceChildren(h("div", { class: "hearings-head" }, h("p", { class: "eyebrow" }, "Four tests, one change each"), h("h2", { id: "hearings-h" }, "Order of hearings")), list,
      h("p", { class: "hearing-note" }, "Share of tested cells flagged. Each change can raise, lower or leave the share unchanged, and we show whichever happens."));
  }
  function drawA() {
    const q = L[sel];
    if (!c.gate.cells) { exA.replaceChildren(h("div", { class: "exhibit-header" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit A"), h("h2", { id: "exa-h" }, "The cell-by-cell evidence"))), withheldNote(c)); return; }
    const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Count flagged cells" }, [["claimed", `Claimed direction (${c.direction})`], ["any", "Either direction"]].map(([k, l]) =>
      h("label", {}, h("input", { type: "radio", name: "mode", value: k, checked: mode === k, onchange: () => { mode = k; drawRail(); drawA(); const x = exA.querySelector(`input[value="${k}"]`); if (x) x.focus(); } }), h("span", {}, l))));
    const m = renderMap(c, q, { id: `map-${c.id}-${q.rung}` });
    const cnt = mode === "any" ? "n_flagged_any" : "n_flagged_claimed";
    exA.replaceChildren(
      h("div", { class: "exhibit-header" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit A"), h("h2", { id: "exa-h" }, "The cell-by-cell evidence")), h("span", { class: "tag" }, `Rung ${q.rung} of ${L.length}: ${q.label}`)),
      h("div", { class: "map-summary" }, h("span", {}, `${q[cnt]} of ${q.n_cells} cells flagged` + (q.cells_changed != null ? `; ${q.cells_changed} changed status from the previous rung` : "")), h("strong", {}, pct(q[key()]), " ", h("span", {}, "of tested cells flagged"))),
      ...(q.note ? [h("p", { class: "muted small" }, q.note)] : []), seg, h("div", { style: "margin-top:12px" }, m.node), legend(),
      h("p", { class: "muted small", style: "margin:10px 0 0" }, "Cells are drawn at their true latitude and longitude. The flagged share describes how much of the map shows a pattern. It is not an error rate and does not say which single cell is right."));
  }

  const chart = seriesChart(c);
  const exB = h("section", { class: "panel", "aria-labelledby": "exb-h" },
    h("div", { class: "exhibit-header" }, h("div", { class: "exhibit-title" }, h("p", { class: "eyebrow" }, "Exhibit B"), h("h2", { id: "exb-h" }, "The regional record")), h("span", { class: "tag" }, "One value per year")),
    h("p", { class: "muted small", style: "margin:0 0 8px" }, `Area-weighted mean anomaly for ${c.region.name}: the difference from this series' own average (${r.baseline}).`), chart.node,
    h("p", { class: "slope-label", style: "margin:10px 0 0" }, `Sen slope ${signed(r.sen.slope_per_decade, 2)} ${u} per decade, 95% range ${signed(r.sen.ci_lo, 2)} to ${signed(r.sen.ci_hi, 2)}`),
    h("details", { style: "margin-top:8px" }, h("summary", {}, "How the uncertainty band is made"), h("p", { class: "muted small" }, r.band_method)));

  const text = [v.label, v.headline, ...v.sentences, `${f.place}; ${f.variable}; ${f.period}; ${f.change_per_decade.text}; interval ${f.interval.lo} to ${f.interval.hi}; ${f.product.name} ${f.product.version} ${f.product.doi}; run ${f.run_id}; ledger ${f.ledger_ref || "n/a"}`].join("\n");
  const copy = h("button", { class: "btn-quiet", type: "button", onclick: e => { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => { e.target.textContent = "Copied"; }, () => download(`finding_${c.id}.txt`, text, "text/plain")); } }, "Copy the finding as text");
  const withheld = v.branch === "withheld";
  const gavel = s("svg", { class: "gavel", viewBox: "0 0 48 48", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "2" }, s("g", { transform: "rotate(-38 24 21)" }, s("rect", { x: 11, y: 9, width: 23, height: 12, rx: 2 }), s("path", { d: "M15 9v12m15-12v12M21 21v17h5V21" })), s("path", { d: "M27 40h15v4H27z" }));
  const ruling = h("section", { class: "panel ruling", role: "status", "aria-labelledby": "ruling-h" },
    h("div", { class: "ruling-head" }, h("p", { class: "eyebrow" }, "The ruling"), gavel),
    h("h2", { id: "ruling-h" }, v.label), h("div", { class: "stamp" }, withheld ? "Checks did not pass" : `Final, after rung ${L.length}`),
    h("p", {}, h("b", {}, v.headline)), v.sentences.map(x => h("p", {}, x)),
    h("p", { class: "caveat" }, h("b", {}, "Caveat. "), f.not_supported ? f.not_supported.join(" ") : "A trend alone does not say what caused it or what comes next."),
    h("small", {}, f.interval.meaning));
  const checks = h("section", { class: "panel record", "aria-labelledby": "chk-h" }, h("h3", { id: "chk-h" }, "Evidence checklist"), h("ul", { class: "ticks" }, v.checklist.map(i => h("li", { class: i.ok ? "yes" : "no" }, h("span", { class: "mark", "aria-hidden": "true" }, i.ok ? "✓" : "–"), h("span", {}, i.text, h("span", { class: "sr-only" }, i.ok ? " (yes)" : " (no)"))))));
  const honest = h("section", { class: "panel record" }, h("h3", {}, "An honest null belongs here."), h("p", {}, "Not flagged means too little evidence, not no change. A result that is not significant is still a finding and can be reported."), h("div", { class: "evidence-tags" }, h("span", {}, "TRACEABLE"), h("span", {}, "REVISABLE")));

  const stat = (k, val, sub) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, val), h("div", { class: "s" }, sub));
  const field = (k, ...kids) => [h("dt", {}, k), h("dd", {}, ...kids)];
  const stats = h("section", { style: "margin-top:20px", "aria-labelledby": "stats-h" }, h("h2", { id: "stats-h" }, "The regional test"),
    withheldNote(c),
    h("div", { class: "statgrid" },
      stat("Sen slope per decade", `${signed(r.sen.slope_per_decade, 2)} ${u}`, `95% range ${signed(r.sen.ci_lo, 2)} to ${signed(r.sen.ci_hi, 2)}`),
      stat("Mann-Kendall with Hamed-Rao", `p = ${fmtP(r.mk_hr.p_hamed_rao)}`, `${sigLabel(r.mk_hr.p_hamed_rao)}. Independent-years p = ${fmtP(r.mk_hr.p_independent)}`),
      stat("Autocorrelation factor", r.mk_hr.vif.toFixed(2), "Above 1.00 means neighbouring years resemble each other")),
    h("div", { class: "baseline", style: "margin-top:14px" }, h("h3", {}, "The familiar baseline: least squares and t-test"), h("p", { class: "muted small" }, "Context only. The ruling rests on the Sen slope and the Hamed-Rao test above."),
      h("p", { style: "margin:0" }, h("b", {}, `${signed(r.ols.slope_per_decade, 2)} ${u} per decade`), `, 95% range ${signed(r.ols.ci_lo, 2)} to ${signed(r.ols.ci_hi, 2)}; `, h("span", { class: "chip " + sigClass(r.ols.p) }, sigLabel(r.ols.p)), ` t = ${r.ols.t}, p = ${fmtP(r.ols.p)}`)));
  const fields = h("section", { class: "panel", style: "margin-top:20px", "aria-labelledby": "fields-h" }, h("div", { class: "fieldstitle" }, h("h2", { id: "fields-h" }, "The publishable finding"), h("div", { class: "flow-nav", style: "margin:0" }, copy, h("a", { class: "btn-quiet", href: "#/evidence" }, "Download the evidence"))),
    h("dl", { class: "fields" },
      field("Place", f.place), field("Variable", f.variable), field("Period", f.period), field("Change per decade", f.change_per_decade.text),
      field("Interval", `${signed(f.interval.lo, 2)} to ${signed(f.interval.hi, 2)} (${Math.round(f.interval.level * 100)}%). `, h("span", { class: "muted" }, f.interval.meaning)),
      field("NASA product", `${f.product.name}, version ${f.product.version}, DOI ${f.product.doi}`),
      field("This number is for", f.scope_text || NA()),
      field("What the evidence does not support", f.not_supported ? h("ul", {}, f.not_supported.map(x => h("li", {}, x))) : NA()),
      field("Selection disclosure", f.selection_disclosure || NA()),
      field("Run ID", h("span", { class: "mono" }, f.run_id)), field("Ledger reference", f.ledger_ref ? h("span", { class: "mono" }, f.ledger_ref) : NA())));

  drawRail(); drawA();
  return { title: `Case ${c.id}`, node: h("div", {},
    h("p", { class: "crumb" }, h("a", { href: "#/cases" }, "Case files"), " / ", c.id),
    h("section", { class: "case-heading", "aria-labelledby": "page-title" },
      h("div", { class: "case-number" }, h("strong", {}, caseNo(c.id)), h("span", {}, "Trial docket")),
      h("div", {}, h("p", { class: "eyebrow" }, "The registered claim"), h("h1", { id: "page-title", tabindex: "-1" }, "“" + c.claim_text + "”"),
        h("p", { class: "definition" }, h("b", {}, c.variable.name + ": "), c.variable.plain)),
      h("div", { class: "case-meta" }, h("b", {}, c.product.name), `${c.season} · ${c.period.start} to ${c.period.end}`, h("br"), c.region.name, h("br"), h("span", { class: "muted" }, boxStr(c.region.box)), h("br"),
        h("span", { class: "chip " + (c.data_kind === "model_reanalysis" ? "warn" : "neutral") }, c.data_kind === "model_reanalysis" ? "Model data" : "Satellite data"), c.synthetic ? h("span", { class: "chip warn" }, "Synthetic test case") : null)),
    h("div", { class: "workspace" }, rail, h("div", { class: "exhibits" }, exA, exB), h("div", { class: "ruling-column" }, ruling, checks, honest)),
    stats, fields) };
}
