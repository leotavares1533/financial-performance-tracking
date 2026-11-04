import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const date = "2026-11-04";
const cutoff = "2026-11-03";
const ids = new Set(["566696", "566697", "566707"]);
const destination = "confina-cra-65-200";
const origin = "confina-cprf-50";
const sourceFile = "data/portfolio/portfolio-confina.js";
const indexFile = "index.html";
const cacheKey = "20261104-transferencia-cra65";
const parse = (content) => JSON.parse(content.replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const read = (file) => parse(fs.readFileSync(file, "utf8"));
const cents = (n) => Math.round(n * 100);
const asMoney = (n) => cents(n) / 100;
const findOperation = (data, id) => data.operations.find((op) => op.operationId === id);
const [importFile = "tmp/portfolio-denipoti-20261104-import.js"] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const original = fs.readFileSync(sourceFile, "utf8");
const before = parse(original);
const imported = read(importFile);
assert.equal(findOperation(before, destination).positionDate, cutoff);
const buyer = findOperation(imported, destination);
const titles = buyer.titles.filter((t) => ids.has(t.id));
const cash = buyer.cashEvents.filter((e) => ids.has(e.titleId));
assert.equal(titles.length, ids.size);
assert.equal(cash.length, ids.size);
assert.equal(cash.reduce((n, e) => n + cents(e.amount), 0), 424859158);
for (const title of titles) {
  assert.ok(title.isActive && title.purchaseDate === date && title.presentValue === title.acquisitionValue);
  assert.equal(title.discountRateMonthly, 0.017);
  assert.equal(cash.find((e) => e.titleId === title.id).amount, title.acquisitionValue);
}
assert.ok(cash.every((e) => e.date === date && e.type === "portfolio_purchase"));
assert.ok(!findOperation(imported, origin).titles.some((t) => ids.has(t.id)));
assert.ok(!findOperation(imported, origin).cashEvents.some((e) => ids.has(e.titleId)));

const next = structuredClone(before);
const managedBuyer = findOperation(next, destination);
assert.ok(!managedBuyer.titles.some((t) => ids.has(t.id)));
assert.ok(!managedBuyer.cashEvents.some((e) => ids.has(e.titleId)));
managedBuyer.titles.push(...titles);
managedBuyer.cashEvents.push(...cash);

const index = fs.readFileSync(indexFile, "utf8");
const paths = [...index.matchAll(/<script src="\.\/([^"?]+)(?:\?[^"]*)?"/g)]
  .map((m) => m[1]).filter((file) => !/^data\/(biological|pecuaria)\//.test(file));
function engine(data) {
  const window = { location: { search: "" }, ceresFinanceEngineOnly: true, ceresParallelControlEngineOnly: true };
  const ctx = vm.createContext({ window, console, Date, Intl, URLSearchParams,
    document: { getElementById: () => null, querySelectorAll: () => [] } });
  for (const file of paths) {
    if (file === sourceFile) window.ceresPortfolioData = structuredClone(data);
    else vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  }
  return (expression) => JSON.parse(JSON.stringify(vm.runInContext(expression, ctx)));
}
const oldEngine = engine(before);
const newEngine = engine(next);
const position = (read, id, day) => read(`(() => {
  const op = operations.find(op => op.id === '${id}');
  const p = operationPortfolioPositionAtDate(op, '${day}');
  const c = operationCashPositionAtDate(op, '${day}');
  return { titleCount: p.titleCount, vp: roundMoney(p.portfolioVp), vn: roundMoney(p.portfolioVn),
    purchase: c.portfolioPurchase, receipt: c.portfolioLiquidation, cash: c.currentBalance,
    interest: c.investmentIncome, funding: fundingBalanceAtDate(op, '${day}') };
})()`);
for (const day of ["2026-09-30", "2026-10-30", cutoff]) {
  for (const id of [origin, destination]) assert.deepEqual(position(newEngine, id, day), position(oldEngine, id, day));
}
assert.deepEqual(position(newEngine, origin, date), position(oldEngine, origin, date));
const prev = position(oldEngine, destination, date);
const updated = position(newEngine, destination, date);
assert.equal(updated.titleCount - prev.titleCount, ids.size);
assert.equal(asMoney(updated.vp - prev.vp), 4248591.58);
assert.equal(asMoney(updated.vn - prev.vn), 5201114.56);
assert.equal(asMoney(updated.purchase - prev.purchase), 4248591.58);
assert.equal(updated.receipt, prev.receipt);
assert.equal(updated.funding, prev.funding);
assert.ok(Math.abs(updated.cash - prev.cash + 4248591.58 - (updated.interest - prev.interest)) <= 0.02);
const newIndex = index.replace(/(data\/portfolio\/portfolio-confina\.js)\?[^"]+"/, `$1?v=${cacheKey}"`);
assert.notEqual(newIndex, index);
// Keep the imported snapshot's original numeric spelling and formatting outside the two new blocks.
const newline = original.includes("\r\n") ? "\r\n" : "\n";
const start = original.indexOf(`${newline}      "operationId": "${destination}",`);
assert.ok(start >= 0);
function appendRows(text, field, rows) {
  const open = text.indexOf(`${newline}      "${field}": [`, start);
  assert.ok(open >= start);
  const end = text.indexOf(`${newline}      ]`, open);
  assert.ok(end > open);
  const formatted = rows.map((row) => JSON.stringify(row, null, 2).split("\n")
    .map((line) => `        ${line}`).join(newline)).join(`,${newline}`);
  return `${text.slice(0, end)},${newline}${formatted}${text.slice(end)}`;
}
const nextPortfolio = appendRows(appendRows(original, "titles", titles), "cashEvents", cash);
assert.deepEqual(parse(nextPortfolio), next);
if (process.argv.includes("--apply")) {
  fs.writeFileSync(sourceFile, nextPortfolio);
  fs.writeFileSync(indexFile, newIndex);
}
console.log(JSON.stringify({ applied: process.argv.includes("--apply"), date, lastCompletePosition: cutoff,
  vpAdded: asMoney(updated.vp - prev.vp), purchaseAdded: asMoney(updated.purchase - prev.purchase),
  estimatedCash: updated.cash }));
