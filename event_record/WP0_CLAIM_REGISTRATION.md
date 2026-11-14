# WP0 claim registration: Climate Claim on Trial (NASA Space Apps 2026, Be An Earth System Trend Detective!)

Registered Sat Nov 14 2026, about 11:00 AM ET, by the orchestrator (Claude Opus 5.5) under Walter Guevara's standing runbook authorization. Registered BEFORE any claim-data download and before any result was seen. No data for any claim has been downloaded at this point. Changes after this point are logged as substitutions, with time and reason, before their own downloads.

## Claims (lead order is not binding: the first claim with a logged, QC-checked subset leads, runbook L0)

| ID | Claim as stated (the claim on trial) | Variable and product (DOI copied from the catalogue at download) | Region box | Season and period |
|---|---|---|---|---|
| C-A | Summer daytime land surface temperature over the Southeastern United States has risen | MODIS Terra LST Day, monthly 0.05 deg CMG (MOD11C3 v061). Pre-registered substitute: MYD11C3 (Aqua; coverage from Jul 2002, so period becomes JJA 2003-2025). Model alternate: MERRA-2 T2M via POWER, labelled a different variable | 30-37N, 90-75.5W | JJA, 2001-2025 (25 summers) |
| C-B | Wet-season rainfall over the central Sahel has increased | GPM IMERG Final Run monthly, V07 (GPM_3IMERGM) | 10-18N, 17W-25E | JJAS, 2001-2025 (25 seasons) |
| C-C | Near-surface air temperature over interior and western Alaska has risen | MERRA-2 2 m air temperature (T2M) via NASA POWER (reanalysis model output, labelled as model data, not a direct observation) | 60-70N, 165-140W | Annual mean, 1981-2025 (45 years) |

## Methods fixed now (before any result)
- Regional test for every claim: Mann-Kendall with Hamed-Rao variance correction on the area-weighted (cos latitude) mean anomaly series; Sen slope reported per decade; two-sided alpha 0.05. One regional test per claim.
- Per-cell ladder (map): rung 1 raw MK assuming independence; rung 2 anomalies against the per-cell climatology of the same season; rung 3 Hamed-Rao; rung 4 Benjamini-Hochberg at declared q = 0.10 (Wilks 2016 recommendation for gridded fields). Estimator and sample identical across rungs.
- A plain least-squares slope with a t-test and 95% confidence interval is also shown as the familiar baseline the brief names; it is context, not the verdict.
- Coverage, gap, interval/band and verdict rules: decided at G-Cov and before results, per spec v3 sections 3.1-3.7.

## Audience note (official brief, read 10:45 AM)
The brief suggests high school and college students and the science-literate public. The product fronts the registered claims with a short guided "detective" question flow and plain definitions of each variable. Users choose among the registered claims; they do not type free claims.
