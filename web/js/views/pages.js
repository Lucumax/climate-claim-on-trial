// How it works (Method, Measurements; the False-Alarm Planet is its own view) and Data & provenance.
import { h, download, U } from "../util.js";
import { kindChip, disc } from "./common.js";

// Set this once the public repository exists; until then the reproduction steps name the folders and commands only.
const REPO_URL = "";

const HOW = [["method", "Method", "#/method"], ["false-alarm", "False-Alarm Planet", "#/false-alarm"], ["glossary", "Measurements", "#/glossary"]];
export function howShell(active, node) {
  return h("div", {}, h("nav", { class: "subnav", "aria-label": "How it works" }, HOW.map(([k, label, href]) => h("a", { href, "aria-current": k === active ? "page" : null }, label))), node);
}

const why = (...kids) => h("p", { class: "why" }, h("b", {}, "Why it matters. "), ...kids);

export function method(b) {
  const q = b.declared_q != null ? b.declared_q : 0.10, a = b.alpha != null ? b.alpha : 0.05;
  const stage = (n, title, ...kids) => h("section", { class: "stage", "aria-labelledby": "st" + n }, h("span", { class: "stage-n", "aria-hidden": "true" }, String(n)), h("div", {}, h("h2", { id: "st" + n }, title), ...kids));
  return { title: "Method", node: howShell("method", h("div", { class: "prose" },
    h("header", { class: "page-head" }, h("h1", { id: "page-title", tabindex: "-1" }, "How a trend gets tested"),
      h("p", { class: "lede" }, "A trend is a claim about the past. Four stages decide how far to believe it, and each one can make the answer stronger or weaker.")),
    stage(1, "Fix the question first",
      h("p", {}, "A case file begins with a written claim: a variable, a region, a season and a period. We wrote ours down before downloading any claim data, so the question could not be bent to fit the answer."),
      why("If you may choose the years after seeing the data, you may choose the answer. The Home page shows one record that supports opposite headlines."),
      h("p", {}, "Investigate works the other way round: you choose everything, so its result is labelled exploratory. Case files are not unchanged preregistered analyses either: two methods were amended on simulated data before any result. ", h("a", { href: "#/data/registration" }, "Read what changed and when"), ".")),
    stage(2, "Measure how much changed",
      h("p", {}, "The Sen slope is the median of the slopes between every pair of years. One odd year barely moves it. We report it per decade with a 95% interval, and draw the ordinary least squares line beside it as the familiar baseline."),
      why("A slope on its own says little. The interval says how steep the trend could plausibly be, and a withheld record shows its slope as a description only."),
      disc("Technical details: the interval and the band",
        h("p", {}, "For the Alaska case the interval is the analytic Sen interval. In simulations it passed a coverage check: it must catch the true slope at least 90% of the time, against a nominal 95%. It describes the slope, not individual years."),
        h("p", {}, "The band on the chart is the Sen line tilted between the lower and upper ends of that interval, pivoting at the middle year. It shows how steep the trend could be. It says nothing about the level, so it is not a full confidence band."))),
    stage(3, "Ask whether chance could explain it",
      h("p", {}, "The Mann-Kendall test asks whether later years tend to be higher or lower than earlier ones, with no straight-line assumption. The answer is a p-value. A p-value below ", String(a), " is called significant. It means a pattern this strong would be rare if there were no trend, under the test's assumptions. It is not the probability that chance produced the pattern, and a larger p-value does not prove there is no trend."),
      why("Neighbouring years often resemble each other. Ignoring that makes p-values too small and trends look more certain than they are. A correction widens the test to allow for it."),
      disc("Technical details: which correction",
        h("p", {}, "We registered Hamed-Rao first. Before any result, a simulation on synthetic series picked the correction that kept false alarms closest to 5% for each claim. At the persistence of the Alaska series Hamed-Rao raised too many false alarms (about 7% instead of 5%), so Alaska uses Yue-Wang. For the Sahel case it is plain Mann-Kendall, because it kept false alarms nearest 5% in the simulations. Sahel's years actually alternate (a wet year tends to be followed by a drier one), and our simulations did not cover that kind of record, so this choice is not validated for it. Hamed-Rao stays on the page as context."),
        h("p", {}, "A p-value is a convention-bound summary: the 0.05 line is not a calibrated scale."))),
    stage(4, "Test every grid cell, then count",
      h("p", {}, "The map repeats the test in every grid cell. Four hearings change one thing each: (1) raw Mann-Kendall, treating every year as independent; (2) each cell compared with its own seasonal normal; (3) the memory correction chosen for the claim; (4) the Benjamini-Hochberg false-discovery step at q = ", String(q), " applied to the hearing 3 p-values."),
      why("Test thousands of cells and some will look significant by luck. The hearings ask different questions of the same map, so you can see how much of it is flagged under each. A hearing can remove flags, add flags or change nothing. We show what happened."),
      h("div", { class: "callout info" }, h("p", {}, h("b", {}, "Hearing 4 is a different question, not a tougher test. "), `It limits the expected share of false alarms among flagged cells at q = ${q}, a different cut from ${a}, so it can add flags as well as remove them. It does not control the share of the map area that is wrong, and it does not confirm any single hotspot.`)),
      disc("Technical details: cell share and area share",
        h("p", {}, "The cell share counts every grid cell once. The area share weights cells by the cosine of latitude, because high-latitude cells cover less ground. Alaska, hearing 4: 750 of 861 cells (87.1%), 85.2% of the area. Both are shares of the tested map, not probabilities: neither is the chance that the claim is true."),
        h("p", {}, `We declared q = ${q} before seeing any result. Benjamini-Hochberg is guaranteed for independent or positively dependent cells. Neighbouring cells are correlated, so we checked the rate on correlated synthetic fields.`))),
    h("section", { class: "section", "aria-labelledby": "proof-h" }, h("h2", { id: "proof-h" }, "Standards of proof"),
      h("p", {}, "Courts ask for different amounts of evidence at different moments. Our three labels borrow the idea. It is an analogy, not a legal test. Statistics never establishes that a claim is true, and none of these labels is a probability that it is."),
      h("table", { class: "analogy-table" }, h("caption", { class: "sr-only" }, "Three legal standards of proof and their rough counterparts in this project"),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "In a court"), h("th", { scope: "col" }, "In this project"))),
        h("tbody", {},
          h("tr", {}, h("th", { scope: "row" }, "Reasonable suspicion"), h("td", {}, h("b", {}, "An exploratory look. "), "Enough to ask a question. Anything you find in Investigate is of this kind.")),
          h("tr", {}, h("th", { scope: "row" }, "Preponderance of the evidence"), h("td", {}, h("b", {}, "Supported by this data. "), "The tests lean one way for one dataset, one box and one period.")),
          h("tr", {}, h("th", { scope: "row" }, "The strongest label (no courtroom equivalent)"), h("td", {}, h("b", {}, "The strongest standard this tool applies: survives every correction and the map-wide check. "), "It holds after the memory correction and the false-discovery step, and across the map, not only in one regional average. It is still not proof."))))),
    h("section", { class: "section", "aria-labelledby": "verdict-h" }, h("h2", { id: "verdict-h" }, "Reading a verdict"),
      h("ul", {}, h("li", {}, h("b", {}, "A verdict is scoped. "), "\"Supported\" is never a general statement. It always names one dataset, one box and one period, and it says the tests lean one way there, not that the claim is true."),
        h("li", {}, h("b", {}, "The thresholds are conventions. "), "The 25% and 5% flagged-area cut-offs between supported and partly supported were chosen before results. They are not a calibrated scale."),
        h("li", {}, h("b", {}, "The map and the series are one source. "), "They come from the same data, so they are not independent evidence."),
        h("li", {}, h("b", {}, "What we do not claim. "), "We do not say what caused a change or forecast one. A regional number is not a number for a single cell. The interval on a headline result is not adjusted for our having picked that headline. A model-based variable is model output, not a measurement."))),
    h("div", { class: "cta-band" }, h("p", {}, h("b", {}, "See it on a planet with no trend. "), "Every flag there is a false alarm, so you can count how many each stage lets through."), h("a", { class: "btn", href: "#/false-alarm" }, "Try the False-Alarm Planet")),
    b.synthetic ? h("p", { class: "muted small", style: "margin-top:24px" }, "This build is currently running on synthetic placeholder data.") : null)) };
}

