# Architecture

For a developer who wants to read, rebuild or extend the project. The statistics are explained in [METHODS.md](METHODS.md), the rebuild commands are in [REPRODUCE.md](REPRODUCE.md), and the bundle format is in [stats/SCHEMA.md](stats/SCHEMA.md). Commands run from the repository root and use POSIX paths; on Windows use `.venv\Scripts\python.exe`.

## Folder map

| Folder | What is in it |
|---|---|
| `data/` | NASA download scripts (`scripts/`), one input folder per case (`C-A` to `C-E2`: `claim.json`, `monthly.npz`, QC and provenance files), the satellite library builders and checks (`library/scripts/`), second-witness inputs (`witness_esa/`, `witness_knmi/`). `raw/` is never committed. |
| `stats/` | The Python statistics package `trendtrial/`, run scripts (`scripts/`), 107 tests (`tests/`), the browser port `js/trendtrial.js`, fixtures, and results (`out/<case>/bundle.json`, `out/validation/`, `out/exploratory/`). |
| `web/` | The whole site: static files, no build step. `index.html`, `js/`, `css/`, `data/` (bundles, library tiles, witnesses), `vendor/` (basemaps, globe), `tools/` (server and checks). `proto/` and `lab.html` are experiments, not part of the site's navigation. |
| `event_record/` | Dated logs (`STATS_LOG.md`, `DATA_LOG.md`, `WEB_LOG.md`) and the registration with its hashes. |
| `review/` | Outside reviews and data checks. |
| `export/` | Builds the public copy from a whitelist (`manifest.json`). |
| `submission/` | Event submission text and the video pipeline. |

## Data flow

```
NASA sources (Earthdata CMR and OPeNDAP, GES DISC, LAADS, NASA POWER API)
  -> data/scripts/*.py, data/library/scripts/*.py          (data venv: earthaccess, netCDF4, pyhdf)
  -> data/C-*/claim.json + monthly.npz (+ qc, provenance)  one folder per registered case
     web/data/library/<id>/ tiles                           one degree monthly grids for Investigate
  -> stats/trendtrial (pipeline.run_claim)                  (stats venv: numpy, scipy; no NASA libraries)
       reads stats/out/validation/validation_results*.json  (the simulation tables the gate consults)
  -> stats/out/C-*/bundle.json -> web/data/bundle_*.json + web/data/index.json
  -> web/ (static site) -> the browser; Investigate also calls NASA POWER live
```

The two virtual environments are separate on purpose. Python is the source of truth for every number; the browser only replays bundles and recomputes series-level statistics for Investigate.

## The static site

`web/index.html` loads `js/main.js`, a hash router. Each route returns a view that builds its page with plain DOM calls.

- `js/views/`: pages. `landing.js` and `hook.js` (home), `detective.js` (Investigate), `cases.js` (case list and docket), `no2.js` (docket text for the NO2 pair), `pages.js` (Method, Data and provenance, Glossary), `falsealarm.js` (False-Alarm Planet), `exhibit.js`, `clinic.js`, `common.js`.
- `js/viz/`: visual modules (globes, stripes, spiral, anomaly map, witness panels). `web/lab.html` mounts them one by one.
- `js/*.js`: helpers. `data.js` adapts a bundle to the views, `chart.js`, `map.js`, `basemap.js`, `library.js`, `live.js`, `stats.js`, `words.js`, `theme.js`, `util.js`.
- `js/vendor/trendtrial.js`: a copy of `stats/js/trendtrial.js`, the browser port of the series-level tests (least squares, Mann-Kendall with corrections, Sen interval, seasonal series, the exploratory gate and its table). Edit only `stats/js/`, then run `sh web/tools/sync_stats.sh`. Parity with Python is tested (`stats/tests/test_js_parity.py`, with `stats/js/parity_runner.mjs`, needs `node`), and `export/smoke_web.py` checks that the two copies are identical. Maps, Benjamini-Hochberg and the bootstrap stay in Python.

Run the site with `python web/tools/serve.py 8765`.

## The satellite library

