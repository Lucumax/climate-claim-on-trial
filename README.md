# Climate Claim on Trial

Team Earth on the Stand. NASA Space Apps Challenge 2026, "Be An Earth System Trend Detective!" (Local Event: Arlington, Virginia, virtual).

**Live site:** {{SITE_URL}}
**30-second video:** {{VIDEO_URL}}
**Code (MIT licence):** {{REPO_URL}}

## What it is

Someone says the climate has changed where you live. Is it true? Climate Claim on Trial helps you check, using NASA Earth data. Pick a measurement, a place and a time period. The page draws the yearly series and tests the trend with the tests the challenge names: a t-test, Mann-Kendall with the Sen slope, and confidence intervals. Then the claim goes on trial. A short run of tougher tests follows, each changing one thing, and the page shows what each did to the answer. It can also say "no verdict" when its own checks on simulated data fail. The site is static files that run in your browser: no server, no account, no AI model at runtime.

## Three ways in

- **Investigate.** Your own question. Choose one of 22 NASA measurements: 12 from NASA POWER, asked for live (model output, so internet is needed), and 10 from a library of NASA satellite and model products that we precomputed and ship with the site (rainfall, water storage, land surface temperature, snow cover, air temperature, water vapour, haze, nitrogen dioxide, and two GLDAS model variables, soil moisture and evapotranspiration, labelled as model output). Pick a region and the years, and follow the five steps from the challenge brief. Results are labelled "your own exploration, not pre-registered", and the page counts how many questions you have tried, because many tries raise the chance of a false alarm.
- **Case files.** Four claims we wrote down before downloading any data. Each gets a ruling, a map of every grid cell at four hearings, the regional series and the limits of the finding. Southeastern US, Sahel and Alaska also have a "Second witness" view: an independent record that checks the result (exploratory, it never changes a ruling).
- **How it works.** The method in plain words, the False-Alarm Planet (a simulated world with no real trend, where many cells still look significant), a glossary, and a Data and provenance page with files, hashes and DOIs. The Home page opens with one NASA record under two time windows that give opposite headlines.

## The four case files

| Claim | NASA data | Ruling | Key numbers |
|---|---|---|---|
| Air temperature over interior and western Alaska has risen (1981 to 2025, annual) | MERRA-2 via NASA POWER (model output, labelled as such) | **Supported** | +0.44 degC per decade (95% interval 0.19 to 0.63), p = 0.0015. 85% of the mapped area flagged after false-discovery control. KNMI/CRU TS station records give +0.36 per decade. |
| Wet-season rainfall over the central Sahel has increased (Jun to Sep, 2001 to 2025) | GPM IMERG Final V07 | **Partly supported** | +0.21 mm/day per decade (95% interval 0.10 to 0.33), p = 0.004. Only 22% of the mapped area flagged. The test rule was changed after the first results and the result got stronger (see "How we kept it honest"); the earlier version gave p = 0.030, and both stay on record. |
| Summer daytime land surface temperature over the Southeastern US has risen (Jun to Aug, 2001 to 2025) | MODIS Terra MOD11C3 | **Withheld** (no ruling) | Raw slope -0.35 degC per decade, not significant (p = 0.27). We give no ruling because our simulated checks show that every candidate test is too liberal for 25 summers with year-to-year dependence. The second witnesses do not back the MODIS cooling: ESA LST CCI gives +0.37 per decade (2001 to 2024) and KNMI/CRU TS station maximum temperature gives +0.30 (2001 to 2025). None of the three slopes is significant. |
| Summer aerosol optical depth over Wisconsin has increased (Jun to Aug, 2003 to 2025) | MODIS Aqua MYD08_M3 | **Not supported** | Slope +0.03 per decade (interval -0.013 to 0.079), p = 0.114; none of 42 cells flagged. Our test is conservative here (it catches 23% of a real rise of the reference size), so "not supported" means the record does not show the claimed rise at the registered bar. It is not evidence that no rise happened. |

A ruling describes the data for that place and period. It does not say why anything changed and it is not a forecast. Every sentence on a ruling comes from a fixed template.

**NO2 pair: results pending.**

## Terra overpass witness check (exploratory)

The Southeastern US case has an extra panel. Terra's daytime pass drifted earlier: mean local solar view time was about 10:58 in 2001 to 2019 and about 9:47 in 2025. An earlier pass sees a cooler surface. One rough adjustment for view time moves the slope from -0.35 to about +0.15 degC per decade; another gives about -0.10. Neither is significant. We show this as a witness check, not a result: year and view time are tangled together, the fitted interval is wide, it is labelled "exploratory check, not the registered test", and the ruling does not change. Sources: `review/TERRA_DRIFT_SOURCES.md`.

## Run it locally

You need Python 3 and nothing else.

```
python web/tools/serve.py 8765
```

Open http://127.0.0.1:8765/. The folder `web/` is the whole site, so any static host works. Case files work offline.

## Reproduce

`REPRODUCE.md` has the exact commands. The data subsets we used are in `data/`. The four case bundles rebuild from them in seconds with the same run identifiers as the shipped ones. Downloading from NASA again needs a free Earthdata account and your own token. The 103 automated tests run with `python -m pytest` inside `stats/`.

## Data

Case-file products:

