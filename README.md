# Climate Claim on Trial

Team Earth on the Stand. NASA Space Apps Challenge 2026, "Be An Earth System Trend Detective!" (Local Event: Arlington, Virginia, virtual).

**Live site:** {{SITE_URL}}
**30-second video:** {{VIDEO_URL}}
**Code (MIT license):** {{REPO_URL}}

## What it is

Someone says the climate has changed where you live. Is it true? Climate Claim on Trial checks a claim the way a scientist would, using NASA Earth data. Each claim is written down before its data are downloaded. The page draws the yearly series and tests the trend with the tests the challenge names: a t-test, the Mann-Kendall trend test with the Sen estimate of the rate of change, and confidence intervals. Then it tests the tests, on simulated records where the right answer is known, to measure how often each one raises a false alarm. A short sequence of test steps follows, each changing one thing, and the page shows what each did to the answer. When its own checks on simulated data fail, the site withholds the verdict. You can also pick your own measurement, place and time period. The site is static files that run in your browser: no server, no account, no AI model at runtime.

## Three ways in

- **Investigate.** Your own question. Choose one of 22 NASA measurements: 12 from NASA POWER, asked for live (model output, so internet is needed), and 10 from a library of NASA satellite and model products that we precomputed and ship with the site (rainfall, water storage, land surface temperature, snow cover, air temperature, water vapor, haze, nitrogen dioxide, and two GLDAS model variables, soil moisture and evapotranspiration, labeled as model output). Pick a region and the years, and follow the five steps from the challenge brief. Results are labelled "your own exploration, not pre-registered", and the page counts how many questions you have tried, because many tries raise the chance of a false alarm.
- **Case files.** Six claims we wrote down before downloading each claim's data. Each gets a ruling, a map of every grid cell at four hearings, the regional series and the limits of the finding. Southeastern US, Sahel and Alaska also have a "Second witness" view: an additional record used to compare the result (exploratory, it never changes a ruling).
- **How it works.** The method in plain words, the False-Alarm Planet (a simulated world with no real trend, where many cells still look significant), a glossary, and a Data and provenance page with files, hashes and DOIs. The Home page opens with one NASA record under two time windows that give opposite headlines.

## The six case files

| Claim | NASA data | Ruling | Key numbers |
|---|---|---|---|
| Air temperature over interior and western Alaska has risen (1981 to 2025, annual) | MERRA-2 via NASA POWER (model output, labeled as such) | **Supported** | +0.44 °C per decade (95% interval 0.19 to 0.63), p = 0.0015. 85% of the mapped area flagged after false-discovery control. KNMI/CRU TS station records give +0.36 per decade. |
| Wet-season rainfall over the central Sahel has increased (Jun to Sep, 2001 to 2025) | GPM IMERG Final V07 | **Partly supported** | +0.21 mm/day per decade (95% interval 0.10 to 0.33), p = 0.004. Only 22% of the mapped area flagged. The test rule was changed after the first results and the result got stronger (see "How we kept it honest"); the earlier version gave p = 0.030, and both stay on record. |
| Summer daytime land surface temperature over the Southeastern US has risen (Jun to Aug, 2001 to 2025) | MODIS Terra MOD11C3 | **Withheld** (the court cannot rule on this evidence) | Descriptive Sen slope -0.35 °C per decade, not significant (p = 0.27). We give no ruling because our simulated checks show that every candidate test raises too many false alarms for 25 summers with year-to-year dependence. The comparison records do not show the same cooling: ESA LST CCI gives +0.37 per decade (2001 to 2024) and KNMI/CRU TS station maximum temperature gives +0.30 (2001 to 2025). None of the three slopes is significant. |
| Summer aerosol optical depth over Wisconsin has increased (Jun to Aug, 2003 to 2025) | MODIS Aqua MYD08_M3 | **Not supported** | Slope +0.03 per decade (interval -0.013 to 0.079), p = 0.114; none of 42 cells flagged. Our test is conservative here (it catches 23% of a real rise of the reference size), so "not supported" means the record does not show the claimed rise at the registered bar. It is not evidence that no rise happened. |
| Tropospheric nitrogen dioxide over the eastern United States has fallen (annual means, 2005 to 2025) | OMI/Aura OMNO2d V004 | **Withheld** | Descriptive Sen slope -0.61 ×10^15 molecules/cm² per decade, in the claimed direction, shown for reading only. Year-to-year memory in the 21-year record is 0.70, above the highest level we tested (0.6), so none of our candidate tests was validated for it. |
| Tropospheric nitrogen dioxide over the Indo-Gangetic Plain (northern India) has risen (annual means, 2005 to 2025) | OMI/Aura OMNO2d V004 | **Withheld** | Descriptive Sen slope +0.36 ×10^15 molecules/cm² per decade, in the claimed direction, shown for reading only. Year-to-year memory is 0.39 (tested at the 0.45 level), and at 21 years all seven candidate tests raise too many false alarms there (the best, Yue-Wang, called 10.7% of trendless simulated records a trend, against a target of 5%). |

