import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const write = (file, name, data) => fs.writeFileSync(file, `window.${name} = ${JSON.stringify(data, null, name === "ceresBiologicalAssetsHistory" ? 0 : 2)};\n`);
const oldPortfolio = read("data/portfolio/portfolio-confina.js");
const frozen = read("data/portfolio/portfolio-confina-frozen-2026-10-02.js");
const now = new Date().toISOString();
const preserveThroughDate = "2026-10-19";
const reviseTitle19 = process.argv.includes("--revise-title-19");
const currentPortfolio = read("tmp/portfolio-confina-2026-10-21-candidate.js");
let authorizedRevision = null;
for (const operation of frozen.operations) {
  operation.freezeThroughDate ||= frozen.freezeThroughDate || frozen.snapshotDate || operation.positionDate;
}
for (const operation of oldPortfolio.operations) {
  assert.equal(operation.positionDate, preserveThroughDate);
  assert.ok(!frozen.operations.some((row) => row.operationId === operation.operationId && row.freezeThroughDate === preserveThroughDate));
  const snapshot = structuredClone(operation);
  if (reviseTitle19 && operation.operationId === "confina-cprf-100") {
    const index = snapshot.titles.findIndex((title) => title.id === "555852");
    assert.ok(index >= 0);
    const original = structuredClone(snapshot.titles[index]);
    const title = structuredClone(currentPortfolio.operations.find((row) => row.operationId === operation.operationId).titles.find((row) => row.id === "556254"));
    assert.equal(title.invoice, original.invoice);
    assert.equal(title.acquisitionValue, original.acquisitionValue);
    assert.equal(title.purchaseDate, preserveThroughDate);
    assert.equal(title.maturityDate, original.maturityDate);
    title.positionDate = preserveThroughDate;
    title.presentValue = title.acquisitionValue;
    title.daysToMaturity = Math.round((new Date(title.maturityDate) - new Date(preserveThroughDate)) / 86400000);
    title.accrualPeriodsAtPosition = 0;
    const faceDelta = Math.round((title.faceValue - original.faceValue) * 100) / 100;
    snapshot.titles[index] = title;
    for (const event of snapshot.cashEvents) if (event.titleId === original.id) event.titleId = title.id;
    for (const row of snapshot.history) {
      if (row.date >= preserveThroughDate) row.faceValue = Math.round((row.faceValue + faceDelta) * 100) / 100;
    }
    const vp = snapshot.totals.portfolioVp;
    snapshot.totals.weightedRateMonthly += original.presentValue * (title.discountRateMonthly - original.discountRateMonthly) / vp;
    snapshot.totals.portfolioVn = Math.round((snapshot.totals.portfolioVn + faceDelta) * 100) / 100;
    authorizedRevision = { authorizationDate: "2026-10-22", effectiveDate: preserveThroughDate,
      operationId: operation.operationId, fromLastro: original.id, toLastro: title.id,
      reason: "User authorized revision of the 19/10 title record in response to the pre-processing audit",
      acquisitionValueUnchanged: title.acquisitionValue, deltaFaceValue: faceDelta,
      cashImpact: 0, vpImpact: 0, originalTitle: original, correctedTitle: title };
  }
  frozen.operations.push({ ...snapshot, freezeThroughDate: preserveThroughDate,
    preservedFromPositionDate: preserveThroughDate });
}
frozen.updatedAt = now;
frozen.freezeThroughDate = preserveThroughDate;
frozen.snapshotDate = preserveThroughDate;
frozen.preservationReason = "Preserve accepted positions through 19/10, except explicitly authorized title correction 555852 to 556254 on 19/10";
if (authorizedRevision) frozen.authorizedRevisions = [...(frozen.authorizedRevisions || []), authorizedRevision];
write("tmp/portfolio-confina-frozen-20261021-candidate.js", "ceresFrozenPortfolioData", frozen);

const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)/g)].map((match) => match[1]);
const context = vm.createContext({ console, Date, Intl, URLSearchParams,
  window: { location: { search: "" }, ceresFinanceEngineOnly: true },
  document: { getElementById: () => null, querySelectorAll: () => [] }
});
for (const file of files) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
const evaluate = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
const previousBio = evaluate("biologicalAssetDataForDate('2026-10-19')");
assert.equal(previousBio.referenceDate, preserveThroughDate);
const carried = structuredClone(previousBio);
carried.updatedAt = now;
carried.referenceDate = "2026-10-20";
carried.compositionReferenceDate = previousBio.compositionReferenceDate || previousBio.referenceDate;
carried.compositionPolicy = "last_available_snapshot_no_backfill_from_future_report";
carried.quoteDate = "2026-10-20";
for (const asset of carried.vehicles) {
  asset.referenceDate = carried.referenceDate;
  asset.compositionReferenceDate = carried.compositionReferenceDate;
  asset.quoteDate = carried.quoteDate;
  for (const key of ["lots", "transitLots", "purchasedTransitLots"]) {
    for (const row of asset[key] || []) {
      context.candidateLot = row;
      context.candidateAsset = asset;
      const quote = evaluate("guaranteeQuoteForLot(candidateLot,candidateAsset,'2026-10-20')");
      assert.equal(quote.quoteDate, carried.quoteDate);
      row[5] = quote.quotePerArroba;
    }
  }
  for (const [key, valueKey] of [["lots", "totalValue"], ["transitLots", "transitValue"], ["purchasedTransitLots", "purchasedTransitValue"]]) {
    asset[valueKey] = Math.round((asset[key] || []).reduce((sum, row) => sum + (Number(row[6]?.valueOverride) > 0 ? row[6].valueOverride : row[2] * row[3] / 15 * row[5]), 0) * 100) / 100;
  }
  asset.coverageValue = Math.round((asset.totalValue + asset.transitValue + asset.purchasedTransitValue) * 100) / 100;
}
carried.assetsByOperationId = Object.fromEntries(carried.vehicles.map((asset) => [asset.operationId, asset]));
write("tmp/biological-assets-confina-20261020-candidate.js", "ceresBiologicalAssets", carried);
const currentBio = read("tmp/biological-assets-confina-20261021-candidate.js");
assert.equal(currentBio.referenceDate, "2026-10-21");
assert.equal(currentBio.quoteDate, "2026-10-21");
const history = read("data/biological/biological-assets-history-confina.js");
const byDate = new Map(history.snapshots.map((snapshot) => [snapshot.referenceDate, snapshot]));
// Preserve the full effective current snapshot before changing the latest composition.
byDate.set(previousBio.referenceDate, previousBio);
for (const snapshot of [carried, currentBio]) {
  assert.ok(!byDate.has(snapshot.referenceDate), `Garantia ja fechada: ${snapshot.referenceDate}`);
  byDate.set(snapshot.referenceDate, snapshot);
}
history.updatedAt = now;
history.snapshots = [...byDate.values()].sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
history.referenceDates = history.snapshots.map((snapshot) => snapshot.referenceDate);
write("tmp/biological-assets-history-confina-20261021-candidate.js", "ceresBiologicalAssetsHistory", history);
console.log(JSON.stringify({ preservedThroughDate: preserveThroughDate, portfolioSnapshots: frozen.operations.length,
  authorizedRevision: authorizedRevision ? { ...authorizedRevision, originalTitle: undefined, correctedTitle: undefined } : null,
  guarantee20: { date: carried.referenceDate, composition: carried.compositionReferenceDate, quote: carried.quoteDate },
  guarantee21: { date: currentBio.referenceDate, quote: currentBio.quoteDate, summary: currentBio.summary } }, null, 2));
