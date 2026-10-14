import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const baselineIndex = process.argv.indexOf("--baseline-ref");
const baseline = baselineIndex >= 0 ? process.argv[baselineIndex + 1] : "65d6df9";
const candidate = process.argv.includes("--candidate");
const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map(match => match[1]);
const parseJs = text => JSON.parse(text.replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const baselineFile = file => execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const candidateFiles = {
  "data/portfolio/portfolio-confina.js": "tmp/portfolio-confina-2026-10-13-candidate.js",
  "data/biological/biological-assets-confina.js": "tmp/biological-assets-confina-20261013-candidate.js"
};
function loadApp(previous) {
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: "", textContent: "", value: "", dataset: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
    return elements.get(id);
  };
  const context = vm.createContext({ console, URLSearchParams, Date, Intl,
    window: { location: { search: "" }, print() {} },
    document: { getElementById, querySelectorAll: () => [], activeElement: null }
  });
  for (const file of files) {
    let source = previous ? baselineFile(file) : fs.readFileSync(candidate ? candidateFiles[file] || file : file, "utf8");
    if (!previous && candidate && file === "data/biological/biological-assets-history-confina.js") {
      const history = parseJs(source);
      history.snapshots.push(parseJs(fs.readFileSync("tmp/biological-assets-confina-20261009-candidate.js", "utf8")));
      source = `window.ceresBiologicalAssetsHistory = ${JSON.stringify(history)};`;
    }
    if (file === "assets/app.js") source = source.replace(/\brender\(\);\s*$/, "");
    vm.runInContext(source, context, { filename: file });
  }
  return { context, elements };
}
const evaluate = (app, code) => JSON.parse(JSON.stringify(vm.runInContext(code, app.context)));
const previous = loadApp(true);
const current = loadApp(false);
assert.equal(evaluate(current, "state.dateKey"), "2026-10-13");
function position(app, date) {
  return evaluate(app, `guaranteeOperations('${date}').map(op => {
    const cash = op.biologicalOnly ? 0 : cashBalanceAtDate(op, '${date}');
    const funding = op.biologicalOnly ? 0 : fundingBalanceAtDate(op, '${date}');
    const vp = op.biologicalOnly ? 0 : roundMoney(operationPortfolioPositionAtDate(op, '${date}').portfolioVp);
    const adjustment = op.biologicalOnly ? 0 : operationSyntheticAdjustmentBalanceAtDate(op, '${date}');
    const g = guaranteeSummary({...op, cash, fundingBalance: funding}, '${date}');
    return { id:op.id, name:op.shortName, controlled:!op.biologicalOnly, vp, cash, funding,
      sub: roundMoney(vp + cash + adjustment - funding),
      heads:g.totalHeads, transitHeads:g.transitHeads, purchasedHeads:g.purchasedTransitHeads,
      weight:Math.round(g.totalWeightKg*1e4)/1e4, transitWeight:Math.round(g.transitWeightKg*1e4)/1e4, purchasedWeight:Math.round(g.purchasedTransitWeightKg*1e4)/1e4,
      guarantee:roundMoney(g.coverageValue), biological:roundMoney(g.value+g.transitValue+g.purchasedTransitValue), quote:g.quoteSource };
  })`);
}
const closedDates = ["2026-09-27", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
for (const date of closedDates) {
  assert.deepEqual(position(current, date), position(previous, date), `Posicao fechada alterada: ${date}`);
  for (const days of [1, 21]) assert.equal(evaluate(current, `addBusinessDaysBack('${date}',${days})`), evaluate(previous, `addBusinessDaysBack('${date}',${days})`));
}
const currentHistory = evaluate(current, "biologicalAssetHistoryData.snapshots");
const previousHistory = evaluate(previous, "biologicalAssetHistoryData.snapshots");
for (const snapshot of previousHistory) assert.deepEqual(currentHistory.find(row => row.referenceDate === snapshot.referenceDate), snapshot, `Snapshot fechado alterado: ${snapshot.referenceDate}`);
const oldPortfolio = evaluate(previous, "portfolioData.operations");
const newPortfolio = evaluate(current, "portfolioData.operations");
for (const op of oldPortfolio) {
  const next = newPortfolio.find(row => row.operationId === op.operationId);
  assert.deepEqual(next.history.filter(row => row.date <= '2026-10-08'), op.history, `Historico diario alterado: ${op.operationId}`);
}
assert.equal(evaluate(current, "isBusinessDayKey('2026-10-12')"), false);
assert.equal(evaluate(current, "cashDailyApplicationRate('2026-10-12')"), 0);
assert.equal(evaluate(current, "addBusinessDaysBack('2026-10-13',1)"), "2026-10-09");
assert.equal(evaluate(current, "addBusinessDaysBack('2026-10-09',1)"), "2026-10-08");
assert.ok(evaluate(current, "operations.every(op=>operationCashPositionAtDate(op,'2026-10-12').investmentIncome===0)"));
assert.ok(evaluate(current, "operations.every(op=>fundingBalanceAtDate(op,'2026-10-12')>=fundingBalanceAtDate(op,'2026-10-09'))"));
assert.equal(evaluate(current, "biologicalAssetDataForDate('2026-10-09').compositionReferenceDate"), "2026-10-08");
assert.equal(evaluate(current, "biologicalAssetDataForDate('2026-10-13').referenceDate"), "2026-10-13");
const days = ["2026-10-09", "2026-10-13"].map(date => {
  const positions = position(current, date);
  const cash = evaluate(current, `operations.map(op=>{ const r=operationCashPositionAtDate(op,'${date}'); return {id:op.id, initial:r.initialBalance, inflows:r.investorInflow, liquidations:r.portfolioLiquidation, purchases:r.portfolioPurchase, amortizations:r.fundingAmortization, adjustments:r.adjustment, income:r.investmentIncome, closing:r.currentBalance}; })`);
  for (const row of cash) assert.ok(Math.abs(row.initial+row.inflows+row.liquidations-row.purchases-row.amortizations+row.adjustments+row.income-row.closing)<=0.02, `Caixa nao fecha: ${row.id} ${date}`);
  const quoteCounts = evaluate(current, `quoteRowsForDate('${date}').reduce((counts,row)=>({...counts,[row.map_type]:(counts[row.map_type]||0)+1}),{})`);
  assert.deepEqual(quoteCounts, {regional_map:27,replacement_grid:192,mt_bulletin:12});
  assert.deepEqual(evaluate(current, `Array.from(new Set(guaranteeRegionalQuoteRows('${date}').map(row=>row.quote_date)))`), [date]);
  evaluate(current, `state.dateKey='${date}'; render(); true`);
  for (const id of ["result-table", "guarantee-management-table", "quotes-regional-matrix"]) {
    assert.ok(current.elements.has(id), `Painel ausente: ${id}`);
    assert.ok(!/NaN|Infinity|undefined/.test(current.elements.get(id).innerHTML), `Valor invalido: ${id}`);
  }
  const totals = positions.filter(row=>row.controlled).reduce((sum,row)=>{
    for (const key of ["vp","cash","funding","sub","guarantee"]) sum[key] = Math.round(((sum[key]||0)+row[key])*100)/100;
    return sum;
  },{});
  return {date, previousBusinessDay:evaluate(current,`addBusinessDaysBack('${date}',1)`), guaranteeLabel:evaluate(current,`guaranteeSnapshotLabel('${date}')`), totals, positions, cash};
});
const purchases = newPortfolio.flatMap(op=>op.cashEvents.filter(row=>row.date>'2026-10-08' && row.type==='portfolio_purchase'));
assert.equal(purchases.length, 9);
assert.equal(Math.round(purchases.reduce((sum,row)=>sum+row.amount,0)*100)/100,11993671.69);
assert.ok(purchases.every(row=>row.operationId==='confina-cprf-50' && row.date==='2026-10-13'));
assert.equal(evaluate(current,"manualFundingEvents.events.filter(row=>row.date>'2026-10-08' && row.date<='2026-10-13').length"),0);
const report = {baseline, closedDatesPreserved:closedDates, holiday:'2026-10-12',
  portfolioSources:evaluate(current,"portfolioData.sourceFiles"),
  guaranteeSources:evaluate(current,"({sourceFile:biologicalAssetData.sourceFile,purchasedTransitSourceFile:biologicalAssetData.purchasedTransitSourceFile,referenceDate:biologicalAssetData.referenceDate,quoteDate:biologicalAssetData.quoteDate})"),
  purchases, guaranteeDates:evaluate(current,"biologicalAssetSnapshots.map(row=>biologicalAssetSnapshotDate(row))"), days};
fs.writeFileSync("tmp/verified-positions-20261013.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({closedDatesPreserved:closedDates, holiday:report.holiday, guaranteeDates:report.guaranteeDates, days:days.map(({date,previousBusinessDay,guaranteeLabel,totals})=>({date,previousBusinessDay,guaranteeLabel,totals}))},null,2));