// ------------------------------------------------------------------ Measurements
const GROUPS = [
  ["Temperature", ["t2m", "t2m_max", "t2m_min", "frost"]],
  ["Water", ["precip", "rh", "soil_root", "soil_top", "snow"]],
  ["Sun and sky", ["solar", "cloud"]],
  ["Wind", ["wind"]],
];
export function groupVariables(cat) {
  const live = cat.variables.filter(v => v.live !== false), seen = new Set();
  const out = GROUPS.map(([name, keys]) => ({ name, items: keys.map(k => live.find(v => v.key === k)).filter(Boolean) })).filter(g => g.items.length);
  out.forEach(g => g.items.forEach(v => seen.add(v.key)));
  const rest = live.filter(v => !seen.has(v.key)); if (rest.length) out.push({ name: "Other", items: rest });
  return out;
}

export function glossary(cat) {
  return { title: "Measurements", node: howShell("glossary", h("div", { class: "prose" },
    h("header", { class: "page-head" }, h("h1", { id: "page-title", tabindex: "-1" }, "Measurements you can investigate"),
      h("p", { class: "lede" }, "Plain definitions of the NASA POWER measurements that Investigate can fetch. All twelve are model-based: a computer model blends satellite and ground observations to fill the whole map.")),
    groupVariables(cat).map(g => h("section", { class: "glossary-group", "aria-labelledby": "g-" + g.name.replace(/\W/g, "") }, h("h2", { id: "g-" + g.name.replace(/\W/g, "") }, g.name),
      h("dl", { class: "gloss" }, g.items.map(v => h("div", {}, h("dt", {}, v.name), h("dd", {}, v.one_line, h("span", { class: "gl-meta" }, `Unit: ${U(v.units)} · record starts ${v.since}`, " · ", v.kind === "model_reanalysis" ? "model-based" : "satellite observation"))))))),
    h("p", { class: "note", style: "margin-top:32px" }, "A model-based series (a reanalysis) is useful for trends but is not a direct measurement. A trend in it can reflect changes in the data that feed the model as well as the climate."))) };
}

