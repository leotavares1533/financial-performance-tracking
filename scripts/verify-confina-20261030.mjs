import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const round = (value) => Math.round(value * 100) / 100;
const ledger = read("tmp/processing-confina-20261030-ledger.json");
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), ledger.baseline);
for (const source of ledger.sources) assert.equal(hash(source.file), source.sha256);
const candidates = {
  "data/portfolio/portfolio-confina.js": "tmp/portfolio-confina-20261030-candidate.js",
  "data/portfolio/portfolio-confina-frozen-2026-10-02.js": "tmp/portfolio-confina-frozen-20261030-candidate.js",
  "data/portfolio/manual-portfolio-adjustments-confina.json": "tmp/manual-portfolio-adjustments-20261030-candidate.json",
  "data/fundings/fundings-confina.js": "tmp/fundings-confina-20261030-candidate.js",
  "data/fundings/funding-events-confina.js": "tmp/funding-events-confina-20261030-candidate.js",
  "data/biological/biological-assets-confina.js": "tmp/biological-assets-confina-20261030-candidate.js",
  "data/biological/biological-assets-history-confina.js": "tmp/biological-assets-history-confina-20261030-candidate.js",
  "data/pecuaria/cotacoes-pecuaria-latest.js": "tmp/cotacoes-pecuaria-20261030-candidate.js"
};
const historicalBio = "data/biological/biological-assets-history-confina.js";
const currentBio = "data/biological/biological-assets-confina.js";
const quoteFile = "data/pecuaria/cotacoes-pecuaria-latest.js";
const oldHistory = read(historicalBio);
const priorBio = read(currentBio);
const bio29 = read("tmp/biological-assets-confina-20261029-candidate.js");
const bio30 = read(candidates[currentBio]);
const composition = bio30.compositionPolicy;
assert.equal(priorBio.referenceDate, ledger.cutoff);
assert.equal(bio29.compositionPolicy, composition);
for (const [snapshot, date, quoteDate] of [[bio29, ledger.dates[0], ledger.cutoff], [bio30, ledger.dates[1], ledger.dates[1]]]) {
  assert.equal(snapshot.referenceDate, date);
  assert.equal(snapshot.quoteDate, quoteDate);
  assert.equal(snapshot.compositionEstimated, true);
}
const pending = [ledger.receiptMode === "pending" && "confirmar recebimentos dos seis titulos",
  composition === "pending" && "confirmar inclusao dos animais preexistentes"].filter(Boolean);
if (apply) assert.deepEqual(pending, [], "Nao publicar antes de resolver as pendencias");
const history = { ...oldHistory, updatedAt: new Date().toISOString(), currentReferenceDate: ledger.dates.at(-1),
  snapshots: [...oldHistory.snapshots, priorBio, bio29],
  referenceDates: [...oldHistory.referenceDates, priorBio.referenceDate, bio29.referenceDate] };
