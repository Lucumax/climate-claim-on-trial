# DATA_QA_R1: two suspicious results (C-B Sahel persistence, C-A SE US cooling)

Reviewer: Claude Sonnet 5.5 (data QA), Sat Nov 14 2026. Read-only on data\, stats\, web\. Nothing in fetch_earthdata.py was edited.
Method note: the stats venv has no matplotlib or requests, so the analysis ran in a scratch venv (numpy, scipy, matplotlib, requests, netCDF4, earthaccess) outside the repo. The scripts are in review\data_qa\scripts\ (paths inside them point at the scratchpad). For the independent re-read of granules I used the project's Earthdata token through the project's own helper (value never printed) to read the same public NASA granules a second time with separate code.

## Summary

| Item | Verdict | One line |
|---|---|---|
| C-B lag-1 of -0.67 | **No bug found** | The number is the DETRENDED lag-1 (raw is -0.31). All 100 granules are unique, in order, and the file's own time stamps match. POWER, an independent product, shows the same year-to-year swings (r = 0.74 in levels, 0.79 in year-to-year changes). The alternation is in the data. |
| C-A cooling of -0.35 degC/decade | **No bug in our processing; but the cooling is mostly a data-product artifact** | Decode, scale, variable, mask and aggregation all check out to 1e-5 degC. The cooling comes from Terra's drifting overpass time: the mean daytime view time is flat at 16.56 UTC until 2020, then falls to 15.39 UTC in 2025 (1.2 h earlier, a cooler part of the morning). After a view-time adjustment the slope is about +0.15 degC/decade. Both witnesses (POWER TS, T2M) warm, not cool. |

## 1. C-B (Sahel JJAS rainfall, IMERG V07)

### 1a. Where -0.67 comes from
- The pipeline's phi_hat is `_lag1()` in stats\trendtrial\pipeline.py: it OLS-detrends the 25 seasonal values first, then takes the lag-1 autocorrelation. My own code reproduces it exactly: detrended lag-1 = -0.668 (Pearson version -0.675).
- Without detrending the same series gives lag-1 = -0.306 (Pearson -0.307). So "-0.67" is the detrended figure; any text that calls it "the persistence of the series" should say "after removing the trend".
- My regional JJAS series matches the shipped bundle anomaly series (web\data\bundle_C-B.json) to 2.5e-7 (r = 1.0000).

### 1b. Processing checks (all pass)
- Granules: 100 in provenance, 100 unique ids, 4 per year (Jun-Sep) x 25 years, no year missing or doubled. Every id carries start date YYYYMM01 and the V07B month code; CMR begin time, https and OPeNDAP urls all agree with the (year, month) arrays in monthly.npz: 0 mismatches. Order is strictly increasing in time.
- Independent check of the file's OWN clock: I re-read /Grid/time from all 100 granules (OPeNDAP, own code). Each is the first of the expected month (0 of 100 mismatches), 100 distinct values. The time variable is "seconds since 1980-01-06".
- Independent re-read of the precipitation field (box rows 1000-1079, cols 1630-2049, own decode: mm/hr x 24, negatives to NaN): maximum difference from data\C-B\monthly.npz is 1.9e-6 mm/day, NaN pattern identical, lat axis identical. So the stored cube is exactly what NASA serves for that box, months in the right slots.
- JJAS = Jun-Sep of the same calendar year: build_cube uses season_months [6,7,8,9] in each calendar year; all four months present every year (valid_months = 4 for all 25 years).
- Units: mm/hr x 24 gives a regional mean of 4.18 mm/day for JJAS and a Jun/Jul/Aug/Sep cycle 2.4/4.6/5.9/3.8 mm/day with a north-south gradient (10N row 10.3, 18N row 1.3 mm/day in Aug). Plausible Sahel climatology.
- Plots: review\data_qa\CB_series_imerg_vs_power.png (regional JJAS by year, both products; monthly series with year boundaries; each calendar month by year).

### 1c. Independent witness: NASA POWER PRECTOTCORR (MERRA-2 bias-corrected precipitation)
Regional API, lat 10-18, lon -17 to 25 in 5 tiles (10-degree limit, edges de-duplicated), 1156 cells, no fill values, cos(lat) weights, mean of the 4 monthly values per year.

| | IMERG (ours) | POWER |
|---|---|---|
| JJAS mean, mm/day | 4.18 | 4.40 |
| lag-1, raw | -0.31 | +0.44 |
| lag-1, detrended | -0.67 | -0.39 |
| Sen slope, mm/day/decade | +0.21 (MK p 0.029) | +1.23 (MK p < 0.001) |

