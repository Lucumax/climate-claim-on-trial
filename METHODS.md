# Methods

How Climate Claim on Trial tests a claim, written for a science judge: what was fixed in advance, what changed afterwards, what the simulations do and do not show, and where each number lives. See also [README.md](README.md), [REPRODUCE.md](REPRODUCE.md), [ARCHITECTURE.md](ARCHITECTURE.md), [stats/SCHEMA.md](stats/SCHEMA.md) and [NOTICE.md](NOTICE.md). Times are Eastern Time on Nov 14, 2026.

## 1. The question

Each case is one sentence: "variable X over region R in season S has risen (or fallen) over period P". We fixed the claim, the NASA product, the box, the season, the years and the direction. The data answer one question: does this record, for this place and period, show a change in the claimed direction? A ruling describes the data. It does not say why anything changed and it is not a forecast. Six claims were registered. The Investigate page's free choices are labelled "your own exploration, not pre-registered" and are not covered here.

## 2. Registration, and what git can and cannot show

The claims and methods are in [event_record/WP0_CLAIM_REGISTRATION.md](event_record/WP0_CLAIM_REGISTRATION.md). Its SHA-256 file has two lines: the version after Addendum 3 and the current file after Addendum 4. Our dated logs are [event_record/STATS_LOG.md](event_record/STATS_LOG.md) and [event_record/DATA_LOG.md](event_record/DATA_LOG.md).

- Claims C-A, C-B, C-C and the tests: commit 839f802, 10:29 AM, before any claim data.
- Addendum 1, C-D (Wisconsin): 36de9c7, 10:35 AM, before its download.
- Addendum 2, the shipped test chosen by a simulation rule: rules in cb1798a, 11:08 AM.
- Addendum 3, the NO2 pair: 252c37a, 1:15 PM, before any NO2 download.
- Addendum 4, a change to the validation gate after results: ca0dfc2, 2:52 PM (section 11).

**What git can show.** The first validation design (29ca2ef, 10:43 AM), the Addendum 2 rules and the NO2 pre-run plan (1b101af, 4:43 PM) were committed before their results (the NO2 results are 4e6d168, 5:12 PM). The post-result checks of section 13 were logged before they were computed (39a9580).

**What git cannot show.** The round 2 and round 3 rules entered git in the same commits as their results (1e93307, 12:09 PM; 3152f39, 2:51 PM). The log says they were written at 11:40 AM and 1:40 PM, before the simulations, but git cannot confirm that. Several log times were typed by our workers and corrected later; git's clock is the only independent timestamp. The NO2 claims were registered before their own downloads but after the first four cases had been run, so that choice was not blind to how the method behaved.

## 3. The data

Model output is labelled as such everywhere on the site.

| Case | Product, version, DOI | Box | Season, period | Grid |
|---|---|---|---|---|
| C-A | MODIS Terra MOD11C3 V061, daytime land surface temperature (satellite retrieval of skin temperature), 10.5067/MODIS/MOD11C3.061 | 30 to 37 N, 90 to 75.5 W | Jun to Aug, 2001 to 2025 | 0.25 degree, 1,264 land cells |
| C-B | GPM IMERG Final V07, GPM_3IMERGM (rain estimate adjusted to gauges), 10.5067/GPM/IMERG/3B-MONTH/07 | 10 to 18 N, 17 W to 25 E | Jun to Sep, 2001 to 2025 | series from 33,600 cells of 0.1 degree; map 1,344 cells of 0.5 degree |
| C-C | **Model output:** MERRA-2 2 m air temperature, through NASA POWER v2.10.0, 10.5067/AP1B0BA5PD2K | 60 to 70 N, 165 to 140 W | annual, 1981 to 2025 | 861 cells, sea included |
| C-D | MODIS Aqua MYD08_M3 V6.1, aerosol optical depth, 10.5067/MODIS/MYD08_M3.061 | 42.5 to 47.1 N, 92.9 to 86.8 W | Jun to Aug, 2003 to 2025 | 42 cells of 1 degree |
| C-E1, C-E2 | OMI/Aura OMNO2d V004, tropospheric NO2, cloud-screened, 10.5067/AURA/OMI/DATA3407 | 35 to 45 N, 90 to 70 W; 22 to 30 N, 75 to 88 E | annual, 2005 to 2025 | 0.25 degree, 3,200 and 1,664 cells |

Sources: `data/C-*/claim.json`, `data/C-*/C-*_provenance.json` (granules, hashes, retrieval times), [event_record/DATA_LOG.md](event_record/DATA_LOG.md). Raw NASA files are not kept.

## 4. The regional series

