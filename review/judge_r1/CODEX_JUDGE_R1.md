# Codex judge panel, round 1 (read-only run, 2026-11-14)

Screenshots: this folder. Detective captured before redesign, form state only; live POWER fetch not exercised. Full tool trace: codex_stdout.log. Prompt: prompt.md.

**Panel verdict: 15/25.** This goes beyond a Giovanni plot plus a p-value in its statistical auditing and provenance. But the website currently misrepresents parts of that audit: it displays a rejected interval, presents an obsolete test as the ruling’s test, and overstates how completely the methods were registered in advance.

## 1. What I actually saw—and could not see

I reviewed the supplied light-theme screenshots, both phone captures, both tall captures, and all six dark-theme page captures. I read the requested app files, Python statistical implementation, schema, registration and work logs, challenge notes, and additional adapters, chart/map code, provenance, tests, and submission outline.

I independently reconstructed the Alaska regional series from the archived NASA CSV:

| Check | Reproduced result |
|---|---:|
| Valid years | 45 |
| Sen slope | +0.44285 °C/decade |
| Yue-Wang corrected MK p-value | 0.00147113 |
| Maximum difference from bundled yearly anomalies | <0.000005 °C |
| Archived CSV and pipeline input hashes | Match recorded hashes |

That establishes a real, traceable calculation. It does **not** validate every inferential assumption.

I did **not** exercise the live POWER requests or browser interactions, rerun pytest, or observe Detective results visually. The Detective source already describes a newer step-based redesign than the screenshots; I give it implementation credit, not verified visual credit. The official challenge URL failed to load during this review, so challenge interpretation uses the supplied page/video notes.

I found a seven-slide **outline**, not a finished presentation or video: `submission/SLIDES_OUTLINE.md`.

## 2. Baseline comparison

| Dimension | Against a strong Giovanni-plus-p-value entry |
|---|---|
| NASA access | A practical browser-to-POWER implementation with tiling, deduplication, progress and error handling goes beyond a pasted Giovanni result. Live completion remains unverified here. (`web/js/live.js:77`) |
| Statistical substance | Sen slope, autocorrelation comparisons, multiple-testing treatment, synthetic calibration, failed-method logs and withholding rules are substantial additions. (`stats/trendtrial/validation.py`; `event_record/STATS_LOG.md`) |
| Reproducibility | Archived data, request URLs, hashes, deterministic run identifiers and downloadable results exceed the baseline. Public-facing reproduction instructions are incomplete. (`data/C-C/C-C_provenance.json`; `web/js/views/pages.js:68`) |
| Teaching | Explicit variable definitions, two guided examples and separation of exploration from registered claims address the brief. Thirteen initial choices and several competing statistical narratives burden beginners. (`web/data/variables.json`; `detective_light_tall.png`) |
| Scientific breadth | Only Alaska MERRA-2 temperature is shipped as a real case. MODIS LST, IMERG rainfall and Wisconsin MODIS AOD remain catalogue records and prepared fetch code. (`web/data/index.json`; `event_record/DATA_LOG.md:21`) |
| Reliability | The baseline can win here: one correctly labelled plot and p-value is more trustworthy than several contradictory displays. (`web/js/data.js:69`) |

**What is decoration:** gavels, “Exhibit A,” docket numbers, stamps and courtroom terminology. These earn presentation credit only when they help someone understand the evidence.

**What is substantive creativity:** showing how assumptions change an answer, retaining failed calibration results, and making the result auditable. Four named rungs alone are not innovation; their scientific meaning matters. In this complete annual record, the seasonal-anomaly rung necessarily changes nothing.

## 3. Scores

Scores reflect the reviewed state. Presentation has the same maximum weight as every other criterion.

| Criterion | Panel | NASA scientist | Statistician | UX judge | One-line justification |
|---|---:|---:|---:|---:|---|
| Impact | **3** | 3 | 3 | 3 | Useful educational potential, but only one completed case and no demonstrated student learning outcome. |
| Creativity | **4** | 4 | 4 | 4 | An inspectable challenge to statistical assumptions meaningfully exceeds the baseline; courtroom styling contributes little scientifically. |
| Validity | **2** | 3 | 2 | 2 | Alaska reproduces, but the displayed interval/test conflict with the selected analysis and calibration claims exceed what was tested. |
| Relevance | **4** | 4 | 4 | 4 | NASA data drives the analysis; misleading source labels and unavailable advertised examples prevent full marks. |
| Presentation | **2** | 2 | 2 | 2 | Coherent desktop styling, but clipped phone content, contradictory explanations and an unfinished submission artifact are substantial defects. |
| **Total** | **15/25** | **16/25** | **15/25** | **15/25** | |

