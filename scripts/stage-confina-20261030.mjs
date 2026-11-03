import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const cutoff = "2026-10-28";
const dates = ["2026-10-29", "2026-10-30"];
const operationId = "confina-cra-65-200";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const write = (file, variable, data) => fs.writeFileSync(file, `window.${variable} = ${JSON.stringify(data, null, 2)};\n`);
const round = (value) => Math.round(value * 100) / 100;
const mode = process.argv.find((arg) => arg.startsWith("--receipts="))?.split("=")[1] || "pending";
assert.ok(["pending", "funding-only", "total", "nominal", "asset-no-cash"].includes(mode));
const downloads = path.join(os.homedir(), "Downloads");
const source = path.join(downloads, "CRA_GER004 - T\u00edtulos (2).csv");
const python = path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe");
const previous = read("data/portfolio/portfolio-confina.js");
const manual = read("data/portfolio/manual-portfolio-adjustments-confina.json");
const funding = read("data/fundings/fundings-confina.js");
const fundingEvents = read("data/fundings/funding-events-confina.js");
const payments = [
  ["2026-10-29", "484475", "485009", "JF01", 35730.15, 142.92],
  ["2026-10-29", "485103", "484605", "JF02", 169286.08, 620.72],
  ["2026-10-30", "484624", "485010", "JF03", 20019.70, 73.41],
  ["2026-10-30", "485100", "484606", "JF04", 67527.08, 180.07],
  ["2026-10-30", "485101", "484607", "JF05", 338917.69, 790.81],
  ["2026-10-30", "485102", "484608", "JF06", 65503.70, 152.84]
].map(([date, realLastro, managerialLastro, invoice, amortization, interestPaid]) =>
  ({ date, realLastro, managerialLastro, invoice, amortization, interestPaid, amount: round(amortization + interestPaid), operationId,
    note: `Amortizacao total ${invoice}, lastro real ${realLastro}, CRA 65a Ceres 2. Lastro gerencial ${managerialLastro}.` }));
for (const payment of payments) {
  const oldTitle = previous.operations.find((op) => op.operationId === operationId).titles.find((t) => t.id === payment.managerialLastro);
  assert.ok(oldTitle?.isActive && oldTitle.invoice.startsWith(payment.invoice));
  assert.ok(!fundingEvents.events.some((event) => event.date === payment.date && event.operationId === operationId));
}
fundingEvents.events.push(...payments);
fundingEvents.updatedAt = "2026-11-03";
funding.positionDate = dates.at(-1);
write("tmp/funding-events-confina-20261030-candidate.js", "ceresFundingManualEvents", fundingEvents);
write("tmp/fundings-confina-20261030-candidate.js", "ceresFundingData", funding);

const preservedMaturities = [
  [operationId, "485010"], [operationId, "484606"], [operationId, "484607"], [operationId, "484608"],
  ["confina-cra-42-50", "469703"]
].map(([id, titleId]) => {
  const title = previous.operations.find((op) => op.operationId === id).titles.find((row) => row.id === titleId);
  assert.ok(title);
  return { id: `vencimento-a-confirmar-20261030-${titleId}`, operationId: id, titleId, type: "title_override", maturityDate: title.maturityDate,
    note: "Exportacao de 03/11 mostra prorrogacao sem data efetiva. Manter vencimento anterior ate confirmacao." };
});
const actualReceipts = payments.flatMap((payment) => {
  if (!["total", "nominal"].includes(mode)) return [];
  return [{ id: `recebimento-confirmado-20261030-${payment.managerialLastro}`, operationId, date: payment.date,
    type: "portfolio_liquidation", mode: "replace_same_day", titleId: payment.managerialLastro,
    amount: mode === "total" ? payment.amount : payment.amortization, settledDate: payment.date,
    paymentStatus: "LIQUIDADO", titleStatus: "LIQUIDADO",
    note: `Recebimento efetivo confirmado pelo usuario, distinto do pagamento do funding; lastro real ${payment.realLastro}.` }];
});
const nonCashClosures = mode === "asset-no-cash" ? payments.map((payment) => ({
  id: `baixa-sem-caixa-20261030-${payment.managerialLastro}`, operationId, titleId: payment.managerialLastro,
  type: "title_override", settledDate: payment.date, note: "Baixa de carteira confirmada pelo usuario sem novo recebimento."
})) : [];
const priorClosures = [["confina-cra-42-50", "453611", "2026-05-04"], ["confina-cras-carteira-100", "458188", "2026-07-10"]]
  .map(([id, titleId, settledDate]) => {
    assert.equal(previous.operations.find((op) => op.operationId === id).titles.find((title) => title.id === titleId).settledDate, settledDate);
    return { id: `baixa-preservada-unificado-${titleId}`, operationId: id, titleId, type: "title_override", settledDate,
      note: "Baixa ja consolidada ate 28/10. Preservada na transicao para a leitura unificada sem inferir novas baixas pelo VP do sistema." };
  });
