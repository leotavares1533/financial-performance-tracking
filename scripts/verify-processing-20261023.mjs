import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const baseline = "e0e0a33", candidate = process.argv.includes("--candidate");
const filesByTarget = {
  "data/fundings/fundings-confina.js": "tmp/fundings-confina-20261023-candidate.js",
  "data/fundings/funding-events-confina.js": "tmp/funding-events-confina-20261023-candidate.js",
  "data/portfolio/portfolio-confina.js": "tmp/portfolio-confina-2026-10-23-candidate.js",
  "data/portfolio/portfolio-confina-frozen-2026-10-02.js": "tmp/portfolio-confina-frozen-20261023-candidate.js",
  "data/biological/biological-assets-confina.js": "tmp/biological-assets-confina-20261023-candidate.js",
  "data/biological/biological-assets-history-confina.js": "tmp/biological-assets-history-confina-20261023-candidate.js",
  "data/pecuaria/cotacoes-pecuaria-latest.js": "tmp/cotacoes-pecuaria-20261023-candidate.js"
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const ledger = readJson("tmp/processing-confina-20261023-ledger.json");
const oldSource = (file) => execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
function load(previous) {
  const nodes = new Map();
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", value: "", textContent: "", dataset: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
    return nodes.get(id);
  };
  const context = vm.createContext({ console, Date, Intl, URLSearchParams,
    window: { location: { search: "" }, ceresFinanceEngineOnly: true }, document: { getElementById: element, querySelectorAll: () => [], activeElement: null } });
  const html = previous ? oldSource("index.html") : fs.readFileSync("index.html", "utf8");
  for (const match of html.matchAll(/<script src="\.\/([^"?]+)/g)) {
    const file = match[1];
    vm.runInContext(previous ? oldSource(file) : fs.readFileSync(candidate ? filesByTarget[file] || file : file, "utf8"), context, { filename: file });
  }
  return { context, nodes };
}
const before = load(true), after = load(false);
const evaluate = (app, code) => JSON.parse(JSON.stringify(vm.runInContext(code, app.context)));
const round = (value) => Math.round(value * 100) / 100;
const position = (app, date) => evaluate(app, `operations.map(op=>{
  const p=operationPortfolioPositionAtDate(op,'${date}');return{id:op.id,vp:roundMoney(p.portfolioVp),vn:roundMoney(p.portfolioVn),
  cash:cashBalanceAtDate(op,'${date}'),funding:fundingBalanceAtDate(op,'${date}'),sub:syntheticAtDate(op,'${date}'),titles:p.titleCount};
})`);
const retroIds = ledger.authorizedRetroactiveTitleIds;
const retroTitles = evaluate(after, `portfolioData.operations.find(op=>op.operationId==='confina-cprf-100').titles.filter(t=>${JSON.stringify(retroIds)}.includes(t.id))`);
assert.equal(retroTitles.length, 3);
const dates = evaluate(after, "calendarDatesBetween('2026-04-01','2026-10-21')");
const revisions = [];
let cashDelta = 0;
for (const date of dates) {
  const oldRows = position(before, date), newRows = position(after, date);
  for (const old of oldRows) {
    const current = newRows.find((row) => row.id === old.id);
    if (old.id !== "confina-cprf-100" || date < "2026-10-02") {
      assert.deepEqual(current, old, `Historico nao autorizado: ${date} ${old.id}`);
      continue;
    }
    let extraVp = 0, extraVn = 0, extraCount = 0, purchases = 0;
    for (const title of retroTitles) {
      if (date < title.purchaseDate) continue;
      after.context.retroTitle = title;
      extraVp += evaluate(after, `portfolioTitleValueAtDate(retroTitle,'${date}','${date}')`);
      extraVn += title.faceValue;
      extraCount += 1;
      if (date === title.purchaseDate) purchases += title.acquisitionValue;
    }
    const row = evaluate(before, `operationCashPositionAtDate(operations.find(op=>op.id==='confina-cprf-100'),'${date}')`);
    const cashParameters = evaluate(after, `({share:CASH_APPLIED_SHARE,rate:cashDailyApplicationRate('${date}')})`);
    const preIncome = row.initialBalance + row.investorInflow - row.portfolioPurchase + row.portfolioLiquidation - row.fundingAmortization + row.adjustment + cashDelta - purchases;
    const expectedCash = round(preIncome + Math.max(preIncome, 0) * cashParameters.share * cashParameters.rate);
    cashDelta = round(expectedCash - old.cash);
    assert.ok(Math.abs(current.cash - expectedCash) < 0.03, `Caixa retroativo ${date}`);
    assert.ok(Math.abs(current.vp - old.vp - extraVp) < 0.03, `VP retroativo ${date}`);
    assert.ok(Math.abs(current.vn - old.vn - extraVn) < 0.03, `Nominal retroativo ${date}`);
    assert.equal(current.titles - old.titles, extraCount);
    assert.equal(current.funding, old.funding);
    assert.ok(Math.abs(current.sub - old.sub - extraVp - cashDelta) < 0.04);
    revisions.push({ date, vp: round(current.vp - old.vp), nominal: round(current.vn - old.vn), cash: cashDelta,
      sub: round(current.sub - old.sub), purchases: round(purchases), count: extraCount });
  }
}
const oldComponent = evaluate(before, "operations.find(op=>op.id==='confina-cra-65-outubro').fundingComponents[0]");
const newComponents = evaluate(after, "operations.find(op=>op.id==='confina-cra-65-outubro').fundingComponents");
const serial = (component) => Object.fromEntries(Object.entries(component).filter(([key]) => !key.startsWith("_")));
assert.deepEqual(serial(newComponents[0]), serial(oldComponent), "Componente de 14/10 modificado");
assert.equal(newComponents.length, 2);
assert.equal(newComponents[1].principal, 68761184.84);
assert.equal(newComponents[1].startDate, "2026-10-22");
assert.equal(newComponents[1].fundingRate, 1.7);
for (const date of ["2026-10-14", "2026-10-21", "2026-10-22", "2026-10-23"]) {
  const principal = evaluate(after, `state.dateKey='${date}';operationFundingPrincipal(operations.find(op=>op.id==='confina-cra-65-outubro'))`);
  assert.equal(principal, date < "2026-10-22" ? 75790266.29 : 144551451.13);
  assert.equal(evaluate(after, `fundingComponentRows(operations.find(op=>op.id==='confina-cra-65-outubro')).length`), date < "2026-10-22" ? 1 : 2);
}
assert.equal(evaluate(after, "calculateComponentBalance(operations.find(op=>op.id==='confina-cra-65-outubro').fundingComponents[1],'2026-10-21')"), 0);
assert.equal(evaluate(after, "calculateComponentBalance(operations.find(op=>op.id==='confina-cra-65-outubro').fundingComponents[1],'2026-10-22')"), 68761184.84);
assert.equal(evaluate(after, "calculateComponentBalance(operations.find(op=>op.id==='confina-cra-65-outubro').fundingComponents[1],'2026-10-23')"), round(68761184.84 * Math.pow(1.017, 1 / 30)));
assert.equal(ledger.pm149Target, "42-65", "Destino do PM149 deve refletir a confirmacao do usuario");
assert.equal(ledger.pendingPm149, false);
assert.equal(round(ledger.payments.reduce((sum, row) => sum + row.amount, 0)), 8287547.62);
const pm149 = evaluate(after, "manualFundingEvents.events.filter(event=>event.date==='2026-10-23'&&event.operationId==='confina-cra-42-65-setembro')");
assert.equal(pm149.length, 1);
assert.equal(pm149[0].amount, 890795.01);
const pmApplied = evaluate(after, "operations.find(op=>op.id==='confina-cra-42-65-setembro').fundingComponents.flatMap(component=>component.events).filter(event=>event.manual&&event.date==='2026-10-23')");
assert.equal(pmApplied.length, 1);
assert.equal(pmApplied[0].amount, 890795.01);
assert.equal(evaluate(after, "manualFundingEvents.events.filter(event=>event.date==='2026-10-23'&&event.operationId==='confina-cras-carteira-50').length"), 0);
for (const payment of ledger.payments) {
  const applied = evaluate(after, `operations.find(op=>op.id==='${payment.operationId}').fundingComponents.flatMap(component=>component.events).filter(event=>event.manual&&event.date==='${payment.date}'&&event.note===${JSON.stringify(payment.note)}).reduce((sum,event)=>sum+event.amount,0)`);
  assert.equal(applied, payment.amount, "Amortizacao ausente ou duplicada");
}
const portfolio = evaluate(after, "portfolioData.operations");
const destination = portfolio.find((op) => op.operationId === "confina-cra-65-outubro");
assert.equal(destination.titles.length, 163);
assert.equal(destination.cashEvents.filter((event) => event.date === "2026-10-22" && event.type === "portfolio_purchase").length, 1);
assert.equal(destination.cashEvents.find((event) => event.date === "2026-10-22" && event.type === "portfolio_purchase").amount, 68761184.84);
for (const [id, seller] of Object.entries(ledger.sellers)) {
  const operation = portfolio.find((op) => op.operationId === id);
  const origins = ledger.transfers.filter((row) => row.sourceOperationId === id).map((row) => row.originalLastro);
  const event = operation.cashEvents.filter((row) => row.date === "2026-10-22" && row.titleId === `venda-65out-22-${id}`);
  assert.equal(event.length, 1);
  assert.equal(event[0].amount, seller.cashReceived);
  assert.ok(!operation.cashEvents.some((row) => row.date === "2026-10-22" && row.type === "portfolio_liquidation" && origins.includes(row.titleId)));
  for (const origin of origins) assert.equal(operation.titles.find((title) => title.id === origin).settledDate, "2026-10-22");
}
for (const row of ledger.transfers) {
  const title = destination.titles.find((title) => title.id === row.lastro);
  assert.equal(title.presentValueMethod, "motor");
  assert.equal(title.acquisitionValue, row.value);
}
const previousBio = evaluate(before, "biologicalAssetData");
for (const snapshot of [...evaluate(before, "biologicalAssetHistoryData.snapshots").filter((row) => row.referenceDate !== previousBio.referenceDate), previousBio]) {
  assert.deepEqual(evaluate(after, `biologicalAssetDataForDate('${snapshot.referenceDate}')`), snapshot, `Composicao alterada ${snapshot.referenceDate}`);
}
assert.deepEqual(evaluate(after, "quoteSnapshot.frozenGuaranteeQuotes"), evaluate(before, "quoteSnapshot.frozenGuaranteeQuotes"));
assert.deepEqual(evaluate(after, "quoteSnapshot.historyRows.filter(row=>row.quote_date<'2026-10-23')"), evaluate(before, "quoteSnapshot.historyRows"), "Cotacao anterior alterada");
const positions = [];
for (const date of ["2026-10-22", "2026-10-23"]) {
  vm.runInContext(`state.dateKey='${date}';state.view='gerencial';window.ceresFinanceEngineOnly=false;render();`, after.context);
  const cashRows = evaluate(after, `laminaOperationsForDate().map(op=>{const r=operationCashPositionAtDate(op,'${date}');return{
    id:op.id,initial:r.initialBalance,inflow:r.investorInflow,purchases:r.portfolioPurchase,receipts:r.portfolioLiquidation,
    payments:r.fundingAmortization,adjustment:r.adjustment,income:r.investmentIncome,closing:r.currentBalance};})`);
  for (const row of cashRows) assert.ok(Math.abs(row.initial + row.inflow - row.purchases + row.receipts - row.payments + row.adjustment + row.income - row.closing) < 0.03, `Caixa nao concilia ${date} ${row.id}`);
  const quotes = evaluate(after, `Array.from(new Set(guaranteeRegionalQuoteRows('${date}').map(row=>row.quote_date)))`);
  assert.deepEqual(quotes, [date]);
  const lots = evaluate(after, `guaranteeOperations('${date}').flatMap(op=>['lots','transitLots','purchasedTransitLots'].flatMap(key=>guaranteeLots(op,key,key,'${date}').map(lot=>({factor:lot.guaranteeFactor,partnership:lot.isPartnershipGuarantee,quote:lot.quoteDate}))))`);
  assert.ok(lots.some((lot) => lot.partnership));
  for (const lot of lots) { assert.equal(lot.factor, lot.partnership ? 0.5 : 1); assert.equal(lot.quote, date); }
  const rows = evaluate(after, `laminaOperationsForDate().map(op=>({id:op.id,name:op.shortName,cash:op.cash,vp:op.portfolioVp,
    funding:op.fundingBalance,sub:op.syntheticSub,day:roundMoney(op.syntheticSub-op.previousSyntheticSub),
    guarantee:roundMoney(guaranteeSummary(op,'${date}').coverageValue)}))`);
  const totals = Object.fromEntries(["cash", "vp", "funding", "sub", "day", "guarantee"].map((key) => [key, round(rows.reduce((sum, row) => sum + row[key], 0))]));
  const accruedInterest = evaluate(after, `laminaOperationsForDate().filter(op=>!op.cashOnly).map(op=>operationFundingActivity(op,'${date}').interestAccrued)`);
  assert.ok(accruedInterest.every((value) => value >= 0), "Amortizacao foi tratada como rendimento negativo do funding");
  for (const key of ["summary-strip", "cash-table", "result-table", "guarantee-management-table", "guarantee-management-print-table"]) assert.ok(!/NaN|Infinity|undefined/.test(after.nodes.get(key)?.innerHTML));
  positions.push({ date, totals, operations: rows, cash: cashRows, guaranteeLabel: evaluate(after, `guaranteeSnapshotLabel('${date}')`) });
}
after.context.window.ceresParallelControlEngineOnly = true;
vm.runInContext(fs.readFileSync("../outputs/controle-paralelo-confina/posicoes.js", "utf8"), after.context);
vm.runInContext(fs.readFileSync("../outputs/controle-paralelo-confina/controle.js", "utf8"), after.context);
const privateFinancialRows = (rows) => rows.map(({ portfolioSourceDate, ...row }) => row);
for (const day of evaluate(after, "parallelControlData.positions")) {
  assert.deepEqual(privateFinancialRows(evaluate(after, `parallelComputeDay('${day.dateKey}')`)), privateFinancialRows(day.accounts), `Paralelo historico alterado ${day.dateKey}`);
}
for (const date of ["2026-10-22", "2026-10-23"]) {
  const parallel = evaluate(after, `parallelComputeDay('${date}')`);
  assert.equal(round(parallel.reduce((sum, row) => sum + row.cash, 0)), 49203849.74);
  assert.equal(parallel.reduce((sum, row) => sum + row.payment, 0), 0);
}
const report = { baseline, mode: candidate ? "candidate" : "official", historicalDaysChecked: dates.length,
  authorizedRevision: { operationId: "confina-cprf-100", titleIds: retroIds, authorizationDate: "2026-10-26", changes: revisions },
  ledger, positions, pendingPm149: ledger.pendingPm149, candidateHashes: Object.fromEntries(Object.entries(filesByTarget).map(([target, file]) => [target, {
    file, sha256: crypto.createHash("sha256").update(fs.readFileSync(candidate ? file : target)).digest("hex") }])) };
fs.writeFileSync("tmp/verified-positions-20261023.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ historicalDaysChecked: dates.length, revision02: revisions.find((row) => row.date === "2026-10-02"),
  revision19: revisions.find((row) => row.date === "2026-10-19"), revision21: revisions.find((row) => row.date === "2026-10-21"),
  positions: positions.map(({ date, totals, guaranteeLabel }) => ({ date, totals, guaranteeLabel })), pendingPm149: ledger.pendingPm149 }, null, 2));
