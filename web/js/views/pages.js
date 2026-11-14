import { h, download } from "../util.js";

export function method(b) {
  const q = b.declared_q != null ? b.declared_q : 0.10, a = b.alpha != null ? b.alpha : 0.05;
  return { title: "Method", node: h("div", { class: "prose" },
    h("p", { class: "crumb" }, h("a", { href: "#/" }, "Home"), " / Method"),
    h("h1", { id: "page-title", tabindex: "-1" }, "How the trial works"),
    h("p", { class: "lede" }, "Every number on this site was computed in advance by tested code and stored in a data bundle. This page only reads and draws it. No server runs and no AI model writes any result."),
    h("h2", {}, "What a trend test asks"),
    h("p", {}, "A trend test asks whether a series of values changes over time by more than chance would explain. The answer is a p-value. Below ", String(a), " is called significant. Above it does not prove there is no trend and does not mean the change is unimportant. A longer record often makes a real trend easier to see."),
    h("h2", {}, "The tests we use, in plain words"),
    h("ul", {},
      h("li", {}, h("b", {}, "Least squares and t-test."), " Fits a straight line and checks whether its slope is zero. This is the version most people meet first, so we show it as context."),
      h("li", {}, h("b", {}, "Mann-Kendall."), " Compares every pair of values and counts whether later ones tend to be higher or lower. It does not assume a straight line."),
      h("li", {}, h("b", {}, "Sen slope."), " The median of all pairwise slopes. It is the rate of change that goes with Mann-Kendall and is hard to pull off course by one odd year."),
      h("li", {}, h("b", {}, "Hamed-Rao correction."), " Months and years that are close often resemble each other. Ignoring that makes trends look more certain than they are. The correction widens the test to allow for it."),
      h("li", {}, h("b", {}, "Benjamini-Hochberg."), " Used on the maps. When you test thousands of grid cells, some will look significant by luck. This rule limits the expected share of false alarms among the flagged cells.")),
    h("h2", {}, "The ladder"),
    h("p", {}, "Each rung changes one thing and keeps everything else the same: (1) raw Mann-Kendall assuming independence, (2) values compared with each cell's own seasonal normal, (3) the Hamed-Rao correction, (4) Benjamini-Hochberg at q = ", String(q), ". The ladder is not built to make red disappear. A rung can change nothing, remove flagged cells, or add them. We show what happened."),
    h("div", { class: "callout info" }, h("b", {}, "About the false discovery rate. "), `We declared q = ${q} before seeing any result. Benjamini-Hochberg controls the expected share of false discoveries among flagged cells when cells are independent or positively dependent. Neighbouring grid cells are correlated, so that condition is not guaranteed, and we checked the rate on correlated synthetic fields. It does not control the share of the map area that is wrong and does not confirm any single hotspot. The flagged share of the map is a description, not an error rate.`),
    h("h2", {}, "What we do not claim"),
    h("ul", {}, h("li", {}, "We do not say what caused a change, and we do not forecast."), h("li", {}, "A regional number is not a number for any single hotspot cell."), h("li", {}, "The interval on a headline result is not adjusted for the fact that we picked that headline."), h("li", {}, "A model-based variable (reanalysis) is labelled as model output, not a measurement.")),
    h("h2", {}, "Detective mode versus case files"),
    h("p", {}, "In Detective mode you choose everything, and the result is labelled as your own exploration, not pre-registered. Case files are claims, regions and methods written down and fingerprinted before any data were downloaded, so the test could not be bent to fit the answer."),
    h("h2", {}, "Tools, data and credits"),
    h("p", {}, "NASA Earth data products named on each case (product, version and DOI are on the finding card). Maps: coastlines and country borders from Natural Earth (public domain) via the world-atlas package 2.0.2 (ISC licence); US state outlines from the US Census Bureau cartographic boundary files via the us-atlas package 3.0.1 (ISC licence). Live data in Detective mode: NASA POWER (MERRA-2 and CERES based parameters). Statistics checked against the pymannkendall package. Code is original to this entry except the generic starter theme, disclosed as pre-existing and MIT licensed. Parts of the code and the sentence templates were produced with LLM assistance that Walter Guevara directed and checked. Not endorsed by NASA."),
    h("p", { class: "muted small" }, b.synthetic ? "This build is currently running on synthetic placeholder data." : "")) };
}

