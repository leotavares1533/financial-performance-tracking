import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const candidates = {
  "assets/app.js": "tmp/app-confina-20261028-candidate.js",
  "data/portfolio/portfolio-confina.js": "tmp/portfolio-confina-2026-10-28-candidate.js",
  "data/portfolio/portfolio-confina-frozen-2026-10-02.js": "tmp/portfolio-confina-frozen-20261028-candidate.js",
  "data/fundings/fundings-confina.js": "tmp/fundings-confina-20261028-candidate.js",
  "data/fundings/funding-events-confina.js": "tmp/funding-events-confina-20261028-candidate.js",
  "data/biological/biological-assets-confina.js": "tmp/biological-assets-confina-20261028-candidate.js",
  "data/biological/biological-assets-history-confina.js": "tmp/biological-assets-history-confina-20261028-candidate.js",
  "data/pecuaria/cotacoes-pecuaria-latest.js": "tmp/cotacoes-pecuaria-20261028-candidate.js",
  "data/portfolio/manual-portfolio-adjustments-confina.json": "tmp/manual-portfolio-adjustments-20261028-candidate.json"
};
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const ledger = read("tmp/processing-confina-20261028-ledger.json");
const round = (value) => Math.round(value * 100) / 100;
const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)/g)].map((match) => match[1]);
function load(candidate) {
  const nodes = new Map();
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", value: "", textContent: "", dataset: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
    return nodes.get(id);
  };
  const window = { location: { search: "" }, ceresFinanceEngineOnly: true };
  window.ceresCattleQuotes = read(candidate ? candidates["data/pecuaria/cotacoes-pecuaria-latest.js"] : "data/pecuaria/cotacoes-pecuaria-latest.js");
  if (candidate) {
    window.ceresBiologicalAssets = read(candidates["data/biological/biological-assets-confina.js"]);
    window.ceresBiologicalAssetsHistory = { snapshots: [26, 27].map((day) => read(`tmp/biological-assets-confina-202610${day}-candidate.js`)) };
    window.ceresCattleQuotes = read(candidates["data/pecuaria/cotacoes-pecuaria-latest.js"]);
  }
  const context = vm.createContext({ console, Date, Intl, URLSearchParams, window,
    document: { getElementById: element, querySelectorAll: () => [], activeElement: null } });
  for (const file of files) {
    if (/^data\/(biological|pecuaria)\//.test(file)) continue;
    vm.runInContext(fs.readFileSync(candidate ? candidates[file] || file : file, "utf8"), context, { filename: file });
  }
  return { context, nodes };
}
const before = load(false), after = load(true);
const evaluate = (app, code) => JSON.parse(JSON.stringify(vm.runInContext(code, app.context)));
const position = (app, date) => evaluate(app, `operations.map(op=>{const p=operationPortfolioPositionAtDate(op,'${date}');return{
  id:op.id,vp:roundMoney(p.portfolioVp),vn:roundMoney(p.portfolioVn),cash:cashBalanceAtDate(op,'${date}'),
  funding:fundingBalanceAtDate(op,'${date}'),sub:syntheticAtDate(op,'${date}'),titles:p.titleCount};})`);
