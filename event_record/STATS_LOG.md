# STATS_LOG: WP2 core and WP3 validation (Sonnet B)

Times are local machine time (ET). Entries are appended in order; pass bars and tolerances are written BEFORE the run they govern.

## Sat Nov 14 10:35 ET - start
- stats/.venv built with uv (CPython 3.12.8). Pinned: numpy 2.5.4, scipy 1.18.1, pandas 3.1.1, pymannkendall 1.4.3 (test oracle only, never imported by trendtrial), pytest 9.2.0. See stats/requirements.txt.
- Design decisions, recorded before any result:
  1. Ladder grain: per-cell series is the seasonal mean per year (n = number of seasons, 25 or 45), the same grain as the regional test and the validation. Consequence, stated honestly: with complete months, anomalies against a per-cell same-season climatology only shift the series by a constant, and MK and Sen are invariant to that. Rung 2 therefore changes a cell only where months are missing (the seasonal mean then mixes different months and the anomaly mean does not). The bundle reports how many cells rung 2 changed; the UI should say "rung 2 changed nothing here" when that is 0.
  2. Missing years: MK and Sen use valid years only, Sen uses calendar-year differences; Hamed-Rao counts lags in valid-observation order (as pymannkendall skips NaN). Approximation stated in the bundle.
  3. Hamed-Rao factor floored at 1 (spec 3.3); pymannkendall does not floor, so the oracle test compares the unfloored factor.
  4. Regional series: anomalies per cell against own per-cell, per-calendar-month climatology over the claim period; cos-lat weighted mean of anomalies per month; a region-month is valid only if at least 80% (parameter) of support cells with a valid climatology have a valid anomaly; a season is valid only if at least 2/3 (parameter) of its months are valid.
  5. Uncertainty: residual moving-block bootstrap around the Sen line (block length default 3, 2000 reps, seed fixed); slope interval = percentile 2.5/97.5 of bootstrap Sen slopes; chart band = pointwise percentile 2.5/97.5 of the bootstrap Sen lines. Same draws for both. Raw trending values are never resampled. Gap years: residuals are resampled among valid years and placed on valid years.

## Oracle tolerances (recorded 10:36 ET BEFORE running tests/test_oracle.py)
Series set: 300 complete series (no NaN), n in 10..60, mixed: iid normal, AR(1) phi 0.5, linear trend + noise, rounded values with ties, lognormal; fixed seed.
- MK vs pymannkendall.original_test: S exact (integer equality); var_s relative 1e-12; z absolute 1e-10; p absolute 1e-10; Sen slope absolute 1e-10; intercept absolute 1e-9.
- HR vs pymannkendall.hamed_rao_modification_test: the unfloored factor (var0 * n_ns_raw equals pymk var_s) relative 1e-9; p and z absolute 1e-9 on every series where pymk's factor >= 1. Where pymk's factor < 1 the shipped test floors at 1 by design (spec 3.3), so there we require var_s == var0 exactly and do not compare p.
- BH vs scipy.stats.false_discovery_control(method='bh'): adjusted p absolute 1e-12; rejection set identical at q = 0.10 on 50 random p-vectors (sizes 5..5000, mixture of uniform and small p).
