// Case files: the registered claims with per-cell ladders from the stats bundle.
import { h, pct, signed, fmtP, boxStr, download } from "../util.js";
import { renderMap, legend } from "../map.js";
import { seriesChart, rungBars } from "../chart.js";
import { caseHeader, miniBox, KIND, tone, withheldNote } from "./common.js";
import { sigClass, sigLabel } from "../words.js";

export function caseList(b) {
  return { title: "Case files", node: h("div", {},
    h("p", { class: "crumb" }, h("a", { href: "#/" }, "Home"), " / Case files"),
    h("h1", { id: "page-title", tabindex: "-1" }, "Case files"),
    h("p", { class: "lede" }, "Claims we registered before looking at any data, then tested on NASA data with the full four-step ladder and a map of every grid cell. You cannot edit these; that is what makes them a fair test."),
    h("div", { class: "grid g2", style: "margin-top:20px" }, b.claims.map(c => h("article", { class: "card" },
      miniBox(c.region.box, "Location of " + c.region.name),
      h("p", { class: "eyebrow", style: "margin-top:12px" }, "Case " + c.id), h("h2", { style: "font-size:1.2rem" }, "“" + c.claim_text + ".”"),
      h("p", { class: "muted small" }, `${c.region.name} · ${c.season}, ${c.period.start} to ${c.period.end} · ${KIND[c.data_kind]}`),
      h("div", { class: "flow-nav" }, h("a", { class: "btn", href: `#/case/${c.id}/ladder` }, "Put it on trial"), h("a", { class: "btn-quiet", href: `#/case/${c.id}/verdict` }, "Jump to the finding"))))) ) };
}

export function caseClaim(b, c) {
  const v = c.variable, p = c.product;
  return { title: "Case " + c.id, node: h("div", {}, caseHeader(c, "claim"),
    h("h1", { id: "page-title", tabindex: "-1", class: "sr-only" }, "Case " + c.id + ": the claim"),
    h("div", { class: "grid g2" },
      h("div", { class: "card" }, h("h2", {}, "The clue"), h("h3", { style: "font-size:1rem" }, v.name), h("p", { class: "muted" }, v.plain), h("p", { class: "small" }, "Unit: ", v.unit)),
      h("div", { class: "card" }, h("h2", {}, "The data"), h("p", {}, p.name), h("p", { class: "muted small" }, "Version ", p.version, " · DOI ", p.doi), h("p", { class: "muted small" }, KIND[c.data_kind]), miniBox(c.region.box, "Location of " + c.region.name))),
    h("div", { class: "flow-nav" }, h("a", { class: "btn", href: `#/case/${c.id}/ladder` }, "Next: the ladder"))) };
}

