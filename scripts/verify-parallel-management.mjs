import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const baseline = process.env.PARALLEL_BASELINE || "c7cfe44";
const output = path.resolve("../outputs/controle-paralelo-confina");
function load(previous = false) {
  const read = (file) => previous
    ? execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 })
    : fs.readFileSync(file, "utf8");
  const html = read("index.html");
  const files = [...html.matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map((match) => match[1]);
  const nodes = new Map();
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", textContent: "", value: "", dataset: {},
      classList: { toggle() {} }, addEventListener() {}, setAttribute() {} });
    return nodes.get(id);
  };
  const context = vm.createContext({ console, Date, Intl, URLSearchParams,
    window: { location: { search: "" }, print() {}, ceresFinanceEngineOnly: !previous },
    document: { getElementById: element, querySelectorAll: () => [], activeElement: null }
  });
  for (const file of files) vm.runInContext(read(file).replace(/\brender\(\);\s*$/, ""), context, { filename: file });
  return { context, nodes, files };
}
const evaluate = (app, code) => JSON.parse(JSON.stringify(vm.runInContext(code, app.context)));
const before = load(true), after = load();
const dates = evaluate(after, "calendarDatesBetween('2026-04-01','2026-10-19')");
const rawPosition = (app, date) => evaluate(app, `operations.map(op=>{
  const p=operationPortfolioPositionAtDate(op,'${date}');
  return {id:op.id,cash:cashBalanceAtDate(op,'${date}'),funding:fundingBalanceAtDate(op,'${date}'),
    vp:roundMoney(p.portfolioVp),vn:roundMoney(p.portfolioVn),count:p.titleCount,
    sub:syntheticAtDate(op,'${date}')};
})`);
for (const date of dates) assert.deepEqual(rawPosition(after, date), rawPosition(before, date), `Historico financeiro alterado em ${date}`);
const unchangedFiles = after.files.filter((file) => file.startsWith("data/") && !file.startsWith("data/management/"));
for (const file of unchangedFiles) {
  const original = execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 });
  const digest = (text) => crypto.createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
  assert.equal(digest(fs.readFileSync(file, "utf8")), digest(original), `Arquivo de origem alterado: ${file}`);
}
const uiKeys = ["summary-strip", "cash-table", "result-table", "history-head", "history-body",
  "guarantee-management-table", "guarantee-management-print-table", "partnership-insights", "partner-risk-chart"];
