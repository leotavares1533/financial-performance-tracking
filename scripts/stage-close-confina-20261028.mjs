import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const write = (file, variable, value) => fs.writeFileSync(file, `window.${variable} = ${JSON.stringify(value, null, 2)};\n`);
const round = (value) => Math.round(value * 100) / 100;
const previous = read("data/portfolio/portfolio-confina.js");
const current = read("tmp/portfolio-confina-2026-10-28-candidate.js");
const frozen = read("data/portfolio/portfolio-confina-frozen-2026-10-02.js");
const context = vm.createContext({ console, Date, Intl, URLSearchParams,
  window: { location: { search: "" }, ceresFinanceEngineOnly: true },
  document: { getElementById: () => null, querySelectorAll: () => [] } });
for (const match of fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)/g)) {
  if (/^data\/(biological|pecuaria)\//.test(match[1])) continue;
  vm.runInContext(fs.readFileSync(match[1], "utf8"), context, { filename: match[1] });
}
const evaluate = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
for (const operation of frozen.operations) operation.freezeThroughDate ||= frozen.freezeThroughDate || frozen.snapshotDate || operation.positionDate;
for (const operation of previous.operations) {
  assert.equal(operation.positionDate, "2026-10-23");
  assert.ok(!frozen.operations.some((row) => row.operationId === operation.operationId && row.freezeThroughDate === "2026-10-23"));
  frozen.operations.push({ ...structuredClone(operation), freezeThroughDate: "2026-10-23", preservedFromPositionDate: "2026-10-23" });
}
const canceledIds = ["555729", "555852"];
const canceled = previous.operations.find((operation) => operation.operationId === "confina-cprf-100").titles.filter((title) => canceledIds.includes(title.id));
assert.equal(canceled.length, 2);
for (const operation of frozen.operations.filter((row) => row.operationId === "confina-cprf-100")) {
  for (const original of canceled) {
    const title = operation.titles.find((row) => row.id === original.id);
    if (!title) continue;
    assert.ok(operation.freezeThroughDate >= "2026-10-19");
    context.canceledTitle = title;
    const atDate = (date) => evaluate(`roundMoney(portfolioTitleValueAtDate(canceledTitle,'${date}','9999-12-31'))`);
    const removalVp = atDate(operation.positionDate);
    operation.titles = operation.titles.filter((row) => row.id !== title.id);
    const purchases = operation.cashEvents.filter((event) => event.titleId === title.id && event.type === "portfolio_purchase");
    assert.equal(purchases.length, 1);
    assert.equal(purchases[0].date, "2026-10-19");
    assert.equal(purchases[0].amount, title.acquisitionValue);
    assert.ok(!operation.cashEvents.some((event) => event.titleId === title.id && event.type !== "portfolio_purchase"));
    operation.cashEvents = operation.cashEvents.filter((event) => event.titleId !== title.id);
    for (const day of operation.history) {
      if (day.date < title.purchaseDate) continue;
      day.presentValue = round(day.presentValue - atDate(day.date));
      day.faceValue = round(day.faceValue - title.faceValue);
      day.activeTitles -= 1;
      if (day.date === title.purchaseDate) day.purchases = round(day.purchases - title.acquisitionValue);
    }
    const oldVp = operation.totals.portfolioVp;
    operation.totals.weightedRateMonthly = (operation.totals.weightedRateMonthly * oldVp - removalVp * title.discountRateMonthly) / (oldVp - removalVp || 1);
    operation.totals.portfolioVp = round(oldVp - removalVp);
    operation.totals.portfolioVn = round(operation.totals.portfolioVn - title.faceValue);
    operation.totals.activeTitles -= 1;
    operation.totals.acquisitionValue = round(operation.totals.acquisitionValue - title.acquisitionValue);
    operation.totals.cashPurchases = round(operation.totals.cashPurchases - title.acquisitionValue);
    operation.totals.uniqueTitles = operation.titles.length;
  }
}
frozen.authorizedRevisions = [...(frozen.authorizedRevisions || []), {
  authorizationDate: "2026-10-29", effectiveDate: "2026-10-19", operationId: "confina-cprf-100",
  type: "remove_canceled_titles_and_managerial_purchases", titleIds: canceledIds,
  reversedPurchases: canceled.map((title) => ({ id: title.id, date: title.purchaseDate, acquisitionValue: title.acquisitionValue })),
  note: "Usuario confirmou os dois cancelamentos e autorizou corrigir desde 19/10, inclusive as compras gerenciais. Nenhuma entrada efetiva de caixa foi criada. Outras operacoes e composicoes biologicas permanecem intactas."
}];
frozen.updatedAt = new Date().toISOString();
frozen.freezeThroughDate = "2026-10-23";
frozen.snapshotDate = "2026-10-23";
write("tmp/portfolio-confina-frozen-20261028-candidate.js", "ceresFrozenPortfolioData", frozen);
for (const date of ["2026-10-26", "2026-10-27", "2026-10-28"]) {
  const portfolio = structuredClone(current);
  for (const operation of portfolio.operations) {
    operation.positionDate = date;
    operation.history = operation.history.filter((row) => row.date <= date);
    operation.cashEvents = operation.cashEvents.filter((row) => row.date <= date);
    for (const title of operation.titles) {
      context.asOfTitle = title;
      title.isActive = evaluate(`portfolioTitleIsOpenAtDate(asOfTitle,'${date}','9999-12-31')`);
      title.presentValue = evaluate(`roundMoney(portfolioTitleValueAtDate(asOfTitle,'${date}','9999-12-31'))`);
      title.positionDate = date;
      title.daysToMaturity = title.maturityDate ? Math.round((new Date(title.maturityDate) - new Date(date)) / 86400000) : 0;
      if (title.isActive) title.paymentStatus = "VINCENDO";
    }
  }
  write(`tmp/portfolio-guarantee-${date}.js`, "ceresPortfolioData", portfolio);
}
console.log(JSON.stringify({ snapshots: frozen.operations.length, preserveThrough: frozen.freezeThroughDate,
  authorizedCancellation: canceledIds, reversedAcquisition: round(canceled.reduce((sum, row) => sum + row.acquisitionValue, 0)),
  asOfPortfolios: ["2026-10-26", "2026-10-27", "2026-10-28"] }));