| Product | DOI |
|---|---|
| MERRA-2 M2TMNXSLV v5.12.4 (2 m air temperature), read through NASA POWER API v2.10.0 (POWER has no DOI of its own) | 10.5067/AP1B0BA5PD2K |
| GPM IMERG Final Run monthly V07 (GPM_3IMERGM) | 10.5067/GPM/IMERG/3B-MONTH/07 |
| MODIS/Terra Land Surface Temperature monthly 0.05 degree, MOD11C3 V061 | 10.5067/MODIS/MOD11C3.061 |
| MODIS/Aqua Atmosphere monthly, MYD08_M3 V6.1 | 10.5067/MODIS/MYD08_M3.061 |

Investigate's satellite and model library (one degree, monthly, built from NASA granules). Its rainfall and haze products are the IMERG and MYD08_M3 products above; the rest are:

| Product | DOI |
|---|---|
| GRACE and GRACE-FO JPL mascons RL06.3Mv04 (water storage) | 10.5067/TEMSC-3JC634 |
| MODIS/Aqua MYD11C3 V061 (land surface temperature, day) | 10.5067/MODIS/MYD11C3.061 |
| MODIS/Terra MOD10CM V61 (snow cover) | 10.5067/MODIS/MOD10CM.061 |
| AIRS/Aqua AIRS3STM V7.0 (surface air temperature and water vapour) | 10.5067/UBENJB9D3T2H |
| OMI/Aura OMNO2d V004 (tropospheric NO2 column) | 10.5067/AURA/OMI/DATA3407 |
| GLDAS Noah land surface model, GLDAS_NOAH10_M V2.1 (soil moisture and evapotranspiration; model output, not observation) | 10.5067/LWTYSMP3VM5Z |

Second witnesses (exploratory cross-checks; no ruling depends on them):

| Source | Reference |
|---|---|
| ESA Land Surface Temperature CCI, multi-sensor IRCDR, L3S, monthly daytime, v3.00 (space agency partner data), for the Southeastern US | 10.5285/b8be3f3993e54d309fddf61ea5d3674f |
| KNMI Climate Explorer serving CRU TS 4.10 (station-based; University of East Anglia CRU), for the Southeastern US, Sahel and Alaska | Harris et al. 2020, https://doi.org/10.1038/s41597-020-0453-3 |

Investigate also reads other NASA POWER monthly variables live. Map and image credits, licences and where each source is used are in `NOTICE.md`.

## How we kept it honest

- **Registered before download.** Claims, regions, periods and test rules were committed at 10:29 AM ET on Nov 14, 2026 (commit 839f802), before any claim data was downloaded. The text and its SHA-256 are in `event_record/`.
- **Method changes, all logged.** We tried seven candidate tests on simulated series with known answers. Our first choice, Hamed-Rao, rejected too often when years resemble each other, so a rule fixed in advance picked the test for each series from simulations only, before any real result was run. Later, an outside review of the first bundles found three gaps in our checks: negative persistence was rounded up to zero, the skewness check measured persistence instead of skew, and missing years passed. We fixed them in a third round. The rules for that round were written before its simulations but after we had seen the second-round results, so we disclose it as a change made after results (`event_record/WP0_CLAIM_REGISTRATION.md`, Addendum 4). It made the Sahel result stronger and moved Wisconsin from "no verdict" to "not supported". The earlier numbers and run identifiers stay on record, and we made no further rule changes after that.
- **One disclosed correction.** The first run of the map rule did not follow the instruction we had written. We corrected it after the first Alaska run and kept both runs (`stats/out/C-C/bundle_firstrun_celltest_tfpw.json`).
- **Withheld verdicts.** When the simulated checks fail for a series, the page gives no ruling. One of the four case files, Southeastern US, is withheld.
- **Failed checks are published** in `stats/out/validation/`. `review/data_qa/` records an independent re-read of the data, which found no processing error.
- **Limits.** Trends are straight lines. We do not test whether the whole pattern of cells could arise by chance. A real series' persistence is estimated from the same series, and with 23 to 25 years that estimate is rough.

## Accessibility

Light and dark themes, with text contrast checked on 104 colour pairs (`web/tools/check_contrast.py`, last run Nov 14). The automated axe-core check found no violations on 12 pages in both themes at its last full run on Nov 14; the Home page was rebuilt after that run. Keyboard navigation, a skip link, spoken page-change announcements, a data table behind every chart, phone layouts down to 375 px, and reduced motion respected. No font files are shipped.

## Use of SI (AI)

LLM-assisted development that Walter Guevara directed. Claude Code (Anthropic): Claude Opus 5.5 orchestrated, wrote plans and checks and reviewed results; Claude Sonnet 5.5 workers wrote the data scripts, statistics, JavaScript, pages and tests. Codex (OpenAI) drew five concept mockups at the start of the event and reviewed plans and builds (prompts in `mockups/prompts/`, reviews in `review/`). **No AI model runs when someone uses the site.** The site contains no generated images, video or audio. The video narration is a synthetic voice (Kokoro, voice af_heart, Apache-2.0, run on our own computer); the screens in the video are recordings of the working site. `event_record/` shows what was made during the event.

## Credits and licences

Our code and text are MIT licensed (`LICENSE`). `NOTICE.md` lists third-party components, data and the generic templates written before the event. Climate Claim on Trial is an independent entry. It is **not endorsed by NASA** and uses no NASA logos or mission identifiers.
