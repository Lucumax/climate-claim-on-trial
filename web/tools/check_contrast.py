#!/usr/bin/env python3
"""check_contrast.py: fail if any text/background token pair is under WCAG AA (4.5:1) in the light or the dark theme.

    python check_contrast.py                      # reads theme.css and contrast_pairs.json next to this file
    python check_contrast.py --css my.css --pairs my_pairs.json
    python check_contrast.py --selftest

Also fails when the two dark blocks in the CSS (the system-setting media block and the manual [data-theme="dark"]
block) disagree, so the toggle and the system setting can never look different. Chart marks and borders ("graphics"
pairs) need 3:1. Exit 0 = pass, 1 = fail, 2 = bad input. Python standard library only."""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOKEN = re.compile(r"--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;")


def blocks(css):
    """Return token maps for the plain :root block, the dark media block and the dark attribute block."""
    def grab(pattern):
        m = re.search(pattern, css, re.S | re.M)
        return dict(TOKEN.findall(m.group(1))) if m else {}
    light = grab(r"(?m)^:root\s*\{(.*?)^\}")
    media = grab(r"@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme=\"light\"\]\)\s*\{(.*?)\n\s*\}")
    attr = grab(r":root\[data-theme=\"dark\"\]\s*\{(.*?)^\}")
    return {"light": light, "dark_media": media, "dark_attr": attr}


def rgb(hexv):
    h = hexv.lstrip("#")
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(c):
    def lin(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(x) for x in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(rgb(a)), lum(rgb(b))
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def check(css_text, pairs):
    b = blocks(css_text)
    problems, rows = [], []
    if not b["light"]:
        problems.append("no light :root block with hex tokens found")
    if not b["dark_media"]:
        problems.append("no dark block inside @media (prefers-color-scheme: dark)")
    if not b["dark_attr"]:
        problems.append('no :root[data-theme="dark"] block')
    if b["dark_media"] and b["dark_attr"] and b["dark_media"] != b["dark_attr"]:
        keys = set(b["dark_media"]) | set(b["dark_attr"])
        diff = sorted(k for k in keys if b["dark_media"].get(k) != b["dark_attr"].get(k))
        problems.append("the two dark blocks differ on: " + ", ".join(diff))
    themes = {"light": b["light"], "dark": {**b["light"], **b["dark_attr"]}}  # dark inherits tokens it does not set
    for kind, need in (("text", 4.5), ("graphics", 3.0)):
        for fg, bg in pairs.get(kind, []):
            for name, tok in themes.items():
                if fg not in tok or bg not in tok:
                    problems.append("%s: token missing for %s/%s" % (name, fg, bg))
                    continue
                r = ratio(tok[fg], tok[bg])
                ok = r >= need
                rows.append((name, kind, fg, bg, tok[fg], tok[bg], r, need, ok))
                if not ok:
                    problems.append("%s %s: %s on %s is %.2f:1, needs %.1f:1" % (name, kind, fg, bg, r, need))
    return rows, problems


def selftest():
    assert abs(ratio("#000000", "#FFFFFF") - 21.0) < 0.01
    assert abs(ratio("#777777", "#FFFFFF") - 4.48) < 0.02       # a known just-failing grey
    css = (':root {\n --a: #777777; --b: #FFFFFF;\n}\n@media (prefers-color-scheme: dark) {\n'
           '  :root:not([data-theme="light"]) {\n    --a: #FFFFFF; --b: #000000;\n  }\n}\n'
           ':root[data-theme="dark"] {\n  --a: #FFFFFF; --b: #000000;\n}\n')
    _, probs = check(css, {"text": [["a", "b"]]})
    assert any(p.startswith("light text") for p in probs) and not any(p.startswith("dark text") for p in probs), probs
    print("selftest ok")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--css", default=str(HERE.parent / "css" / "tokens.css"))
    ap.add_argument("--pairs", default=str(HERE / "contrast_pairs.json"))
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("-q", "--quiet", action="store_true", help="print failures only")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    try:
        css = Path(a.css).read_text(encoding="utf-8")
        pairs = json.loads(Path(a.pairs).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        print("cannot read input:", e)
        return 2
    rows, problems = check(css, pairs)
    if not a.quiet:
        for name, kind, fg, bg, fh, bh, r, need, ok in rows:
            print("%-5s %-8s %-10s on %-9s %s/%s  %5.2f  (need %.1f)  %s" % (name, kind, fg, bg, fh, bh, r, need, "ok" if ok else "FAIL"))
    for p in problems:
        print("FAIL:", p)
    print("CONTRAST CHECK:", "FAIL (%d)" % len(problems) if problems else "PASS (%d pair checks)" % len(rows))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
