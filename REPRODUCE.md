# Reproduce Climate Claim on Trial

Three levels, from quick to slow. Level 1 needs no NASA account and takes about a minute. It rebuilds the four case files from the data subsets in `data/` and checks them against the shipped results.

| Level | What it proves | Needs | Time |
|---|---|---|---|
| 1. Rebuild and test | The statistics turn the included data into exactly the shipped case files | Python 3.12, `uv`, Node 24 (for one test) | about 1 minute |
| 2. Download again from NASA | The included data subsets come from the named NASA products with the stated processing | Free Earthdata account and your own token | about 25 minutes |
| 3. Rerun the simulations | The simulated checks behind every verdict and withheld verdict | Several CPU cores | hours |

Commands use POSIX paths. On Windows, replace `.venv/bin/python` with `.venv\Scripts\python.exe`. Run everything from the repository root unless a `cd` says otherwise.

## 0. Set up

```
uv venv --python 3.12 stats/.venv
uv pip install --python stats/.venv/bin/python -r stats/requirements.txt

uv venv --python 3.12 data/.venv
uv pip install --python data/.venv/bin/python -r data/requirements.txt
```

The two environments are separate on purpose. The statistics environment has SciPy and no NASA download libraries. The data environment has the download libraries (`earthaccess`, `netCDF4`, `pyhdf`) and no SciPy. Level 1 needs only the statistics environment. Versions are pinned in the requirements files (tested with CPython 3.12.8, uv 0.5.9, Node 24).

## 1. Rebuild and test (no NASA login)

Run the automated tests (90 tests, about 4 seconds):

```
cd stats
.venv/bin/python -m pytest -q -p no:cacheprovider
```

Expected: `90 passed`. These include comparisons with `pymannkendall` and SciPy, and a check that the browser statistics (`stats/js/trendtrial.js`) give the same numbers as the Python statistics (that one needs `node` on your path and is skipped without it).

Rebuild the four case bundles into a scratch folder (still in `stats/`; each takes 1 to 2 seconds):

```
for c in C-A C-B C-C C-D; do
  .venv/bin/python -m trendtrial.pipeline ../data/$c --out ../scratch/$c \
      --validation out/validation/validation_results.json
done
```

(Do not add `-I` to this command; it would hide the `trendtrial` package from Python.) Read the run identifier from each result and compare it with the table:

```
.venv/bin/python -c "import json;b=json.load(open('../scratch/C-C/bundle.json'));print(b['run']['run_id'], b['verdict']['id'])"
```

| Case file | Run id | Verdict id | `claim.json` SHA-256 | `monthly.npz` SHA-256 |
|---|---|---|---|---|
| C-A (Southeastern US land surface temperature) | `run-e8371c27d38f` | withheld | `c0ada91ac00168d0c1b24eb9fee5aa3a77773ce2e6bd7d5ffeead85d492e4df3` | `6b0c273d999b46c404dda083429a902335b2142c81f8bddadb400771855c250e` |
| C-B (Sahel rainfall) | `run-ecf5f569af51` | partly_supported | `fa961a2438673b9850c26fed4935da8343f44256b68d5b3076cfdc1e43fbdbb9` | `ccd0548cfd33a7ab869249be889359b70152466e78df27c4c8a39b6a071c2adb` |
| C-C (Alaska air temperature) | `run-bdb2a144421d` | supported | `4e1c6eeb03ad28320d6aa54cdf71059d2134e70233a6627b8629bc00d054b67d` | `56767e7cfee30bdbead1f858131ac52098f49e51d5cad4d98f95bdaa54f100c8` |
| C-D (Wisconsin aerosol) | `run-b80e1e70ad85` | withheld | `18ed8fa2132c257c05c461dbfcbb3f5a6f3d727c101bb134a90c1b49211b9468` | `3ee4d5b50113dfa391f1af439c12446d8c14a7ed8594dc67db3634a9e93d9b92` |

The run id is a hash of the code version, the two input hashes, the parameters and the validation file, so the same id means the same inputs and the same code. The input hashes are also stored in each bundle under `run.input_sha256`. Apart from `run.generated_at` and `run.elapsed_seconds`, a rebuilt `bundle.json` is identical to the shipped `web/data/bundle_<id>.json` (we checked all four). Compare the JSON, not the file hash, because the timestamp changes the file hash.

