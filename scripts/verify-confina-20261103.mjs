import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const hash = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const money = (value) => Math.round(value * 100) / 100;
const ledger = JSON.parse(fs.readFileSync("tmp/processing-confina-20261103-ledger.json", "utf8"));
const { date, cutoff, payments, receiptTotal, purchaseTotal } = ledger;
function checkInputs() {
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), ledger.base);
  for (const source of ledger.sources) assert.equal(hash(source.file), source.sha256);
  for (const [file, digest] of Object.entries(ledger.baselineHashes)) assert.equal(hash(file), digest, file);
}
checkInputs();

const portfolio = "data/portfolio/portfolio-confina.js";
const frozen = "data/portfolio/portfolio-confina-frozen-2026-10-02.js";
const fundings = "data/fundings/fundings-confina.js";
const events = "data/fundings/funding-events-confina.js";
const currentBio = "data/biological/biological-assets-confina.js";
const historyBio = "data/biological/biological-assets-history-confina.js";
const quotes = read("data/pecuaria/cotacoes-pecuaria-latest.js");
const files = {
  [portfolio]: "tmp/portfolio-confina-20261103-candidate.js",
  [frozen]: "tmp/portfolio-confina-frozen-20261103-candidate.js",
  [fundings]: "tmp/fundings-confina-20261103-candidate.js",
  [events]: "tmp/funding-events-confina-20261103-candidate.js",
  [currentBio]: "tmp/biological-assets-confina-20261103-candidate.js",
  [historyBio]: "tmp/biological-assets-history-confina-20261103-candidate.js",
  "index.html": "tmp/index-confina-20261103-candidate.html",
};
const prior = read(currentBio);
const latest = read(files[currentBio]);
const oldHistory = read(historyBio);
assert.equal(prior.referenceDate, cutoff);
assert.equal(latest.referenceDate, date);
assert.ok(latest.quoteDate <= date);
assert.ok(latest.compositionEstimated);
assert.ok(!oldHistory.referenceDates.includes(cutoff) && !oldHistory.referenceDates.includes(date));
const history = { ...oldHistory, updatedAt: new Date().toISOString(), currentReferenceDate: date,
  snapshots: [...oldHistory.snapshots, prior], referenceDates: [...oldHistory.referenceDates, cutoff] };
const historyJs = `window.ceresBiologicalAssetsHistory = ${JSON.stringify(history)};\n`;
assert.ok(Buffer.byteLength(historyJs) < 100 * 1024 * 1024, `Historico excede limite do GitHub: ${Buffer.byteLength(historyJs)} bytes`);
fs.writeFileSync(files[historyBio], historyJs);
assert.deepEqual(read(files[fundings]).operations, read(fundings).operations);
assert.deepEqual(read(files[events]).events, [...read(events).events, ...payments]);
const oldFrozen = read(frozen);
assert.deepEqual(read(files[frozen]).operations, [...oldFrozen.operations.map((op) => ({
  ...op, freezeThroughDate: op.freezeThroughDate || oldFrozen.freezeThroughDate || oldFrozen.snapshotDate || op.positionDate,
})), ...read(portfolio).operations.map((op) => ({ ...op, freezeThroughDate: cutoff, preservedFromPositionDate: cutoff }))]);

const index = fs.readFileSync("index.html", "utf8");
const scripts = [...index.matchAll(/<script src="\.\/([^"?]+)(?:\?[^"]*)?"/g)].map((match) => match[1]);
fs.writeFileSync(files["index.html"], index.replace(
  /(<script src="\.\/)(data\/(?:fundings|portfolio|biological)\/[^"?]+)\?[^"]+(")/g,
  (match, start, file, end) => files[file] ? `${start}${file}?v=20261104-fechamento-0311${end}` : match,
));

