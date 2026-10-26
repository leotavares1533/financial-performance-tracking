import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const write = (file, variable, data) => fs.writeFileSync(file, `window.${variable} = ${JSON.stringify(data, null, 2)};\n`);
const json = (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
const round = (value) => Math.round(value * 100) / 100;
const date = "2026-10-22", fundingId = "confina-cra-65-outubro", principal = 68761184.84;
const pmTarget = process.argv.find((arg) => arg.startsWith("--pm149-target="))?.split("=")[1] || "pending";
assert.ok(["pending", "42-65", "parallel-50"].includes(pmTarget));
const previous = read("data/portfolio/portfolio-confina.js");
const incoming = read("tmp/portfolio-confina-2026-10-23-raw-candidate.js");
const manual = read("data/portfolio/manual-portfolio-adjustments-confina.json");
const append = (event) => { assert.ok(!manual.events.some((row) => row.id === event.id), event.id); manual.events.push(event); };
const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)/g)].map((match) => match[1]).filter((file) => !/^data\/(biological|pecuaria)\//.test(file));
const context = vm.createContext({ console, Date, Intl, URLSearchParams,
  window: { location: { search: "" }, ceresFinanceEngineOnly: true }, document: { getElementById: () => null, querySelectorAll: () => [] } });
for (const file of files) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
const evaluate = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
const existingIds = new Set(previous.operations.find((op) => op.operationId === fundingId).titles.map((title) => title.id));
const additions = incoming.operations.find((op) => op.operationId === fundingId).titles.filter((title) => !existingIds.has(title.id));
assert.equal(additions.length, 74);
const sellerAmounts = { "confina-cprf-100": 21949525.76, "confina-cprf-50": 15959445.04, "confina-cra-42-50": 1649933.53 };
const transfers = [];
for (const title of additions) {
  assert.equal(title.purchaseDate, date);
  const matches = previous.operations.flatMap((op) => op.titles.filter((row) => row.id === title.originalLastro).map((row) => ({ operationId: op.operationId, title: row })));
  assert.ok(matches.length <= 1, `Origem ambigua ${title.id}`);
  if (!matches.length) {
    assert.equal(title.transferSourceVehicle, "CERES CONFINAMENTO LTDA");
    transfers.push({ lastro: title.id, originalLastro: title.originalLastro, sourceOperationId: null,
      sourceName: title.transferSourceVehicle, value: title.acquisitionValue, reportedAcquisition: title.acquisitionValue, monthlyRate: title.discountRateMonthly });
    continue;
  }
  const match = matches[0];
  assert.ok(sellerAmounts[match.operationId]);
  context.sourceTitle = match.title;
  const value = evaluate(`roundMoney(portfolioTitleValueAtDate(sourceTitle,'${date}','${date}'))`);
  const faceValue = evaluate(`roundMoney(portfolioTitleFaceValueAtDate(sourceTitle,'${date}','${date}'))`);
  const monthlyRate = evaluate("portfolioMonthlyRateDecimal(sourceTitle)");
  assert.ok(value > 0, `Origem sem VP ${title.id}`);
  append({ id: `base-transferencia-65out-20261022-${title.id}`, operationId: fundingId, type: "title_override", titleId: title.id,
    acquisitionValue: value, faceValue, monthlyRate, rateSource: "taxa_origem_transferencia", controlReferenceLastro: title.originalLastro,
    allowPresentValueAboveFace: match.title.allowPresentValueAboveFace,
    note: "VP economico calculado na origem em 22/10, liquido das baixas anteriores, como base D0. Sem VP do sistema nem rateio." });
  transfers.push({ lastro: title.id, originalLastro: title.originalLastro, sourceOperationId: match.operationId,
    value, reportedAcquisition: title.acquisitionValue, monthlyRate, faceValue });
}
for (const [operationId, amount] of Object.entries(sellerAmounts)) {
  append({ id: `venda-65out-20261022-${operationId}`, operationId, date, type: "portfolio_liquidation", mode: "replace_title_group_day_type",
    titleId: `venda-65out-22-${operationId}`, replaceTitleIds: transfers.filter((row) => row.sourceOperationId === operationId).map((row) => row.originalLastro), amount,
    note: "Entrada de caixa efetiva pela cessao de 22/10, conforme valor informado pelo usuario. Substitui somente os recebimentos dos titulos vendidos, sem duplicacao." });
}
append({ id: "compra-total-65out-20261022", operationId: fundingId, date, type: "portfolio_purchase", mode: "replace_title_group_day_type",
  titleId: "compra-total-65out-22", replaceTitleIds: additions.map((title) => title.id), amount: principal,
  note: "Pagamento integral da compra de 22/10, com novo funding no mesmo veiculo. Valor economico separado do custo financeiro; caixa do novo aporte D0 zero." });
const retroIds = ["549872", "555729", "555852"];
for (const titleId of retroIds) {
  const title = incoming.operations.find((op) => op.operationId === "confina-cprf-100").titles.find((row) => row.id === titleId);
  assert.ok(title);
  append({ id: `inclusao-retroativa-autorizada-20261026-${titleId}`, operationId: "confina-cprf-100", type: "title_override", titleId,
    purchaseDate: title.purchaseDate, purchaseDateSource: "inclusao_retroativa_autorizada_usuario", portfolioEligible: true,
    note: "Usuario autorizou em 26/10 incluir o registro que passou de pendente para em carteira e revisar os efeitos retroativos. Mantidos tambem os demais registros validos; risco de duplicidade informado." });
}
manual.updatedAt = "2026-10-26";
manual.totals = { ...manual.totals, rows: manual.events.length, amount: round(manual.events.reduce((sum, event) => sum + Number(event.amount || 0), 0)) };
json("tmp/manual-portfolio-adjustments-20261023-candidate.json", manual);
const csvSources = read("tmp/audit-confina-20261023-raw.json").sources.map((row) => row.file);
execFileSync(path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"),
  ["scripts/import-confina-portfolio.py", ...csvSources, "--position-date", "2026-10-23",
    "--manual-adjustments", "tmp/manual-portfolio-adjustments-20261023-candidate.json",
    "--output", "tmp/portfolio-confina-2026-10-23-candidate.js"], { stdio: "inherit" });
const fundings = read("data/fundings/fundings-confina.js");
const operation = fundings.operations.find((op) => op.id === fundingId);
assert.equal(operation.fundingComponents.length, 1);
assert.equal(operation.fundingComponents[0].principal, 75790266.29);
const originalComponent = structuredClone(operation.fundingComponents[0]);
operation.fundingComponents.push({ ...structuredClone(originalComponent), componentId: "65-outubro-aporte-20261022",
  sheet: "CRA 65a Outubro - Aporte 22/10/2026", operationLabel: "CRA 65a Out/26 - 22/10", principal,
  startDate: date, issueDate: date, fundingBalance: principal, workbookBalanceAtPosition: principal, calculatedBalanceAtPosition: principal,
  fundingRate: 1.7, baseDays: 360, accrueOnStartDate: false, events: [], rateSchedule: [] });
operation.fundingPrincipalByComponentDate = true;
operation.requireFundingComponentOnPayments = true;
operation.fundingPrincipal = round(originalComponent.principal + principal);
operation.sourceSheets = operation.fundingComponents.map((component) => component.sheet);
fundings.positionDate = "2026-10-23";
fundings.exportedAt = new Date().toISOString();
write("tmp/fundings-confina-20261023-candidate.js", "ceresFundingData", fundings);
const fundingEvents = read("data/fundings/funding-events-confina.js");
const payments = [
  { operationId: "confina-cra-65-200", date: "2026-10-23", amount: 2032746.88, interestPaid: 10935.52, amortization: 2021811.36,
    note: "Amortizacao Green Farming GF98/GF99, conforme demonstrativo de 23/10, lastros reais 484612 e 484614." },
  { operationId: "confina-cra-65-200", date: "2026-10-23", amount: 5364005.73, interestPaid: 2779.92, amortization: 5361225.81,
    note: "Amortizacao Ramax RX55 a RX62 de 23/10. Total do comprovante R$ 5.364.005,73; diferenca de R$ 0,01 frente a soma dos juros por linha, preservado o total informado." }
];
if (pmTarget !== "pending") payments.push({ operationId: pmTarget === "42-65" ? "confina-cra-42-65-setembro" : "confina-cras-carteira-50",
  ...(pmTarget === "parallel-50" ? { component: "CRA Carteira 50mm 1 (1.8%)" } : {}),
  date: "2026-10-23", amount: 890795.01, interestPaid: 2073.68, amortization: 888721.33,
  note: "Amortizacao PM1492026-1-1, lastro real 549901, conforme demonstrativo de 23/10; destino confirmado pelo usuario em 26/10." });
for (const payment of payments) {
  assert.ok(!fundingEvents.events.some((row) => row.date === payment.date && row.operationId === payment.operationId && row.note === payment.note));
  fundingEvents.events.push(payment);
}
fundingEvents.updatedAt = "2026-10-26";
write("tmp/funding-events-confina-20261023-candidate.js", "ceresFundingManualEvents", fundingEvents);
const sellers = Object.fromEntries(Object.entries(sellerAmounts).map(([id, cash]) => {
  const rows = transfers.filter((row) => row.sourceOperationId === id);
  const value = round(rows.reduce((sum, row) => sum + row.value, 0));
  return [id, { count: rows.length, economicValue: value, cashReceived: cash, saleResult: round(cash - value) }];
}));
const economicValue = round(transfers.reduce((sum, row) => sum + row.value, 0));
const ledger = { date, fundingId, originalComponent, newFunding: principal, monthlyRate: 1.7, totalFundingPrincipal: operation.fundingPrincipal,
  economicValue, newContributionGap: round(economicValue - principal), initialIncrementalCash: 0,
  sellers, externalSeller: { controlled: false, name: "Ceres Confina LTDA", paid: 29202280.51, count: transfers.filter((row) => !row.sourceOperationId).length },
  transfers, payments, pm149Target: pmTarget, pendingPm149: pmTarget === "pending", authorizedRetroactiveTitleIds: retroIds,
  ramaxPaymentRoundingDifference: -0.01 };
json("tmp/processing-confina-20261023-ledger.json", ledger);
console.log(JSON.stringify({ ...ledger, originalComponent: undefined, transfers: undefined }, null, 2));
