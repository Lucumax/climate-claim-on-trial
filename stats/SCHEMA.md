# Bundle schema v1.0 (stats worker)

Python is the source of truth. `out/<claim_id>/bundle.json` is what the browser replays. Examples (synthetic, NOT real data):
`stats/fixtures/example_bundle.json` (validation placeholder passes everything) and `stats/fixtures/example_bundle_withheld.json` (no validation attached, so the verdict is withheld: the flag path).

Conventions: all numbers are plain JSON numbers rounded to 6 significant digits (cell fields 5); NaN is `null`; per-cell fields are flat arrays in row-major order (`index = iy * nx + ix`, `iy` along `lat`, `ix` along `lon`); slopes are per decade, in the variable's units per decade; years are calendar years.

## Input contract for the data worker (`data/<claim_id>/`)

`claim.json`:
```
{ "claim_id": "C-A", "claim_text": "...", "variable": "...", "variable_plain": "summer daytime land surface temperature",
  "units": "K", "direction": "increase" | "decrease", "season_months": [6,7,8], "period": [2001, 2025],
  "region_name": "the Southeastern United States", "region_box": {...},
  "product": {"name": "...", "version": "...", "doi": "..."}, "is_model_data": false }
```
`monthly.npz`: `values` (T, ny, nx) float, NaN = missing; `lat` (ny,), `lon` (nx,); `year` (T,) int; `month` (T,) int; optional `support` (ny, nx) bool (cells inside the region/land mask; default all). Months of the season only are needed (annual mean: all 12). Seasons must lie inside one calendar year. Aggregate to the shipped grid before writing (`trendtrial.aggregate.block_aggregate`: 0.05 to 0.25 degrees is k = 5). Run: `stats\.venv\Scripts\python -m trendtrial.pipeline data\C-A --out out\C-A --validation out\validation\validation_results.json`.

## Top level
`schema_version, run, claim, params, coverage, regional, sensitivity, cells, validation, verdict, finding, method_notes`.

- `run`: `run_id` ("run-" + 12 hex of sha256 over code version, input hashes, params, validation hash), `generated_at`, `code_version`, `seed`, `elapsed_seconds`, `input_sha256 {claim_json, monthly_npz}`, `software`.
- `claim`: claim.json copied verbatim.
- `params`: alpha 0.05, bh_q 0.10, cov_threshold 0.80, min_season_month_frac 2/3, min_clim_frac 0.6, min_valid_years_*, boot_reps 2000, boot_block_len 3, boot_level 0.95, seed, sensitivity grids, breadth_min 0.25, local_min 0.05.
- `coverage`: `n_cells_grid, n_support_cells, n_cells_with_climatology, cov_threshold, months_total, months_dropped, years_total, years_valid, years_dropped[], mean_valid_cell_frac, min_valid_cell_frac, monthly[{year, month, valid_cell_frac, area_weighted_frac, region_month_valid}]`.
- `regional`:
  - `years[]`, `anomaly[]` (area-weighted seasonal mean anomaly, `null` for invalid seasons), `valid_months[]`, `baseline_mean` (add to anomaly for an absolute-units display), `sen_line[]` (Sen line at each year), `units`, `season_months`.
  - `tests.mk_hr`: `n, s, tau, var_s_independent, hr_factor_raw, hr_factor` (floored at 1), `var_s, z, p, significant, alpha`. This is THE regional test.
  - `tests.mk_independent`: `z, p, significant` (same series, no autocorrelation correction; context).
  - `tests.sen`: `slope_per_decade, intercept, ci_bootstrap_per_decade [lo,hi]` (the interval to show), `ci_analytic_hr_per_decade` (context), `interval_method`.
  - `tests.ols`: familiar baseline: `slope_per_decade, se_per_decade, t, df, p, ci_per_decade, n, note`.
  - `band`: `years[], center[], lo[], hi[], level, meaning, reps, block_len, n`; same bootstrap draws as the slope interval; band is for the trend line, not individual years.