export function caseLadder(b, c) {
  let mode = "claimed";
  const wrap = h("div", {});
  function draw() {
    if (!c.gate.cells) { wrap.replaceChildren(withheldNote(c), h("div", { class: "card" }, h("p", { class: "muted" }, "The per-cell maps are withheld for this case because the checks they depend on did not pass."))); return; }
    const L = c.ladder, key = mode === "any" ? "flagged_fraction_any" : "flagged_fraction_claimed", cnt = mode === "any" ? "n_flagged_any" : "n_flagged_claimed";
    const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Count flagged cells" }, [["claimed", `Claimed direction only (${c.direction})`], ["any", "Either direction"]].map(([k, l]) =>
      h("label", {}, h("input", { type: "radio", name: "mode", value: k, checked: mode === k, onchange: () => { mode = k; draw(); const f = wrap.querySelector(`input[value="${k}"]`); if (f) f.focus(); } }), h("span", {}, l))));
    wrap.replaceChildren(
      h("div", { class: "card" }, h("h2", {}, "How much of the map is flagged, step by step"),
        h("p", { class: "muted" }, "Each rung changes exactly one thing. The bars show the share of grid cells flagged as a significant trend. They can go down, stay the same, or go up. We report whatever happens."),
        seg, h("div", { style: "margin-top:14px" }, rungBars(c, mode))),
      h("div", { class: "grid g2", style: "margin-top:16px" }, L.map((r, i) => {
        const prev = L[i - 1], d = prev ? (r[key] - prev[key]) * 100 : 0, dn = prev ? r[cnt] - prev[cnt] : 0;
        const dcls = Math.abs(d) < 0.05 ? "flat" : d > 0 ? "up" : "down";
        const dtext = !prev ? "Starting point" : Math.abs(d) < 0.05 ? "No change from the previous rung" : `${d > 0 ? "More" : "Fewer"} flagged than the previous rung: ${signed(d, 1)} percentage points (${dn > 0 ? "+" : ""}${dn} cells)`;
        const m = renderMap(c, r, { id: `map-${c.id}-${r.rung}` });
        return h("article", { class: "card rung" }, h("header", {}, h("span", { class: "num", "aria-hidden": "true" }, String(r.rung)), h("div", {}, h("h3", {}, r.label), h("p", { class: "what" }, r.changes))),
          h("div", {}, h("div", { class: "bignum" }, pct(r[key])), h("div", { class: "muted small" }, `${r[cnt]} of ${r.n_cells} cells flagged` + (r.cells_changed != null ? `; ${r.cells_changed} cells changed status from the previous rung` : "")), h("div", { class: "delta " + dcls }, dtext), r.note ? h("p", { class: "muted small", style: "margin:6px 0 0" }, r.note) : null), m.node);
      })),
      h("div", { class: "card", style: "margin-top:16px" }, legend(c), h("p", { class: "muted small", style: "margin:10px 0 0" }, "The flagged share describes how much of the map shows a pattern. It is not an error rate and does not tell you which single cell is right.")),
      h("div", { class: "flow-nav" }, h("a", { class: "btn", href: `#/case/${c.id}/series` }, "Next: the regional series")));
  }
  draw();
  return { title: `Case ${c.id}: the ladder`, node: h("div", {}, caseHeader(c, "ladder"), h("h1", { id: "page-title", tabindex: "-1", class: "sr-only" }, "Case " + c.id + ": the ladder"), wrap) };
}

export function caseSeries(b, c) {
  const r = c.regional, chart = seriesChart(c), u = r.units;
  const stat = (k, v, sub) => h("div", { class: "stat" }, h("div", { class: "k" }, k), h("div", { class: "v" }, v), h("div", { class: "s" }, sub));
  return { title: `Case ${c.id}: the series`, node: h("div", {}, caseHeader(c, "series"), h("h1", { id: "page-title", tabindex: "-1", class: "sr-only" }, "Case " + c.id + ": the series"),
    withheldNote(c), h("div", { class: "card", style: "margin-top:12px" }, h("h2", {}, "Regional series, one value per year"), h("p", { class: "muted" }, `Area-weighted mean anomaly for ${c.region.name}. Anomaly means the difference from this series' own average (${r.baseline}).`), chart.node,
      h("details", { style: "margin-top:12px" }, h("summary", {}, "How the uncertainty band is made"), h("p", { class: "muted small" }, r.band_method))),
    h("div", { class: "statgrid", style: "margin-top:16px" },
      stat("Sen slope per decade", `${signed(r.sen.slope_per_decade, 2)} ${u}`, `95% range ${signed(r.sen.ci_lo, 2)} to ${signed(r.sen.ci_hi, 2)}`),
      stat("Mann-Kendall, Hamed-Rao", `p = ${fmtP(r.mk_hr.p_hamed_rao)}`, `${sigLabel(r.mk_hr.p_hamed_rao)}. Independent-years p = ${fmtP(r.mk_hr.p_independent)}`),
      stat("Autocorrelation factor", r.mk_hr.vif.toFixed(2), "Above 1.00 means neighbouring years resemble each other")),
    h("div", { class: "baseline", style: "margin-top:16px" }, h("h3", {}, "The familiar baseline: least squares and t-test"), h("p", { class: "muted small" }, "Context only. The verdict rests on the Sen slope and the Hamed-Rao test above."),
      h("p", {}, h("b", {}, `${signed(r.ols.slope_per_decade, 2)} ${u} per decade`), `, 95% range ${signed(r.ols.ci_lo, 2)} to ${signed(r.ols.ci_hi, 2)}; `, h("span", { class: "chip " + sigClass(r.ols.p) }, sigLabel(r.ols.p)), ` (t = ${r.ols.t}, p = ${fmtP(r.ols.p)})`)),
    h("div", { class: "flow-nav" }, h("a", { class: "btn", href: `#/case/${c.id}/verdict` }, "Next: the finding"))) };
}

