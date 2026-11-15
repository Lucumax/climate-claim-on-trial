// Node check for completeSeasons (web/js/library.js): wholly absent years are listed with the partly missing ones.
// Run: node web/tools/test_complete_seasons.mjs
import assert from "node:assert/strict";
import { completeSeasons } from "../js/library.js";

const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const rows = [];
for (let y = 2001; y <= 2010; y++) for (const m of months) if (!(y === 2004 && m === 3) && y !== 2007) rows.push({ year: y, month: m, value: 1 });
const r = completeSeasons(rows, months, 2001, 2010);
assert.deepEqual(r.skipped, [2004, 2007], "partly missing 2004 and wholly absent 2007 are both listed");
assert.equal(r.rows.length, 8 * 12);
// Winter (Dec-Feb) wraps: label is the year of Jan-Feb.
const w = [12, 1, 2], wr = [{ year: 2000, month: 12 }, { year: 2001, month: 1 }, { year: 2001, month: 2 }];
assert.deepEqual(completeSeasons(wr, w, 2001, 2003).skipped, [2002, 2003]);
console.log("completeSeasons ok");