A ruling describes the data for that place and period. It does not say why anything changed and it is not a forecast. Every sentence on a ruling comes from a fixed template.

**The NO2 pair (C-E1 and C-E2).** We registered these two claims together at 1:15 PM ET on Nov 14, 2026, before any NO2 data were downloaded, as an opposite-sign pair: NO2 over the eastern US has fallen, and over northern India has risen. Both came back withheld. The readings point the claimed way in both boxes, and the maps flag most of the area in that direction (descriptive only). But the record is only 21 years long and its year-to-year memory is high, so none of our validated tests can speak for it. We did not change the gate or the claims after seeing this. A gate that refuses a trend that looks obvious is the method working, not a failure.

## Terra overpass witness check (exploratory)

The Southeastern US case has an extra panel. Terra's daytime pass drifted earlier: mean local solar view time was about 10:58 in 2001 to 2019 and about 9:47 in 2025. Changing observation time may affect the record. One rough adjustment for view time moves the slope from -0.35 to about +0.15 °C per decade; another gives about -0.10. Neither is significant. We show this as a witness check, not a result: year and view time are tangled together, the fitted interval is wide, it is labelled "exploratory check, not the registered test", and the ruling does not change. Sources: `review/TERRA_DRIFT_SOURCES.md`.

## Run it locally

You need Python 3 and nothing else.

```
python web/tools/serve.py 8765
```

Open http://127.0.0.1:8765/. The folder `web/` is the whole site, so any static host works. Case files work offline.

## Reproduce

`REPRODUCE.md` has the exact commands. The data subsets we used are in `data/`. The six case bundles rebuild from them in seconds with the same run identifiers as the shipped ones. Downloading the Earthdata products again needs a free Earthdata account and your own token. NASA POWER does not require a login. The 107 automated tests run with `python -m pytest` inside `stats/`.

## Data

Case-file products:

| Product | DOI |
|---|---|
| MERRA-2 M2TMNXSLV v5.12.4 (2 m air temperature), read through NASA POWER API v2.10.0 (POWER has no DOI of its own) | 10.5067/AP1B0BA5PD2K |
| GPM IMERG Final Run monthly V07 (GPM_3IMERGM) | 10.5067/GPM/IMERG/3B-MONTH/07 |
| MODIS/Terra Land Surface Temperature monthly 0.05 degree, MOD11C3 V061 | 10.5067/MODIS/MOD11C3.061 |
| MODIS/Aqua Atmosphere monthly, MYD08_M3 V6.1 | 10.5067/MODIS/MYD08_M3.061 |
| OMI/Aura NO2 Cloud-Screened Total and Tropospheric Column, OMNO2d V004 (the NO2 pair, C-E1 and C-E2) | 10.5067/AURA/OMI/DATA3407 |

Investigate's satellite and model library (one degree, monthly, built from NASA granules). Its rainfall, haze and NO2 products are the IMERG, MYD08_M3 and OMNO2d products above; the rest are:

| Product | DOI |
|---|---|
| GRACE and GRACE-FO JPL mascons RL06.3Mv04 (water storage) | 10.5067/TEMSC-3JC634 |
| MODIS/Aqua MYD11C3 V061 (land surface temperature, day) | 10.5067/MODIS/MYD11C3.061 |
| MODIS/Terra MOD10CM V61 (snow cover) | 10.5067/MODIS/MOD10CM.061 |
| AIRS/Aqua AIRS3STM V7.0 (surface air temperature and water vapor) | 10.5067/UBENJB9D3T2H |
| GLDAS Noah land surface model, GLDAS_NOAH10_M V2.1 (soil moisture and evapotranspiration; model output, not observation) | 10.5067/LWTYSMP3VM5Z |

