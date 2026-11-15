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
  const withheldN = b.claims.filter(c => c.verdict.branch === "withheld").length;
  const stage = (n, title, ...kids) => h("section", { class: "stage", "aria-labelledby": "st" + n }, h("span", { class: "stage-n", "aria-hidden": "true" }, String(n)), h("div", {}, h("h2", { id: "st" + n }, title), ...kids));
  return { title: "Method", node: howShell("method", h("div", { class: "prose" },
    h("header", { class: "page-head" }, h("h1", { id: "page-title", tabindex: "-1" }, "How a trend gets tested"),
      h("p", { class: "lede" }, "A trend is a claim about the past. Four stages decide how far to believe it, and each one can make the answer stronger or weaker.")),
    stage(1, "Fix the question first",
      h("p", {}, "A case file begins with a written claim: a variable, a region, a season and a period. We wrote ours down before downloading any claim data, so the question could not be bent to fit the answer."),
      why("If you may choose the years after seeing the data, you may choose the answer. The Home page shows one record that supports opposite headlines."),
      h("p", {}, "Investigate works the other way round: you choose everything, so its result is labeled exploratory. Our rule is: questions registered; methods amended and disclosed; final gate frozen. The case questions were registered in advance, but the methods were amended: two on simulated data before any result, and the validation gate after the results. ", h("a", { href: "#/data/registration" }, "Read what changed and when"), ".")),
    stage(2, "Measure how much changed",
      h("p", {}, "The Sen slope is the median of the slopes between every pair of years. One odd year barely moves it. We report it per decade with a 95% interval, and draw the ordinary least squares line beside it as the familiar baseline."),
      why("A slope on its own says little. The interval says how steep the trend could plausibly be, and a withheld record shows its slope as a description only."),
      disc("Technical details: the interval and the band",
        h("p", {}, "For the Alaska case the interval is the analytic Sen interval. In simulations it passed a coverage check: it must catch the true slope at least 90% of the time, against a nominal 95%. It describes the slope, not individual years."),
        h("p", {}, "The band on the chart is the Sen line tilted between the lower and upper ends of that interval, pivoting at the middle year. It shows how steep the trend could be. It says nothing about the level, so it is not a full confidence band."))),
    stage(3, "Ask whether chance could explain it",
      h("p", {}, "The Mann-Kendall test asks whether later years tend to be higher or lower than earlier ones, with no straight-line assumption. The answer is a p-value. A p-value below ", String(a), " is called significant. It means a pattern this strong would be rare if there were no trend, under the test's assumptions. It is not the probability that chance produced the pattern, and a larger p-value does not prove there is no trend."),
      why("Neighboring years often resemble each other. Ignoring that makes p-values too small and trends look more certain than they are. A correction widens the test to allow for it."),
      disc("Technical details: which correction",
        h("p", {}, "We registered Hamed-Rao first. Before any result, a simulation on synthetic series picked the correction that kept false alarms closest to 5% for each claim. At the persistence of the Alaska series Hamed-Rao raised too many false alarms (about 7% instead of 5%), so Alaska uses Yue-Wang. For the Sahel case it is now a moving-block bootstrap Mann-Kendall. Sahel's years alternate (a wet year tends to be followed by a drier one). Our first round of checks rounded that up to no persistence at all; after an outside review we simulated negative persistence too (round 3, disclosed as Addendum 4, a change made after the results), and this test was the best-calibrated one that passed. Hamed-Rao stays on the page as context."),
        h("p", {}, "Simulation checks show how a test performs under the stated scenarios (series length, year-to-year persistence, skew). They do not show that a test is calibrated for every record, and they are not the probability that a particular claim is true."),
        h("p", {}, "The 0.05 threshold is a convention, not a scale of certainty."))),
    stage(4, "Test every grid cell, then count",
      h("p", {}, "The map repeats the test in every grid cell. Four hearings change one thing each: (1) raw Mann-Kendall, treating every year as independent; (2) each cell compared with its own seasonal normal; (3) the memory correction chosen for the claim; (4) the Benjamini-Hochberg false-discovery step at q = ", String(q), " applied to the hearing 3 p-values. The two NO₂ case pages show hearings 1 to 3 only, because hearing 4 was not validated for them. All hearings reuse one dataset, so they are not independent confirmations."),
      why("Test thousands of cells and some will look significant by luck. The hearings ask different questions of the same map, so you can see how much of it is flagged under each. A hearing can remove flags, add flags or change nothing. We show what happened."),
      h("div", { class: "callout info" }, h("p", {}, h("b", {}, "Hearing 4 is a different question, not a tougher test. "), `It limits the expected share of false alarms among flagged cells at q = ${q}, a different cut from ${a}, so it can add flags as well as remove them. It does not control the share of the map area that is wrong, and it does not confirm any single hotspot.`)),
      disc("Technical details: cell share and area share",
        h("p", {}, "The cell share counts every grid cell once. The area share weights cells by the cosine of latitude, because high-latitude cells cover less ground. Alaska, hearing 4: 750 of 861 cells (87.1%), 85.2% of the area. Both are shares of the tested map, not probabilities: neither is the chance that the claim is true."),
        h("p", {}, `We declared q = ${q} before seeing any result. For independent or positively dependent cells, Benjamini-Hochberg controls the expected share of false discoveries among flagged cells. Neighboring cells are correlated, so we checked the rate on correlated synthetic fields.`))),
    h("section", { class: "section", id: "known-limits", "aria-labelledby": "kl-h" }, h("h2", { id: "kl-h" }, "Known limits and the checks made after the results"),
      h("p", {}, "These limits are in plain view because a careful reader should hear them from us. None of them changes a ruling. The numbers marked exploratory were computed after the results, were logged before they were computed (event_record/STATS_LOG.md), and are not the registered test."),
      h("ul", { class: "limits-list" },
        h("li", {}, h("b", {}, "What our simulated checks assume. "), "They assume that a year's departure carries over only into the next year (one-year memory), that the noise is bell-shaped or one-sided skewed, and that the trend is a straight line. They did not test long-memory noise, sudden steps, rare extreme years such as smoke summers, or curved trends. Long-memory noise would make every test raise more false alarms; curved trends make the gate withhold."),
        h("li", {}, h("b", {}, "Curved trends. "), "The gate measures year-to-year memory around a straight line, so a trend that bends looks like memory and the gate withholds. In a simulation of a clean curved decline shaped like the eastern US NO\u2082 record, with no memory at all, the gate gave a verdict in 0 of 2,000 runs (a reviewer's larger check, 20,000 runs, also found 0). With twice the noise it gave one in 13% of runs, and with four times in 59%: a cleaner signal is less likely to get a verdict. That is a weakness of our gate, not a finding about the record. A no-trend simulation with memory as high as 0.8 gives a chance of about 0.015 for a trend this strong, and only at 0.9 does it reach 0.055, so the case for the decline rests on outside knowledge of emission controls."),
        h("li", {}, h("b", {}, "Sahel: both tests, and what power means. "), "The Sahel rainfall trend is significant under both tests we ran: p = 0.030 under the first (plain Mann-Kendall), p = 0.004 under the second (bootstrap Mann-Kendall, 499 resamples, so the smallest possible p is 0.002; written after we saw the first results). The first test was already valid for this series, only cautious. The change bought power, not validity. \"Partly supported\" reflects what a 25-season map can see: in our simulated map settings a map finds between 0.7% and 24% of the cells that truly change by the reference amount (under 12% in eight of the ten settings), so a small flagged share is not evidence that the change is narrow."),
        h("li", {}, h("b", {}, "Sahel: dependence on year-to-year memory. "), "In 2001 to 2025 Sahel wet seasons tend to alternate (memory about -0.67). In an exploratory simulation of series with no trend, a pattern as strong as the observed one happens by chance 0.05% of the time at memory -0.7, 2.8% at 0, 4.1% at 0.1, 7.2% at 0.2 and 8.3% at 0.3. So the result holds if this window's alternation is a real property of the record, and it stops being significant at memory 0.2 or more, as in longer Sahel records. An estimate as low as -0.67 in 25 years would be very unlikely (about 1 in 3,000) if the true memory were zero, so we think this window really alternates."),
        h("li", {}, h("b", {}, "Cells and boxes. "), "The Sahel map's test was checked at the memory of the regional series (-0.7 and -0.5), but the individual cells are less negative (middle cell about -0.16, a fifth above zero), so the 22.3% flagged comes from a test used partly outside its checked range; the first test flagged 15.6%. Some analysis cells reach past the registered boxes: the Wisconsin map uses 42 one-degree cells from 42 to 48 N and 93 to 86 W against a registered box of 42.5 to 47.1 N and 92.9 to 86.8 W (it includes parts of Lake Michigan and Lake Superior), and the Alaska and eastern US boxes include sea cells because POWER and OMI cells have no land mask."),
        h("li", {}, h("b", {}, "IMERG and CRU. "), "IMERG's rain estimates come from a changing set of satellite sensors (TRMM before 2014, GPM after, different microwave sensors over time), and the Final product is adjusted each month to rain-gauge totals from GPCC, so a trend in it can partly reflect its inputs. The CRU station record uses many of the same gauges, so the two are a cross-check, not independent measurements."),
        h("li", {}, h("b", {}, "Reanalysis and satellite drift. "), "Alaska is MERRA-2 model output; stations warm about 0.06 \u00b0C per decade slower (difference p = 0.018, and the MERRA-2 box includes sea cells). For Terra, MODIS already trails station air temperature by about 0.5 \u00b0C per decade over 2001 to 2020 (p = 0.003), before the orbit drift, so the drift does not explain the whole gap. Aqua's later overpass since 2021 is flagged in our library but not removed from the Wisconsin case; a reviewer's check found that three smoke summers (2021, 2023, 2025) carry the rise there."),
        h("li", {}, h("b", {}, "False alarms among verdicts that were given. "), "The 5% bar we checked is the overall rate with withheld series counted as no call. Among simulated trendless Alaska-like series that did receive a verdict, 7.4% were called significant (4.8% overall). That is above 5%, so Alaska's p-value is a little less strong than it looks. In an exploratory check, a pattern as strong as Alaska's would arise with no trend only 0.2% to 0.9% of the time at memory 0.1 to 0.3."),
        h("li", {}, h("b", {}, "Six claims, no adjustment across cases, well-known claims. "), "Each claim was tested on its own at the 5% level. A Holm adjustment of the three released p-values (exploratory arithmetic) gives Alaska 0.004, Sahel 0.008 and Wisconsin 0.114; with the first Sahel test the Sahel figure would be 0.060 and would not pass 0.05. We chose well-known claims on purpose, for teaching.")),
      h("p", {}, "Every case page repeats the limits that matter for it in a short list under its ruling, with the numbers above in a collapsed exploratory panel. ", h("a", { href: "#/data/registration" }, "Registration and amendments"))),
    h("section", { class: "section", "aria-labelledby": "proof-h" }, h("h2", { id: "proof-h" }, "Standards of proof"),
      h("p", {}, "Courts ask for different amounts of evidence at different moments. The rows below borrow the idea. It is an analogy, not a legal test. Statistics never establishes that a claim is true, and none of these labels is a probability that it is."),
      h("table", { class: "analogy-table" }, h("caption", { class: "sr-only" }, "Three legal standards of proof and their rough counterparts in this project"),
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "In a court"), h("th", { scope: "col" }, "In this project"))),
        h("tbody", {},
          h("tr", {}, h("th", { scope: "row" }, "Reasonable suspicion"), h("td", {}, h("b", {}, "An exploratory look. "), "Enough to ask a question. Anything you find in Investigate is of this kind.")),
          h("tr", {}, h("th", { scope: "row" }, "Preponderance of the evidence"), h("td", {}, h("b", {}, "Supported by this data. "), "The tests lean one way for one dataset, one box and one period.")),
          h("tr", {}, h("th", { scope: "row" }, "The strongest label (no courtroom equivalent)"), h("td", {}, h("b", {}, "The strongest standard this tool applies: survives every correction and the map-wide check. "), "It holds after the memory correction and the false-discovery step, and across the map, not only in one regional average. It is still not proof."))))),
    h("section", { class: "section", "aria-labelledby": "verdict-h" }, h("h2", { id: "verdict-h" }, "Reading a verdict"),
      h("ul", {}, h("li", {}, h("b", {}, "Five outcomes can appear. "), "Supported; partly supported (the regional average moved but not much of the map did, though a small flagged share can also mean the map has little power at this length of record); not supported (the record does not show the claimed change at the registered bar); contradicted (the record moved the other way); and withheld, which means the court cannot rule on this evidence: no test passes its false-alarm check for that record, or the record has more year-to-year memory than our checks cover. ", `${withheldN} of the ${b.claims.length} registered cases are in that last group (the Southeast US and the two NO₂ regions), and withholding is what the gate is built to do when no test passes its checks. For the two NO₂ regions it also exposes a weakness of the gate: a trend that bends can look like year-to-year memory, so even a clean curved decline would very rarely get a ruling. `, "\"Not supported\" is not proof that nothing changed, and where the test is conservative, as for Wisconsin, it is not evidence that the change did not happen."),
        h("li", {}, h("b", {}, "A verdict is scoped. "), "\"Supported\" is never a general statement. It always names one dataset, one box and one period, and it says the tests lean one way there, not that the claim is true."),
        h("li", {}, h("b", {}, "The thresholds are conventions. "), "The 25% and 5% flagged-area cut-offs between supported and partly supported were chosen before results. They are not a calibrated scale."),
        h("li", {}, h("b", {}, "The map and the series are one source. "), "They come from the same data, so they are not independent evidence."),
        h("li", {}, h("b", {}, "What we do not claim. "), "We do not say what caused a change or forecast one. A regional number is not a number for a single cell. The interval on a headline result is not adjusted for our having picked that headline, and p-values are not adjusted across the six cases. A model-based variable is model output, not a measurement."))),
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
    h("p", { class: "note", style: "margin-top:32px" }, "A reanalysis combines observations with a computer model to reconstruct past conditions. A model-based series is useful for trends but is not a direct measurement. A trend in it can reflect changes in the data that feed the model as well as the climate."))) };
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
      ["Case bundle", "Everything the page shows for the case: claim, hearing results, series, verdict, run identifiers.", "JSON", bundleText, `climate_claim_on_trial_${tag}_bundle.json`, "application/json", "Download case bundle"],
      ["Hearing summary", "One row per claim and hearing: cells tested, cells flagged, shares.", "CSV", () => ladderCsv(claims), `climate_claim_on_trial_${tag}_ladder.csv`, "text/csv", "Download hearing summary"],
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
    const cmd = one ? one.id : "C-C", noKey = cmd === "C-C", isNo2 = cmd === "C-E1" || cmd === "C-E2";
    body.replaceChildren(...[
      h("p", { class: "ids" }, run ? [h("span", {}, "Run ", h("b", { class: "mono" }, run.run_id)), h("span", {}, "Schema ", h("b", { class: "mono" }, raws[0].schema_version || "n/a")),
        h("span", {}, "Code ", h("b", { class: "mono" }, run.code_version || "n/a")), h("span", {}, "Seed ", h("b", { class: "mono" }, String(run.seed))), h("span", {}, "Generated ", h("b", {}, run.generated_at ? run.generated_at.replace("T", " ").slice(0, 16) + " ET" : "n/a"))]
        : h("span", {}, `${claims.length} archived cases; pick one case to see its run identifiers.`)),
      one && run && run.input_sha256 ? h("p", { class: "ids" }, h("span", {}, "Input hashes (SHA-256) · claim ", h("b", { class: "mono" }, run.input_sha256.claim_json.slice(0, 12)), " · monthly values ", h("b", { class: "mono" }, run.input_sha256.monthly_npz.slice(0, 12)))) : null,
      one ? h("p", { class: "muted small" }, one.product.name, ", version ", one.product.version, ", DOI ", one.product.doi, " · ", kindChip(one.data_kind).textContent) : null,
      h("div", { class: "file-rows", role: "group", "aria-label": "Files for the selected case" }, rows),
      h("h2", { class: "section", id: "reproduce" }, "Reproduce a case"),
      h("p", { class: "muted", style: "max-width:68ch" }, `These steps rebuild an archived case from the NASA source files. They do not reproduce a live Investigate session, which runs in your browser and is not stored. ${REPO_URL ? "" : "The public repository link will be added here at submission; the folders below are in the project repository."}`),
      REPO_URL ? h("p", {}, h("a", { href: REPO_URL }, "Project repository (MIT license)")) : null,
      h("p", { class: "muted small" }, `Commands use POSIX paths; on Windows replace .venv/bin/python with .venv\Scripts\python.exe. Run them from the repository root unless a cd says otherwise.${one ? "" : " The examples below use C-C; choose a case above to see its own commands."}`),
      h("h3", {}, "1. Fetch the NASA data (optional; the data subsets are already in the repository)"),
      h("p", { class: "muted small" }, noKey ? "C-C uses NASA POWER and needs no key." : "This case uses NASA Earthdata and needs a free Earthdata token in the EARTHDATA_TOKEN environment variable."),
      h("pre", { class: "cmd", tabindex: "0" }, ["uv venv --python 3.12 data/.venv", "uv pip install --python data/.venv/bin/python -r data/requirements.txt", "",
        ...(noKey ? ["data/.venv/bin/python -I data/scripts/fetch_power_cc.py", "data/.venv/bin/python -I data/scripts/make_contract_cc.py"] : isNo2 ? ["data/.venv/bin/python -u -I data/library/scripts/build_no2.py", "data/.venv/bin/python -u -I data/library/scripts/make_no2_cases.py"] : [`data/.venv/bin/python -I data/scripts/fetch_earthdata.py ${cmd}`])].join("\n")),
      h("h3", {}, "2. Install the statistics environment and run the statistics"),
      h("pre", { class: "cmd", tabindex: "0" }, ["uv venv --python 3.12 stats/.venv", "uv pip install --python stats/.venv/bin/python -r stats/requirements.txt", "", "cd stats",
        `.venv/bin/python -m trendtrial.pipeline ../data/${cmd} --out ../scratch/${cmd} \\`, `    --validation out/validation/${isNo2 ? "validation_results_n21.json" : "validation_results.json"}`].join("\n")),
      h("p", { class: "muted small" }, `This writes scratch/${cmd}/bundle.json, which matches the case bundle you can download above, apart from the timestamp. ${isNo2 ? "The NO₂ cases use the n = 21 validation file, which adds the 21-year simulations. " : ""}${run ? `The run identifier should be ${run.run_id}. ` : "The run identifier and input hashes should match the ones listed for the case. "}Do not add -I to this command: it would hide the trendtrial package from Python.`),
      h("h3", {}, "3. Check it"),
      h("pre", { class: "cmd", tabindex: "0" }, [".venv/bin/python -m pytest -q -p no:cacheprovider", "", "cd ..", "python web/tools/serve.py   # then open http://127.0.0.1:8765/"].join("\n")),
      null].filter(Boolean));
  }
  draw();

  const ledger = h("section", { class: "section", id: "registration", "aria-labelledby": "reg-h" },
    h("h2", { id: "reg-h" }, "Registration and amendments"),
    h("p", {}, h("b", {}, "Questions registered; methods amended and disclosed; final gate frozen."), " The questions were registered before data download (10:29 AM ET). Three kinds of change came later, and all are disclosed: two dated method amendments made on simulated data before results, a short list of corrections (below), and one validation-rule change made after the results (Addendum 4). All of it happened on Saturday, November 14, 2026. The NO₂ pair (C-E1 and C-E2) was registered at 1:15 PM ET, before any NO₂ data were downloaded."),
    h("ol", { class: "ledger" },
      h("li", {}, h("span", { class: "when" }, "10:29 AM ET"), h("b", {}, "Registration"), "Before any claim data were downloaded, we wrote down three claims with their regions, seasons and periods (Alaska air temperature, Sahel rainfall, southeastern US land surface temperature). We also wrote down the methods: Mann-Kendall with the Hamed-Rao correction as the one regional test, four hearings for the map, and Benjamini-Hochberg at q = 0.10. A fourth claim, Wisconsin smoke and haze, was added at 10:35 AM ET, also before any of its data."),
      h("li", {}, h("span", { class: "when" }, "11:22 AM ET (addendum 2)"), h("b", {}, "Amendment 1: the regional test"), "Simulations on synthetic series, run before any claim result, showed Hamed-Rao raised too many false alarms (about 7% instead of 5%) at the persistence of the Alaska series. The shipped test became the candidate that passes the false-alarm check and has the most power. For Alaska that is Yue-Wang. The registered Hamed-Rao and the raw test stay on the page as context."),
      h("li", {}, h("span", { class: "when" }, "Before the other claims were run"), h("b", {}, "Amendment 2: the slope-bias threshold"), "The pass threshold for bias in the Sen slope (systematic over- or underestimation) was relaxed to bias within 3 simulation standard errors, or within 0.025 standard deviations per decade. The stricter threshold would fail about two scenarios by chance alone, and five failed, all negligible in size. The original threshold and its failures stay published. The Alaska case is unaffected."),
      h("li", {}, h("span", { class: "when" }, "After the first Alaska result"), h("b", {}, "A correction: the cell-test rule"), "The first run chose the cell test with the highest false-discovery power instead of following the written rule (keep the shipped test if it keeps false-discovery control). We corrected it after seeing the first Alaska result. Both runs are kept and disclosed. It changes the map (hearings 3 and 4), not the regional test."),
      h("li", { id: "addendum-3" }, h("span", { class: "when" }, "1:15 PM ET (addendum 3)"), h("b", {}, "Registration of the NO₂ pair"), "Before any NO₂ data were downloaded, we registered two more claims as an opposite-sign pair driven by the same process, combustion emissions and the controls on them: tropospheric NO₂ over the eastern United States has fallen (C-E1), and over the Indo-Gangetic Plain in northern India has risen (C-E2), both as annual means, 2005 to 2025, from NASA's OMI instrument on the Aura satellite. They use the same tests, hearings and gates as the other cases, and OMI's own quality flags decide which rows are used. Both were run later, after Addendum 4, under its rules, and both came back withheld: the record's year-to-year memory is beyond what our validated tests can handle at 21 years. No rule was changed after those results."),
      h("li", { id: "addendum-4" }, h("span", { class: "when" }, "2:52 PM ET (addendum 4, after results)"), h("b", {}, "Post-result change: the validation gate"), "An outside review of the first full set of results found that the gate rounded negative persistence up to zero, checked skewness with one scenario that actually measured persistence, and let missing years pass. We changed the gate, not the claims, bars or candidate tests, and re-ran every case. Sahel stayed \"partly supported\" but got stronger (the shipped test changed to a bootstrap Mann-Kendall; p 0.030 to 0.004). For the Sahel the earlier test was already valid, only cautious, so the change added power, not validity. Wisconsin changed from \"withheld\" to \"not supported\". Alaska and the Southeast US kept their rulings. This is a post-result change, shown beside the round 2 numbers on each affected case; the round 2 bundles and run IDs are kept and marked superseded.")),
    h("p", {}, "So the question, region, season and period were registered before the data and not changed. The methods were not run once, exactly as registered: they were amended twice on simulated data before results, one cell rule was corrected afterwards, and the validation gate was changed after the results were seen. A registered question with amended methods is not an unchanged preregistered analysis, and we do not claim it is. We also picked well-known claims on purpose, for teaching: registration fixes the data, region, period and test before download, not whether the answer was already known. The full text is in event_record/WP0_CLAIM_REGISTRATION.md and event_record/STATS_LOG.md in the project repository."), h("h3", { id: "git-limit" }, "What git can and cannot prove"), h("p", {}, "The claim set (commit 839f802, 10:29 AM ET) and the NO\u2082 pair's pre-run plan (commit 1b101af, 4:43 PM ET, before its results in 4e6d168 at 5:12 PM) were committed before their results. The round 2 and round 3 rules were not. We wrote them in our log at 11:40 AM and 1:40 PM, but they first appear in git in the same commits as their results (1e93307 at 12:09 PM and 3152f39 at 2:51 PM). So git cannot show that those rules were written before the results they changed. That rests on our log, and the log's times were typed by the workers (several were corrected afterwards). The git commit times are the record. The post-result checks added after the science review (the Method page, Known limits) were logged before they were computed (commit 39a9580)."), h("p", {}, "The registration hash file has two lines: the Addendum 3 version of the registration text, and the current file after Addendum 4, which is the one that matches today."), h("h3", { id: "corrections" }, "Corrections and amendments we know of"), h("ol", {}, h("li", {}, "The first run of the map rule did not follow the instruction we had written. We corrected it after the first Alaska run and kept both runs."), h("li", {}, "The pass bar for bias in the Sen slope was relaxed before the Sahel, Southeastern US and Wisconsin runs (amendment 2)."), h("li", {}, "A typo in our log gave the overall false-alarm limit as 0.047 instead of 0.05 plus two standard errors. The code always used the right one, and the log line was fixed in place."), h("li", {}, "The first run of the 21-year NO\u2082 checks used the wrong Python installation. It was stopped, kept in a folder marked discarded, and repeated with the right one."), h("li", {}, "Addendum 4 first said the Sahel round 2 test was Yue-Wang. It was plain Mann-Kendall, corrected nine minutes later."), h("li", {}, "Several header times in our log and in Addendum 4 were corrected to the git commit times."), h("li", {}, "Bugs found and fixed before anything shipped: a tie-variance error in Mann-Kendall, a double scale factor in haze data and a flipped NO\u2082 grid, all caught by our own checks.")));

  const credits = h("section", { class: "section", "aria-labelledby": "cr-h" }, h("h2", { id: "cr-h" }, "Sources, tools and credits"),
    h("p", { style: "max-width:68ch" }, "NASA Earth data products are named on each case, with product, version and DOI. Maps: coastlines and country borders from Natural Earth (public domain) via the world-atlas package 2.0.2 (ISC license); US state outlines from the US Census Bureau cartographic boundary files via the us-atlas package 3.0.1 (ISC license). Live data in Investigate: NASA POWER (MERRA-2 and CERES based parameters), fetched from your browser to NASA. Statistics checked against the pymannkendall package. The project is MIT licensed; the generic starter theme is disclosed as pre-existing and MIT licensed. Parts of the code and the sentence templates were produced with LLM assistance that Walter Guevara directed and checked. Not endorsed by NASA."));

  return { title: "Data & provenance", node: h("div", {},
    h("header", { class: "page-head" }, h("h1", { id: "page-title", tabindex: "-1" }, "Data & provenance"),
      h("p", { class: "lede" }, "Download the archived case files and check any number yourself. These files cover registered cases only, not your own Investigate session."),
      b.synthetic ? h("p", { class: "callout" }, h("b", {}, "Synthetic data. "), b.notice || "These files hold placeholder numbers, not results.") : null),
    h("div", { class: "prov-select" }, h("label", { for: "prov-case" }, "Case"), select),
    body, ledger, credits) };
}
