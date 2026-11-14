# stats

The statistics behind every ruling. Python is the source of truth for each number on the site.

- `trendtrial/`: the package. `pipeline.py` (`run_claim`) turns a case folder into a bundle; `trend.py`, `aggregate.py`, `bootstrap.py` and `verdict.py` hold the tests, the regional series, the interval and the five outcomes; `validation*.py` run the simulations that decide which tests may speak.
- `scripts/`: `run_case.py` (run one case and publish its bundle), `run_no2.py`, `validate_no2.py`, `exploratory_r3.py`, `make_gate_table.py`.
- `tests/`: 107 tests, run with `python -m pytest -q` from this folder.
- `js/trendtrial.js`: the browser port of the series-level tests.
- `out/`: bundles, validation tables and post-result checks.

Bundle format: [SCHEMA.md](SCHEMA.md). The method in plain words: [../METHODS.md](../METHODS.md). Folder map and how to run a new claim: [../ARCHITECTURE.md](../ARCHITECTURE.md). Rebuild commands: [../REPRODUCE.md](../REPRODUCE.md).
