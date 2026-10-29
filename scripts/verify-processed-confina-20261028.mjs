import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import path from "node:path";

const report = JSON.parse(fs.readFileSync("tmp/verified-positions-20261028.json", "utf8"));
assert.equal(report.status, "verified");
for (const [file, expected] of Object.entries(report.candidateHashes)) {
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), expected.sha256, `Aplicacao divergiu ${file}`);
}
const nodes = new Map();
const element = (id) => {
  if (!nodes.has(id)) nodes.set(id, { innerHTML: "", textContent: "", value: "", dataset: {},
    classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
  return nodes.get(id);
};
const context = vm.createContext({ console, Date, Intl, URLSearchParams,
  window: { location: { search: "" }, ceresFinanceEngineOnly: true, ceresParallelControlEngineOnly: true },
  document: { getElementById: element, querySelectorAll: () => [], activeElement: null } });
const html = fs.readFileSync("index.html", "utf8");
assert.ok(!html.includes("controle-paralelo"));
for (const match of html.matchAll(/<script src="\.\/([^"?]+)/g)) {
  vm.runInContext(fs.readFileSync(match[1], "utf8"), context, { filename: match[1] });
}
const evaluate = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
for (const expected of report.positions) {
  vm.runInContext(`state.dateKey='${expected.date}';state.view='gerencial';window.ceresFinanceEngineOnly=false;render();`, context);
  const rows = evaluate(`laminaOperationsForDate().map(op=>({id:op.id,name:op.shortName,cash:op.cash,vp:op.portfolioVp,
    funding:op.fundingBalance,sub:op.syntheticSub,day:roundMoney(op.syntheticSub-op.previousSyntheticSub),
    guarantee:roundMoney(guaranteeSummary(op,'${expected.date}').coverageValue)}))`);
  assert.deepEqual(rows, expected.operations, `Posicao em tela diferente da validada ${expected.date}`);
  assert.equal(evaluate(`guaranteeSnapshotLabel('${expected.date}')`), expected.guaranteeLabel);
  for (const key of ["summary-strip", "cash-table", "result-table", "guarantee-management-table", "guarantee-management-print-table", "funding-selector"]) {
    assert.ok(nodes.get(key)?.innerHTML.length > 0, `Quadro vazio ${key}`);
    assert.ok(!/NaN|Infinity|undefined/.test(nodes.get(key).innerHTML), `Quadro invalido ${key}`);
  }
  assert.ok(!nodes.get("result-table").innerHTML.includes("CRAs Carteira R$ 50MM"));
  assert.ok(!nodes.get("result-table").innerHTML.includes("CRAs Carteira R$ 100MM"));
}
vm.runInContext(fs.readFileSync("../outputs/controle-paralelo-confina/posicoes.js", "utf8"), context);
vm.runInContext(fs.readFileSync("../outputs/controle-paralelo-confina/controle.js", "utf8"), context);
const financialRows = (rows) => rows.map(({ portfolioSourceDate, ...row }) => row);
for (const expected of report.parallel) {
  assert.deepEqual(financialRows(evaluate(`parallelPositionsAtDate('${expected.date}')`)), financialRows(expected.accounts));
}
const auditFile = "data/validations/processing-confina-2026-10-28.json";
const publishedAudit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
const { parallel, ...publicReport } = publishedAudit;
fs.writeFileSync(path.resolve("../outputs/processamento-confina-20261028/validacao-interna.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(auditFile, `${JSON.stringify({ ...publicReport,
  parallelValidation: { status: "verified_local_only", closedThrough: "2026-10-28", privateLedgerPublished: false } }, null, 2)}\n`);
console.log(JSON.stringify({ status: "verified_official", dates: report.positions.map((row) => row.date),
  historicalDaysChecked: report.historicalDaysChecked, privateControlPublished: false,
  visibleFundingCount28: evaluate("laminaOperationsForDate('2026-10-28').filter(op=>!op.cashOnly).length"),
  newFundingCashD0: evaluate(`cashBalanceAtDate(operations.find(op=>op.id==='${report.ledger.fundingId}'),'2026-10-28')`) }));
