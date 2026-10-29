import fs from "node:fs";
import vm from "node:vm";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const json = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const write = (file, variable, value) => fs.writeFileSync(file, `window.${variable} = ${JSON.stringify(value, null, 2)};\n`);
const round = (value) => Math.round(value * 100) / 100;
const tradeDate = "2026-10-28";
const fundingId = "confina-cra-42a-59a-65a-out-2026";
const principal = 72553977.10;
const incoming = read("tmp/portfolio-confina-2026-10-28-raw-candidate.js");
const previous = read("data/portfolio/portfolio-confina.js");
const manual = read("data/portfolio/manual-portfolio-adjustments-confina.json");
const append = (event) => {
  assert.ok(!manual.events.some((row) => row.id === event.id), event.id);
  manual.events.push(event);
};
const context = vm.createContext({ console, Date, Intl, URLSearchParams,
  window: { location: { search: "" }, ceresFinanceEngineOnly: true },
  document: { getElementById: () => null, querySelectorAll: () => [] } });
for (const match of fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)/g)) {
  if (/^data\/(biological|pecuaria)\//.test(match[1])) continue;
  vm.runInContext(fs.readFileSync(match[1], "utf8"), context, { filename: match[1] });
}
const evaluate = (code) => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
const sellerAmounts = { "confina-cprf-100": 42355071.78, "confina-cprf-50": 15813972.33 };
const destination = incoming.operations.find((operation) => operation.operationId === fundingId);
assert.equal(destination.titles.length, 76);
const transfers = destination.titles.map((title) => {
  assert.equal(title.purchaseDate, tradeDate);
  const origins = incoming.operations.filter((operation) => operation.operationId !== fundingId)
    .flatMap((operation) => operation.titles.filter((row) => row.id === title.originalLastro).map((row) => ({ operationId: operation.operationId, title: row })));
  assert.ok(origins.length <= 1, `Origem ambigua ${title.id}`);
  if (!origins.length) {
    assert.equal(title.transferSourceVehicle, "CERES CONFINAMENTO LTDA");
    return { lastro: title.id, originalLastro: title.originalLastro, sourceOperationId: null,
      sourceName: title.transferSourceVehicle, value: title.acquisitionValue,
      reportedAcquisition: title.acquisitionValue, monthlyRate: title.discountRateMonthly };
  }
  const origin = origins[0];
  assert.ok(sellerAmounts[origin.operationId]);
  const source = structuredClone(origin.title);
  source.settledDate = "";
  source.settledWithoutDate = false;
  source.isActive = true;
  source.partialLiquidations = source.partialLiquidations.filter((event) => event.date < tradeDate);
  context.sourceTitle = source;
  const value = evaluate(`roundMoney(portfolioTitleValueAtDate(sourceTitle,'${tradeDate}','${tradeDate}'))`);
  const faceValue = evaluate(`roundMoney(portfolioTitleFaceValueAtDate(sourceTitle,'${tradeDate}','${tradeDate}'))`);
  const monthlyRate = evaluate("portfolioMonthlyRateDecimal(sourceTitle)");
  assert.ok(value > 0, `Origem sem VP ${title.id} <- ${source.id}: ${JSON.stringify({purchase:source.purchaseDate,eligible:source.portfolioEligible,status:source.titleStatus,face:source.faceValue,acquisition:source.acquisitionValue})}`);
  append({ id: `base-transferencia-42-59-65out-20261028-${title.id}`, operationId: fundingId,
    type: "title_override", titleId: title.id, acquisitionValue: value, faceValue, monthlyRate,
    rateSource: "taxa_origem_transferencia", controlReferenceLastro: title.originalLastro,
    allowPresentValueAboveFace: source.allowPresentValueAboveFace,
    note: "Base economica D0 calculada pelo motor na origem em 28/10, liquida das baixas anteriores. Sem VP do sistema, sem rateio e separada do caixa de cessao." });
  return { lastro: title.id, originalLastro: title.originalLastro, sourceOperationId: origin.operationId,
    value, reportedAcquisition: title.acquisitionValue, monthlyRate, faceValue };
});
for (const [operationId, amount] of Object.entries(sellerAmounts)) {
  append({ id: `venda-42-59-65out-20261028-${operationId}`, operationId, date: tradeDate,
    type: "portfolio_liquidation", mode: "replace_title_group_day_type", titleId: `venda-42-59-65out-28-${operationId}`,
    replaceTitleIds: transfers.filter((row) => row.sourceOperationId === operationId).map((row) => row.originalLastro), amount,
    note: "Entrada de caixa efetiva de 28/10 conforme usuario. Substitui somente os recebimentos dos titulos cedidos, sem duplicacao." });
}
append({ id: "compra-total-42-59-65out-20261028", operationId: fundingId, date: tradeDate,
  type: "portfolio_purchase", mode: "replace_title_group_day_type", titleId: "compra-total-42-59-65out-28",
  replaceTitleIds: destination.titles.map((title) => title.id), amount: principal,
  note: "Pagamento integral da nova cessao de 28/10, igual ao novo funding. Caixa D0 zero, sem confundir custo financeiro com VP economico." });
const canceledIds = ["555729", "555852"];
for (const titleId of canceledIds) append({ id: `cancelamento-autorizado-20261029-${titleId}`, operationId: "confina-cprf-100",
  type: "title_exclusion", titleId, note: "Usuario confirmou cancelamento e autorizou em 29/10 retirar desde a compra de 19/10, inclusive a saida gerencial de caixa. Sem registrar recebimento efetivo." });
manual.updatedAt = "2026-10-29";
manual.totals = { ...manual.totals, rows: manual.events.length,
  amount: round(manual.events.reduce((sum, event) => sum + Number(event.amount || 0), 0)) };
json("tmp/manual-portfolio-adjustments-20261028-candidate.json", manual);
execFileSync(path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"),
  ["scripts/import-confina-portfolio.py", ...read("tmp/audit-confina-20261028-raw.json").sources.slice(0, 12).map((row) => row.file),
    "--position-date", tradeDate, "--manual-adjustments", "tmp/manual-portfolio-adjustments-20261028-candidate.json",
    "--output", "tmp/portfolio-confina-2026-10-28-candidate.js"], { stdio: "inherit" });

const fundings = read("data/fundings/fundings-confina.js");
const funding = structuredClone(fundings.operations.find((operation) => operation.id === "confina-cra-42-65-setembro"));
Object.assign(funding, { id: fundingId, name: "Confina CRA 42a/59a/65a - Outubro/2026", shortName: "CRA 42/59/65 Out/26",
  positionDate: tradeDate, issueDate: tradeDate, visibleFromDate: tradeDate, fundingPrincipal: principal, fundingBalance: principal,
  fundingPrevious: 0, fundingMonthStart: 0, syntheticSub: 0, previousSyntheticSub: 0, monthStartSyntheticSub: 0,
  sourceSheets: ["CRA 42/59/65 Outubro/2026"], cash: 0, portfolioVp: 0, portfolioVn: 0 });
Object.assign(funding.fundingComponents[0], { componentId: "42-59-65-outubro-20261028", sheet: "CRA 42/59/65 Outubro/2026",
  operationLabel: "42/59/65-outubro", principal, startDate: tradeDate, issueDate: tradeDate,
  fundingBalance: principal, workbookBalanceAtPosition: principal, calculatedBalanceAtPosition: principal,
  fundingRate: 1.7, accrueOnStartDate: false, events: [], rateSchedule: [] });
assert.ok(!fundings.operations.some((operation) => operation.id === fundingId));
const insertionIndex = fundings.operations.findIndex((operation) => operation.id === "confina-cra-42-65-setembro") + 1;
fundings.operations.splice(insertionIndex, 0, funding);
fundings.positionDate = tradeDate;
fundings.exportedAt = new Date().toISOString();
write("tmp/fundings-confina-20261028-candidate.js", "ceresFundingData", fundings);

const rawPayments = [
  ["2026-10-26", "559953", "SL132026", 225728.09, 0],
  ["2026-10-26", "559955", "SL152026", 112256.22, 0],
  ["2026-10-26", "559950", "SL192026", 3918.53, 0],
  ["2026-10-26", "559930", "SL122026", 135203.55, 0],
  ["2026-10-26", "506763", "SL012026", 1683312.47, 0],
  ["2026-10-26", "506766", "SL052026", 3853.19, 0],
  ["2026-10-26", "506762", "SL032026", 993008.77, 0],
  ["2026-10-26", "506764", "SL022026", 183186.20, 0],
  ["2026-10-26", "506768", "SL052026", 55222.21, 0],
  ["2026-10-26", "485227", "FS752026", 230188.30, 0],
  ["2026-10-26", "484491", "FS762026", 1910003.50, 0],
  ["2026-10-26", "484637", "FS772026", 87430.12, 0],
  ["2026-10-26", "484638", "FS782026", 805374.62, 0],
  ["2026-10-26", "484641", "FS792026", 302157.43, 0],
  ["2026-10-26", "484642", "FS802026", 281043.16, 0],
  ["2026-10-26", "555616", "VR082026", 1918280.85, 0],
  ["2026-10-26", "547097", "VR092026", 2188900.75, 0],
  ["2026-10-26", "506749", "VR112026", 1377695.67, 0],
  ["2026-10-26", "547098", "VR102026", 819627.50, 0],
  ["2026-10-26", "506761", "VR122026", 86753.86, 0],
  ["2026-10-26", "506752", "VR132026", 296632.69, 0],
  ["2026-10-27", "484614", "GF992026", 578843.20, 4244.85],
  ["2026-10-27", "484615", "GF1002026", 159799.50, 1171.86],
  ["2026-10-27", "484617", "GF1012026", 160469.09, 0]
];
const mappedPayments = rawPayments.map(([date, realLastro, invoice, amortization, interestPaid]) => {
  const matches = incoming.operations.flatMap((operation) => operation.titles
    .filter((title) => title.invoice.split("-")[0] === invoice && title.purchaseDate <= date &&
      title.portfolioEligible && !title.settledWithoutDate && (!title.settledDate || title.settledDate >= date))
    .map((title) => ({ operationId: operation.operationId, title })));
  if (matches.length === 0 && /^GF(99|100|101)2026$/.test(invoice)) {
    return { operationId: "confina-cra-65-200", date, amount: round(amortization + interestPaid), amortization, interestPaid,
      realLastro, managerialLastro: null, invoice, allocationMethod: "same_real_65_issuance_as_previous_green_payments",
      note: `Amortizacao ${invoice}, lastro real ${realLastro}, em ${date}. Sem titulo gerencial aberto correspondente; pagamento do funding 65a 200MM, sem criar novo recebimento de carteira.` };
  }
  assert.equal(matches.length, 1, `Amortizacao sem vinculo unico: ${invoice} ${matches.map((row) => row.title.id)}`);
  const { operationId, title } = matches[0];
  const operation = fundings.operations.find((row) => row.id === operationId);
  const component = operation.fundingComponents.length > 1
    ? operation.fundingComponents.find((row) => row.startDate === title.purchaseDate)?.sheet : undefined;
  assert.ok(operation.fundingComponents.length === 1 || component, `Componente necessario ${title.id}`);
  return { operationId, ...(component ? { component } : {}), date, amount: round(amortization + interestPaid), amortization, interestPaid,
    realLastro, managerialLastro: title.id, invoice,
    note: `Amortizacao ${invoice}, lastro real ${realLastro}, em ${date}. Vinculo gerencial ${title.id}; contabilizar o pagamento uma unica vez.` };
});
const events = read("data/fundings/funding-events-confina.js");
const pm27 = { date: "2026-10-27", amount: 6262627.68, interestPaid: 3199.55, amortization: 6259428.13,
  allocationAuthorizedAt: "2026-10-29", actualSeparateFundingPayment: true };
const confirmedPayments = [
  { ...pm27, operationId: "confina-cra-42-65-setembro",
    note: "Pagamento efetivo da 42a em 27/10: PM156, PM157 e PM158, incluindo realocacao de R$ 389.309,03 ao PM155. Total mantido R$ 6.262.627,68. Usuario confirmou destino CRA 42/65 Setembro; recebimento da carteira contado uma unica vez." },
  { ...pm27, operationId: "confina-cras-carteira-50", component: "CRA Carteira 50mm 1 (1.8%)",
    note: "Segundo pagamento efetivo, da 59a, em 27/10. Usuario confirmou abatimento no CRA Carteira antigo duplicado, segregado no paralelo. Lastros gerenciais de origem 481207 a 481210, comprados em 16/06/2026: Carteira 50MM, componente 1. Sem duplicar recebimento de carteira ou incluir caixa reservado na lamina." },
  { operationId: "confina-cra-42-65-setembro", date: "2026-10-28", amount: 5322946.88, interestPaid: 20083.74,
    amortization: 5302863.14, allocationAuthorizedAt: "2026-10-29",
    note: "Pagamento PM152 e PM153, lastros reais 549902 e 549933, em 28/10. Usuario confirmou CRA 42/65 Setembro. Os titulos gerenciais 537448 e 537449 ja foram liquidados em 07/10; registrar apenas pagamento do funding, sem criar novo recebimento de carteira." }
];
for (const payment of [...mappedPayments, ...confirmedPayments]) events.events.push(payment);
events.updatedAt = "2026-10-29";
write("tmp/funding-events-confina-20261028-candidate.js", "ceresFundingManualEvents", events);
const sellers = Object.fromEntries(Object.entries(sellerAmounts).map(([id, cash]) => {
  const rows = transfers.filter((row) => row.sourceOperationId === id);
  const economicValue = round(rows.reduce((sum, row) => sum + row.value, 0));
  return [id, { titles: rows.length, economicValue, cashReceived: cash, saleResult: round(cash - economicValue) }];
}));
const economicValue = round(transfers.reduce((sum, row) => sum + row.value, 0));
const ledger = { date: tradeDate, fundingId, newFunding: principal, monthlyRate: 1.7, newFundingD0Cash: 0,
  economicValue, reportedAcquisitionTotal: round(transfers.reduce((sum, row) => sum + row.reportedAcquisition, 0)),
  newFundingGap: round(economicValue - principal), sellers,
  externalSeller: { controlled: false, name: "Ceres Confina LTDA", paid: 14384932.99, titles: transfers.filter((row) => !row.sourceOperationId).length },
  transfers, payments: [...mappedPayments, ...confirmedPayments], canceledIds, canceledPurchaseDate: "2026-10-19", cancellationAuthorizedAt: "2026-10-29",
  duplicatePortalPayments: { economicReceiptCount: 1, actualFundingPayments: 2, date: "2026-10-27", amountEach: pm27.amount,
    authorizedAt: "2026-10-29", targets: confirmedPayments.slice(0, 2).map((row) => ({ operationId: row.operationId, component: row.component || null })) },
  pending: [] };
json("tmp/processing-confina-20261028-ledger.json", ledger);
console.log(JSON.stringify({ ...ledger, transfers: undefined }, null, 2));