The scientist gives more credit for the reproduced data pipeline. The statistician and UX judge regard a wrong displayed uncertainty interval as a central validity failure, regardless of whether the backend is correct.

## 4. TOP 10 CHANGES, ranked by likely score gain per hour

Estimates are focused implementation hours, not guarantees; gains overlap.

| Rank | Change and evidence | Criteria moved | Hours | Concrete acceptance test |
|---|---|---|---:|---|
| **1** | Make every case display consume the **selected** test, interval and gates. Currently the adapter selects bootstrap endpoints and registered HR statistics. (`web/js/data.js:69`, `:92`) | Validity, Presentation | 1–2 | Open `#/case/C-C`: ruling, regional statistics, finding, clipboard and accessible chart description all identify Yue-Wang, p≈0.00147, factor≈1.10, interval **0.19045–0.628303**. A disabled-interval bundle renders without a band or an error. |
| **2** | Remove unsupported promises and broken destinations. Wisconsin AOD is advertised but absent; whole-world runs are offered but rejected. (`landing.js:6`, `:18`; `variables.json:146`) | Relevance, Presentation | 0.5–1 | Every offered case opens a real case. Unavailable AOD is explicitly pending. Choosing “Whole world” either produces a genuine global result or is clearly marked unavailable before proceeding. |
| **3** | Separate cell count from area share; explain why BH increases flags. (`cases.js:52`; `pipeline.py:285`) | Validity, Presentation | 0.5–1 | C-C displays **750/861 cells, 87.1%; 85.2% of tested area**. Rung 4 explains the change from unadjusted α=0.05 to BH q=0.10. |
| **4** | Publish the method-amendment history beside the registration claim. Remove unconditional “run once, as registered” assurances. (`data.js:66`; `STATS_LOG.md:132`) | Validity | 0.5–1 | The checklist and selection disclosure link to original registration, pre-result amendments and the post-result cell-rule correction; both retained runs are accessible. |
| **5** | Finish the public evidence chain: clickable repository, exact rerun instructions, source URLs, provenance, citations and licence texts. (`pages.js:68`; `web/vendor/LICENSES.md`) | Validity, Relevance, Impact | 1–2 | A reviewer follows the Evidence page from a clean environment, obtains the raw input and pinned environment, and reproduces C-C’s slope, p-value and selected interval without requesting missing instructions. |
| **6** | Turn the outline into a finished ≤7-slide submission—or deliver a captioned 30-second video. (`submission/SLIDES_OUTLINE.md`) | Presentation | 1–2 | The final artifact opens, contains no placeholders, identifies NASA products and AI assistance, and uses numbers matching the corrected app. |
| **7** | Fix phone overflow and make the chart/result reachable early. Repair the oversized case thumbnail. (`detective_light_390.png`; `case_C-C_light_390.png`; `cases_light.png`) | Presentation, Impact | 2–3 | At 390 px and 200% text zoom, both routes have no document-level horizontal overflow; controls and sentences remain readable; the case overview uses a compact, geographically informative map. |
| **8** | Deliver two reliable guided demonstrations with a clearly labelled cached fallback. (`detective.js:288`; live behavior not observed here) | Impact, Presentation | 2–4 | Open Detective, run Wisconsin and Sahel through all steps, and see plots and explanations. Repeat offline: a dated cached example works and is explicitly labelled as cached. |
| **9** | Ship the registered Wisconsin MODIS AOD example, with honest coverage/QC and whatever conclusion the checks permit. (`WP0_CLAIM_REGISTRATION.md:27`; `DATA_LOG.md:10`) | Relevance, Impact, Creativity | 4–8 | `#/case/C-D` shows real MYD08_M3 input, exact region/season, missing-data treatment, source citation and reproducible output; unsupported inference is withheld rather than substituted. |
| **10** | Validate the **complete adaptive decision procedure**, including persistence estimation and field gating; constrain exploratory verdicts where calibration fails. (`validation.py:374`; `stats/SCHEMA.md:73`) | Validity | 6–12+ | Held-out simulations rerun estimation → method selection → test → interval → verdict, and report unconditional false-positive rate and coverage. Include heterogeneous cell persistence and the shipped 45-year field configuration; failures visibly suppress corresponding claims. |

