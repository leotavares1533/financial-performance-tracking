import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const baseline = "d687b67";
const candidate = process.argv.includes("--candidate");
const overrides = {
  "data/portfolio/portfolio-confina.js": "tmp/portfolio-confina-2026-10-21-candidate.js",
  "data/portfolio/portfolio-confina-frozen-2026-10-02.js": "tmp/portfolio-confina-frozen-20261021-candidate.js",
  "data/biological/biological-assets-confina.js": "tmp/biological-assets-confina-20261021-candidate.js",
  "data/biological/biological-assets-history-confina.js": "tmp/biological-assets-history-confina-20261021-candidate.js"
};
const source = (file) => execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
function load(previous) {
  const nodes = new Map();
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", value: "", textContent: "", dataset: {},
      classList: { toggle() {} }, addEventListener() {}, setAttribute() {} });
    return nodes.get(id);
  };
  const context = vm.createContext({ console, Date, Intl, URLSearchParams,
    window: { location: { search: "" }, ceresFinanceEngineOnly: true },
    document: { getElementById: element, querySelectorAll: () => [], activeElement: null }
  });
  const html = previous ? source("index.html") : fs.readFileSync("index.html", "utf8");
  const files = [...html.matchAll(/<script src="\.\/([^"?]+)/g)].map((match) => match[1]);
  for (const file of files) vm.runInContext(previous ? source(file) : fs.readFileSync(candidate ? overrides[file] || file : file, "utf8"), context, { filename: file });
  return { context, nodes };
}
const before = load(true), after = load(false);
const evaluate = (app, code) => JSON.parse(JSON.stringify(vm.runInContext(code, app.context)));
const position = (app, date) => evaluate(app, `operations.map(op=>{
  const p=operationPortfolioPositionAtDate(op,'${date}');
  return {id:op.id,cash:cashBalanceAtDate(op,'${date}'),funding:fundingBalanceAtDate(op,'${date}'),
    vp:roundMoney(p.portfolioVp),vn:roundMoney(p.portfolioVn),count:p.titleCount,sub:syntheticAtDate(op,'${date}')};
})`);
const dates = evaluate(after, "calendarDatesBetween('2026-04-01','2026-10-19')");
for (const date of dates) {
  const oldRows = position(before, date), newRows = position(after, date);
  for (const original of oldRows) {
    const current = newRows.find((row) => row.id === original.id);
    if (date === "2026-10-19" && original.id === "confina-cprf-100") {
      assert.equal(Math.round((current.vn - original.vn) * 100), -120058392, "Correcao autorizada do nominal divergente");
      assert.deepEqual({ ...current, vn: original.vn }, original, "A revisao de 19/10 alterou outros saldos");
    } else assert.deepEqual(current, original, `Historico alterado em ${date}: ${original.id}`);
  }
}
for (const date of ["2026-09-30", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-13", "2026-10-14", "2026-10-16", "2026-10-19"]) {
  for (const app of [before, after]) vm.runInContext(`state.dateKey='${date}';state.view='gerencial';window.ceresFinanceEngineOnly=false;render();`, app.context);
  for (const key of ["summary-strip", "cash-table", "result-table", "history-head", "history-body", "guarantee-management-table", "guarantee-management-print-table", "partnership-insights", "partner-risk-chart"]) {
    assert.equal(after.nodes.get(key)?.innerHTML, before.nodes.get(key)?.innerHTML, `Tela historica alterada ${date}: ${key}`);
  }
}
const originalCurrent = evaluate(before, "biologicalAssetData");
const originalHistory = evaluate(before, "biologicalAssetHistoryData.snapshots");
for (const snapshot of [...originalHistory.filter((row) => row.referenceDate !== originalCurrent.referenceDate), originalCurrent]) {
  after.context.expectedSnapshotDate = snapshot.referenceDate;
  assert.deepEqual(evaluate(after, "biologicalAssetDataForDate(expectedSnapshotDate)"), snapshot, `Composicao alterada: ${snapshot.referenceDate}`);
}
assert.equal(evaluate(after, "portfolioDataForOperationAtDate(operations.find(op=>op.id==='confina-cprf-100'),'2026-10-19').titles.some(t=>t.id==='555852')"), false);
assert.equal(evaluate(after, "portfolioDataForOperationAtDate(operations.find(op=>op.id==='confina-cprf-100'),'2026-10-19').titles.some(t=>t.id==='556254')"), true);
const revised = evaluate(after, "frozenPortfolioData.authorizedRevisions.at(-1)");
assert.equal(revised.authorizationDate, "2026-10-22");
assert.equal(revised.effectiveDate, "2026-10-19");
assert.equal(revised.cashImpact, 0);
assert.equal(revised.vpImpact, 0);
const current = evaluate(after, "portfolioData.operations.find(op=>op.operationId==='confina-cprf-100')");
assert.equal(current.titles.find((title) => title.id === "556254").discountRateMonthly, 0.0195);
assert.equal(current.titles.find((title) => title.id === "556254").faceValue, 506325.60);
assert.ok(!current.titles.some((title) => title.id === "555852"));
const newPurchases = current.cashEvents.filter((event) => event.date >= "2026-10-20" && event.date <= "2026-10-21" && event.type === "portfolio_purchase");
assert.deepEqual(newPurchases.map(({ date, titleId, amount }) => ({ date, titleId, amount })), [{ date: "2026-10-20", titleId: "556955", amount: 148830 }]);
assert.equal(evaluate(after, "manualFundingEvents.events.filter(e=>e.date>='2026-10-20'&&e.date<='2026-10-21').length"), 0);
assert.equal(evaluate(after, "biologicalAssetDataForDate('2026-10-20').compositionReferenceDate"), "2026-10-19");
assert.equal(evaluate(after, "biologicalAssetDataForDate('2026-10-21').referenceDate"), "2026-10-21");
assert.equal(evaluate(after, "biologicalAssetData.summary.weightSources.peso_projetado_ajustado_gmd_140"), 2379);
assert.deepEqual(evaluate(after, "biologicalAssetData.liveStatusFilter"), ["PROCESSADO", "EM PROCESSAMENTO"]);
const positions = [];
for (const date of ["2026-10-20", "2026-10-21"]) {
  vm.runInContext(`state.dateKey='${date}';state.view='gerencial';render();`, after.context);
  assert.equal(evaluate(after, "laminaOperationsForDate().filter(op=>!op.cashOnly).length"), 9);
  assert.equal(evaluate(after, "laminaOperationsForDate().filter(op=>op.cashOnly).length"), 1);
  const rows = evaluate(after, `laminaOperationsForDate().map(op=>{
    const g=guaranteeSummary(op,'${date}');const cash=operationCashPositionAtDate(op,'${date}');
    return{id:op.id,name:op.shortName,vp:op.portfolioVp,cash:op.cash,funding:op.fundingBalance,sub:op.syntheticSub,day:roundMoney(op.syntheticSub-op.previousSyntheticSub),
      heads:g.totalHeads,weight:g.totalWeightKg,live:g.value,transitHeads:g.transitHeads,transit:g.transitValue,purchasedHeads:g.purchasedTransitHeads,purchased:g.purchasedTransitValue,
      guarantee:roundMoney(g.coverageValue),cashFlowDelta:roundMoney(cash.initialBalance+cash.investorInflow-cash.portfolioPurchase+cash.portfolioLiquidation-cash.fundingAmortization+cash.adjustment+cash.investmentIncome-cash.currentBalance)};
  })`);
  for (const row of rows) assert.ok(Math.abs(row.cashFlowDelta) < 0.03, `Caixa nao concilia ${date}: ${row.id}`);
  const lots = evaluate(after, `guaranteeOperations('${date}').flatMap(op=>['lots','transitLots','purchasedTransitLots'].flatMap(key=>guaranteeLots(op,key,key,'${date}').map(lot=>({factor:lot.guaranteeFactor,partnership:lot.isPartnershipGuarantee,quote:lot.quoteDate}))))`);
  assert.ok(lots.some((lot) => lot.partnership));
  for (const lot of lots) { assert.equal(lot.factor, lot.partnership ? 0.5 : 1); assert.equal(lot.quote, date); }
  for (const key of ["summary-strip", "cash-table", "result-table", "guarantee-management-table", "guarantee-management-print-table"]) assert.ok(!/NaN|Infinity|undefined/.test(after.nodes.get(key)?.innerHTML), `Tela invalida: ${key}`);
  positions.push({ date, guaranteeLabel: evaluate(after, `guaranteeSnapshotLabel('${date}')`), rows,
    totals: Object.fromEntries(["vp", "cash", "funding", "sub", "day", "guarantee"].map((key) => [key, Math.round(rows.reduce((sum, row) => sum + row[key], 0) * 100) / 100])) });
}
const privateOutput = path.resolve("../outputs/controle-paralelo-confina");
vm.runInContext(fs.readFileSync(path.join(privateOutput, "posicoes.js"), "utf8"), after.context);
after.context.window.ceresParallelControlEngineOnly = true;
vm.runInContext(fs.readFileSync(path.join(privateOutput, "controle.js"), "utf8"), after.context);
const parallelBefore = JSON.parse(JSON.stringify(after.context.window.ceresParallelManagementData.positions));
for (const row of parallelBefore) {
  const excludeMetadata = (rows) => rows.map(({ portfolioSourceDate, ...account }) => account);
  assert.deepEqual(excludeMetadata(evaluate(after, `parallelComputeDay('${row.dateKey}')`)), excludeMetadata(row.accounts));
}
const report = { baseline, mode: candidate ? "candidate_only_not_published" : "official", preservedHistoricalDays: dates.length,
  preservedThroughDate: "2026-10-18", authorizedHistoricalRevision: revised,
  titleReplacement: { from: "555852", to: "556254", appliesFrom: "2026-10-19", userAuthorized: true },
  fundingPaymentsAdded: 0, positions, parallelPositionsUnchanged: true };
fs.writeFileSync("tmp/verified-positions-20261021.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ baseline, mode: report.mode, preservedHistoricalDays: dates.length,
  positions: positions.map(({ date, guaranteeLabel, totals }) => ({ date, guaranteeLabel, totals })), parallelPositionsUnchanged: true }, null, 2));