function load(candidate) {
  const nodes = new Map();
  const element = (id) => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: "", value: "", textContent: "", dataset: {}, classList: { toggle() {} },
      setAttribute() {}, addEventListener() {} });
    return nodes.get(id);
  };
  const window = { location: { search: "" }, ceresFinanceEngineOnly: true, ceresParallelControlEngineOnly: true,
    ceresBiologicalAssets: candidate ? latest : prior,
    ceresBiologicalAssetsHistory: candidate ? history : oldHistory, ceresCattleQuotes: quotes };
  const context = vm.createContext({ console, Date, Intl, URLSearchParams, window,
    document: { getElementById: element, querySelectorAll: () => [], activeElement: null } });
  for (const file of scripts.filter((file) => !/^data\/(biological|pecuaria)\//.test(file))) {
    vm.runInContext(fs.readFileSync(candidate ? files[file] || file : file, "utf8"), context, { filename: file });
  }
  return { context, nodes };
}
const before = load(false), after = load(true);
const evaluate = (app, expression) => JSON.parse(JSON.stringify(vm.runInContext(expression, app.context)));
const positions = (app, day) => evaluate(app, `operations.map(op=>{const p=operationPortfolioPositionAtDate(op,'${day}');return {
  id:op.id,vp:roundMoney(p.portfolioVp),vn:roundMoney(p.portfolioVn),count:p.titleCount,
  cash:cashBalanceAtDate(op,'${day}'),funding:fundingBalanceAtDate(op,'${day}'),sub:syntheticAtDate(op,'${day}')};})`);
const checked = evaluate(before, `calendarDatesBetween('2026-04-01','${cutoff}')`);
for (const day of checked) assert.deepEqual(positions(after, day), positions(before, day), `Historico financeiro alterado: ${day}`);
for (const snapshot of [...oldHistory.snapshots, prior]) {
  const day = snapshot.referenceDate;
  const quoteRows = (app) => evaluate(app, `guaranteeRegionalQuoteRows('${day}').map(r=>[r.quote_date,r.category,r.region,r.price]).sort()`);
  assert.deepEqual(quoteRows(after), quoteRows(before), `Preco historico alterado: ${day}`);
}
const holidays = ["2026-10-31", "2026-11-01", "2026-11-02"];
assert.deepEqual(evaluate(after, `[${holidays.map((day) => `isBusinessDayKey('${day}')`).join(",")}]`), [false, false, false]);
assert.deepEqual(evaluate(after, `[...new Set(guaranteeRegionalQuoteRows('${date}').map(row=>row.quote_date))]`), [latest.quoteDate]);

const account = (app, op, fn) => evaluate(app, `(() => {const op = operations.find(op=>op.id==='${op}');return ${fn};})()`);
for (const payment of payments) {
  const balance = `fundingBalanceAtDate(op,'${date}')`;
  assert.equal(money(account(before, payment.operationId, balance) - account(after, payment.operationId, balance)), payment.amount,
    `Pagamento excede componente ou nao reconciliou: ${payment.operationId}`);
  const cash = account(after, payment.operationId, `operationCashPositionAtDate(op,'${date}')`);
  assert.equal(cash.fundingAmortization, payment.amount);
  assert.equal(cash.portfolioLiquidation, payment.realLastro === "549937" ? receiptTotal : 0);
}
const purchaseCash = account(after, "confina-cprf-50", `operationCashPositionAtDate(op,'${date}')`);
assert.equal(purchaseCash.portfolioPurchase, purchaseTotal);

const parallelRoot = path.resolve("../outputs/controle-paralelo-confina");
const parallelFile = path.join(parallelRoot, "posicoes.js");
const parallelHash = hash(parallelFile);
const parallel = read(parallelFile);
assert.equal(parallel.positions.at(-1).dateKey, cutoff);
after.context.window.ceresParallelManagementData = parallel;
vm.runInContext(fs.readFileSync(path.join(parallelRoot, "controle.js"), "utf8"), after.context);
const comparable = (rows) => rows.map(({ portfolioSourceDate, ...rest }) => rest);
for (const day of parallel.positions) assert.deepEqual(comparable(evaluate(after, `parallelComputeDay('${day.dateKey}')`)),
  comparable(day.accounts), `Historico paralelo alterado: ${day.dateKey}`);