assert.equal(new Set(history.referenceDates).size, history.referenceDates.length);
const historyJs = `window.ceresBiologicalAssetsHistory = ${JSON.stringify(history)};\n`;
assert.ok(Buffer.byteLength(historyJs) < 100 * 1024 * 1024, "Historico excede limite por arquivo do GitHub");
fs.writeFileSync(candidates[historicalBio], historyJs);
const oldFrozen = read("data/portfolio/portfolio-confina-frozen-2026-10-02.js");
const newFrozen = read(candidates["data/portfolio/portfolio-confina-frozen-2026-10-02.js"]);
const priorPortfolio = read("data/portfolio/portfolio-confina.js");
assert.deepEqual(newFrozen.operations, [...oldFrozen.operations.map((op) => ({ ...op,
  freezeThroughDate: op.freezeThroughDate || oldFrozen.freezeThroughDate || oldFrozen.snapshotDate || op.positionDate })),
...priorPortfolio.operations.map((op) => ({ ...op, freezeThroughDate: ledger.cutoff, preservedFromPositionDate: ledger.cutoff }))]);
const fundsFile = "data/fundings/fundings-confina.js";
const eventsFile = "data/fundings/funding-events-confina.js";
assert.deepEqual(read(candidates[fundsFile]).operations, read(fundsFile).operations);
assert.deepEqual(read(candidates[eventsFile]).events, [...read(eventsFile).events, ...ledger.fundingPayments]);
assert.equal(round(ledger.fundingPayments.reduce((sum, row) => sum + row.amount, 0)), 698945.17);
assert.equal(ledger.purchaseTotal, 15397357.79);
const oldQuotes = read(quoteFile), newQuotes = read(candidates[quoteFile]);
assert.deepEqual(newQuotes.frozenGuaranteeQuotes, oldQuotes.frozenGuaranteeQuotes);
assert.deepEqual(newQuotes.regionalGuaranteePolicy, oldQuotes.regionalGuaranteePolicy);
const priceKey = (row) => JSON.stringify([row.quote_date, row.product, row.category, row.map_type, row.region, row.subregion, row.row_index, row.column_index]);
const oldPrices = new Map(oldQuotes.historyRows.filter((row) => row.quote_date <= ledger.cutoff).map((row) => [priceKey(row), row.price]));
const newPrices = new Map(newQuotes.historyRows.filter((row) => row.quote_date <= ledger.cutoff).map((row) => [priceKey(row), row.price]));
assert.deepEqual(newPrices, oldPrices);

const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)/g)].map((match) => match[1]);
function load(candidate) {
  const nodes = new Map();
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", value: "", textContent: "", dataset: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
    return nodes.get(id);
  };
  const window = { location: { search: "" }, ceresFinanceEngineOnly: true, ceresParallelControlEngineOnly: true,
    ceresBiologicalAssets: candidate ? bio30 : priorBio,
    ceresBiologicalAssetsHistory: candidate ? history : oldHistory, ceresCattleQuotes: candidate ? newQuotes : oldQuotes };
  const context = vm.createContext({ console, Date, Intl, URLSearchParams, window,
    document: { getElementById: element, querySelectorAll: () => [], activeElement: null } });
  for (const file of files.filter((file) => !/^data\/(biological|pecuaria)\//.test(file))) {
    vm.runInContext(fs.readFileSync(candidate ? candidates[file] || file : file, "utf8"), context, { filename: file });
  }
  return { context, nodes };
}
const before = load(false), after = load(true);
const evaluate = (app, code) => JSON.parse(JSON.stringify(vm.runInContext(code, app.context)));
const position = (app, date) => evaluate(app, `operations.map(op=>{const p=operationPortfolioPositionAtDate(op,'${date}');return {
  id:op.id,vp:roundMoney(p.portfolioVp),vn:roundMoney(p.portfolioVn),count:p.titleCount,
  cash:cashBalanceAtDate(op,'${date}'),funding:fundingBalanceAtDate(op,'${date}'),sub:syntheticAtDate(op,'${date}')};})`);
const checked = evaluate(before, `calendarDatesBetween('2026-04-01','${ledger.cutoff}')`);
for (const date of checked) assert.deepEqual(position(after, date), position(before, date), `Historico financeiro alterado ${date}`);
for (const snapshot of [...oldHistory.snapshots, priorBio]) {
  const date = snapshot.referenceDate;
  const quoteRows = (app) => evaluate(app, `guaranteeRegionalQuoteRows('${date}').map(row=>[row.quote_date,row.category,row.region,row.price]).sort()`);
  assert.deepEqual(quoteRows(after), quoteRows(before), `Preco historico alterado ${date}`);
}