// ------------------------------------------------------------------ Data & provenance
function csvEscape(v) { return v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v); }
export function cellsCsv(claims) {
  const rows = ["claim,lat,lon,sen_slope_per_decade,rung1_flag,rung2_flag,rung3_flag,rung4_flag"];
  for (const c of claims) {
    const g = c.grid;
    for (let i = 0; i < g.n_lat; i++) for (let j = 0; j < g.n_lon; j++) {
      const k = i * g.n_lon + j; if (c.ladder[0].flags[k] == null) continue;
      rows.push([c.id, g.lat[i], g.lon[j], c.cell_slope_per_decade ? c.cell_slope_per_decade[k] : "", ...c.ladder.map(r => r.flags[k])].map(csvEscape).join(","));
    }
  }
  return rows.join("\n");
}
export function seriesCsv(claims) {
  const rows = ["claim,year,anomaly,band_lo,band_hi"];
  for (const c of claims) c.regional.years.forEach((y, i) => rows.push([c.id, y, c.regional.anomaly[i], c.regional.band_lo ? c.regional.band_lo[i] : "", c.regional.band_hi ? c.regional.band_hi[i] : ""].join(",")));
  return rows.join("\n");
}
export function ladderCsv(claims) {
  const rows = ["claim,rung,label,n_cells,n_flagged_claimed,n_flagged_any,flagged_fraction_claimed,flagged_fraction_any"];
  for (const c of claims) for (const r of c.ladder) rows.push([c.id, r.rung, r.label, r.n_cells, r.n_flagged_claimed, r.n_flagged_any, r.flagged_fraction_claimed, r.flagged_fraction_any].map(csvEscape).join(","));
  return rows.join("\n");
}
const kb = n => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB" : (n / 1048576).toFixed(1) + " MB";
const rawFor = (b, id) => b._raws.find(r => (r.claim && r.claim.claim_id === id) || (r.claims && r.claims.some(c => c.id === id)));