## 5. What looks wrong or statistically overclaimed

### A. The site displays an interval its own validation rejected

This is the clearest defect.

The bundle selects the analytic interval **0.19045–0.628303 °C/decade**. The bootstrap interval **0.220778–0.675726** failed the governing coverage check, according to `event_record/STATS_LOG.md:134`.

Nevertheless, [web/js/data.js](<web/js/data.js:69>) reads `ci_bootstrap_per_decade`. Those endpoints populate the chart caption, statistics and finding card. The screenshot consequently shows approximately **+0.22 to +0.68**, while the ruling says **0.19 to 0.628**.

Worse, the finding describes those bootstrap endpoints using the **analytic** method name. This is a wrong number–method pairing, not rounding.

### B. The regional statistics identify the wrong ruling test

The selected test is Yue-Wang, p=0.00147113, variance factor=1.10015.

The adapter exposes registered Hamed-Rao instead: p=0.000850632 and factor=1.00. `web/js/views/cases.js:83` presents those statistics, and line 85 says the ruling rests on that test.

Thus the regional panel contradicts the actual ruling calculation. The Method page also describes HR as the operative third rung. (`web/js/views/pages.js:16`, `:19`)

### C. “85.2% of tested cells” is incorrect

The adapter maps **area-weighted fractions** into fields displayed as cell fractions. (`web/js/data.js:56`; `web/js/views/cases.js:52`)

- **750/861 cells = 87.1%.**
- **85.2% = cosine-latitude-weighted share of tested area.**

The ruling’s “mapped area” description is substantially better. Neither percentage is the probability the claim is true, an accuracy score, or the percentage of the map that is certainly warming.

### D. BH adding flags is legitimate here—but the ladder obscures why

Rung 3 uses unadjusted p<0.05. Rung 4 uses BH q=0.10. These control different error quantities at different nominal levels. Consequently, BH can flag cells that did not pass p<0.05; the observed increase from 710 to 750 is not itself a bug. (`stats/trendtrial/pipeline.py:285`)