manual.events.push(...priorClosures);
const realAdjustments = [...actualReceipts, ...nonCashClosures];
const asOfManual = (date) => {
  const overrideById = new Map(preservedMaturities.map((row) => [row.titleId, row]));
  for (const row of realAdjustments.filter((row) => (row.date || row.settledDate) <= date && row.type === "title_override")) {
    overrideById.set(row.titleId, { ...overrideById.get(row.titleId), ...row });
  }
  return { ...manual, events: [...manual.events, ...overrideById.values(), ...actualReceipts.filter((row) => row.date <= date)] };
};
const eventsThroughCutoff = (events) => {
  const sums = new Map();
  for (const event of events.filter((row) => row.date <= cutoff)) {
    const key = JSON.stringify([event.date, event.titleId, event.type]);
    sums.set(key, round((sums.get(key) || 0) + event.amount));
  }
  return [...sums].sort(([a], [b]) => a.localeCompare(b));
};
let latest;
for (const date of dates) {
  const tempManual = `tmp/adjustments-asof-${date}.json`;
  fs.writeFileSync(tempManual, JSON.stringify(asOfManual(date)));
  const output = `tmp/portfolio-guarantee-${date}.js`;
  execFileSync(python, ["scripts/import-confina-portfolio.py", source, "--position-date", date,
    "--manual-adjustments", tempManual, "--output", output], { stdio: "inherit" });
  latest = read(output);
  assert.equal(latest.operations.length, previous.operations.length);
  assert.equal(latest.sourceFiles.reduce((sum, row) => sum + row.rows, 0), 2537);
  for (const old of previous.operations) {
    const next = latest.operations.find((row) => row.operationId === old.operationId);
    assert.ok(next, old.operationId);
    assert.deepEqual(eventsThroughCutoff(next.cashEvents), eventsThroughCutoff(old.cashEvents), `Eventos retroativos ${old.operationId}`);
    assert.ok(!next.cashEvents.some((event) => event.date > date), `Evento futuro ${old.operationId}`);
    const titles = new Map(next.titles.map((title) => [title.id, title]));
    for (const title of old.titles) {
      const current = titles.get(title.id);
      assert.ok(current, `Lastro ausente: ${old.operationId}/${title.id}`);
      for (const field of ["purchaseDate", "acquisitionValue", "faceValue", "maturityDate", "discountRateMonthly",
        "accrualBaseDays", "accrualDayCount", "partialLiquidations", "settledWithoutDate"]) {
        assert.deepEqual(current[field], title[field], `Campo divergente ${title.id} ${field}`);
      }
      const authorized = realAdjustments.find((row) => row.titleId === title.id && row.settledDate <= date);
      assert.equal(current.settledDate, authorized?.settledDate || title.settledDate, `Data de baixa divergente ${title.id}`);
      if (current.isActive) assert.ok(!["LIQUIDADO", "BAIXA MANUAL", "BAIXADO"].includes(current.paymentStatus), `Baixa futura no status ${title.id}`);
    }
  }
}
const frozen = read("data/portfolio/portfolio-confina-frozen-2026-10-02.js");
for (const op of frozen.operations) op.freezeThroughDate ||= frozen.freezeThroughDate || frozen.snapshotDate || op.positionDate;
for (const op of previous.operations) {
  assert.equal(op.positionDate, cutoff);
  assert.ok(!frozen.operations.some((row) => row.operationId === op.operationId && row.freezeThroughDate === cutoff));
  frozen.operations.push({ ...op, freezeThroughDate: cutoff, preservedFromPositionDate: cutoff });
}
frozen.snapshotDate = frozen.freezeThroughDate = cutoff;
frozen.updatedAt = new Date().toISOString();
write("tmp/portfolio-confina-frozen-20261030-candidate.js", "ceresFrozenPortfolioData", frozen);
write("tmp/portfolio-confina-20261030-candidate.js", "ceresPortfolioData", latest);
const recordedManual = { ...manual, updatedAt: "2026-11-03", events: [...manual.events, ...realAdjustments] };
recordedManual.totals = { ...manual.totals, rows: recordedManual.events.length,
  amount: round(recordedManual.events.reduce((sum, row) => sum + Number(row.amount || 0), 0)) };
fs.writeFileSync("tmp/manual-portfolio-adjustments-20261030-candidate.json", `${JSON.stringify(recordedManual, null, 2)}\n`);
const sources = [source, path.join(downloads, "relatorio_GERANIMAL02 (24).csv"), path.join(downloads, "relatorio_GERANIMAL02 (23).csv"),
  path.join(downloads, "Relat\u00f3rio de 42_2026-11-03T21_29_23.891Z.csv")]
  .map((file) => ({ file, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") }));
const purchases = latest.operations.flatMap((row) => row.cashEvents.filter((event) => event.date > cutoff && event.type === "portfolio_purchase"));
assert.equal(purchases.length, 14);
assert.ok(purchases.every((row) => row.operationId === "confina-cprf-100" && row.date === dates[0]));
const purchaseTotal = round(purchases.reduce((sum, row) => sum + row.amount, 0));
const ledger = { baseline: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dates, cutoff,
  sources, fundingPayments: payments, receiptMode: mode, actualReceipts, nonCashClosures, preservedMaturities, purchaseTotal, purchases };
fs.writeFileSync("tmp/processing-confina-20261030-ledger.json", `${JSON.stringify(ledger, null, 2)}\n`);
console.log(JSON.stringify({ receiptMode: mode, purchaseTotal, purchases: purchases.length, amortizations: dates.map((date) =>
  ({ date, total: round(payments.filter((row) => row.date === date).reduce((sum, row) => sum + row.amount, 0)) })) }));