Headline numbers you should see in the bundles:

| Case | Sen slope per decade | Interval (95%) | Shipped test and p | Flagged area after false-discovery control |
|---|---|---|---|---|
| C-C | +0.4428 degC | 0.1905 to 0.6283 | Mann-Kendall, Yue-Wang correction, p = 0.00147 | 85.2% |
| C-B | +0.2068 mm/day | 0.0233 to 0.4893 | Mann-Kendall, independent years, p = 0.0299 | 15.1% in the claimed direction |
| C-A | -0.3503 degC | not shown | none (verdict withheld); raw Mann-Kendall p = 0.272 | 0.0% |
| C-D | +0.0296 (unitless) | not shown | none (verdict withheld); raw Mann-Kendall p = 0.224 | 0.0% |

To publish a rebuilt bundle to the site folder instead of a scratch folder, use `stats/scripts/run_case.py` (it writes `web/data/bundle_<id>.json` and updates `web/data/index.json`):

```
stats/.venv/bin/python stats/scripts/run_case.py C-C
```

Other generated files in the site folder, from the same data (both are deterministic):

```
stats/.venv/bin/python -I web/tools/make_viz_data.py                # web/data/viz/*.json, descriptive anomalies for the lab page
python web/tools/make_false_alarm_validation.py                     # web/data/false_alarm_validation.json, from stats/out/validation/validation_B.json
sh web/tools/sync_stats.sh                                          # copies stats/js/trendtrial.js to web/js/vendor/
```

## 2. Download again from NASA (optional)

### 2.1 Get a token (Earthdata products: C-A, C-B, C-D)

1. Create a free account at https://urs.earthdata.nasa.gov.
2. For C-D, approve the LAADS Web application under Applications, Authorized Apps (MYD08_M3 is served by LAADS DAAC).
3. Generate a user token on your Earthdata profile page.
4. Put it in your own environment. It is never stored in this repository and no script prints it.

```
export EARTHDATA_TOKEN="<paste your token>"          # macOS or Linux
$env:EARTHDATA_TOKEN = "<paste your token>"          # Windows PowerShell, this window only
powershell -File data/scripts/set_earthdata_token.ps1   # Windows, saves it to your user environment (hidden prompt)
```

If the token is missing the scripts stop with `TOKEN_MISSING`; if NASA refuses it they stop with `AUTH_FAIL` (exit code 3).

### 2.2 Alaska (no login, NASA POWER)

```
data/.venv/bin/python -I data/scripts/fetch_power_cc.py     # three 10-degree tiles, 1981 to 2025, writes parquet, csv.gz, qc, provenance
data/.venv/bin/python -I data/scripts/make_contract_cc.py   # writes data/C-C/claim.json and monthly.npz
```

