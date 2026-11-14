#!/bin/sh
# syntax-check every module (as ES modules)
cd "$(dirname "$0")/.." && for f in js/*.js js/views/*.js; do cp "$f" "${TMPDIR:-/tmp}/chk.mjs" && node --check "${TMPDIR:-/tmp}/chk.mjs" 2>&1 | head -4 | sed "s#^#$f: #"; done; echo checked
