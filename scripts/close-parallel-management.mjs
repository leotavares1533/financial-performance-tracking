import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const root = process.cwd();
const output = path.resolve(root, "../outputs/controle-paralelo-confina");
const target = path.join(output, "posicoes.js");
const throughIndex = process.argv.indexOf("--through");
assert.ok(throughIndex >= 0, "Informe --through AAAA-MM-DD");
const through = process.argv[throughIndex + 1];
assert.match(through, /^\d{4}-\d{2}-\d{2}$/);
const parsedThrough = new Date(`${through}T12:00:00Z`);
assert.ok(!Number.isNaN(parsedThrough.getTime()) && parsedThrough.toISOString().slice(0, 10) === through, "Data de fechamento invalida");
const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)]
  .map((match) => match[1]).filter((file) => !/^data\/(biological|pecuaria)\//.test(file));
const dataHashes = Object.fromEntries(files.filter((file) => file.startsWith("data/"))
  .map((file) => [file, crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")]));
const context = vm.createContext({ console, Date, Intl, URLSearchParams,
  window: { location: { search: "" }, ceresFinanceEngineOnly: true, ceresParallelControlEngineOnly: true },
  document: { getElementById: () => null, querySelectorAll: () => [] }
});
for (const file of files) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
const read = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
let data;
if (fs.existsSync(target)) {
  data = JSON.parse(fs.readFileSync(target, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
} else {
  const accounts = read(`operations.filter(op=>managementPresentationPolicy.excludedOperationIds.includes(op.id)).map(op=>({
    operationId:op.id,name:op.shortName,
    openingCash:cashBalanceAtDate(op,'2026-10-19'),
    openingDebt:fundingBalanceAtDate(op,'2026-10-19')
  }))`);
  assert.equal(Math.round(accounts.reduce((sum, row) => sum + row.openingCash, 0) * 100), 5008193980);
  assert.equal(Math.round(accounts.reduce((sum, row) => sum + row.openingDebt, 0) * 100), 4917455549);
  data = { authorizationDate: "2026-10-22", effectiveDate: "2026-10-20", baseDate: "2026-10-19",
    cashTreatment: "nominal_without_simulated_cdi", debtTreatment: "continues_original_accrual_without_fictitious_payment",
    accounts, positions: [] };
}
context.window.ceresParallelManagementData = data;
vm.runInContext(fs.readFileSync(path.join(output, "controle.js"), "utf8"), context);
assert.ok(through >= data.effectiveDate);
const dates = read(`calendarDatesBetween('${data.effectiveDate}','${through}')`);
const additions = [];
for (const date of dates) {
  const accounts = read(`parallelComputeDay('${date}')`);
  assert.ok(accounts.every((row) => row.portfolioVp === 0), `Carteira ativa em veiculo segregado: ${date}`);
  const existing = data.positions.find((row) => row.dateKey === date);
  if (existing) {
    const financialValues = (rows) => rows.map(({ portfolioSourceDate, ...row }) => row);
    assert.deepEqual(financialValues(accounts), financialValues(existing.accounts), `Posicao paralela preservada divergiu em ${date}; requer revisao autorizada antes de alterar`);
  } else {
    additions.push({ dateKey: date, status: "carried_without_new_portfolio", accounts, sourceHashes: dataHashes });
  }
}
data.positions.push(...additions);
data.positions.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(target, `window.ceresParallelManagementData = ${JSON.stringify(data, null, 2)};\n`);
for (const [file, hash] of Object.entries(dataHashes)) {
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), hash);
}
console.log(JSON.stringify({ file: target, preserved: data.positions.length, added: additions.length,
  positions: data.positions.map((row) => ({ date: row.dateKey,
    cash: Math.round(row.accounts.reduce((sum, account) => sum + account.cash, 0) * 100) / 100,
    debt: Math.round(row.accounts.reduce((sum, account) => sum + account.debt, 0) * 100) / 100,
    interest: Math.round(row.accounts.reduce((sum, account) => sum + account.interest, 0) * 100) / 100 })) }, null, 2));
