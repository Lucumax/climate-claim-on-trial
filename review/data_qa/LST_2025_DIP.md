# Is the 2025 dip in the global land surface temperature (LST) series real?

Library product: `web/data/library/lst_day_myd11/` (MODIS Aqua MYD11C3 v061, LST_Day_CMG, 1 degree monthly, 2003-01 to 2026-10, 286 months).
Checked 2026-11-14. Method: decoded all tiles back into a 286 x 180 x 360 cube and recomputed everything from it.
The recomputed area-weighted global series matches the shipped `global_series.json` to 0.0004 degC, so the web series is exactly what the tiles hold.

## Finding

**The dip is an ARTIFACT, but not a build bug. The cause is Aqua's orbit drift (the overpass time moving later), which cools the daytime reading.** The footprint, units, fill values, month counts and averaging order are all clean.

Berkeley Earth's 2025 report ranks 2025 the third-warmest year globally and says land was its **second warmest** land year (behind 2024). So a real land cooling of about 0.65 degC from 2024 to 2025 (what our series shows) is not credible, and the 2026 anomaly of -1.8 degC (down to -3.3 degC in Oct 2026) is physically impossible. Source: https://berkeleyearth.org/global-temperature-report-for-2025/

## Evidence

Anomalies are against each cell's own 2003-2022 monthly climatology, averaged afterwards over a FIXED footprint (21,124 1-degree cells valid in all 286 months), area-weighted by cos(lat).

| Year | Months | Valid cells (mean/month) | Raw global mean, all cells (degC) | Anomaly, fixed footprint (degC) | Anomaly, all valid cells (degC) | Mean view-time anomaly (h) |
|---|---|---|---|---|---|---|
| 2003 | 12 | 22109 | 17.19 | -0.10 | -0.09 | -0.05 |
| 2015 | 12 | 22108 | 17.36 | +0.07 | +0.09 | +0.01 |
| 2020 | 12 | 22100 | 17.74 | +0.50 | +0.47 | 0.00 |
| 2021 | 12 | 22108 | 17.53 | +0.29 | +0.26 | 0.00 |
| 2022 | 12 | 22103 | 17.35 | +0.11 | +0.08 | +0.05 |
| 2023 | 12 | 22105 | 17.71 | +0.47 | +0.44 | +0.21 |
| 2024 | 12 | 22101 | 17.41 | +0.17 | +0.14 | +0.49 |
| **2025** | **12** | **22090** | **16.74** | **-0.48** | **-0.54** | **+0.93** |
| 2026 | 10 (Jan-Oct) | 22091 | 16.48 | -1.82 | -1.84 | +1.42 |

1. **Not incomplete months.** 2025 has all 12 monthly granules. (2026 has 10 months, so its raw mean is a partial year, but 2026 is not the dip in question.)
2. **Not a changing footprint.** Valid cells per month range 21,941 to 22,118 (std 20 cells, 0.1%). 2025 is 22,090 against about 22,105 in other years; the lowest month is Dec 2025 at 21,941. Area-covered fraction is 0.2953 every year. Fixed-footprint and all-cells anomalies differ by 0.05 degC or less, and the dip is the same in both.
3. **Not averaging raw before anomalies.** Because the footprint is stable, the judge's concern does not bite here: raw fixed-footprint means (16.18 in 2025 against 16.84 in 2024) show the same drop as the anomaly series.
4. **Not fill values or units.** Fill 0 is masked before the 0.02 K scale and the single K to degC step; values range -82 to +67 degC with no stray fill. Seasonal checks (Sahara, Amazon) are sane. The dip is gradual and smooth, not a step or a spike.
5. **Aqua drift is the cause.** The file's own `Day_view_time` (local solar hour of the observation, read from the earlier QA fetch `vt_myd11.npz`, block-averaged to 1 degree) is flat at 12.1-12.2 h through 2021 and then climbs: +0.05 h (2022), +0.21 (2023), +0.49 (2024), +0.93 (2025), +1.42 (2026). The drift passes +0.1 h in Dec 2022. The LST anomaly falls in step. Over 2022-2026 monthly: slope -1.53 degC per hour of later overpass, r = -0.84. Across all months: slope -0.94 degC/h, r = -0.57. The pre-drift years (2003-2021) show no view-time/LST relation, which is expected because view time was constant. Reasons it cools: a later overpass reads the afternoon after the daily peak, and it also changes which clear-sky scenes are sampled. This matches the caveat already in `products.py` (Aqua drifting later since mid-2021, NSIDC 2021).
6. **Latitude pattern fits a sampling/diurnal effect, not climate.** Fixed-footprint anomaly in 2025 by band: 60S-30S -1.96, 30S-0 -1.92, 0-30N -0.92, 30N-60N +0.21, 60N+ +0.85 degC. 80% of cells are cooler than baseline in 2026.
7. **Independent check.** AIRS air temperature from the same Aqua platform, same footprint (cells valid in both products; also drift-affected, but it is an air temperature, not a skin temperature) shows a much smaller change: 2024 +0.33, 2025 -0.06, 2026 -0.21 degC against our LST +0.07, -0.68, -2.05 on that footprint. Berkeley Earth (station data) says land was the second warmest ever in 2025.
8. **Effect on trend.** Fixed-footprint annual anomaly OLS trend: +0.32 degC/decade for 2003-2021, +0.29 for 2003-2024, but +0.20 for 2003-2025. Ending a window in 2025 or 2026 reports the drift, not the climate.

## Recommended fix

No library rebuild was done. Nothing in `data/library/scripts/build_lst.py` is wrong, and a rebuild would give the same cube.

**Library (optional, small).** In `data/library/scripts/products.py` (`LST_CAV`) and the manifest caveat text, state the size: "By late 2025 Aqua's overpass is about 1 hour later than before 2022, and the LST reads about 1 degC cooler per hour of drift, so values from 2022 on are biased cool and a global land dip in 2025-2026 is an artifact."

**Web UI (to be done by the owner of `web/js` and `web/css`, not by me).**

1. Add `quality_end` to the `lst_day_myd11` entry of `web/data/library/manifest.json` with the value `"2021-12"` (the last month with the view time within +/-0.05 h of its 2003-2021 level; the drift passes 0.1 h in Dec 2022, so `"2022-12"` is the loosest defensible value).
2. In the library chart, for any series whose product has `quality_end`: draw months after `quality_end` as a hatched or lighter band labelled "Aqua overpass drift: values after Dec 2021 read too cool, not climate", and exclude those months from any trend, Sen slope, window default and "latest value" statistic. The default window for this product should end at `quality_end`.
3. If the user picks a window that ends after `quality_end`, show an amber banner over the result: "This window includes 2022-2026, when the satellite's overpass time drifted about 1 hour later. Daytime surface temperature from this product reads cooler as a result (-0.5 degC by 2025). Do not read the dip as real cooling."
4. In the verdict text for any claim that uses this product after 2021, cap the confidence ("cannot rule on this window with this dataset") and cite Berkeley Earth 2025 (land second warmest) as the check.

Anomaly-before-averaging is still good practice and should stay (the stats layer should compute anomalies on cells valid in the baseline), but it does not remove this artifact.

## Files and scripts

Intermediate arrays and scripts (scratchpad only, not in the repo): `load.py`, `an.py`, `an2.py`, `an3.py`, `vt.py`, kept in a temporary scratch folder of the analysis session.
The earlier file `vt_myd11.npz` is truncated by the crash: only its `vt` array is readable (used here); `csd` and `lst` are lost, so Clear_sky_days was not checked.
No new downloads were made.
