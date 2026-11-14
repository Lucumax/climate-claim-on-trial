"""Decode the shipped tiles exactly as a browser would and compare with the staged cube. Usage: python -I verify.py <id>"""
import sys, json, gzip
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
import libcommon as L

pid = sys.argv[1]
man = json.loads(L.MANIFEST.read_text()); ent = [v for v in man["variables"] if v["id"] == pid][0]
cube = np.load(L.SCRATCH / f"{pid}_cube.npy"); T = cube.shape[0]
rec = np.full(cube.shape, np.nan, np.float64)
for r, c in ent["tiles"]:
    b = gzip.decompress((L.WEB / pid / f"tile_{r}_{c}.bin.gz").read_bytes())
    n = len(b) // 2; hi = np.frombuffer(b[:n], np.uint8).astype(np.int32); lo = np.frombuffer(b[n:], np.uint8).astype(np.int32)
    v = ((hi << 8) | lo).astype(np.uint16).view(np.int16).reshape(T, 30, 30)
    out = v * ent["scale"] + ent["offset"]; out[v == L.SENT] = np.nan
    rec[:, r * 30:(r + 1) * 30, c * 30:(c + 1) * 30] = out
same_mask = np.array_equal(np.isfinite(rec), np.isfinite(cube))
d = np.abs(rec - cube)[np.isfinite(cube)]
print(pid, "mask identical:", same_mask, "max abs diff", float(d.max()), "(scale/2 =", ent["scale"] / 2, ")")
assert same_mask and d.max() <= ent["scale"] / 2 + 1e-6