const positions = ledger.dates.map((date) => {
  vm.runInContext(`state.dateKey='${date}';state.view='gerencial';window.ceresFinanceEngineOnly=false;render();`, after.context);
  const operations = evaluate(after, `laminaOperationsForDate().map(op=>({id:op.id,name:op.shortName,cash:op.cash,vp:op.portfolioVp,
    funding:op.fundingBalance,sub:op.syntheticSub,day:roundMoney(op.syntheticSub-op.previousSyntheticSub),
    guarantee:roundMoney(guaranteeSummary(op,'${date}').coverageValue)}))`);
  for (const op of operations) for (const key of ["cash","vp","funding","sub","day","guarantee"]) assert.ok(Number.isFinite(op[key]));
  const actual = evaluate(after, `operationCashPositionAtDate(operations.find(op=>op.id==='confina-cra-65-200'),'${date}')`);
  const fundingPaid = round(ledger.fundingPayments.filter((row) => row.date === date).reduce((sum, row) => sum + row.amount, 0));
  const assetReceived = round(ledger.actualReceipts.filter((row) => row.date === date).reduce((sum, row) => sum + row.amount, 0));
  assert.equal(actual.fundingAmortization, fundingPaid);
  assert.equal(actual.portfolioLiquidation, assetReceived);
  assert.ok(evaluate(after, `operationFundingActivity(operations.find(op=>op.id==='confina-cra-65-200'),'${date}').interestAccrued`) >= 0);
  assert.ok(Math.abs(actual.initialBalance + actual.investorInflow - actual.portfolioPurchase + actual.portfolioLiquidation
    - actual.fundingAmortization + actual.adjustment + actual.investmentIncome - actual.currentBalance) < 0.03);
  assert.ok(!operations.some((op) => ["confina-cras-carteira-50", "confina-cras-carteira-100"].includes(op.id)));
  const quote = evaluate(after, `[...new Set(guaranteeRegionalQuoteRows('${date}').map(row=>row.quote_date))]`);
  assert.deepEqual(quote, [date === ledger.dates[0] ? ledger.cutoff : date]);
  for (const key of ["cash-table","result-table","guarantee-management-table","guarantee-management-print-table"]) {
    assert.ok(after.nodes.get(key)?.innerHTML.length > 0);
    assert.ok(!/NaN|Infinity|undefined/.test(after.nodes.get(key).innerHTML));
  }
  const totals = Object.fromEntries(["cash","vp","funding","sub","day","guarantee"].map((key) => [key, round(operations.reduce((sum, row) => sum + row[key], 0))]));
  return { date, totals, operations, fundingPaid, assetReceived, quote: quote[0],
    guaranteeLabel: evaluate(after, `guaranteeSnapshotLabel('${date}')`) };
});
const report = { status: pending.length ? "pending" : "verified", pending, baseline: ledger.baseline, preservedThrough: ledger.cutoff,
  historicalDaysChecked: checked.length, checkedHistoricalPositions: checked,
  preservedBiologicalDates: oldHistory.referenceDates.concat(priorBio.referenceDate),
  receiptMode: ledger.receiptMode, compositionPolicy: composition, sources: ledger.sources, purchaseTotal: ledger.purchaseTotal,
  payments: ledger.fundingPayments, assetReceipts: ledger.actualReceipts, preservedMaturities: ledger.preservedMaturities,
  guaranteeReconstruction: [bio29, bio30].map((snapshot) => ({ date: snapshot.referenceDate, ...snapshot.reconstruction })),
  positions };
fs.writeFileSync("tmp/verified-positions-20261030.json", `${JSON.stringify(report, null, 2)}\n`);
if (apply) {
  const backup = path.resolve("../outputs/processamento-confina-20261030/antes-da-atualizacao");
  for (const target of Object.keys(candidates)) {
    const saved = path.join(backup, target);
    fs.mkdirSync(path.dirname(saved), { recursive: true });
    assert.ok(!fs.existsSync(saved), `Backup ja existente ${saved}`);
    fs.copyFileSync(target, saved);
  }
  for (const [target, candidate] of Object.entries(candidates)) {
    fs.copyFileSync(candidate, target);
    assert.equal(hash(target), hash(candidate));
  }
  fs.writeFileSync("data/validations/processing-confina-2026-10-30.json",
    `${JSON.stringify({ ...report, sources: report.sources.map(({file, sha256}) => ({file: path.basename(file), sha256})),
      mode: "official", appliedAt: new Date().toISOString() }, null, 2)}\n`);
}
console.log(JSON.stringify({ status: report.status, pending, applied: apply, historicalDaysChecked: checked.length,
  positions: positions.map(({ operations, ...row }) => row),
  historyBytes: Buffer.byteLength(historyJs) }));