const NA = h("span", { class: "muted" }, "Not in this bundle yet.");
export function caseVerdict(b, c) {
  const v = c.verdict, f = c.finding, t = tone(v);
  const field = (k, ...kids) => [h("dt", {}, k), h("dd", {}, ...kids)];
  const text = [v.label, v.headline, ...v.sentences, `${f.place}; ${f.variable}; ${f.period}; ${f.change_per_decade.text}; interval ${f.interval.lo} to ${f.interval.hi}; ${f.product.name} ${f.product.version} ${f.product.doi}; run ${f.run_id}; ledger ${f.ledger_ref || "n/a"}`].join("\n");
  const copy = h("button", { class: "btn-quiet", type: "button", onclick: e => { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => { e.target.textContent = "Copied"; }, () => { download(`finding_${c.id}.txt`, text, "text/plain"); }); } }, "Copy the finding as text");
  return { title: `Case ${c.id}: the finding`, node: h("div", {}, caseHeader(c, "verdict"), h("h1", { id: "page-title", tabindex: "-1", class: "sr-only" }, "Case " + c.id + ": the finding"),
    h("section", { class: "card verdict " + (t === "neutral" ? "" : t), role: "status", "aria-labelledby": "verdict-h" },
      h("p", { class: "eyebrow" }, "Finding for case " + c.id), h("span", { class: "chip " + t }, v.label), h("h2", { id: "verdict-h", style: "margin-top:10px" }, v.headline),
      v.sentences.map(x => h("p", {}, x)),
      h("h3", { style: "margin-top:16px;font-size:1rem" }, "Evidence checklist"), h("ul", { class: "ticks" }, v.checklist.map(i => h("li", { class: i.ok ? "yes" : "no" }, h("span", { class: "mark", "aria-hidden": "true" }, i.ok ? "✓" : "–"), h("span", {}, i.text, h("span", { class: "sr-only" }, i.ok ? " (yes)" : " (no)")))))),
    h("section", { class: "card", style: "margin-top:16px", "aria-labelledby": "fields-h" }, h("h2", { id: "fields-h" }, "The publishable finding"),
      h("dl", { class: "fields" },
        field("Place", f.place), field("Variable", f.variable), field("Period", f.period),
        field("Change per decade", f.change_per_decade.text),
        field("Interval", `${signed(f.interval.lo, 2)} to ${signed(f.interval.hi, 2)} (${Math.round(f.interval.level * 100)}%). `, h("span", { class: "muted" }, f.interval.meaning)),
        field("NASA product", `${f.product.name}, version ${f.product.version}, DOI ${f.product.doi}`),
        field("This number is for", f.scope_text || NA),
        field("What the evidence does not support", f.not_supported ? h("ul", {}, f.not_supported.map(x => h("li", {}, x))) : NA),
        field("Selection disclosure", f.selection_disclosure || NA),
        field("Run ID", h("span", { class: "mono" }, f.run_id)), field("Ledger reference", f.ledger_ref ? h("span", { class: "mono" }, f.ledger_ref) : NA))),
    h("div", { class: "flow-nav" }, copy, h("a", { class: "btn-quiet", href: "#/evidence" }, "Download the evidence"), h("a", { class: "btn-quiet", href: "#/method" }, "Read the method"))) };
}