const canceled = evaluate(before, `portfolioData.operations.find(op=>op.operationId==='confina-cprf-100').titles.filter(t=>${JSON.stringify(ledger.canceledIds)}.includes(t.id))`);
assert.equal(canceled.length, 2);
const dates = evaluate(after, "calendarDatesBetween('2026-04-01','2026-10-23')");
const revisions = [];
let cashDelta = 0;
for (const date of dates) {
  const oldRows = position(before, date), newRows = position(after, date);
  for (const old of oldRows) {
    const current = newRows.find((row) => row.id === old.id);
    if (old.id !== "confina-cprf-100" || date < "2026-10-19") {
      assert.deepEqual(current, old, `Historico nao autorizado ${date} ${old.id}`);
      continue;
    }
    let removedVp = 0, removedVn = 0, reversedPurchase = 0;
    for (const title of canceled) {
      after.context.canceledTitle = title;
      removedVp += evaluate(after, `portfolioTitleValueAtDate(canceledTitle,'${date}','9999-12-31')`);
      removedVn += title.faceValue;
      if (date === title.purchaseDate) reversedPurchase += title.acquisitionValue;
    }
    const cash = evaluate(before, `operationCashPositionAtDate(operations.find(op=>op.id==='confina-cprf-100'),'${date}')`);
    const parameters = evaluate(after, `({share:CASH_APPLIED_SHARE,rate:cashDailyApplicationRate('${date}')})`);
    const preIncome = cash.initialBalance + cash.investorInflow - cash.portfolioPurchase + cash.portfolioLiquidation - cash.fundingAmortization + cash.adjustment + cashDelta + reversedPurchase;
    const expectedCash = round(preIncome + Math.max(preIncome, 0) * parameters.share * parameters.rate);
    cashDelta = round(expectedCash - old.cash);
    assert.ok(Math.abs(current.cash - expectedCash) < 0.03, `Caixa retroativo ${date}: ${current.cash} != ${expectedCash}`);
    assert.ok(Math.abs(current.vp - old.vp + removedVp) < 0.03, `VP retroativo ${date}`);
    assert.ok(Math.abs(current.vn - old.vn + removedVn) < 0.03);
    assert.equal(current.titles, old.titles - 2);
    assert.equal(current.funding, old.funding);
    assert.ok(Math.abs(current.sub - old.sub + removedVp - cashDelta) < 0.04);
    revisions.push({ date, vp: round(current.vp - old.vp), nominal: round(current.vn - old.vn),
      cash: cashDelta, sub: round(current.sub - old.sub), reversedPurchase });
  }
}
const oldBio = read("data/biological/biological-assets-history-confina.js");
const oldCurrent = read("data/biological/biological-assets-confina.js");
const newBio = read(candidates["data/biological/biological-assets-history-confina.js"]);
for (const snapshot of [...oldBio.snapshots, oldCurrent]) {
  assert.deepEqual(newBio.snapshots.find((row) => row.referenceDate === snapshot.referenceDate), snapshot, `Composicao alterada ${snapshot.referenceDate}`);
  const normalizedQuotes = (app) => evaluate(app, `guaranteeRegionalQuoteRows('${snapshot.referenceDate}').map(row=>({date:row.quote_date,category:row.category,region:row.region,price:row.price})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))`);
  assert.deepEqual(normalizedQuotes(after), normalizedQuotes(before), `Preco da garantia alterado ${snapshot.referenceDate}`);
}
const oldQuotes = read("data/pecuaria/cotacoes-pecuaria-latest.js"), newQuotes = after.context.window.ceresCattleQuotes;
assert.deepEqual(newQuotes.frozenGuaranteeQuotes, oldQuotes.frozenGuaranteeQuotes);
const quoteKey = (row) => JSON.stringify([row.quote_date, row.product, row.category, row.map_type, row.region, row.subregion, row.row_index, row.column_index]);
const quoteMap = new Map(newQuotes.historyRows.map((row) => [quoteKey(row), row]));
for (const quote of oldQuotes.historyRows) assert.equal(quoteMap.get(quoteKey(quote))?.price, quote.price, `Cotacao anterior alterada ${quoteKey(quote)}`);
const portfolio = read(candidates["data/portfolio/portfolio-confina.js"]);
const buyer = portfolio.operations.find((row) => row.operationId === ledger.fundingId);
assert.equal(buyer.titles.length, 76);
assert.equal(round(buyer.titles.reduce((sum, row) => sum + row.acquisitionValue, 0)), 71985336.10);
assert.equal(buyer.cashEvents.filter((event) => event.type === "portfolio_purchase").length, 1);
assert.equal(buyer.cashEvents.find((event) => event.type === "portfolio_purchase").amount, 72553977.10);
for (const [id, seller] of Object.entries(ledger.sellers)) {
  const operation = portfolio.operations.find((row) => row.operationId === id);
  const ids = ledger.transfers.filter((row) => row.sourceOperationId === id).map((row) => row.originalLastro);
  assert.equal(round(operation.cashEvents.filter((event) => event.date === ledger.date && event.titleId === `venda-42-59-65out-28-${id}`).reduce((sum, row) => sum + row.amount, 0)), seller.cashReceived);
  assert.ok(!operation.cashEvents.some((event) => event.date === ledger.date && event.type === "portfolio_liquidation" && ids.includes(event.titleId)));
  for (const id of ids) assert.equal(operation.titles.find((row) => row.id === id).settledDate, ledger.date);
}
assert.equal(evaluate(after, `fundingBalanceAtDate(operations.find(op=>op.id==='${ledger.fundingId}'),'2026-10-27')`), 0);
assert.equal(evaluate(after, `fundingBalanceAtDate(operations.find(op=>op.id==='${ledger.fundingId}'),'2026-10-28')`), 72553977.10);
assert.equal(evaluate(after, `laminaOperationsForDate('2026-10-27').some(op=>op.id==='${ledger.fundingId}')`), false);
assert.equal(evaluate(after, `laminaOperationsForDate('2026-10-28').some(op=>op.id==='${ledger.fundingId}')`), true);
const positions = [];
for (const date of ["2026-10-26", "2026-10-27", "2026-10-28"]) {
  vm.runInContext(`state.dateKey='${date}';state.view='gerencial';window.ceresFinanceEngineOnly=false;render();`, after.context);
  const cash = evaluate(after, `laminaOperationsForDate().map(op=>{const r=operationCashPositionAtDate(op,'${date}');return{
    id:op.id,initial:r.initialBalance,inflow:r.investorInflow,purchases:r.portfolioPurchase,receipts:r.portfolioLiquidation,
    payments:r.fundingAmortization,adjustment:r.adjustment,income:r.investmentIncome,closing:r.currentBalance};})`);
  for (const row of cash) assert.ok(Math.abs(row.initial + row.inflow - row.purchases + row.receipts - row.payments + row.adjustment + row.income - row.closing) < 0.03, `Caixa nao concilia ${date} ${row.id}`);
  const rows = evaluate(after, `laminaOperationsForDate().map(op=>({id:op.id,name:op.shortName,cash:op.cash,vp:op.portfolioVp,
    funding:op.fundingBalance,sub:op.syntheticSub,day:roundMoney(op.syntheticSub-op.previousSyntheticSub),
    guarantee:roundMoney(guaranteeSummary(op,'${date}').coverageValue)}))`);
  for (const row of rows) for (const key of ["cash", "vp", "funding", "sub", "day", "guarantee"]) {
    assert.ok(Number.isFinite(row[key]), `Valor nao calculado ${date} ${row.id} ${key}`);
  }
  const totals = Object.fromEntries(["cash", "vp", "funding", "sub", "day", "guarantee"].map((key) => [key, round(rows.reduce((sum, row) => sum + row[key], 0))]));
  const interest = evaluate(after, `laminaOperationsForDate().filter(op=>!op.cashOnly).map(op=>operationFundingActivity(op,'${date}').interestAccrued)`);
  assert.ok(interest.every((value) => value >= 0), `Amortizacao virou rendimento negativo de funding ${date}`);
  const quotes = evaluate(after, `Array.from(new Set(guaranteeRegionalQuoteRows('${date}').map(row=>row.quote_date)))`);
  assert.deepEqual(quotes, [date === "2026-10-26" ? "2026-10-23" : date]);
  assert.equal(evaluate(after, `new Set(guaranteeRegionalQuoteRows('${date}').map(row=>row.category+':'+row.region)).size`), 27);
  const lots = evaluate(after, `guaranteeOperations('${date}').flatMap(op=>['lots','transitLots','purchasedTransitLots'].flatMap(key=>guaranteeLots(op,key,key,'${date}').map(lot=>({factor:lot.guaranteeFactor,partnership:lot.isPartnershipGuarantee,quote:lot.quoteDate}))))`);
  for (const lot of lots) {
    assert.equal(lot.factor, lot.partnership ? 0.5 : 1);
    assert.equal(lot.quote, date === "2026-10-26" ? "2026-10-23" : date);
  }
  for (const key of ["summary-strip", "cash-table", "result-table", "guarantee-management-table", "guarantee-management-print-table"]) assert.ok(!/NaN|Infinity|undefined/.test(after.nodes.get(key)?.innerHTML));
  positions.push({ date, totals, operations: rows, cash, quotes, guaranteeLabel: evaluate(after, `guaranteeSnapshotLabel('${date}')`) });
}
const hashes = Object.fromEntries(Object.entries(candidates).map(([target, file]) => [target, {
  file, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
  originalSha256: crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex")
}]));
const paymentsByDate = Object.fromEntries(["2026-10-26", "2026-10-27", "2026-10-28"].map((date) => [date,
  round(ledger.payments.filter((row) => row.date === date).reduce((sum, row) => sum + row.amount, 0))]));
