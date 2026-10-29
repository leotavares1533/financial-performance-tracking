import fs from "node:fs";
import assert from "node:assert/strict";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const history = read("data/biological/biological-assets-history-confina.js");
const current = read("data/biological/biological-assets-confina.js");
const quotes = read("tmp/cotacoes-pecuaria-20261028-candidate.js");
quotes.regionalGuaranteePolicy = { effectiveDate: "2026-10-26", requireCompleteRegionalBulletin: true,
  fallback: "latest_complete_regional_bulletin_at_or_before_reference_date", preserveThroughDate: "2026-10-23" };
fs.writeFileSync("tmp/cotacoes-pecuaria-20261028-candidate.js", `window.ceresCattleQuotes = ${JSON.stringify(quotes, null, 2)};\n`);
const byDate = new Map(history.snapshots.map((snapshot) => [snapshot.referenceDate, snapshot]));
if (byDate.has(current.referenceDate)) assert.deepEqual(byDate.get(current.referenceDate), current);
else byDate.set(current.referenceDate, current);
for (const date of ["2026-10-26", "2026-10-27"]) {
  const snapshot = read(`tmp/biological-assets-confina-${date.replaceAll("-", "")}-candidate.js`);
  assert.equal(snapshot.referenceDate, date);
  assert.equal(snapshot.compositionReferenceDate, "2026-10-23");
  assert.ok(!byDate.has(date));
  byDate.set(date, snapshot);
}
history.snapshots = [...byDate.values()].sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
history.referenceDates = history.snapshots.map((snapshot) => snapshot.referenceDate);
history.currentReferenceDate = "2026-10-28";
history.updatedAt = new Date().toISOString();
const source = `window.ceresBiologicalAssetsHistory = ${JSON.stringify(history)};\n`;
assert.ok(Buffer.byteLength(source) < 100 * 1024 * 1024, "Historico excede o limite por arquivo; dividir sem alterar composicoes.");
fs.writeFileSync("tmp/biological-assets-history-confina-20261028-candidate.js", source);
console.log(JSON.stringify({ preservedThrough: current.referenceDate, referenceDates: history.referenceDates,
  current: history.currentReferenceDate, bytes: Buffer.byteLength(source) }));