for (const date of ["2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30", "2026-10-02", "2026-10-06", "2026-10-08", "2026-10-13", "2026-10-19"]) {
  for (const app of [before, after]) {
    vm.runInContext(`state.dateKey='${date}';state.view='gerencial';window.ceresFinanceEngineOnly=false;render();`, app.context);
  }
  for (const key of uiKeys) assert.equal(after.nodes.get(key)?.innerHTML, before.nodes.get(key)?.innerHTML, `Tela historica alterada: ${date} ${key}`);
}
const excluded = ["confina-cras-carteira-100", "confina-cras-carteira-50"];
const surplusId = "confina-caixa-operacao";
const releasedCash = 878090.06;
assert.equal(evaluate(after, "cashBalanceAtDate(operatingCashOperation,'2026-10-19')"), 0);
assert.equal(evaluate(after, "syntheticAtDate(operatingCashOperation,'2026-10-19')"), 907384.31);
assert.equal(evaluate(after, "cashBalanceAtDate(operatingCashOperation,'2026-10-20')"), releasedCash);
assert.equal(evaluate(after, "operationCashPositionAtDate(operatingCashOperation,'2026-10-20').investmentIncome"), 0);
assert.equal(evaluate(after, "operationCashPositionAtDate(operatingCashOperation,'2026-10-21').adjustment"), 0);
assert.equal(evaluate(after, "operationCashPositionAtDate(operatingCashOperation,'2026-10-21').totalAdjustment"), releasedCash);
assert.equal(evaluate(after, "fundingBalanceAtDate(operatingCashOperation,'2026-10-21')"), 0);
assert.ok(evaluate(after, "operationCashPositionAtDate(operatingCashOperation,'2026-10-21').investmentIncome") > 0);
const latest = [];
for (const date of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-24", "2026-10-26"]) {
  vm.runInContext(`state.dateKey='${date}';state.view='gerencial';render();`, after.context);
  const ids = evaluate(after, "laminaOperationsForDate().map(op=>op.id)");
  assert.equal(ids.length, 10);
  assert.ok(ids.includes(surplusId));
  assert.equal(evaluate(after, "selectedEvolutionOperations().length"), 9);
  assert.equal(evaluate(after, "selectedPortfolioOperations().length"), 9);
  for (const id of excluded) {
    assert.ok(!ids.includes(id));
    for (const getter of ["selectedEvolutionOperations", "selectedCashOperations", "selectedPortfolioOperations", "guaranteeOperations"]) {
      assert.ok(!evaluate(after, `${getter}().map(op=>op.id)`).includes(id), `${getter} vazou ${id}`);
    }
  }
  for (const key of ["funding-selector", ...uiKeys]) {
    const html = after.nodes.get(key)?.innerHTML || "";
    assert.ok(!/CRAs Carteira R\$\s*100MM|CRAs Carteira R\$\s*50MM/.test(html), `Papel segregado visivel: ${date} ${key}`);
  }
  const expectedDayResult = evaluate(after, "laminaOperationsForDate().reduce((sum,op)=>sum+op.syntheticSub-op.previousSyntheticSub,0)");
  const raw = rawPosition(before, date).filter((row) => ids.includes(row.id));
  const previousDate = evaluate(after, `addBusinessDaysBack('${date}',1)`);
  const prior = rawPosition(before, previousDate).filter((row) => ids.includes(row.id));
  const expected = Math.round((raw.reduce((s, r) => s + r.sub, 0) - prior.reduce((s, r) => s + r.sub, 0)) * 100) / 100;
  const surplus = evaluate(after, `syntheticAtDate(operatingCashOperation,'${date}')`);
  const priorSurplus = evaluate(after, `syntheticAtDate(operatingCashOperation,'${previousDate}')`);
  assert.ok(Math.abs(expectedDayResult - expected - surplus + priorSurplus) < 0.03, `Resultado ficticio por segregacao: ${date}`);
  if (previousDate < "2026-10-20") {
    const legacyGain = rawPosition(before, previousDate).filter((row) => excluded.includes(row.id)).reduce((sum, row) => sum + row.sub, 0);
    assert.ok(Math.abs(priorSurplus - legacyGain) < 0.01, "Ganho anterior perdido na reclassificacao");
  }
  const monthDate = evaluate(after, `rollingMonthReferenceKey('${date}')`);
  if (monthDate < "2026-10-20") {
    const legacyMonth = rawPosition(before, monthDate).filter((row) => excluded.includes(row.id)).reduce((sum, row) => sum + row.sub, 0);
    const monthBaseline = evaluate(after, "operatingCashOperation.monthStartSyntheticSub");
    assert.ok(Math.abs(monthBaseline - legacyMonth) < 0.01, "Comparativo de 21 dias alterou o ganho historico");
  }
  const guaranteeCash = evaluate(after, "guaranteeOperations().filter(op=>!op.biologicalOnly).reduce((s,op)=>s+guaranteeSummary(op).cashCoverage,0)");
  const publicCash = evaluate(after, "laminaOperationsForDate().reduce((s,op)=>s+op.cash,0)");
  assert.ok(Math.abs(guaranteeCash - publicCash) < 0.01);
  assert.ok(after.nodes.get("cash-table").innerHTML.includes("Caixa da operacao"));
  assert.ok(after.nodes.get("result-table").innerHTML.includes("Caixa da operacao"));
  latest.push({ date, visibleFundings: ids.length - 1, operatingCash: surplus,
    cash: evaluate(after, "roundMoney(laminaOperationsForDate().reduce((s,op)=>s+op.cash,0))"),
    funding: evaluate(after, "roundMoney(laminaOperationsForDate().reduce((s,op)=>s+op.fundingBalance,0))") });
}
vm.runInContext("state.dateKey='2026-10-21';state.view='individual';state.selectedId='confina-cras-carteira-100';state.cashId=state.selectedId;state.portfolioId=state.selectedId;state.evolutionId=state.selectedId;render();", after.context);
assert.equal(evaluate(after, "state.view"), "gerencial");
for (const key of ["cashId", "portfolioId", "evolutionId"]) assert.equal(evaluate(after, `state.${key}`), "gerencial");
vm.runInContext(fs.readFileSync(path.join(output, "posicoes.js"), "utf8"), after.context);
after.context.window.ceresParallelControlEngineOnly = true;
vm.runInContext(fs.readFileSync(path.join(output, "controle.js"), "utf8"), after.context);
const privateRows = [];
for (const date of ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-24", "2026-10-26"]) {
  const rows = evaluate(after, `parallelPositionsAtDate('${date}')`);
  assert.equal(rows.length, 2);
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.cash, 0) * 100), 4920384974);
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.cash + row.operatingCashReleased, 0) * 100), 5008193980);
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.operatingCashReleased, 0) * 100), Math.round(releasedCash * 100));
  for (const row of rows) {
    assert.equal(row.cashIncome, 0);
    assert.equal(row.portfolioVp, 0);
    assert.equal(row.debt, evaluate(before, `fundingBalanceAtDate(operations.find(op=>op.id==='${row.operationId}'),'${date}')`));
    assert.equal(row.payment, 0);
    assert.ok(Math.abs(row.debt - row.previousDebt - row.interest + row.payment) < 0.03);
  }
  privateRows.push({ date, cash: rows.reduce((s, r) => s + r.cash, 0), debt: Math.round(rows.reduce((s, r) => s + r.debt, 0) * 100) / 100 });
}
// A real payment reduces both ledgers once; preserved prior positions do not change.
const frozen = evaluate(after, "parallelPositionsAtDate('2026-10-21')");
vm.runInContext(`{
 const op=operations.find(op=>op.id==='confina-cras-carteira-50');
 const component=op.fundingComponents[0];
 component.events.push({date:'2026-10-22',amount:1000,interestPaid:0,amortization:1000,manual:true});
 component._preparedForCalculation=false;component._balanceCache=new Map();
 prepareFundingComponent(component);op._cashRowsCache=new Map();
}`, after.context);
const withPayment = evaluate(after, "parallelPositionsAtDate('2026-10-22').find(r=>r.operationId==='confina-cras-carteira-50')");
const originalAccount = evaluate(before, "cashBalanceAtDate(operations.find(op=>op.id==='confina-cras-carteira-50'),'2026-10-19')");
assert.equal(withPayment.cash, originalAccount - withPayment.operatingCashReleased - 1000);
assert.equal(withPayment.payment, 1000);
assert.deepEqual(evaluate(after, "parallelPositionsAtDate('2026-10-21')"), frozen);
assert.equal(evaluate(after, "cashBalanceAtDate(operatingCashOperation,'2026-10-20')"), releasedCash);
const data = evaluate(after, "parallelControlData");
assert.ok(fs.existsSync(path.join(output, data.revisions.at(-1).backupFile)));
assert.equal(data.revisions.at(-1).operatingCashReleased, releasedCash);
assert.ok(!fs.readFileSync("index.html", "utf8").includes("controle-paralelo"));
assert.ok(!fs.existsSync("controle-paralelo-confina"));
console.log(JSON.stringify({ historicalDaysVerified: dates.length, historicalScreensVerified: 9,
  sourceFilesUnchanged: unchangedFiles.length, publicPositions: latest, parallelPositions: privateRows,
  fictitiousPaymentsCreated: 0, privateControlPublished: false, paymentRegression: "passed" }, null, 2));