- Correlation of the two JJAS series 2001-2025: r = 0.74 (Spearman 0.70); after removing each series' own linear trend r = 0.69; correlation of year-to-year changes r = 0.79, and the sign of the change agrees in 19 of 24 years (79 percent). By month: Jun 0.42, Jul 0.75, Aug 0.74, Sep 0.80.
- Year by year the same wet and dry years alternate in both products (2002 low, 2003 high, 2004 low; 2010 high, 2011 low, 2012 high, 2013 low; 2020-2025 high-low-high-low-high-low).
- Persistence does not depend on part of the box: detrended lag-1 is -0.44 west of 0E, -0.52 east of 0E, -0.63 south of 14N, -0.46 north of 14N, -0.68 excluding lon < -12 (so not an ocean-edge artifact). Leave-one-year-out range -0.78 to -0.49. By calendar month alone the lag-1 is mild (Jun -0.07, Jul -0.32 detrended, Aug -0.19, Sep -0.54).
- Is it just chance? Under 20,000 random re-orderings of the 25 values the detrended lag-1 has mean -0.08, sd 0.19; the observed -0.67 is rarer than 1 in 3,000 (p about 0.0003). So it is a real feature of this 25-year sample, not noise at the level of the estimator.

### 1d. Honest caveats for a judge
1. POWER is not fully independent of IMERG: PRECTOTCORR is bias-corrected with gauge-based products, and IMERG Final is gauge-calibrated, so some shared wet/dry signal is expected. The check shows no processing error, not that nature alternates.
2. The two products disagree on the TREND by a lot: IMERG +0.21 mm/day/decade, POWER +1.23. POWER's series has an upward step in the 2010s (3.0 in 2001 to 4.2-6.8 in 2020-2024), a known kind of MERRA-2 inhomogeneity (see POWER_LIVE_NOTES caveat). It also means POWER's own detrended lag-1 (-0.39) is distorted by a non-linear trend; on a 1981-2025 POWER record the lag-1 is +0.48 raw, +0.32 detrended (1981-2000: +0.25). So over a longer record Sahel persistence is positive, as the literature says; the -0.67 is specific to 2001-2025 in IMERG (and partly echoed by POWER).
3. I did not find a physical explanation for the alternation; I report it as a feature of the data and do not claim one.
4. The estimator at n = 25 has sd about 0.19 and a small-sample bias of about -1/n; -0.67 is far outside that, so the gate that buckets it (raw Mann-Kendall by the rule) is working on a genuinely negative number.

### 1e. Verdict and fix
**No bug found.** There is nothing to change in data\scripts\fetch_earthdata.py for C-B. Only wording: where the site or write-up says "persistence -0.67", say "lag-1 autocorrelation after removing the linear trend (raw: -0.31)". Optional cheap hardening: write the file's /Grid/time value per granule into the provenance (`granules[i]`) so the year/month assignment is checkable without re-fetching (in `opendap_subset` for C-B add `/Grid/time` to the DAP4 constraint; note a combined multi-variable constraint can fail, so use a second request).

## 2. C-A (SE US summer daytime LST, MOD11C3 v061)

