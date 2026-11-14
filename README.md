# Climate Claim on Trial

Team Earth on the Stand. NASA Space Apps Challenge 2026, "Be An Earth System Trend Detective!" (Local Event: Arlington, Virginia, virtual).

**Live site:** {{SITE_URL}}
**30-second video:** {{VIDEO_URL}}

## What it is

Someone says the climate has changed where you live. Is it true? Climate Claim on Trial helps you check, using NASA Earth data. Pick a measurement, a place and a time period. The page draws the yearly series and tests the trend with the tests the challenge names: a t-test, Mann-Kendall with the Sen slope, and confidence intervals. Then the claim goes on trial. A short run of tougher tests follows, each changing one thing, and the page shows what each did to the answer. It can also say "no verdict" when its own checks on simulated data fail. The site is static files that run in your browser: no server, no account, no AI model at runtime.

## Three ways in

- **Investigate.** Your own question. Choose one of 12 NASA POWER measurements, a region and the years, and follow the five steps from the challenge brief. Results are labelled "your own exploration, not pre-registered". It needs internet, because it asks NASA POWER for the data.
- **Case files.** Four claims we wrote down before downloading any data. Each gets a ruling, a map of every grid cell at four hearings, the regional series and the limits of the finding.
- **How it works.** The method in plain words, the False-Alarm Planet (a simulated world with no real trend, where many cells still look significant), a glossary, and a Data and provenance page with files, hashes and DOIs.

## The four case files

| Claim | NASA data | Ruling | Key numbers |
|---|---|---|---|
| Air temperature over interior and western Alaska has risen (1981 to 2025, annual) | MERRA-2 via NASA POWER (model output, labelled as such) | **Supported** | +0.44 degC per decade (95% interval 0.19 to 0.63), p = 0.0015. 85% of the mapped area flagged after false-discovery control. |
| Wet-season rainfall over the central Sahel has increased (Jun to Sep, 2001 to 2025) | GPM IMERG Final V07 | **Partly supported** | +0.21 mm/day per decade (0.02 to 0.49), p = 0.030. Only 15% of the mapped area flagged. |
| Summer daytime land surface temperature over the Southeastern US has risen (Jun to Aug, 2001 to 2025) | MODIS Terra MOD11C3 | **No verdict** | Raw slope -0.35 degC per decade, not significant (p = 0.27). Our simulated checks failed for this series, so we do not rule. |
| Summer aerosol optical depth over Wisconsin has increased (Jun to Aug, 2003 to 2025) | MODIS Aqua MYD08_M3 | **No verdict** | Slope +0.03 per decade. A plain t-test gives p = 0.04, but the series is strongly lopsided and every test we tried was too liberal on such series. |

A ruling describes the data for that place and period. It does not say why anything changed and it is not a forecast. Every sentence on a ruling comes from a fixed template.

## Terra overpass witness check (exploratory)

The Southeastern US case has an extra panel. Terra's daytime pass drifted earlier: mean local solar view time was about 10:58 in 2001 to 2019 and about 9:47 in 2025. An earlier pass sees a cooler surface. A rough adjustment for view time moves the slope from -0.35 to about +0.15 degC per decade. We show this as a witness check, not a result: year and view time are tangled together, the fitted interval is wide, it is labelled "exploratory check, not the registered test", and the ruling does not change. Sources: `review/TERRA_DRIFT_SOURCES.md`.

## Run it locally

You need Python 3 and nothing else.

```
python web/tools/serve.py 8765
```

Open http://127.0.0.1:8765/. The folder `web/` is the whole site, so any static host works. Case files work offline.

## Reproduce

`REPRODUCE.md` has the exact commands. The data subsets we used are in `data/`. The four case bundles rebuild from them in seconds with the same run identifiers as the shipped ones. Downloading from NASA again needs a free Earthdata account and your own token. The 90 automated tests run with `python -m pytest` inside `stats/`.

## Data

| Product | DOI |
|---|---|
| MERRA-2 M2TMNXSLV v5.12.4 (2 m air temperature), read through NASA POWER API v2.10.0 (POWER has no DOI of its own) | 10.5067/AP1B0BA5PD2K |
| GPM IMERG Final Run monthly V07 (GPM_3IMERGM) | 10.5067/GPM/IMERG/3B-MONTH/07 |
| MODIS/Terra Land Surface Temperature monthly 0.05 degree, MOD11C3 V061 | 10.5067/MODIS/MOD11C3.061 |
| MODIS/Aqua Atmosphere monthly, MYD08_M3 V6.1 | 10.5067/MODIS/MYD08_M3.061 |

Investigate also reads other NASA POWER monthly variables live. No space agency partner data was used. Map and image credits are in `NOTICE.md`.

## How we kept it honest

- **Registered before download.** Claims, regions, periods and test rules were committed at 10:29 AM ET on Nov 14, 2026 (commit 839f802), before any claim data was downloaded. The text and its SHA-256 are in `event_record/`.
- **One method change, made on simulated data.** We tried seven candidate tests on simulated series with known answers. Our first choice, Hamed-Rao, rejected too often when years resemble each other, so we switched to Yue-Wang, before any real result was run. A slope-bias pass bar was also loosened before the Sahel, Southeastern US and Wisconsin runs; the original bar and its failures stay published.
- **One disclosed correction.** The first run of the map rule did not follow the instruction we had written. We corrected it after the first Alaska run and kept both runs (`stats/out/C-C/bundle_firstrun_celltest_tfpw.json`).
- **Withheld verdicts.** When the simulated checks fail for a series, the page gives no ruling. Two of the four case files are withheld.
- **Failed checks are published** in `stats/out/validation/`. `review/data_qa/` records an independent re-read of the data, which found no processing error.
- **Limits.** Trends are straight lines. We do not test whether the whole pattern of cells could arise by chance. The shipped test kept its error rate only for weak year-to-year persistence, and a real series' persistence is estimated from the same series.

## Accessibility

Light and dark themes, with text contrast checked on 96 colour pairs. The automated axe-core check found no violations on 12 pages in both themes at the last run. Keyboard navigation, a skip link, spoken page-change announcements, a data table behind every chart, phone layouts down to 375 px, and reduced motion respected. No font files are shipped.

## Use of SI (AI)

LLM-assisted development that Walter Guevara directed. Claude Code (Anthropic): Claude Opus 5.5 orchestrated, wrote plans and checks and reviewed results; Claude Sonnet 5.5 workers wrote the data scripts, statistics, JavaScript, pages and tests. Codex (OpenAI) drew five concept mockups at the start of the event and reviewed plans and builds (prompts in `mockups/prompts/`, reviews in `review/`). **No AI model runs when someone uses the site.** The site contains no generated images, video or audio. The video narration is a synthetic voice (Kokoro, voice af_heart, Apache-2.0, run on our own computer); the screens in the video are recordings of the working site. `event_record/` shows what was made during the event.

## Credits and licences

Our code and text are MIT licensed (`LICENSE`). `NOTICE.md` lists third-party components and the generic templates written before the event. Climate Claim on Trial is an independent entry. It is **not endorsed by NASA** and uses no NASA logos or mission identifiers.
