# data

NASA inputs for the six registered cases and the satellite library, with the scripts that fetched them. Raw NASA files are never kept.

- `C-A` to `C-E2`: one folder per case with `claim.json` (the registered claim, product, box and period), `monthly.npz` (the subset the statistics read), and QC and provenance files (granule lists, hashes, retrieval times).
- `scripts/`: fetch and contract scripts for the cases. Earthdata products need a free account and your own token; NASA POWER needs no login.
- `library/`: builders (`library/scripts/`) and per-product QC and provenance for the ten measurements Investigate uses. The browser tiles are written to `web/data/library/`.
- `witness_esa/`, `witness_knmi/`: inputs and scripts for the comparison records.
- `POWER_LIVE_NOTES.md`: how the live NASA POWER calls work.

Folder map and data flow: [../ARCHITECTURE.md](../ARCHITECTURE.md). Download and rebuild commands: [../REPRODUCE.md](../REPRODUCE.md).