export function provenance(b, pick) {
  const ids = b.claims.map(c => c.id);
  let sel = ids.includes(pick) ? pick : "all";
  const body = h("div", {});
  const label = c => `${c.id} · ${c.region.name} · ${c.variable.name.split(" (")[0].toLowerCase()}`;
  const select = h("select", { id: "prov-case", onchange: e => { sel = e.target.value; draw(); } },
    h("option", { value: "all" }, "All archived cases"), b.claims.map(c => h("option", { value: c.id }, label(c))));
  select.value = sel;
  const btn = (text, fn) => h("button", { class: "btn-quiet", type: "button", onclick: fn }, text);

  function draw() {
    const claims = sel === "all" ? b.claims : b.claims.filter(c => c.id === sel), tag = sel === "all" ? "all_cases" : sel;
    const raws = sel === "all" ? b._raws : [rawFor(b, sel)].filter(Boolean);
    const bundleText = () => JSON.stringify(raws.length === 1 ? raws[0] : { bundles: raws });
    const files = [
      ["Case bundle", "Everything the page shows for the case: claim, ladder, series, verdict, run identifiers.", "JSON", bundleText, `climate_claim_on_trial_${tag}_bundle.json`, "application/json", "Download case bundle"],
      ["Ladder summary", "One row per claim and hearing: cells tested, cells flagged, shares.", "CSV", () => ladderCsv(claims), `climate_claim_on_trial_${tag}_ladder.csv`, "text/csv", "Download ladder summary"],
      ["Cell table", "One row per grid cell with data: position, Sen slope, flag at each hearing.", "CSV", () => cellsCsv(claims), `climate_claim_on_trial_${tag}_cells.csv`, "text/csv", "Download cell table"],
      ["Regional series", "Yearly regional anomaly and slope-range band.", "CSV", () => seriesCsv(claims), `climate_claim_on_trial_${tag}_series.csv`, "text/csv", "Download regional series"],
    ];
    const sizes = files.map(f => { try { return kb(new Blob([f[3]()]).size); } catch (e) { return "n/a"; } });
    const run = raws.length === 1 && raws[0].run ? raws[0].run : null;
    const one = sel !== "all" ? claims[0] : null;
    const first = claims[0];
    const rows = [h("div", { class: "file-row head", "aria-hidden": "true" }, h("span", {}, "File"), h("span", {}, "Purpose"), h("span", {}, "Format"), h("span", {}, "Size"), h("span", {}, ""))]
      .concat(files.map((f, i) => h("div", { class: "file-row" }, h("span", { class: "fname" }, f[0]), h("span", { class: "fpurpose" }, f[1]), h("span", { class: "fnum ffmt" }, f[2]), h("span", { class: "fnum fsize" }, sizes[i]),
        h("span", { class: "fact" }, i === 0 ? h("button", { class: "btn", type: "button", onclick: () => download(f[4], f[3](), f[5]) }, f[6]) : btn(f[6], () => download(f[4], f[3](), f[5]))))));
    const cmd = one ? one.id : "C-C";
    body.replaceChildren(...[
      h("p", { class: "ids" }, run ? [h("span", {}, "Run ", h("b", { class: "mono" }, run.run_id)), h("span", {}, "Schema ", h("b", { class: "mono" }, raws[0].schema_version || "n/a")),
        h("span", {}, "Code ", h("b", { class: "mono" }, run.code_version || "n/a")), h("span", {}, "Seed ", h("b", { class: "mono" }, String(run.seed))), h("span", {}, "Generated ", h("b", {}, run.generated_at ? run.generated_at.replace("T", " ").slice(0, 16) + " ET" : "n/a"))]
        : h("span", {}, `${claims.length} archived cases; pick one case to see its run identifiers.`)),
      one && run && run.input_sha256 ? h("p", { class: "ids" }, h("span", {}, "Input hashes (SHA-256) · claim ", h("b", { class: "mono" }, run.input_sha256.claim_json.slice(0, 12)), " · monthly values ", h("b", { class: "mono" }, run.input_sha256.monthly_npz.slice(0, 12)))) : null,
      one ? h("p", { class: "muted small" }, one.product.name, ", version ", one.product.version, ", DOI ", one.product.doi, " · ", kindChip(one.data_kind).textContent) : null,
      h("div", { class: "file-rows", role: "group", "aria-label": "Files for the selected case" }, rows),
      h("h2", { class: "section", id: "reproduce" }, "Reproduce a case"),
      h("p", { class: "muted", style: "max-width:68ch" }, `These steps rebuild an archived case from the NASA source files. They do not reproduce a live Investigate session, which runs in your browser and is not stored. ${REPO_URL ? "" : "The public repository link will be added here at submission; the folders below are in the project repository."}`),
      REPO_URL ? h("p", {}, h("a", { href: REPO_URL }, "Project repository (MIT licence)")) : null,
      h("h3", {}, "1. Fetch the NASA data"),
      h("p", { class: "muted small" }, cmd === "C-C" ? "C-C uses NASA POWER and needs no key." : "This case uses NASA Earthdata and needs a free Earthdata token in the EARTHDATA_TOKEN environment variable."),
      h("pre", { class: "cmd", tabindex: "0" }, cmd === "C-C" ? "python data/scripts/fetch_power_cc.py\npython data/scripts/make_contract_cc.py" : `data\\.venv\\Scripts\\python.exe -I data\\scripts\\fetch_earthdata.py ${cmd}`),
      h("h3", {}, "2. Run the statistics"),
      h("pre", { class: "cmd", tabindex: "0" }, `cd stats\npython scripts/run_case.py ${cmd}`),
      h("p", { class: "muted small" }, `This writes stats/out/${cmd}/bundle.json, the file you can download above. The run identifier and input hashes should match.`),
      h("h3", {}, "3. Check it"),
      h("pre", { class: "cmd", tabindex: "0" }, "cd stats\npython -m pytest\n\ncd ..\npython web/tools/serve.py   # then open http://127.0.0.1:8765/"),
      null].filter(Boolean));
  }
  draw();

  const ledger = h("section", { class: "section", id: "registration", "aria-labelledby": "reg-h" },
    h("h2", { id: "reg-h" }, "Registration and amendments"),
    h("p", {}, h("b", {}, "Registered before data download (10:29 AM ET), with two dated method amendments made on simulated data before results, and one disclosed cell-rule correction."), " All of it happened on Saturday, November 14, 2026."),
    h("ol", { class: "ledger" },
      h("li", {}, h("span", { class: "when" }, "10:29 AM ET"), h("b", {}, "Registration"), "Before any claim data were downloaded, we wrote down three claims with their regions, seasons and periods (Alaska air temperature, Sahel rainfall, southeastern US land surface temperature). We also wrote down the methods: Mann-Kendall with the Hamed-Rao correction as the one regional test, the four-hearing ladder for the map, and Benjamini-Hochberg at q = 0.10. A fourth claim, Wisconsin smoke and haze, was added at 10:35 AM ET, also before any of its data."),
      h("li", {}, h("span", { class: "when" }, "11:22 AM ET (addendum 2)"), h("b", {}, "Amendment 1: the regional test"), "Simulations on synthetic series, run before any claim result, showed Hamed-Rao raised too many false alarms (about 7% instead of 5%) at the persistence of the Alaska series. The shipped test became the candidate that passes the false-alarm check and has the most power. For Alaska that is Yue-Wang. The registered Hamed-Rao and the raw test stay on the page as context."),
      h("li", {}, h("span", { class: "when" }, "Before the other claims were run"), h("b", {}, "Amendment 2: the bias bar"), "The pass bar for bias in the Sen slope was relaxed (bias within 3 Monte Carlo standard errors, or within 0.025 standard deviations per decade), because the stricter bar would fail about two scenarios by chance alone and five failed, all negligible in size. The original bar and its failures stay published. The Alaska case is unaffected."),
      h("li", {}, h("span", { class: "when" }, "After the first Alaska result"), h("b", {}, "One correction: the cell-test rule"), "The first run chose the cell test with the highest false-discovery power instead of following the written rule (keep the shipped test if it keeps false-discovery control). We corrected it after seeing the first Alaska result. Both runs are kept and disclosed. It changes the map (hearings 3 and 4), not the regional test.")),
    h("p", {}, "So the question, region, season and period were registered before the data and not changed. The methods were not run once, exactly as registered: they were amended twice on simulated data before results, and one cell rule was corrected afterwards. A registered question with amended methods is not an unchanged preregistered analysis, and we do not claim it is. The full text is in event_record/WP0_CLAIM_REGISTRATION.md and event_record/STATS_LOG.md in the project repository."));

  const credits = h("section", { class: "section", "aria-labelledby": "cr-h" }, h("h2", { id: "cr-h" }, "Sources, tools and credits"),
    h("p", { style: "max-width:68ch" }, "NASA Earth data products are named on each case, with product, version and DOI. Maps: coastlines and country borders from Natural Earth (public domain) via the world-atlas package 2.0.2 (ISC licence); US state outlines from the US Census Bureau cartographic boundary files via the us-atlas package 3.0.1 (ISC licence). Live data in Investigate: NASA POWER (MERRA-2 and CERES based parameters), fetched from your browser to NASA. Statistics checked against the pymannkendall package. The project is MIT licensed; the generic starter theme is disclosed as pre-existing and MIT licensed. Parts of the code and the sentence templates were produced with LLM assistance that Walter Guevara directed and checked. Not endorsed by NASA."));

  return { title: "Data & provenance", node: h("div", {},
    h("header", { class: "page-head" }, h("h1", { id: "page-title", tabindex: "-1" }, "Data & provenance"),
      h("p", { class: "lede" }, "Download the archived case files and check any number yourself. These files cover registered cases only, not your own Investigate session."),
      b.synthetic ? h("p", { class: "callout" }, h("b", {}, "Synthetic data. "), b.notice || "These files hold placeholder numbers, not results.") : null),
    h("div", { class: "prov-select" }, h("label", { for: "prov-case" }, "Case"), select),
    body, ledger, credits) };
}