assert.deepEqual(paymentsByDate, { "2026-10-26": 13699777.68, "2026-10-27": 13429783.86, "2026-10-28": 5322946.88 });
for (const payment of ledger.payments) {
  const applied = evaluate(after, `operations.find(op=>op.id==='${payment.operationId}').fundingComponents.flatMap(component=>component.events).filter(event=>event.manual&&event.date==='${payment.date}'&&event.note===${JSON.stringify(payment.note)}).reduce((sum,event)=>sum+event.amount,0)`);
  assert.equal(round(applied), payment.amount, `Pagamento ausente ou duplicado ${payment.invoice || payment.date}`);
}
after.context.window.ceresParallelControlEngineOnly = true;
vm.runInContext(fs.readFileSync("../outputs/controle-paralelo-confina/posicoes.js", "utf8"), after.context);
vm.runInContext(fs.readFileSync("../outputs/controle-paralelo-confina/controle.js", "utf8"), after.context);
const financialRows = (rows) => rows.map(({ portfolioSourceDate, ...row }) => row);
for (const day of evaluate(after, "parallelControlData.positions")) {
  assert.deepEqual(financialRows(evaluate(after, `parallelComputeDay('${day.dateKey}')`)), financialRows(day.accounts), `Paralelo anterior alterado ${day.dateKey}`);
}
const parallel = ["2026-10-26", "2026-10-27", "2026-10-28"].map((date) => {
  const accounts = evaluate(after, `parallelComputeDay('${date}')`);
  assert.equal(round(accounts.reduce((sum, row) => sum + row.cash, 0)), date < "2026-10-27" ? 49203849.74 : 42941222.06);
  assert.equal(round(accounts.reduce((sum, row) => sum + row.payment, 0)), date === "2026-10-27" ? 6262627.68 : 0);
  return { date, accounts };
});
const rawAudit = read("tmp/audit-confina-20261028-raw.json");
const report = { status: ledger.pending.length ? "awaiting_funding_allocation" : "verified", mode: "candidate", historicalDaysChecked: dates.length,
  baseline: rawAudit.baseline, sources: rawAudit.sources, sourceExtractionDate: "2026-10-29",
  authorizedRevision: { operationId: "confina-cprf-100", titleIds: ledger.canceledIds, authorizationDate: "2026-10-29", changes: revisions },
  preservedBiologicalDates: newBio.referenceDates.filter((date) => date <= "2026-10-23"),
  guaranteeWarnings: ["26/10 e 27/10: composicao de animais de 23/10, realocada por titularidade; sem relatorios proprios desses dias.",
    "26/10: sem boletim regional completo na base local; usada cotacao de 23/10, sem cotacao futura.",
    "Mantido o criterio de peso vivo/15 sem rendimento de carcaca; alteracao desse criterio ainda nao autorizada."],
  ledger, positions, parallel, paymentsByDate, candidateHashes: hashes };
fs.writeFileSync("tmp/verified-positions-20261028.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, historicalDaysChecked: dates.length,
  revised19: revisions.find((row) => row.date === "2026-10-19"), revised23: revisions.find((row) => row.date === "2026-10-23"),
  positions: positions.map(({ date, totals, quotes, guaranteeLabel }) => ({ date, totals, quotes, guaranteeLabel })),
  pending: ledger.pending, guaranteeWarnings: report.guaranteeWarnings }, null, 2));