const parallelToday = evaluate(after, `parallelComputeDay('${date}')`);
assert.ok(parallelToday.every((row) => row.portfolioVp === 0));
assert.equal(parallelToday.find((row) => row.operationId === payments[1].operationId).payment, payments[1].amount);

vm.runInContext(`state.dateKey='${date}';state.view='gerencial';window.ceresFinanceEngineOnly=false;render();`, after.context);
const visible = evaluate(after, `laminaOperationsForDate().map(op=>({id:op.id,name:op.shortName,cash:op.cash,vp:op.portfolioVp,
  funding:op.fundingBalance,sub:op.syntheticSub,day:roundMoney(op.syntheticSub-op.previousSyntheticSub),
  guarantee:roundMoney(guaranteeSummary(op,'${date}').coverageValue)}))`);
assert.ok(!visible.some((op) => ["confina-cras-carteira-50", "confina-cras-carteira-100"].includes(op.id)));
const keys = ["cash", "vp", "funding", "sub", "day", "guarantee"];
for (const op of visible) for (const key of keys) assert.ok(Number.isFinite(op[key]), `${op.id}/${key}`);
for (const key of ["cash-table", "result-table", "guarantee-management-table", "guarantee-management-print-table"]) {
  assert.ok(after.nodes.get(key)?.innerHTML.length > 0, key);
  assert.ok(!/NaN|Infinity|undefined/.test(after.nodes.get(key).innerHTML), key);
}
const totals = Object.fromEntries(keys.map((key) => [key, money(visible.reduce((sum, op) => sum + op[key], 0))]));
const report = { ...ledger, sources: ledger.sources.map(({ name, sha256 }) => ({ file: name, sha256 })),
  status: "verified", historyDays: checked.length, priorGuaranteeDates: [...oldHistory.referenceDates, cutoff],
  quoteDate: latest.quoteDate, guaranteeReconstruction: latest.reconstruction, guaranteeSummary: latest.summary,
  totals, visible, parallelToday };
fs.writeFileSync("tmp/verified-positions-20261103.json", JSON.stringify(report, null, 2) + "\n");
if (apply) {
  checkInputs();
  assert.equal(hash(parallelFile), parallelHash);
  const backup = path.resolve("../outputs/processamento-confina-20261103/antes-da-atualizacao");
  assert.ok(!fs.existsSync(backup), "Backup existente; aplicar somente uma vez");
  for (const [file, candidate] of Object.entries(files)) {
    const old = path.join(backup, file);
    fs.mkdirSync(path.dirname(old), { recursive: true });
    fs.copyFileSync(file, old, fs.constants.COPYFILE_EXCL);
    assert.equal(hash(old), ledger.baselineHashes[file]);
    assert.ok(fs.existsSync(candidate));
  }
  fs.copyFileSync(parallelFile, path.join(backup, "posicoes-paralelo.js"), fs.constants.COPYFILE_EXCL);
  for (const [file, candidate] of Object.entries(files)) {
    fs.copyFileSync(candidate, file);
    assert.equal(hash(file), hash(candidate));
  }
  const { parallelToday: privatePositions, ...officialReport } = report;
  fs.writeFileSync("data/validations/processing-confina-2026-11-03.json", JSON.stringify({
    ...officialReport, mode: "official", appliedAt: new Date().toISOString(),
  }, null, 2) + "\n");
}
console.log(JSON.stringify({ applied: apply, date, cutoff, days: checked.length, historyBytes: Buffer.byteLength(historyJs),
  quoteDate: latest.quoteDate, totals, parallelToday: parallelToday.map(({ operationId, cash, debt, payment }) => ({
    operationId, cash, debt, payment,
  })) }));