### 2a. Processing checks (all pass)
- Variable: group /MODIS_MONTHLY_0_05DEG_CMG_LST/Data_Fields/LST_Day_CMG, uint16, units K, scale_factor 0.02, add_offset 0, _FillValue 0, valid_range 7500-65535 (read from the DMR of granule 1). LST_Night_CMG, emissivity bands and QC fields are separate variables and are not used.
- Independent re-read of all 75 granules (own decode: K = 0.02 x stored, stored 0 and out-of-range to NaN, minus 273.15, once): maximum difference from data\C-A\C-A_subset_native.npz = 1.6e-5 degC, NaN pattern identical. Scale is applied once and Kelvin to degC once. Raw stored range 14354-15849 gives 287.1-317.0 K (14-44 degC): sane. Stored 0 (fill) is 22.4 percent of native cells (ocean/water); nothing else is below valid_range.
- Granules: 75 unique ids, 3 per year, DOY in the id gives the 1st of Jun/Jul/Aug in every case (0 mismatches). Row 0 = north in the file; the native npz is stored south-to-north and matches after the flip, so orientation is right. Spot checks: Atlanta valid with 32.8 C on 1 Jun 2001, Atlantic (32N 76W) and Gulf (30.1N 88W) are fill in all 75 granules, Charleston coast valid.
- Coverage: within the 1264-cell land support, valid fraction is 99.98 percent, worst month 99.84 percent; per-year valid fraction is 0.999 for every year, so no year or month has abnormal coverage and there is no change in sampling over time. Region monthly means run 26.7 to 32.0 degC (hot years 2002, 2007, 2011, 2012 are the known SE drought and heat summers; cool 2003, 2013, 2025).
- Land support mask: built from LST validity itself (cells valid in at least half of the months). 1260 of the 1264 cells are valid in all 75 months, so the mask is stable. The product's own Percent_land_in_grid field is NOT usable as a mask (it reads 0 at Atlanta and Nashville); the pipeline correctly does not use it.
- 5x5 block aggregation: slope on the native 0.05-degree cells (land cells, cos weights) is -0.351; on the shipped 0.25-degree cube -0.350; with only the always-valid cells -0.351. Restricting to cells with at least 3, 5 or 10 clear days in a month: -0.351, -0.351, -0.371. So aggregation, mask and clear-day count do not drive the sign.
- Not applied: the per-pixel QC_Day bit field (monthly CMG product). The fill/valid-range screen is what is applied; the clear-day sensitivity above is the substitute check.
- The series matches the shipped bundle (r = 1.0000, Sen -0.350).
- Significance: the cooling is not significant (Mann-Kendall p 0.275, OLS p 0.31). The pipeline already withholds the C-A verdict (phi_hat 0.198).

### 2b. Independent witnesses (NASA POWER, MERRA-2, JJA, same box, land cells only = 279 POWER cells for TS, T2M, precipitation; 80 for cloud and sunlight; "all cells" in brackets)
| Series | Mean | Sen degC/decade | MK p | r with MODIS day LST (levels / detrended) |
|---|---|---|---|---|
| MODIS Terra day LST (ours) | 28.9 | **-0.35** | 0.28 | 1 |
| MODIS Terra night LST | 21.1 | **+0.62** | < 0.001 (OLS) | 0.79 with T2M |
| POWER TS, skin temperature | 26.4 | **+0.26** (+0.25) | 0.28 | 0.80 / 0.88 |
| POWER T2M, air temperature | 26.3 | **+0.32** (+0.35) | 0.19 | 0.78 / 0.86 |
| POWER precipitation | 4.2 mm/day | +0.14 | 0.53 | -0.76 / -0.76 |
| POWER cloud amount | 54 % | -0.40 | 0.91 | -0.61 / -0.63 |
| POWER all-sky sunlight | 6.0 | +0.06 | 0.07 | +0.67 / +0.82 |
- The year-to-year variability matches very well (detrended r = 0.88 with TS), so the extremes are real and correctly dated. What differs is the TREND: the MODIS day series cools by 0.35 while both MERRA-2 temperatures warm by 0.26-0.32 degC/decade, a gap of about 0.6 degC/decade (1.5 degC over the record). The night LST warms by 0.62.
- Hot summers are dry and sunny (r with precipitation -0.76) as expected, but precipitation, cloud and sunlight have no significant trend in POWER, so they do not explain a cooling trend. A regression on precipitation explains 57 percent of the year-to-year variance but leaves a residual Sen of -0.15.
- Map (review\data_qa\CA_series_and_witnesses.png, panel 4): 93 percent of land cells have a negative slope; the median cell slope is -0.25 and the strongest cooling is a patch in Georgia and Alabama (-0.7 or lower).