Built the same way for every case ([stats/trendtrial/aggregate.py](stats/trendtrial/aggregate.py)). Each cell's monthly value becomes an anomaly against that cell's own mean for the same month over the claim period. Each month's regional value is the cosine-of-latitude weighted mean of the anomalies, valid if at least 80% of cells have one. A season is the mean of its months, valid if at least two thirds of them are (annual claims need 8 of 12). A missing year is never filled in, and any missing year withholds the ruling.

## 5. The tests and the ladder

The trend is the Sen slope (Sen 1968), the median slope between every pair of years, per decade. Significance comes from the Mann-Kendall test (Mann 1945, Kendall 1975), which compares pairs of years that rise with pairs that fall. It assumes each year is independent, but a warm year tends to follow a warm year, so trends look more certain than they are. We measured seven candidates ([stats/trendtrial/trend.py](stats/trendtrial/trend.py)): raw Mann-Kendall; Hamed-Rao (Hamed and Rao 1998), the registered choice, with screened lags and with all lags; Yue-Wang (Yue and Wang 2004), which shrinks the effective number of years; trend-free pre-whitening (Yue et al. 2002); and moving-block bootstrap versions with 3-year and 5-year blocks.

The page shows a ladder, so a reader sees what each step does: least-squares line with a t-test (the brief's baseline), raw Mann-Kendall, registered Hamed-Rao, the shipped test. On the map the four rungs are raw Mann-Kendall per cell, anomalies against each cell's own season, the memory correction chosen for the claim, and the false-discovery step (section 8). The slope's interval is a residual block bootstrap (2,000 resamples), shown only if it passed its coverage bar in simulation; otherwise the analytic Hamed-Rao interval, if that passed; otherwise none.

## 6. Validation by simulation

We measured every test on fake records where the answer is known. Each fake series has a "memory" (phi): the correlation between one year and the next after a straight line is removed. We simulated phi from -0.7 to 0.6 in nine steps, for 21, 23, 25 and 45 years, with bell-shaped and with lopsided noise (skewness 2), with and without 12% of years missing, and with no trend or a trend of 0.3 standard deviations per decade. Each scenario used 4,000 fake series (2,000 for the bootstrap tests, 1,000 for interval coverage). Map checks used 200 correlated fake fields shaped like the real grids (600 for Wisconsin), with no trend, 30% of cells truly rising, or a mix of rising and falling. There are 334 scenarios (367 with the 21-year ones). Files: `stats/out/validation/validation_results.json` and `validation_results_n21.json`, with the failed checks.

**Bars, set before each run.** A test may speak only if its false-alarm rate on trendless series stays within 5% plus two standard errors (a too-cautious test is flagged but allowed). The map's false-discovery rate must stay within 10% plus two standard errors. The interval must contain the true slope at least 90% of the time. Slope bias must be at most three standard errors or 0.025 standard deviations per decade (relaxed before the Sahel, Southeastern US and Wisconsin runs, in Addendum 2).

**The adaptive gate.** A real series has unknown memory, so the procedure estimates it from the series itself, finds the nearest tested length and memory (a negative estimate is bracketed by two tested values), and takes the passing test with the most power. If none passes, the ruling is withheld. We then simulated this whole procedure on fresh fake series: its overall false-alarm rate, counting withheld series as "no call", must be at most 5% plus two standard errors (about 5.7%), and the interval it shows must cover at least 90%.

**What "calibrated" means.** In fake records of this length and memory, the shipped test called a trend in about 5% of trendless records or fewer. It does not mean the p-value is exact for a real series, that real noise is of the simulated kind, or that a claim has a stated chance of being true. Among records that did receive a ruling the rate can be higher: 7.4% for Alaska's setting, against 4.8% overall.

## 7. The five outcomes

First match wins ([stats/trendtrial/verdict.py](stats/trendtrial/verdict.py)). The 25% and 5% thresholds are conventions fixed before results, not error rates.

1. **Withheld:** a check failed (no calibrated test, a missing year, or memory above the tested range).
2. **Contradicted:** p below 0.05 with the slope opposite to the claim.
3. **Supported:** p below 0.05 in the claimed direction, an interval excluding zero, and at least 25% of the mapped area flagged in that direction.
4. **Partly supported:** p below 0.05 but a narrow map or an interval touching zero; or a non-significant average with at least 5% of the area flagged.
5. **Not supported by this data:** everything else. This is not evidence of no change.

## 8. Maps and false-discovery control

A map tests thousands of cells, so about 5% would look significant by chance. We use the Benjamini-Hochberg step (Benjamini and Hochberg 1995) at a declared rate of 10%, as Wilks (2016) recommends for gridded fields, so about one flagged cell in ten may be a false alarm. The method assumes independent or positively related cells, so we measured the rate on correlated fake fields. If no cell test kept the rate near 10% at the claim's memory, the map is "unadjusted, descriptive" and the ruling does not use it (C-E2). Flagged-area shares are descriptive, not error rates.

## 9. The second witnesses

Comparison records for C-A, C-B and C-C, in `web/data/witness/`. None changes a ruling.

- **Alaska:** CRU TS 4.10 station-based record (via KNMI Climate Explorer), +0.359 per decade (0.112 to 0.582). Station minus MERRA-2 is -0.061 (-0.106 to -0.013, p = 0.018). `C-C_knmi.json`.
- **Sahel:** CRU rainfall, +0.183 mm/day per decade (-0.008 to 0.411), p = 0.065 by plain Mann-Kendall; correlation with IMERG 0.904. `C-B_knmi.json`.
- **Southeastern US:** CRU maximum temperature +0.301 (-0.132 to 0.852), 2001 to 2025. ESA LST CCI multi-sensor +0.369 (-0.475 to 1.115) against MODIS Terra -0.244 on the same footprint, 2001 to 2024. `C-A_knmi.json`, `C-A_esa.json`.

**Independence limits.** CRU uses station and gauge archives, different inputs from the satellite and model series, but measures a different quantity (air temperature on land, against skin temperature or a model box with sea). IMERG Final is also gauge-adjusted and shares many gauges with CRU, so Sahel agreement is partly shared input. ESA's record is Terra MODIS again in 2012 to 2018. These are cross-checks, not second measurements.

## 10. Instrument drift

- **Terra, C-A.** Mean local solar view time was 10.96 h in 2001 to 2019 and 1.18 h earlier by 2025. The gap between land surface temperature and POWER surface temperature tracks view time (r = 0.767; 1.47 degC per hour). Adjusting for it gives +0.146 per decade (-0.465 to 0.705); a fit on year and view time gives -0.097 (-0.748 to 0.553). Year and view time are tangled, so this is exploratory. Station maximum temperature already pulls ahead of MODIS by +0.530 per decade over 2001 to 2020 (0.237 to 0.902), so drift is not the whole gap. Files: `C-A.json`, `C-A_knmi.json`; sources in [review/TERRA_DRIFT_SOURCES.md](review/TERRA_DRIFT_SOURCES.md).
- **Aqua, C-D.** Aqua's afternoon pass has drifted later since 2021. The library flags Aqua haze after December 2021, but the registered series runs to 2025 and we did not remove those years. C-D's sensitivity check is not stable: the bootstrap interval excludes zero at block lengths 3 and 5 but not 1, and a plain t-test gives p = 0.040 (bundle `sensitivity`, `regional.tests.ols`).
- **IMERG, C-B.** Its inputs change over the record (older and newer satellite groups; `data/library/scripts/products.py`). We did not test for steps.

## 11. Changes after results (Addendum 4)

At 1:40 PM, after the round-2 bundles (12:20 PM), we changed the validation gate, not the claims, bars or candidates. An outside review had shown that the gate rounded negative memory up to zero, checked skewness with a scenario that measured memory, and let missing years pass. Effects (bundles, STATS_LOG "ROUND 3"):

| Case | Round 2 | Round 3 (shipped) |
|---|---|---|
| C-C Alaska | supported | supported, numbers unchanged |
| C-B Sahel | partly supported; plain Mann-Kendall p = 0.030; interval 0.023 to 0.489; 15.6% of area flagged | partly supported; bootstrap Mann-Kendall p = 0.004; interval 0.096 to 0.330; 22.3% flagged; slope unchanged, +0.207 mm/day |
| C-A | withheld | withheld |
| C-D Wisconsin | withheld (skewness 1.42, one scenario at the wrong memory) | not supported, p = 0.114 |

The Sahel result became stronger after a rule change made once we had seen results. The round-2 test was already valid for that series, so the change bought power, not validity. Both p-values are published; round-2 run ids are in `stats/run_id_history.json`. No gate change followed.

## 12. The NO2 pair

C-E1 (eastern US NO2 has fallen) and C-E2 (northern India NO2 has risen) were registered together as an opposite-sign pair. Both were withheld. C-E1's memory is 0.70, above the highest tested value (0.6), so no scenario licenses a test. C-E2's memory is 0.39 (tested at 0.45), and at 21 years all seven tests raise too many false alarms there (the best, Yue-Wang, 10.7% against 5%). The readings point the claimed way (Sen -0.611 and +0.357 ×10^15 molecules/cm² per decade), but we did not change the gate or the claims after seeing that. A gate that refuses a trend that looks obvious is the method working as written: 21 years is too short and persistent for a calibrated test. Source: STATS_LOG entries of 4:44 PM and 5:12 PM.

## 13. Exploratory checks after the results

Logged before they were computed (STATS_LOG, 6:06 PM). They are not tests and change no ruling. Numbers: `web/data/exploratory.json`, with 2,000 to 4,000 simulations each, so a few tenths of a point is noise.

- **Registered method alone.** Hamed-Rao with no gate agrees in direction and significance with all three released rulings. For C-A and the NO2 pair it would have called a trend, which the gate refuses to trust.
- **Memory sensitivity.** With no trend, how often does a pattern this strong arise at each memory? Sahel: 0.6% at -0.3, 2.8% at 0, 4.1% at 0.1, 7.2% at 0.2, 8.3% at 0.3. So the Sahel result holds if its alternating wet and dry years are real, and fails at memory 0.2 or more. Alaska stays under 1% up to 0.3. Both NO2 trends stay near 1.5% up to memory 0.8 and reach about 5.4% only at 0.9.
- **Curved declines.** A clean curve shaped like the eastern US NO2 record, with no memory, got a ruling in 0 of 2,000 runs; with twice the noise 13.1%, with four times 59.4%. The gate reads a bend as memory. That is a weakness of the gate, not a finding about NO2. C-E2 is different: a curve of its shape would get a ruling 67.7% of the time, and its real memory (0.39) is above that simulation's 95th percentile (0.34).
- **Cell memory.** For the Sahel the middle cell's memory is -0.156 (5th to 95th percentile -0.483 to 0.173), while the map test was checked at -0.7 and -0.5. The other maps match their checked values.
- **Holm adjustment** of the three rulings' p-values: Alaska 0.004, Sahel 0.008, Wisconsin 0.114 (Sahel 0.060 under the first test).

## 14. Known limits

- **Noise model.** Memory is estimated from the series itself, which is rough at 21 to 25 years. The simulations assume one-year memory, bell-shaped or lopsided noise, and straight-line trends. They did not test long-memory noise, sudden steps, rare extreme years such as smoke summers, or curved trends. Long memory would make every test raise more false alarms; curves make the gate withhold.
- **Map power.** At 25 seasons the Sahel map's test finds about 1% to 9% of cells that truly change, and the 42-cell Wisconsin map 2% to 5%. A small flagged share does not show a change is narrow, and "0 of 42" is weak evidence.
- **Multiple claims.** Each claim was tested at 5% with no adjustment across cases.
- **Chosen headlines.** The claims are well-known topics, chosen for teaching. Registration fixes data, region, period and test, not whether the answer was known.
- **Footprints and models.** Some cells reach past the registered boxes, some boxes include sea, and the one supported case is MERRA-2 model output.

## 15. Results

| Case | Ruling | Sen slope per decade | 95% interval | Shipped test, p | Registered Hamed-Rao p | Map flagged, claimed direction | Memory |
|---|---|---|---|---|---|---|---|
| C-A Southeastern US surface temperature | withheld | -0.350 degC | not shown | none | 0.272 | 0 of 1,264 cells | 0.20 |
| C-B Sahel rainfall | partly supported | +0.207 mm/day | 0.096 to 0.330 | bootstrap MK, 0.004 | 0.030 | 21.8% | -0.67 |
| C-C Alaska air temperature (model) | supported | +0.443 degC | 0.190 to 0.628 | Yue-Wang, 0.0015 | 0.00085 | 85.2% | 0.05 |
| C-D Wisconsin aerosol | not supported | +0.030 | -0.013 to 0.079 | bootstrap MK, 0.114 | 0.224 | 0 of 42 cells | -0.48 |
| C-E1 eastern US NO2 | withheld | -0.611 | not shown | none | 0.0013, reading only | 88.0%, descriptive | 0.70 |
| C-E2 northern India NO2 | withheld | +0.357 | not shown | none | 0.000094, reading only | 74.4%, unadjusted | 0.39 |

NO2 units are 10^15 molecules/cm². Sources: `web/data/bundle_C-A.json` to `bundle_C-E2.json` (fields `regional.tests`, `regional.interval`, `cells.rungs`, `validation`; run ids in [REPRODUCE.md](REPRODUCE.md)) and `web/data/exploratory.json` (`shadow`). MK is Mann-Kendall.

## References

Benjamini, Y. and Hochberg, Y. (1995). Controlling the false discovery rate: a practical and powerful approach to multiple testing. Journal of the Royal Statistical Society B.

Hamed, K. H. and Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data. Journal of Hydrology.

Kendall, M. G. (1975). Rank Correlation Methods. Griffin.

Mann, H. B. (1945). Nonparametric tests against trend. Econometrica.

Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. Journal of the American Statistical Association.

Wilks, D. S. (2016). "The stippling shows statistically significant grid points": how research results are routinely overstated and overinterpreted, and what to do about it. Bulletin of the American Meteorological Society 97, 2263 to 2273.

Yue, S. and Wang, C. Y. (2004). The Mann-Kendall test modified by effective sample size to detect trend in serially correlated hydrological series. Water Resources Management.

Yue, S., Pilon, P., Phinney, B. and Cavadias, G. (2002). The influence of autocorrelation on the ability to detect trend in hydrological series. Hydrological Processes.
