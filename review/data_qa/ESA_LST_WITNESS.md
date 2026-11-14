# ESA LST CCI multi-sensor witness for C-A (Nov 14)

Exploratory check, not the registered test. The C-A verdict stays WITHHELD and nothing in `data\C-A\` or the case bundle was changed.

Files: `web\data\witness\C-A_esa.json` (numbers), `data\witness_esa\make_esa_witness.py` (script; stats venv, `-I`, one month in memory at a time).

## 1. What IRCDR is

ESA Land Surface Temperature CCI, "IRCDR" = the infrared climate data record, level L3S (several sensors merged on one 0.01 degree grid), monthly daytime, v3.00. DOI 10.5285/b8be3f3993e54d309fddf61ea5d3674f.

Source: ESA LST_cci Product User Guide, LST-CCI-D4.3-PUG v3.1, 15 Jan 2024, https://admin.climate.esa.int/documents/3019/LST-CCI-D4.3-PUG_-_i3r1_-_Product_User_Guide.pdf
- Section 4.9, Table 15 (pp. 41-43): the record combines ATSR-2 (ERS-2), AATSR (Envisat), MODIS on Terra and SLSTR on Sentinel-3. "The data is harmonised across sensors and corrected to a common local equatorial crossing time." Method: intercalibrate against IASI (GSICS), then add a temporal correction to any sensor not nominally at the reference sensor's crossing time; "Terra MODIS is the reference sensor".
- Section 6.2 (p. 62): same two steps in the Level-3 processing description. Monthly values are simple means of the clear-sky daily values.
- Sensor transitions: the guide warns that inconsistencies or discontinuities may occur when sensors change; the stability line for ATSR-2/AATSR is -0.41 to 0.25 K per decade (global, against air temperature). No regional step sizes are given.
- Caution: the guide documents version 2.0 (to 2020). The v3.00 files used here run to 2024, carry no time-correction variable, and their sensor list is below. So how far the time-of-day correction applies to these v3.00 daytime months cannot be confirmed from the files. The mean solar zenith angle of the retrievals (JSON, `esa_mean_solar_zenith_deg`) is about 27 degrees in the ATSR/AATSR and Sentinel-3B years and about 22 degrees in the Terra years, so the sampling time visibly differs between sensors.

Sensor per month (from `meta_new.json`, platform and sensor attributes):
| Months | Platform / sensor | Source string |
|---|---|---|
| Jul-Aug 2001 | ERS-2 / ATSR-2 | ATSR_2 L3S V3.00 |
| Jun 2002 - Aug 2011 | Envisat / AATSR | ATSR_3 L3S V3.00 |
| Jun 2012 - Aug 2018 (JJA) | Terra / MODIS | MODIST **L3C V4.50** |
| Jun 2019 - Aug 2024 | Sentinel-3B / SLSTR | SLSTRB L3S V3.00 |

Important: in 2012-2018 the ESA record is Terra MODIS again (ESA's own processing). So ESA is independent of NASA MOD11C3 and of Terra's late drift only in 2001-2011 and 2019-2024. The Terra drift (view time 16.56 UTC to 15.39 UTC) starts in 2021, inside the Sentinel-3B years, so the drift window itself is covered by a different satellite.

## 2. Data completeness and footprint

- 71 of 72 JJA months 2001-2024. Missing: June 2001. It is not a failed download: the CEDA server answers 404 for that file (record starts July 2001). 2001 therefore uses July and August (the season rule needs 2 of 3 months).
- Scaling from the OPeNDAP .das of the 2005-07 file: lst = raw x 0.01 + 273.15 K (so degC = raw x 0.01), fill -32768, valid range -8315..7685; also dropped: n = 0, land cover water/snow/sea ice (210, 220, 230).
- Regridding: 0.01 degree to the C-A 0.25 degree grid (28 x 58) by 25 x 25 block mean, block valid if at least 50% of the 625 pixels are valid (same rule as C-A). The blocks line up exactly with the C-A grid.
- Cells: C-A land support 1,264; ESA valid in all 71 months inside the support 1,003; **fixed footprint (also valid in all 72 MODIS months) 1,003 cells**. Sensitivity footprint (valid in at least 90% of months): 1,229 cells.
- Anomalies per cell and calendar month against the 2001-2024 mean, then cos(latitude) weights, then JJA mean (the case's own `trendtrial.aggregate` functions). MODIS is processed on the identical footprint and years.

## 3. Results, 2001-2024 (24 seasons, degC per decade)

| Series | Sen | 95% interval | p (Hamed-Rao, registered headline) | p (Yue-Wang) | p (independent) |
|---|---|---|---|---|---|
| ESA multi-sensor | +0.37 | -0.48 to +1.12 | 0.39 | 0.45 | 0.39 |
| MODIS Terra, same footprint | -0.24 | -0.83 to +0.44 | 0.54 | 0.61 | 0.54 |
| MODIS Terra, registered, 2001-2025 | -0.35 | (case bundle) | 0.27 | | |

No regional test is shipped for C-A (gate withheld), so the registered Hamed-Rao version is shown alongside Yue-Wang, which stayed closest to nominal size in the gate table. Neither series has a significant trend under any of them.

- Agreement: Pearson r = 0.905 (anomalies), 0.976 on year-to-year changes, 0.962 after removing each series' own trend. By era: 0.98 (ATSR/AATSR, 11 seasons), 0.97 (Terra years, 7 seasons, expected because it is the same instrument), 0.53 (Sentinel-3B years, 6 seasons, p 0.28).
- Difference series (ESA minus MODIS): Sen +0.44 degC per decade (interval +0.20 to +0.69, p 0.0005). It is flat through 2020 (mean -0.19) and then +0.51, +0.62, +0.68, +1.23 in 2021-2024 (mean +0.76). Level steps (descriptive, 24 points, autocorrelated so p is indicative): 2012 (AATSR to Terra) +0.11 (p 0.51), 2019 (Terra to Sentinel-3B) +0.17 (p 0.53), 2021 +0.74 (p 0.02). Sensor-change years show no clear step; the divergence starts in 2021.
- Before the Terra drift, 2001-2020: ESA +0.08 (interval -0.89 to +1.23), MODIS -0.19 (-0.95 to +0.79); both about zero, no significant difference visible. Dropping 2001 (two months, ATSR-2): ESA +0.10, MODIS -0.37.
- Air-temperature cross-check (NASA POWER T2M, from the C-A witness file, slightly different footprint): ESA tracks it with r 0.90, gap in 2021-2024 +0.16 degC; MODIS r 0.84, gap -0.63. MODIS minus T2M has a trend of -0.45 degC per decade (interval -0.74 to -0.11), ESA minus T2M +0.13 (-0.29 to +0.48).

## 4. Plain conclusion

ESA does not corroborate the MODIS cooling. It is inconclusive on the trend itself: the two 24-year Sen slopes have opposite signs (ESA +0.37, MODIS -0.24 degC per decade), but neither is statistically distinguishable from zero and their intervals overlap. The two records move together year to year (r 0.91) and agree before 2021 (both about zero). They part ways in 2021-2024, the same years in which Terra's overpass time moved earlier, and the difference does not coincide with an ESA sensor change (the 2019 switch to Sentinel-3B shows no step). That pattern is consistent with the Terra drift pulling MODIS down, but this check cannot prove it: the Sentinel-3B years are only six, the ESA record has its own unquantified sensor breaks, and the ESA monthly files do not show whether time-of-day correction was applied. The C-A verdict remains withheld.

Docket sentence: "An independent European multi-sensor record agrees with MODIS Terra year by year (r 0.91) and until 2020, but shows no cooling over 2001-2024 (+0.37 against -0.24 degC per decade, neither significant), because the two diverge after 2021, when Terra's overpass time began to move earlier; the claim stays withheld."