### 2c. What is behind the cooling: the Terra overpass time drifts
The product carries the mean daytime observation time (Day_view_time, hours UTC). Regional JJA mean, from the data:
- 2001-2019: 16.52 to 16.67 (flat, mostly 16.54-16.59). 2020: 16.57. 2021: 16.49. 2022: 16.36. 2023: 16.11. 2024: 15.80. 2025: 15.39.
- That is an overpass about 1.2 hours earlier by 2025 (about 11:00 local solar time falling to about 9:55). This matches the known end of Terra's orbit-maintenance in 2020 (Terra is allowed to drift to earlier crossing times). I am recalling that from general knowledge, not from a source I fetched: it should be cited from NASA before it appears in the write-up; the in-data Day_view_time series is the evidence I am relying on.
- Morning surface temperature rises quickly, so an earlier sample reads cooler. The gap LST minus POWER TS: mean 2.66 degC in 2001-2019 and 1.88 degC in 2020-2025, falling to 0.86 in 2025; its trend is -0.46 degC/decade (MK p 0.002), and it tracks the view time closely (r = 0.77; slope 1.47 degC per hour of earlier overpass; inside 2020-2025 alone slope 1.29, r 0.93, n = 6).
- Adjusting the MODIS series to a constant view time using that slope turns the trend into +0.15 degC/decade (OLS +0.08, p 0.76) with TS, +0.18 with T2M. Sensitivity by end year (MODIS day vs POWER TS, Sen degC/decade): to 2015: +0.34 vs +0.48; to 2019: -0.12 vs +0.21; to 2021: -0.31 vs +0.09; to 2025: -0.35 vs +0.26. A gap of about 0.3 remains before the drift, which is within what skin-vs-model and clear-sky-only sampling can produce. (Terra LST is clear-sky only; JJA clear-sky days per month, counted from the Clear_sky_days bit field, are 17.5 on average with a non-significant rise of +0.9 per decade, so sampling does not point the wrong way.)
- Caveat: the view-time regression is a diagnostic fitted on 25 points; it shows the size and direction, not an exact correction. Weather in 2025 could add noise; the 2020-2025 sub-fit is the cleanest and gives the same slope.
- Plot: review\data_qa\CA_viewtime_drift.png.

### 2d. Is the cooling real?
- Real physical day-cooling in the SE US is plausible in kind: air-temperature "warming hole" literature, wetter summers, more cloud and soil moisture, and agriculture/forest effects all push daytime temperature down, and daytime-down with nighttime-up is the classic signature. The night LST warming of +0.62 here is consistent with that pattern, as is the Georgia/Alabama patch of strongest cooling.
- But the data do not show it for air temperature or skin temperature in the independent reanalysis (T2M +0.32, TS +0.26), nor in precipitation, cloud or sunlight (no significant trends), and the MODIS series' decline is concentrated after 2020 exactly when the sensor's sampling time slides. Before 2020 (2001-2019) the MODIS day trend is about zero (Sen -0.12, OLS -0.02, p 0.95), not -0.35, and for 2001-2015 it is positive (+0.34).
- Conclusion: not a bug in our pipeline, but the registered -0.35 is best read as largely an artifact of the Terra overpass-time drift, with a possible small real day-cooling that this record cannot confirm. The registered test is not significant either way (p 0.28).

### 2e. Verdict and fix
**No bug found in processing** (every decode, scale, QC, mask and aggregation step reproduced to within 2e-5 degC). **A product artifact is found** that a tough NASA judge will ask about. Recommended handling (no change to registered methods):
1. Report -0.35 as registered but state, with the Day_view_time plot, that Terra's daytime overpass drifted about 1.2 h earlier after 2020 and that the 2001-2019 trend is about zero. Offer the sensitivity (2001-2019 or view-time adjusted) as a labelled exploratory check, not as a replacement claim.
2. Optional data addition in data\scripts\fetch_earthdata.py so the site can show the drift live: for claim C-A also request `/MODIS_MONTHLY_0_05DEG_CMG_LST/Data_Fields/Day_view_time[1060:1199][1800:2089]` (byte, scale_factor 0.2, _FillValue 255, valid_range 0-120) in `opendap_subset` as its own DAP4 request (a combined multi-variable constraint returned HTTP 400 in my test), and in `a_from_hdf4` read `sd.select("Day_view_time")[A_R0:A_R1, A_C0:A_C1]`; decode (0.2 x stored, 255 to NaN), block-mean it like the LST, and write it as `view_time` in monthly.npz and in C-A_qc.json next to `support`. The stats contract does not need to read it; it is context for the exhibit.
3. Optional: add the Aqua product (MYD11C3 v061, starts 2002-07, afternoon orbit, still near its nominal time) as a cross-check witness for the Terra drift. Not fetched here.

## Files
- review\data_qa\DATA_QA_R1.md (this file)
- review\data_qa\CB_series_imerg_vs_power.png (C-B: JJAS by year IMERG vs POWER; 100-month series; by calendar month)
- review\data_qa\CA_series_and_witnesses.png (C-A: day vs night LST; standardised vs POWER TS/T2M; vs precip and cloud; cell slope map)
- review\data_qa\CA_viewtime_drift.png (C-A: Day_view_time by year; LST minus TS; scatter vs view time)
- review\data_qa\scripts\ (the analysis code)
