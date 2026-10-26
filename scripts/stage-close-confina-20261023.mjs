import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const write = (file, name, data) => fs.writeFileSync(file, `window.${name} = ${JSON.stringify(data, null, 2)};\n`);
const round = (value) => Math.round(value * 100) / 100;
const previous = read("data/portfolio/portfolio-confina.js");
const current = read("tmp/portfolio-confina-2026-10-23-candidate.js");
const frozen = read("data/portfolio/portfolio-confina-frozen-2026-10-02.js");
const context = vm.createContext({ console, Date, Intl, URLSearchParams,
  window: { location: { search: "" }, ceresFinanceEngineOnly: true }, document: { getElementById: () => null, querySelectorAll: () => [] } });
const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)/g)].map((match) => match[1]).filter((file) => !/^data\/(biological|pecuaria)\//.test(file));
for (const file of files) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
const evaluate = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
for (const operation of frozen.operations) operation.freezeThroughDate ||= frozen.freezeThroughDate || frozen.snapshotDate || operation.positionDate;
for (const operation of previous.operations) {
  assert.equal(operation.positionDate, "2026-10-21");
  assert.ok(!frozen.operations.some((row) => row.operationId === operation.operationId && row.freezeThroughDate === "2026-10-21"));
  frozen.operations.push({ ...structuredClone(operation), freezeThroughDate: "2026-10-21", preservedFromPositionDate: "2026-10-21" });
}
const source = current.operations.find((row) => row.operationId === "confina-cprf-100");
const retroactiveTitles = ["549872", "555729", "555852"].map((id) => source.titles.find((title) => title.id === id));
assert.ok(retroactiveTitles.every(Boolean));
for (const operation of frozen.operations.filter((row) => row.operationId === "confina-cprf-100")) {
  for (const original of retroactiveTitles) {
    if (original.purchaseDate > operation.freezeThroughDate) continue;
    assert.ok(!operation.titles.some((title) => title.id === original.id));
    const title = structuredClone(original);
    title.positionDate = operation.positionDate;
    context.retroTitle = title;
    const atDate = (date) => evaluate(`roundMoney(portfolioTitleValueAtDate(retroTitle,'${date}','${date}'))`);
    title.presentValue = atDate(operation.positionDate);
    title.daysToMaturity = Math.round((new Date(title.maturityDate) - new Date(operation.positionDate)) / 86400000);
    title.isActive = title.purchaseDate <= operation.positionDate && title.presentValue > 0;
    const purchase = source.cashEvents.find((event) => event.titleId === title.id && event.type === "portfolio_purchase");
    assert.ok(purchase);
    operation.titles.push(title);
    operation.cashEvents.push(structuredClone(purchase));
    operation.ignoredTitles = operation.ignoredTitles.filter((row) => row.id !== title.id);
    for (const row of operation.history) {
      if (row.date < title.purchaseDate) continue;
      row.presentValue = round(row.presentValue + atDate(row.date));
      row.faceValue = round(row.faceValue + title.faceValue);
      row.activeTitles += 1;
      if (row.date === title.purchaseDate) row.purchases = round(row.purchases + title.acquisitionValue);
    }
    const oldVp = operation.totals.portfolioVp;
    operation.totals.weightedRateMonthly = (operation.totals.weightedRateMonthly * oldVp + title.presentValue * title.discountRateMonthly) / (oldVp + title.presentValue || 1);
    operation.totals.portfolioVp = round(oldVp + title.presentValue);
    operation.totals.portfolioVn = round(operation.totals.portfolioVn + (title.isActive ? title.faceValue : 0));
    operation.totals.activeTitles += title.isActive ? 1 : 0;
    operation.totals.acquisitionValue = round(operation.totals.acquisitionValue + (title.isActive ? title.acquisitionValue : 0));
    operation.totals.cashPurchases = round(operation.totals.cashPurchases + title.acquisitionValue);
    operation.totals.uniqueTitles = operation.titles.length;
    operation.totals.ignoredTitles = operation.ignoredTitles.length;
  }
  operation.cashEvents.sort((a, b) => a.date.localeCompare(b.date));
}
const revision = { authorizationDate: "2026-10-26", operationId: "confina-cprf-100", type: "include_reactivated_titles",
  titleIds: retroactiveTitles.map((title) => title.id),
  purchases: retroactiveTitles.map((title) => ({ id: title.id, date: title.purchaseDate, acquisitionValue: title.acquisitionValue })),
  note: "Usuario autorizou incluir os tres registros e revisar os impactos retroativos apos aviso dos indicios de duplicidade. Sem retirar os demais titulos validos. Composicoes biologicas anteriores permanecem inalteradas." };
frozen.authorizedRevisions = [...(frozen.authorizedRevisions || []), revision];
frozen.updatedAt = new Date().toISOString();
frozen.freezeThroughDate = "2026-10-21";
frozen.snapshotDate = "2026-10-21";
write("tmp/portfolio-confina-frozen-20261023-candidate.js", "ceresFrozenPortfolioData", frozen);
for (const date of ["2026-10-22", "2026-10-23"]) {
  const portfolio = structuredClone(current);
  for (const operation of portfolio.operations) {
    operation.positionDate = date;
    for (const title of operation.titles) {
      title.positionDate = date;
      context.asOfTitle = title;
      title.isActive = evaluate(`portfolioTitleIsOpenAtDate(asOfTitle,'${date}','${date}')`);
      title.presentValue = evaluate(`roundMoney(portfolioTitleValueAtDate(asOfTitle,'${date}','${date}'))`);
      if (title.isActive) title.paymentStatus = "VINCENDO";
    }
  }
  write(`tmp/portfolio-guarantee-${date}.js`, "ceresPortfolioData", portfolio);
}
console.log(JSON.stringify({ portfolioSnapshots: frozen.operations.length, revision, guaranteePortfolioDates: ["2026-10-22", "2026-10-23"] }, null, 2));