- `sensitivity`: `coverage[{cov_threshold, years_valid, p, slope_per_decade, significant_in_direction}]`, `block_len[{block_len, ci_per_decade, excludes_zero_in_direction}]`, `stable` (bool), `definition`. Label as sensitivity, not validation.
- `cells`: `grid {ny, nx, lat[], lon[], order}`, `n_valid_cells, n_excluded_cells, min_valid_years`, `fields` (flat arrays): `valid` (0/1), `slope_raw_per_decade` (rung 1 series), `slope_per_decade` (rungs 2-4), `p_rung1, p_rung2, p_rung3, bh_adjusted_p, hr_factor, flag_rung1..flag_rung4` (0/1). `rungs[4]`: `{rung, name, what_changes, flagged_cells, flagged_area_frac, flagged_in_direction_cells, flagged_in_direction_area_frac, cells_changed_vs_previous}`. `rung2_cells_with_changed_p` and `rung2_note`: if 0, say "rung 2 changed nothing here" (with complete months, anomalies only shift a cell's series by a constant). Area fractions are cos-lat weighted shares of valid cells, descriptive, never an error rate. Flags in the claimed direction only count cells whose Sen slope has the claimed sign.
- `validation`: `status` ("run" | "not_run"), `gate`, `claim_phi_hat`, `results_summary`, `results_run`, `source_sha256`. See "Gate flags".
- `verdict`: `id` (withheld | contradicted | supported | partly_supported | not_supported), `branch` (adds sub-branches `partly_regional_narrow`, `partly_local_only`), `text` (render this; the sentences come only from the fixed templates in `trendtrial/verdict.py`, no free text), `precedence_trace[]`, `withheld_reasons[]`, `inputs`, `branches[]`.

- `finding` (spec 3.8 card; every sentence is a fixed template, render as is): `place_name, variable, units, period, season, seasons_used, change_per_decade {value, units, interval [lo,hi] | null, interval_method, interval_meaning, scope}, product {name, version, doi}, verdict_id, verdict_text, not_supported[]` (what the evidence does not support), `selection_disclosure` (headline = the one pre-registered regional test; synthetic and user-exploration variants), `scope_text` (regional average vs hotspot), `is_model_data, run_id, ledger_ref`. `product` is copied from claim.json `product`; `ledger_ref` from claim.json `ledger_ref` if present, else "claim / run_id". `interval` is null when the gate disabled it. Extra optional claim.json keys used: `preregistered` (default true), `registration_ref`, `synthetic`, `ledger_ref`.
- Interval source: `regional.tests.sen.interval_used_per_decade` is the interval to show (null if disabled); `interval_method` says whether it is the bootstrap or the analytic Hamed-Rao interval (the gate picks: bootstrap if it passed its coverage bar, else analytic if that passed, else none). `regional.band` follows the same method (`band.meaning` states what it is).

## Verdict precedence (first match wins)
withheld > contradicted > supported > partly supported > not supported by this data. Definitions and the 0.25 / 0.05 thresholds are in `verdict.py` and were recorded in `event_record/STATS_LOG.md` before any claim data. Never present nonsignificance as unpublishable; never state a cause or forecast. The browser must render `verdict.text` as is.

## Gate flags (the browser MUST honour them)
`validation.gate`: `regional_verdict_enabled, interval_enabled, interval_method (bootstrap | analytic_hr | null), cells_enabled, reasons_blocking_verdict[], conservative_flags[], governing[]`.
- `regional_verdict_enabled = false`: show no regional verdict and no "significant / not significant" badge for the regional test; show `verdict.text` (withheld) and the reasons. Numbers may be shown as plain description only.
- `interval_enabled = false`: hide the slope interval and the chart band (the OLS interval is a baseline and may stay, labelled as such).
- `cells_enabled = false`: hide hotspot flags, flagged-area fractions and any breadth claim on the map; the per-cell p-values and slopes may still be shown as description.
- `conservative_flags`: show the text as a note near the verdict ("the test is conservative here: a non-significant result carries less weight"); it does not disable anything.
- Rules for how results become flags: STATS_LOG.md "WP3 validation design and PASS BARS". A claim is enabled only if all its governing scenarios pass.
- Independently, a claim whose regional series has fewer than max(10, 0.6 * seasons) valid seasons is withheld (G-Cov).

## Validation results file (`out/validation/validation_results.json`)
`run`, `scenarios[]` (`id, kind (regional|cells), n, phi, metrics {name: {value, se}}, checks {B1..B4: {passed, ...}}, floor_ok`), `summary {failures[], conservative_size[], all_floors_ok}`. Every failure is published on the method page.

## Honest limits to print
Hamed-Rao is less reliable for short series; gaps are skipped (lags counted in valid observations); BH wording per spec 3.5; synthetic calibration does not establish BH validity for all real fields; field significance out of scope; hotspot intervals pointwise.