Calling this simply another “tougher test” is misleading. Explain the threshold change. BH’s dependence conditions are also stronger than merely “nearby cells are positively correlated”; the relevant theory concerns the joint distribution of the test statistics. [Benjamini and Yekutieli, 2001](https://www.math.tau.ac.il/~ybenja/MyPapers/benjamini_yekutieli_ANNSTAT2001.pdf)

### E. “Supported by this data” is defensible only as a scoped, conditional conclusion

The reproduced regional result supports increasing **MERRA-2 T2M within the registered box and period**. That deserves a clear finding.

The stronger courtroom treatment—“Final,” checkmarks and “The data support the claim”—conceals important limitations:

- The supported/partly-supported distinction uses conventional **25% and 5% flagged-area thresholds**, not a calibrated evidential scale. (`stats/trendtrial/verdict.py:15`)
- A nonsignificant regional mean can receive “partly supported” from local flags. That does not establish the regional-average claim. (`verdict.py:128`)
- Map and regional series derive from the same data; they are not independent corroborations.

Suggested headline: **“Increasing regional temperature in this MERRA-2 record.”** Put the test, uncertainty and limitations immediately beneath it.

### F. Registration disclosure is materially incomplete

The original registered regional method was Hamed-Rao. Later synthetic experiments selected among seven candidates. The cell-selection rule was then corrected **after the first C-C result**. (`WP0_CLAIM_REGISTRATION.md:32`; `STATS_LOG.md:83`, `:132`)

The logs disclose this unusually well. The public interface does not:

- “The regional test was run once, as registered” is an unconditional successful checklist item. (`web/js/data.js:66`)
- The Method page says registered methods prevent bending the test to the answer. (`pages.js:24`)
- The finding calls the headline “the one regional test registered” before download. (`pipeline.py:454`)

I found no basis to accuse the team of selecting the smallest observed claim p-value. But **a registered question with amended methods is not an unchanged preregistered analysis**. State the distinction.

### G. Calibration does not establish validity of the adaptive pipeline

`gate_for_claim` chooses a governing persistence scenario from an estimated lag-1 correlation, then selects a passing method with high simulated power. (`validation.py:374`)

The simulations evaluate candidates at fixed true persistence values. They do not establish the error rate of the complete procedure that estimates persistence and chooses its own calibration scenario.

For C-C, estimated persistence is 0.048 and the governing scenario is 0.1. The log itself notes substantial uncertainty in that estimate. (`STATS_LOG.md:138`) Passing a simulation tolerance with observed size 0.05625 also does not prove exact 5% control.

### H. Field validation does not match the shipped field sufficiently

The gate uses the **regional** persistence estimate to select calibration for all cells. (`validation.py:427`) Cell simulations default to 25 years and a 20×20 field, while C-C has 45 years and 861 cells. (`validation.py:251`)

My reconstruction found estimated cell persistence above 0.1 in **207 cells**, above 0.2 in **30**, and a maximum near 0.321. These estimates do not prove invalid flags; they show that the regional estimate is not a demonstrated bound on cell persistence.

### I. “95%” and “uncertainty band” need more precise qualifications

The interval acceptance floor is **90% coverage for a nominal 95% interval**. (`validation.py:27`) Report nominal level and measured coverage separately.

The selected chart band is a **slope-range illustration pivoted at the median year**, with no uncertainty in the level at that pivot. It is not a complete confidence band for the fitted trend. The backend states this correctly, but the visible legend merely says “Uncertainty band.” (`pipeline.py:350`; `web/js/chart.js:29`)

Also, `web/js/data.js:75` assumes `reg.band` exists. A legitimate disabled interval produces `band=null` in the Python pipeline; the adapter does not safely support that state.

### J. Detective significance claims outrun its own documented limits

The schema requires a persistence caveat because exploratory p-values can be too small. (`stats/SCHEMA.md:73`) The redesigned ruling warns about the interval and model data but does not give an equivalent prominent warning about p-value calibration. (`detective.js:266`)

“Significant means the rise is unlikely to be chance alone” also invites an inverse-probability interpretation. (`stats/trendtrial/verdict.py:62`) Prefer: **“Under the no-trend model and its assumptions, a test statistic this extreme would be unusual.”** The [ASA statement](https://doi.org/10.1080/00031305.2016.1154108) explicitly distinguishes this from the probability that chance produced the result.

The code appropriately avoids causal attribution and forecasting. Those limits are real strengths. (`pipeline.py:435`)

## 6. What will confuse students

- **There are five steps, three Detective hearings and four case rungs.** These are different structures, but the shared courtroom language makes them appear interchangeable. Explain the distinction once. (`detective.js:16`, `:168`; `cases.js:40`)
- **The map precedes the time series.** The challenge’s central learning sequence is examine the record, then analyze it; the case docket visually prioritizes flags and the ruling. (`case_C-C_light_tall.png`)
- **The phone captures visibly clip sentences and navigation.** This contradicts the earlier “no horizontal overflow” log entry. Automated accessibility success cannot override the supplied visual evidence. (`detective_light_390.png`; `case_C-C_light_390.png`; `WEB_LOG.md:10`)
- **“Watch a demo” is a click-through walkthrough in current code.** Label it accordingly, or provide an actual watchable demonstration. (`detective.js:315`)
- **The cases overview spends most of the screen on an unlabeled enlarged geographic crop.** It neither locates Alaska globally nor previews the finding. (`cases_light.png`, `cases_dark.png`)
- **Anomaly, Sen slope, reanalysis, variance factor and false discovery appear together.** Begin with “estimated change per decade,” “difference from this record’s average” and “years can resemble neighboring years”; reveal method names on demand.
- **“Test whether the trend is real” promotes binary certainty.** Significance evaluates compatibility with a model; it does not certify reality. (`landing.js:11`)
- **The decimal-heavy metadata crowds out meaning.** The important result is approximately +0.44 °C/decade over a defined box and period; the run hash belongs in expandable evidence. (`case_C-C_light_tall.png`)

There is useful accessibility work: skip navigation, visible focus styles, keyboard map readouts, chart tables and non-colour symbols exist in source. (`index.html:15`; `map.js:63`; `chart.js:76`) I did not verify them interactively.

## 7. NASA-data-is-core check

**Yes. NASA data is computationally essential, not branding.** MERRA-2 alone can satisfy this challenge; adding more mission names is not inherently better.

| Product/path | What actually exists |
|---|---|
| **MERRA-2 T2M via POWER monthly regional API** | Shipped Alaska case; three tiled requests, deduplicated grid, archived monthly data and matching hashes. (`C-C_provenance.json:8`) |
| **POWER live parameters** | Twelve selectable parameters, fetched directly from browser regional/point endpoints; live results not exercised in this review. (`live.js:77`; `variables.json`) |
| **MODIS Terra MOD11C3.061** | Registered southeastern-US LST case; catalogue granules present, no completed case input. (`DATA_LOG.md:8`) |
| **GPM IMERG Final V07** | Registered Sahel case; catalogue and prepared fetch path, no completed case input. (`DATA_LOG.md:8`) |
| **MODIS Aqua MYD08_M3.061** | Registered Wisconsin AOD case; advertised but absent from shipped index. (`variables.json:146`; `web/data/index.json`) |

NASA’s documentation supports POWER’s MERRA-2 meteorological provenance and distinguishes solar products derived from SRB, CERES and FLASHFlux. The catalogue’s identical “MERRA-2 and CERES model-based data” source string for every variable is therefore insufficiently specific, especially when everything is classified as reanalysis. [POWER monthly documentation](https://power.larc.nasa.gov/docs/services/api/temporal/monthly/)

Additional findings:

- **Region scope:** C-C is an unmasked rectangular box, including water and territory outside Alaska. Label it as a box around the named region; do not imply an Alaska-only land average. (`DATA_LOG.md:16`; `pipeline.py:130`)
- **Traceability:** I traced the regional result to archived NASA-derived values. That is stronger than an assertion that every displayed number is correct—the adapter disproves that assertion.
- **DOI:** The recorded DOI identifies the MERRA-2 monthly single-level collection. Keep that citation distinct from the POWER service/version citation. [NASA catalogue record](https://doi.org/10.5067/AP1B0BA5PD2K)
- **Reproduction:** The Evidence page promises repository instructions but supplies no repository hyperlink. Its downloads do not replace the original monthly input/provenance chain. (`pages.js:55`, `:68`)
- **Licences:** Map credits and ISC permission text exist. I found no project-level licence supporting the outline’s blanket “MIT licence” statement. Provide the actual licence and complete third-party notices. (`web/vendor/LICENSES.md`; `SLIDES_OUTLINE.md:13`)
- **NASA logos:** None observed; the scales icon is original-looking courtroom imagery, not NASA insignia. (`web/index.html:20`)
- **AI/SI disclosure:** Explicit LLM-assistance disclosure exists on Method. Carry it into the submitted artifact and distinguish development assistance from runtime inference. (`pages.js:26`)
- **Contradictory architecture claims:** Footer and Method say every number is precomputed, although Detective fetches and computes live. Correct both. (`index.html:37`; `pages.js:8`)

## 8. What would make a judge say “WINNER”

**NASA scientist:** “A student reproduced the author’s Wisconsin MODIS example, understood what AOD measures, and could explain the region, seasonal choice, missing observations and NASA source.”

**Statistician:** “The interface agrees with the analysis artifact, the complete decision procedure has defensible calibration, and an inconclusive or withheld result receives the same care as a significant result.”

**UX judge:** “Within 30 seconds I saw a question, a real NASA time series, an estimated change and uncertainty, then one memorable reason the initial answer needed scrutiny—and it worked on a phone.”

The winning demonstration is a student making and defending an evidence-based conclusion. More gavels, method names or coloured cells will not supply that. The current ingredients are in `detective.js`, the calibration logs and the provenance files; they need a consistent, finished experience.

## 9. Global Nominee decision

**Would this be a Global Nominee: no.** My subjective probability is **20% in the reviewed state**: the auditing concept exceeds the baseline, but contradictory statistical displays, clipped mobile pages and an unfinished submission artifact prevent a nomination recommendation. Fixing the evidence-display contract would remove the largest immediate obstacle.