Second witnesses, the additional comparison records (exploratory cross-checks; no ruling depends on them):

| Source | Reference |
|---|---|
| ESA Land Surface Temperature CCI, multi-sensor IRCDR, L3S, monthly daytime, v3.00 (space agency partner data), for the Southeastern US | 10.5285/b8be3f3993e54d309fddf61ea5d3674f |
| KNMI Climate Explorer serving CRU TS 4.10 (station-based; University of East Anglia CRU), for the Southeastern US, Sahel and Alaska | Harris et al. 2020, https://doi.org/10.1038/s41597-020-0453-3 |

Investigate also reads other NASA POWER monthly variables live. Map and image credits, licenses and where each source is used are in `NOTICE.md`.

## How we kept it honest

- **Questions registered; methods amended and disclosed; final gate frozen.** Claims, regions, periods and the first test rules were committed at 10:29 AM ET on Nov 14, 2026 (commit 839f802), before any claim data was downloaded. The text and its SHA-256 are in `event_record/`. The NO2 pair was registered at 1:15 PM ET the same day, also before its data were downloaded (Addendum 3).
- **Method changes, all logged.** We tried seven candidate tests on simulated series with known answers. Our first choice, Hamed-Rao, rejected too often when years resemble each other, so a rule fixed in advance picked the test for each series from simulations only, before any real result was run. Later, an outside review of the first bundles found three gaps in our checks: negative persistence was rounded up to zero, the skewness check measured persistence instead of skew, and missing years passed. We fixed them in a third round. The rules for that round were written before its simulations but after we had seen the second-round results, so we disclose it as a change made after results (`event_record/WP0_CLAIM_REGISTRATION.md`, Addendum 4). It made the Sahel result stronger (p 0.030 to 0.004) and moved Wisconsin from "withheld" to "not supported". The earlier numbers and run identifiers stay on record, and we made no further rule changes after that.
- **One disclosed correction.** The first run of the map rule did not follow the instruction we had written. We corrected it after the first Alaska run and kept both runs (`stats/out/C-C/bundle_firstrun_celltest_tfpw.json`).
- **Withheld verdicts.** When the simulated checks fail for a series, the page gives no ruling. Three of the six case files are withheld: the Southeastern US and the two NO2 regions.
- **What the simulations show.** Simulation checks show how each test performs under the stated scenarios. They do not show universal calibration, and they are not the probability that a particular claim is true.
- **Failed checks are published** in `stats/out/validation/`. `review/data_qa/` records an independent re-read of the data, which found no processing error.
- **Limits.** Trends are straight lines. We do not test whether the whole pattern of cells could arise by chance. A real series' persistence is estimated from the same series, and with 23 to 25 years that estimate is rough.

## Accessibility

Light and dark themes, with text contrast checked on 104 color pairs (`web/tools/check_contrast.py`, last run Nov 14). The automated axe-core check found no violations on 12 pages in both themes at its last full run on Nov 14; the Home page was rebuilt after that run. Keyboard navigation, a skip link, spoken page-change announcements, a data table behind every chart, phone layouts down to 375 px, and reduced motion respected. No font files are shipped.

## Use of SI (AI)

LLM-assisted development that Walter Guevara directed. Claude Code (Anthropic): Claude Opus 5.5 orchestrated, wrote plans and checks and reviewed results; Claude Sonnet 5.5 workers wrote the data scripts, statistics, JavaScript, pages and tests. Codex (OpenAI) drew five concept mockups at the start of the event and reviewed plans and builds (prompts in `mockups/prompts/`, reviews in `review/`). **No AI model runs when someone uses the site.** The site contains no generated images, video or audio. The video narration is an AI voice clone of Walter Guevara (ElevenLabs), made with his consent; the screens in the video are recordings of the working site. `event_record/` shows what was made during the event.

## Credits and licenses

Our code and text are MIT licensed (`LICENSE`). `NOTICE.md` lists third-party components, data and the generic templates written before the event. Climate Claim on Trial is an independent entry. It is **not endorsed by NASA** and uses no NASA logos or mission identifiers.
