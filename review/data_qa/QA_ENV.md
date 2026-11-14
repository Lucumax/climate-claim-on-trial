# Data QA environment and sample granules (kept as notes; the files were deleted)

Deleted Sat Nov 14 2026 at Walter's request to free disk space (about 0.7 GB). Nothing in the repo referenced either folder.

## 1. The QA Python environment ("qa", 451 MB)
A throwaway uv virtual environment the data-QA worker built at 12:11 PM ET to check the satellite library and the Terra/Aqua drift.
- Python 3.12.8 (uv 0.5.9), no system site-packages.
- Key packages: earthaccess 0.19.0 (NASA Earthdata search and download), python_cmr 0.13.0, s3fs and aiobotocore (cloud access), netcdf4 1.7.5.1 and cftime (reading NetCDF and HDF5), numpy 2.5.4, pandas 3.1.1, scipy 1.18.1, matplotlib 3.11.2, pyarrow 26.0.1, aiohttp 3.14.5, pqdm and tenacity (parallel downloads with retries).
- To rebuild it: `uv venv qa --python 3.12` then `uv pip install --python qa earthaccess netcdf4 numpy pandas scipy matplotlib`. The other packages come in as dependencies.

Lessons:
- Use one shared QA environment per project, not one per worker. Each one was about 450 MB, and on a nearly full disk that adds to the risk that crashed the run on Nov 14.
- earthaccess reads the Earthdata token from the user environment, so it is never printed or typed.
- The library build itself does not need this environment: it uses OPeNDAP subsetting with the project's own interpreter (data\library\scripts\libcommon.py).

## 2. Sample granules ("mock", 248 MB)
Six full-size granules downloaded at 10:47 AM ET to check file formats before writing the subsetting scripts:
- IMERG monthly V07B: Jun and Jul 2001 (HDF5, 26 MB each)
- MOD11C3 v061 (Terra LST, 0.05 degree): Jun and Jul 2001 (HDF4, 104 MB each)
- MYD08_M3 v061 (Aqua atmosphere, AOD): Jun and Jul 2003 (HDF4, 0.13 MB each)

Lessons:
- One full MOD11C3 granule is 104 MB, while an OPeNDAP subset of one region is a few kilobytes. Whole-granule downloads are for checking the format only (one file per product), and they are deleted once the subset script works.
- Within each pair the June and July files are exactly the same size, because these products use fixed-size arrays. File size is therefore not a check that a download succeeded: open the file and check that it has valid values.
