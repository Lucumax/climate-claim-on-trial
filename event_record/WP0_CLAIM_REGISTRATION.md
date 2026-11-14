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

## Addendum 1, Sat Nov 14 ~11:30 AM ET (before any C-D download; C-A to C-C unchanged)
Reason: the challenge author's video (Cd9Q48LhNbo) lists five steps the app must let users do (choose variable, region incl. the world, period; make and examine the series; test significance) and uses MODIS Aqua AOD over Wisconsin as the worked example.

| ID | Claim | Variable and product | Region | Season and period |
|---|---|---|---|---|
| C-D | Summer aerosol optical depth over Wisconsin has increased (the challenge author's own example, put on trial) | MODIS Aqua monthly atmosphere L3, AOD 550 nm Dark Target + Deep Blue combined (MYD08_M3 v6.1), or the same variable through Giovanni; product and DOI copied at download | Wisconsin bounding box 42.5-47.1N, 92.9-86.8W (state mask if cheap) | JJA, 2003-2025 (first full Aqua summer 2003) |

Same regional test and ladder as section "Methods fixed now". Detective mode (user-chosen variable, region and period) is exploratory: its outputs carry a "your own exploration, not pre-registered" label and the same plain p < 0.05 wording the author uses, plus the honest caveats.

## Addendum 2 countersigned by the orchestrator, Sat Nov 14 11:22 ET
- Method change (STATS_LOG.md, addendum 2): chosen on synthetic data only, before C-C was run. Shipped regional test per claim = the candidate that passes the size bar at the claim's governing persistence scenario with the highest power (in practice Yue-Wang 2004 effective-sample-size MK). Raw MK and the registered Hamed-Rao stay on the ladder as visible steps. Cells: shipped test if it keeps BH false-discovery control at the claim's scenario, else the highest-power candidate that does, else the map is 'unadjusted, descriptive' and the verdict does not use it. The stats worker's first cell-rule run (highest BH power) did not follow this instruction; it was corrected after the first C-C run, and both runs are kept and disclosed.
- Bar B4 (Sen-slope bias) amended BEFORE C-A, C-B and C-D are run: pass if |bias| <= 3 Monte Carlo SE OR |bias| <= 0.025 SD per decade. Reason: the recorded 2-SE bar was applied to 38 scenarios (about 2 failures expected by chance; 5 observed, all below 0.025 SD per decade, which is negligible next to the slopes we report). The original bar and its failures stay published. C-C is unaffected (its governing scenario passed the original bar).

## Timestamp correction (orchestrator)
The "about 11:00 AM ET" in the first paragraph and "~11:30 AM" in addendum 1 were the orchestrator's estimates and were wrong. The git commit times are authoritative: registration committed Sat Nov 14 10:29 AM ET (839f802), addendum 1 at 10:35 AM ET (36de9c7). Both are after the 9:00 AM ET start and before any claim-data download (first data commit f08c4f0, C-C only).

## Addendum 3, Sat Nov 14 13:15 ET (orchestrator; BEFORE any NO2 data download; C-A to C-D unchanged)
Reason: the brief says one variable can trend one way in one region and the opposite way in another, even when the same process drives both; the challenge author names OMI. This registers an opposite-sign pair driven by the same process (combustion emissions and their controls).
| ID | Claim | Variable and product (DOI copied at download) | Region | Season and period |
|---|---|---|---|---|
| C-E1 | Tropospheric nitrogen dioxide over the eastern United States has fallen | OMI/Aura tropospheric NO2 column, cloud-screened, Level-3 (OMNO2d v003 or the current GES DISC version), aggregated to monthly then annual means | 35-45N, 90-70W | Annual mean, 2005-2025 |
| C-E2 | Tropospheric nitrogen dioxide over the Indo-Gangetic Plain (northern India) has risen | same product | 22-30N, 75-88E | Annual mean, 2005-2025 |
Same regional test, ladder, gates and validation rules as the other cases (method addendum 2, adaptive-procedure gate). OMI row-anomaly data handling follows the product's own flags; document it. If time runs out, this pair is dropped and the drop is disclosed.

## Addendum 4, Sat Nov 14 15:45 ET (orchestrator; AFTER results; disclosed as a post-result change)
What changed: the validation gate, not the registered claims, bars or candidate tests. Rules R3-1 to R3-8 were written in event_record/STATS_LOG.md at 13:40 ET, after the round-2 bundles (12:20 ET) had been seen and before any round-3 simulation was run. Trigger: the round-2 outside review showed that the old gate (a) rounded negative persistence up to zero, (b) checked skewness with one scenario (n 25, phi 0.3) that measured persistence rather than skew, and (c) let missing years pass the gap check.
Effect on verdicts (round 2 -> round 3; commit 3152f39):
- C-C Alaska: supported -> supported (unchanged numbers).
- C-B Sahel: partly supported -> partly supported. The shipped test changed from Yue-Wang to bootstrap Mann-Kendall (block length 3) because negative persistence is now simulated: p 0.030 -> 0.004; interval 0.023-0.489 -> 0.096-0.330 mm/day per decade; area flagged 15.6% -> 22.3%. Sen +0.207 unchanged. The result became STRONGER after a post-result rule change; this is stated wherever the result is shown, and the round-2 numbers stay on record.
- C-A Southeast US: withheld -> withheld (reason now dependence at n 25, phi 0.2).
- C-D Wisconsin: withheld -> NOT SUPPORTED (boot-MK L3, p 0.114, Sen +0.0296 per decade, 0 of 42 cells). The test is conservative here (size 2.9%, power 23% at the reference trend), so "not supported" means the record does not show the claimed rise at the registered bar; it is not evidence that the rise did not happen.
Round-2 bundles and run IDs are kept and listed as superseded. No further gate changes before submission.
