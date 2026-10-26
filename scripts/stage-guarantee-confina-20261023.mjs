import fs from "node:fs";
import assert from "node:assert/strict";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const history = read("data/biological/biological-assets-history-confina.js");
const previous = read("data/biological/biological-assets-confina.js");
const byDate = new Map(history.snapshots.map((snapshot) => [snapshot.referenceDate, snapshot]));
if (byDate.has(previous.referenceDate)) assert.deepEqual(byDate.get(previous.referenceDate), previous);
else byDate.set(previous.referenceDate, previous);
const carried = read("tmp/biological-assets-confina-20261022-candidate.js");
carried.compositionReferenceDate = "2026-10-21";
carried.allocationReferenceDate = "2026-10-22";
carried.compositionPolicy = "last_known_animals_reallocated_by_titles_owned_on_22_with_quote_22";
for (const asset of carried.vehicles) {
  asset.compositionReferenceDate = carried.compositionReferenceDate;
  asset.allocationReferenceDate = carried.allocationReferenceDate;
}
carried.assetsByOperationId = Object.fromEntries(carried.vehicles.map((asset) => [asset.operationId, asset]));
fs.writeFileSync("tmp/biological-assets-confina-20261022-candidate.js", `window.ceresBiologicalAssets = ${JSON.stringify(carried, null, 2)};\n`);
assert.ok(!byDate.has(carried.referenceDate));
byDate.set(carried.referenceDate, carried);
const current = read("tmp/biological-assets-confina-20261023-candidate.js");
assert.equal(current.referenceDate, "2026-10-23");
assert.equal(current.quoteDate, "2026-10-23");
current.sourceExtractionDate = "2026-10-26";
current.dateRule = "D-1_business_day";
fs.writeFileSync("tmp/biological-assets-confina-20261023-candidate.js", `window.ceresBiologicalAssets = ${JSON.stringify(current, null, 2)};\n`);
history.updatedAt = new Date().toISOString();
history.snapshots = [...byDate.values()].sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
history.referenceDates = history.snapshots.map((snapshot) => snapshot.referenceDate);
history.currentReferenceDate = current.referenceDate;
// The full current snapshot is loaded separately and archived before the next update.
fs.writeFileSync("tmp/biological-assets-history-confina-20261023-candidate.js", `window.ceresBiologicalAssetsHistory = ${JSON.stringify(history)};\n`);
console.log(JSON.stringify({ archived: history.referenceDates, current: current.referenceDate,
  historicalBytes: fs.statSync("tmp/biological-assets-history-confina-20261023-candidate.js").size,
  weightAdjustments22: carried.summary.weightSources, weightAdjustments23: current.summary.weightSources }, null, 2));
