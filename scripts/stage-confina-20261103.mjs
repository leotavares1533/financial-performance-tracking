import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const date = "2026-11-03";
const cutoff = "2026-10-30";
const reads = (file) => fs.readFileSync(file, "utf8");
const read = (file) => JSON.parse(reads(file).replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const write = (file, variable, data) => fs.writeFileSync(file, `window.${variable} = ${JSON.stringify(data, null, 2)};\n`);
const money = (number) => Math.round(number * 100) / 100;
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const downloads = path.join(os.homedir(), "Downloads");
const sources = ["CRA_GER004 - T\u00edtulos (3).csv", "relatorio_GERANIMAL02 (25).csv",
  "Relat\u00f3rio de 42_2026-11-04T18_37_33.517Z.csv", "relatorio_GERANIMAL02 (24).csv"]
  .map((name) => ({ file: path.join(downloads, name), name })).map((row) => ({ ...row, sha256: sha(row.file) }));
const python = path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe");
const portfolioFile = "data/portfolio/portfolio-confina.js";
const manualFile = "data/portfolio/manual-portfolio-adjustments-confina.json";
const frozenFile = "data/portfolio/portfolio-confina-frozen-2026-10-02.js";
const fundingFile = "data/fundings/fundings-confina.js";
const eventsFile = "data/fundings/funding-events-confina.js";
const portfolio = read(portfolioFile);
const manual = JSON.parse(reads(manualFile).replace(/^\uFEFF/, ""));
const frozen = read(frozenFile);
const fundings = read(fundingFile);
const events = read(eventsFile);
const priorOps = new Map(portfolio.operations.map((op) => [op.operationId, op]));
const getTitle = (id, lastro) => priorOps.get(id).titles.find((title) => title.id === lastro);
const base = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(fundings.positionDate, cutoff);

const buyer = "confina-cra-42-65-setembro";
const parallel = "confina-cras-carteira-50";
assert.equal(getTitle(buyer, "537450").invoice, "PM1552026-1-1");
assert.equal(getTitle(buyer, "537450").originalLastro, "481207");
assert.equal(getTitle(parallel, "481207").settledDate, "2026-09-25");
const payments = [
  { date, operationId: buyer, realLastro: "549937", managerialLastro: "537450", invoice: "PM1552026",
    amortization: 5318911.03, interestPaid: 21275.64, amount: 5340186.67,
    note: "Amortizacao total da 42a, no CRA 42/65 Setembro, seguindo o vinculo confirmado em 27/10. Recebimento do ativo lido separadamente no CSV." },
  { date, operationId: parallel, component: "CRA Carteira 50mm 1 (1.8%)", realLastro: "479319",
    managerialLastro: "481207", invoice: "PM1552026", amortization: 3883763.40, interestPaid: 15535.05, amount: 3899298.45,
    note: "Amortizacao total da 59a no componente 1 da Carteira 50MM segregada. Lastro de origem 481207, conforme vinculo ja confirmado em outubro. Sem novo recebimento neste veiculo." },
];
assert.ok(!events.events.some((event) => event.date >= date));
assert.equal(money(payments.reduce((sum, p) => sum + p.amount, 0)), 9239485.12);
assert.ok(payments.every((p) => money(p.amortization + p.interestPaid) === p.amount));
events.events.push(...payments);
events.updatedAt = "2026-11-04";
fundings.positionDate = date;
write("tmp/funding-events-confina-20261103-candidate.js", "ceresFundingManualEvents", events);
write("tmp/fundings-confina-20261103-candidate.js", "ceresFundingData", fundings);

const preservedMaturities = [
  ["confina-cra-65-200", "485010"], ["confina-cra-65-200", "484606"],
  ["confina-cra-65-200", "484607"], ["confina-cra-65-200", "484608"], ["confina-cra-42-50", "469703"],
].map(([operationId, titleId]) => ({
  id: `vencimento-a-confirmar-20261103-${titleId}`, operationId, titleId, type: "title_override",
  maturityDate: getTitle(operationId, titleId).maturityDate, reportedMaturityDate: "2026-11-30",
  note: "Preservar vencimento anterior: o relatorio continua sem indicar a data efetiva da prorrogacao.",
}));
const deferredPurchases = [
  ["566696", "2026-08-28", 1332825.98], ["566697", "2026-08-28", 2275455.60], ["566707", "2026-09-01", 640310.00],
].map(([titleId, sourcePurchaseDate, acquisitionValue]) => ({
  id: `compra-data-pendente-${titleId}`, type: "title_exclusion", operationId: "confina-cprf-50",
  titleId, sourcePurchaseDate, acquisitionValue, sourceApprovalDate: "2026-11-04",
  note: "Cessao retroativa mas envio/aprovacao em 04/11. Fora da posicao de 03/11 ate confirmar a data efetiva do caixa.",
}));
const temporaryManual = "tmp/adjustments-asof-2026-11-03.json";
fs.writeFileSync(temporaryManual, JSON.stringify({ ...manual, events: [...manual.events, ...preservedMaturities, ...deferredPurchases] }));
const candidate = "tmp/portfolio-confina-20261103-candidate.js";
execFileSync(python, ["scripts/import-confina-portfolio.py", sources[0].file, "--position-date", date,
  "--manual-adjustments", temporaryManual, "--output", candidate], { stdio: "inherit" });
const next = read(candidate);
assert.equal(next.operations.length, portfolio.operations.length);
assert.equal(next.sourceFiles.reduce((sum, source) => sum + source.rows, 0), 2556);
const received = [], purchased = [];
const groupEvents = (events) => {
  const grouped = new Map();
  for (const event of events.filter((row) => row.date <= cutoff)) {
    const key = JSON.stringify([event.date, event.titleId, event.type]);
    grouped.set(key, money((grouped.get(key) || 0) + event.amount));
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b));
};
for (const old of portfolio.operations) {
  const current = next.operations.find((op) => op.operationId === old.operationId);
  assert.ok(current, old.operationId);
  assert.deepEqual(groupEvents(current.cashEvents), groupEvents(old.cashEvents), `Eventos retroativos: ${old.operationId}`);
  assert.ok(!current.cashEvents.some((row) => row.date > date));
  const newTitles = new Map(current.titles.map((title) => [title.id, title]));
  for (const item of old.titles) {
    const updated = newTitles.get(item.id);
    assert.ok(updated, `Lastro ausente ${item.id}`);
    for (const key of ["purchaseDate", "acquisitionValue", "faceValue", "maturityDate", "discountRateMonthly",
      "accrualBaseDays", "accrualDayCount", "partialLiquidations", "settledWithoutDate", "isIgnored"]) {
      assert.deepEqual(updated[key], item[key], `Campo divergente ${item.id}: ${key}`);
    }
    assert.equal(updated.settledDate, old.operationId === buyer && item.id === "537450" ? date : item.settledDate);
  }
  const previousIds = new Set(old.titles.map((title) => title.id));
  for (const title of current.titles.filter((t) => !previousIds.has(t.id))) {
    assert.ok(old.operationId === "confina-cprf-50" && (title.isIgnored || title.purchaseDate === date), title.id);
  }
  for (const row of current.cashEvents.filter((row) => row.date > cutoff)) {
    assert.equal(row.date, date);
    if (row.type === "portfolio_purchase") purchased.push(row);
    else if (row.type === "portfolio_liquidation") received.push(row);
    else assert.fail(`Movimento novo inesperado: ${row.type}`);
  }
}
assert.equal(purchased.length, 11);
assert.ok(purchased.every((row) => row.operationId === "confina-cprf-50"));
assert.equal(received.length, 5);
assert.ok(received.every((row) => row.operationId === buyer && row.titleId === "537450"));
const receiptTotal = money(received.reduce((sum, row) => sum + row.amount, 0));
assert.equal(receiptTotal, 3885610.25);
for (const title of deferredPurchases) {
  const row = next.operations.find((op) => op.operationId === title.operationId).titles.find((t) => t.id === title.titleId);
  assert.ok(!row || (row.isIgnored && !row.isActive));
}
for (const op of frozen.operations) op.freezeThroughDate ||= frozen.freezeThroughDate || frozen.snapshotDate || op.positionDate;
for (const op of portfolio.operations) {
  assert.equal(op.positionDate, cutoff);
  assert.ok(!frozen.operations.some((row) => row.operationId === op.operationId && row.freezeThroughDate === cutoff));
  frozen.operations.push({ ...op, freezeThroughDate: cutoff, preservedFromPositionDate: cutoff });
}
frozen.snapshotDate = frozen.freezeThroughDate = cutoff;
frozen.updatedAt = new Date().toISOString();
write("tmp/portfolio-confina-frozen-20261103-candidate.js", "ceresFrozenPortfolioData", frozen);
const inputs = [portfolioFile, manualFile, frozenFile, fundingFile, eventsFile, "data/pecuaria/cotacoes-pecuaria-latest.js",
  "data/biological/biological-assets-confina.js", "data/biological/biological-assets-history-confina.js", "index.html"];
const report = { date, cutoff, base, sources, baselineHashes: Object.fromEntries(inputs.map((file) => [file, sha(file)])),
  payments, received, receiptTotal, purchased, purchaseTotal: money(purchased.reduce((sum, row) => sum + row.amount, 0)),
  preservedMaturities, deferredPurchases };
fs.writeFileSync("tmp/processing-confina-20261103-ledger.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ purchaseTotal: report.purchaseTotal, cashReceipt: receiptTotal, paid: 9239485.12 }));