Expected: 861 cells (21 x 41), 503,685 rows after removing shared tile edges, no fill values, and `(540, 21, 41) 0 NaN` printed by the second command (45 years x 12 months; POWER's own annual code 13 is dropped and the annual mean is computed by our code).

### 2.3 Southeastern US, Sahel, Wisconsin (Earthdata login)

The exact granule lists are included (`data/C-*/C-*_cmr_granules.json`). To regenerate them from NASA's metadata search, which needs no login:

```
data/.venv/bin/python -I data/scripts/cmr_prepare.py        # C-B and C-A lists
data/.venv/bin/python -I data/scripts/cmr_prepare.py D      # C-D list
```

Fetch each claim. Do a two-granule test first; it also checks the fast server-side route against a whole-granule download of granule 1 (for C-D that download is about 351 MB and is deleted straight after):

```
data/.venv/bin/python -I data/scripts/fetch_earthdata.py C-B --test 2
data/.venv/bin/python -I data/scripts/fetch_earthdata.py C-B
data/.venv/bin/python -I data/scripts/fetch_earthdata.py C-A
data/.venv/bin/python -I data/scripts/fetch_earthdata.py C-D
```

What a correct run looks like (from our logged runs on Nov 14, 2026):

| Claim | Granules | Product | Grid written to `monthly.npz` | Notes | Time |
|---|---|---|---|---|---|
| C-B | 100 (Jun to Sep, 2001 to 2025) | GPM_3IMERGM V07 | 80 x 420 cells, 0.1 degree | all cells valid; mm/hr times 24 = mm/day | about 4.5 min |
| C-A | 75 (Jun to Aug, 2001 to 2025) | MOD11C3 V061 | 28 x 58 cells, 0.25 degree (5 x 5 block mean, block valid if at least 50% of cells valid) | 1,264 land cells in the support mask; 99.98% valid inside it; scale 0.02, kelvin minus 273.15 = degC | about 5 min |
| C-D | 69 (Jun to Aug, 2003 to 2025) | MYD08_M3 V6.1 | 6 x 7 cells, 1 degree | all valid; scale 0.001 | about 8 min (parallel) |

Each run writes `claim.json`, `monthly.npz`, `<claim>_qc.json` and `<claim>_provenance.json` into `data/<claim>/`. The provenance file lists the access route, the retrieval time, the granule list and a SHA-256 per output file. The raw NASA files are never kept.

Then rebuild the case file as in level 1. If NASA has reprocessed a product since Nov 14, 2026, the arrays can change slightly and so can the hashes; compare values with `numpy.allclose` against the included `monthly.npz` and expect the same verdicts unless the change is large. The hashes in the table above refer to the files we used.

### 2.4 The Terra overpass witness panel (exploratory)

```
data/.venv/bin/python -I data/scripts/make_ca_witness.py fetch  <scratch_dir>   # 75 view-time requests plus NASA POWER surface and air temperature
stats/.venv/bin/python -I data/scripts/make_ca_witness.py build <scratch_dir>   # writes C-A_view_time.npz, its provenance, and web/data/witness/C-A.json
```

The scratch folder must be outside the repository. Expected: Sen slope per decade of -0.350 (land surface temperature), +0.262 (POWER surface temperature), +0.316 (POWER 2 m air temperature); mean view time 16.57 hours UTC in 2001 to 2019 and 15.39 in 2025; an east to west check of -0.0657 hours per degree of longitude (UTC would give -0.0667). `C-A_view_time.npz` had SHA-256 `cbec880632238873b6005ce5dd015d913ba81d5cd36c3cb193087633e76f8489`. The witness JSON carries a build timestamp, so compare its numbers, not its hash. The panel never changes `claim.json` or `monthly.npz`.

## 3. Rerun the simulations (optional, hours)

The simulated checks decide which tests may speak for each series. Their results are included in `stats/out/validation/`. The file that the verdict code reads is `validation_results.json` (SHA-256 `04abc1e37019c3dc0084722447e52b12b2e921349298b285e77f7ccc4acef1eb`); each bundle records the same hash under `validation.source_sha256`.

```
cd stats
.venv/bin/python -m trendtrial.validation --run A --out out/validation/validation_runA_registered_method.json   # registered method only, seed 11, about 22 min
.venv/bin/python -m trendtrial.validation --run B --out out/validation/validation_B.json                         # seven candidate tests, seed 101, about 14 min
.venv/bin/python -m trendtrial.validation_r2 --part n23      --workers 6  --out out/validation/r2_n23.json
.venv/bin/python -m trendtrial.validation_r2 --part cells    --workers 12 --out out/validation/r2_cells.json    # about 25 min or more
.venv/bin/python -m trendtrial.validation_r2 --part adaptive --workers 12 --out out/validation/r2_adaptive.json
.venv/bin/python -m trendtrial.validation_r2 --part merge --res <round 1 file> --n23 ... --cells ... --adaptive ... --out out/validation/validation_results.json
.venv/bin/python scripts/make_gate_table.py        # rebuilds the gate lookup table in Python and in stats/js/trendtrial.js
```

Seeds are fixed, but the runs used several processes and the final file was assembled by merging parts in the order logged in `event_record/STATS_LOG.md` (round 1 merged run A's interval results into run B; round 2 merged the cell, n = 23 and adaptive parts). If you rerun, expect the same findings; treat the included `validation_results.json` as the reference for the shipped verdicts.

## 4. Other checks

```
(cd web && python tools/check_contrast.py)  # text contrast, light and dark themes (96 colour pairs for the main pages)
sh web/tools/check_js.sh                    # syntax-check every JavaScript module
```

The accessibility check used axe-core 4.10.2 from a local copy; it is not in this repository (see `NOTICE.md`). To repeat it, download axe-core 4.10.2 from npm and run it on each route in a browser.