Ten NASA measurements for Investigate, at one degree and monthly. Each is stored in `web/data/library/<id>/` as 30 by 30 degree tiles (`tile_<row>_<col>.bin.gz`, int16 values, `-32768` for no data) plus `global_series.json`. `web/data/library/manifest.json` describes the products (units, DOI, caveats, period, scale) and the encoding. `js/library.js` reads the manifest, fetches only the tiles that touch the chosen box, and builds the monthly series in the browser. Twelve more variables come live from the NASA POWER monthly API through `js/live.js` (boxes tiled in 10 degree pieces, at most four requests at a time; limits in `data/POWER_LIVE_NOTES.md`).

**To add a measurement:**

1. Add an entry to `PRODUCTS` in `data/library/scripts/products.py` (name, units, scale, offset, plain definition, caveats, source variable, CMR concept id, and optional `limits` or `quality_end`).
2. Write `data/library/scripts/build_<name>.py`, modelled on `build_snow.py`, using `libcommon.py`. It must stage a one degree cube (`<id>_cube.npy`, rows 89.5 N to south) and `<id>_prov.json` in the scratch folder set at the top of `libcommon.py`.
3. Run `build_<name>.py`, then `finalize.py <id>` (writes tiles, `global_series.json`, `qc.json`, `provenance.json` and the manifest entry), then `verify.py <id>` (decodes the tiles as a browser would and compares them with the cube). `make_readme.py` can write a plain-language summary.
4. Give it a short picker name in the `PICK` table of `web/js/library.js` and, if useful, a one-line `LIMITS` entry.

## Registering and running a new claim

1. **Register first.** Append an addendum to `event_record/WP0_CLAIM_REGISTRATION.md`: claim, product, box, season, period, direction. Commit it, and append the new SHA-256 line to `WP0_CLAIM_REGISTRATION.sha256`. Do this before any download.
2. **Get the data.** Write `data/<id>/claim.json` and `monthly.npz` as the input contract in `stats/SCHEMA.md` describes (examples: `data/scripts/fetch_earthdata.py`, `data/library/scripts/make_no2_cases.py`), with QC and provenance files.
3. **Pre-run entry.** Append to `event_record/STATS_LOG.md`, and commit, the aggregation and validity rules, the cell family, the validation scenarios matched to the series length, and the verdict mapping, before any trend or p-value is computed. The NO2 pair's entry ("C-E1 / C-E2 PRE-RUN ENTRY") is the model. If the length is not 21, 23, 25 or 45 years, extra simulations are needed (`stats/scripts/validate_no2.py` shows how).
4. **Run.** `stats/.venv/bin/python stats/scripts/run_case.py <id>` runs `run_claim`, writes `stats/out/<id>/bundle.json`, copies it to `web/data/bundle_<id>.json` and adds it to `web/data/index.json`. For a different validation file follow `run_no2.py`.
5. **Show it.** Add the case to the label tables in `web/tools/make_viz_data.py` and `web/js/views/hook.js`, `web/js/viz/globe-trials.js` and `web/js/viz/lab.js`, then run `web/tools/make_viz_data.py`. Add its run id to `REPRODUCE.md`.

## Tests and checks

| Check | Command |
|---|---|
| Statistics tests (107, about 5 seconds) | `cd stats && .venv/bin/python -m pytest -q -p no:cacheprovider` |
| JavaScript parity | included above; skipped without `node` |
| JavaScript syntax | `sh web/tools/check_js.sh` |
| Text contrast, both themes (104 color pairs) | `(cd web && python tools/check_contrast.py)` |
| Accessibility (axe-core) | run axe-core on each route in both themes; a local copy sits in `web/tools/vendor/` and is not exported |
| Export dry run | `python export/export_public.py --dry-run` (lists and scans, writes nothing) |
| Full export and clean-copy tests | `sh export/build_export.sh` |
| Static smoke test of a public copy | `python export/smoke_web.py <public_copy_dir>` |

Anything a file needs to appear in the public copy must be matched by `include` in `export/manifest.json`.

## The video pipeline

`submission/video/pipeline/` builds the 30-second video from the running site. `run_all.sh <version>` starts `web/tools/serve.py` if needed, then runs `capture.mjs` (Playwright records one clip per shot, stepping the page clock frame by frame), `assemble.py` (lays clips on the narration timing in `timing.json`, burns captions, draws the end card, exports MP4, SRT and a contact sheet, with the AI-voice disclosure in the metadata) and `check.py` (duration, size, audio, disclosure). It needs Node with Playwright, `ffmpeg`, Pillow and the narration files, which are not in git. Its own `README.md` lists the shots.