function csvEscape(v) { return v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v); }
export function cellsCsv(b) {
  const rows = ["claim,lat,lon,sen_slope_per_decade,rung1_flag,rung2_flag,rung3_flag,rung4_flag"];
  for (const c of b.claims) {
    const g = c.grid;
    for (let i = 0; i < g.n_lat; i++) for (let j = 0; j < g.n_lon; j++) {
      const k = i * g.n_lon + j; if (c.ladder[0].flags[k] == null) continue;
      rows.push([c.id, g.lat[i], g.lon[j], c.cell_slope_per_decade ? c.cell_slope_per_decade[k] : "", ...c.ladder.map(r => r.flags[k])].map(csvEscape).join(","));
    }
  }
  return rows.join("\n");
}
export function seriesCsv(b) {
  const rows = ["claim,year,anomaly,band_lo,band_hi"];
  for (const c of b.claims) c.regional.years.forEach((y, i) => rows.push([c.id, y, c.regional.anomaly[i], c.regional.band_lo[i], c.regional.band_hi[i]].join(",")));
  return rows.join("\n");
}
export function ladderCsv(b) {
  const rows = ["claim,rung,label,n_cells,n_flagged_claimed,n_flagged_any,flagged_fraction_claimed,flagged_fraction_any"];
  for (const c of b.claims) for (const r of c.ladder) rows.push([c.id, r.rung, r.label, r.n_cells, r.n_flagged_claimed, r.n_flagged_any, r.flagged_fraction_claimed, r.flagged_fraction_any].map(csvEscape).join(","));
  return rows.join("\n");
}

export function evidence(b) {
  const btn = (label, fn) => h("button", { class: "btn-quiet", type: "button", onclick: fn }, label);
  const files = [
    ["Evidence bundle (JSON)", "Everything the site shows: claims, ladders, series, verdicts, run IDs.", () => download("climate_claim_on_trial_bundle.json", JSON.stringify(b._raws.length === 1 ? b._raws[0] : { bundles: b._raws }, null, 2), "application/json")],
    ["Ladder summary (CSV)", "One row per claim and rung: cells tested, cells flagged, shares.", () => download("climate_claim_on_trial_ladder.csv", ladderCsv(b), "text/csv")],
    ["Cell table (CSV)", "One row per grid cell with data: position, Sen slope, flag on each rung.", () => download("climate_claim_on_trial_cells.csv", cellsCsv(b), "text/csv")],
    ["Regional series (CSV)", "Yearly regional anomaly and uncertainty band for each claim.", () => download("climate_claim_on_trial_series.csv", seriesCsv(b), "text/csv")],
  ];
  return { title: "Evidence", node: h("div", {},
    h("p", { class: "crumb" }, h("a", { href: "#/" }, "Home"), " / Evidence"),
    h("h1", { id: "page-title", tabindex: "-1" }, "Download the evidence"),
    h("p", { class: "lede" }, "Everything on this site comes from one bundle. Download it and check any number yourself."),
    b.synthetic ? h("p", { class: "callout" }, h("b", {}, "Synthetic data. "), b.notice || "These files hold placeholder numbers, not results.") : null,
    h("p", { class: "muted small" }, "Run ID: ", h("span", { class: "mono" }, b.run_id || "n/a"), "  ·  Schema: ", h("span", { class: "mono" }, b.schema_version || "n/a")),
    h("div", { class: "grid g2", style: "margin-top:16px" }, files.map(f => h("div", { class: "card" }, h("h2", { style: "font-size:1.1rem" }, f[0]), h("p", { class: "muted" }, f[1]), btn("Download", f[2])))),
    h("div", { class: "card", style: "margin-top:16px" }, h("h2", { style: "font-size:1.1rem" }, "Reproduce it"), h("p", { class: "muted" }, "The Python code that made the bundle is in the project repository, with instructions to rerun it from the downloaded NASA files."))) };
}
