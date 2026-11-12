import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const output = path.resolve('../outputs/publicacao-conciliacao-20261110');
const source = path.resolve('../outputs/analise-funding-20261110-20261112');
const date = '2026-11-10';
const round = n => Math.round(n * 100) / 100;
const approvedFile = path.join(source, 'simulacao-premio-sub-3mm-20261110.json');
const approved = JSON.parse(fs.readFileSync(approvedFile, 'utf8'));
const fundingInput = JSON.parse(fs.readFileSync(path.join(source, 'simulacao.json'), 'utf8'));
const files = ['data/fundings/fundings-confina.js', 'data/fundings/funding-events-confina.js',
  'data/portfolio/partnership-titles-confina.js', 'data/portfolio/portfolio-confina-frozen-2026-10-02.js',
  'data/portfolio/portfolio-confina.js', 'data/indices/di.js', 'data/cash/cash-events-confina.js',
  'data/management/presentation-policy-confina.js', 'assets/app.js'];
fs.mkdirSync(output, {recursive: true});
const baselineFile = path.join(output, 'baseline-before-publication.json');
let baseline;
if (fs.existsSync(baselineFile)) {
  baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
} else {
  assert.ok(!fs.existsSync('data/management/position-reconciliation-confina.js'), 'Capture the original closing first.');
  const ctx = vm.createContext({console, Date, Intl, URLSearchParams,
    window: {location: {search: ''}, ceresFinanceEngineOnly: true},
    document: {getElementById: () => null, querySelectorAll: () => []}});
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, {filename: f});
  const evaluate = code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)));
  const positions = key => evaluate(`(()=>{state.dateKey='${key}';recalculateFundingPositions();
    return [...operations,operatingCashOperation].filter(Boolean).map(o=>({id:o.id,
      portfolio:o.portfolioVp,cash:o.cash,funding:o.fundingBalance,adjustment:o.syntheticAdjustment,sub:o.syntheticSub}));})()`);
  const history = [];
  const dates = evaluate("calendarDatesBetween('2026-04-01','2026-11-09')");
  for (const key of dates) {
    history.push({date: key, rows: positions(key)});
    if (history.length % 30 === 0) console.log(`Preserved ${history.length}/${dates.length} calendar closings`);
  }
  const protectedFiles = [...files.filter(f => f !== 'assets/app.js'),
    ...fs.readdirSync('data/biological').filter(f => f.endsWith('.js')).map(f => `data/biological/${f}`)];
  baseline = {history, closing: positions(date),
    components: evaluate('operations.map(o=>({id:o.id,components:o.fundingComponents.map(c=>({sheet:c.sheet,startDate:c.startDate||c.issueDate}))}))'),
    protectedHashes: Object.fromEntries(protectedFiles.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),
    privatePositions: fs.readFileSync('../outputs/controle-paralelo-confina/posicoes.js', 'utf8')};
  fs.writeFileSync(baselineFile, JSON.stringify(baseline, null, 2) + '\n');
  for (const f of ['assets/app.js', 'index.html', '../outputs/controle-paralelo-confina/controle.js', '../outputs/controle-paralelo-confina/index.html']) {
    fs.copyFileSync(f, path.join(output, path.basename(f) + '.before'));
  }
}
const capitalDistributions = approved.capitalDistributions.flatMap(event => event.allocations.map(a => ({
  id: `${event.id}-${a.id}`, groupId: event.id, operationId: a.id, date: event.date,
  amount: a.distribution, type: 'subordinated_distribution'
})));
const operationClosings = approved.rows.map(row => {
  const old = baseline.closing.find(o => o.id === row.id);
  assert.ok(old, row.id);
  const distribution = capitalDistributions.filter(e => e.operationId === row.id).reduce((s, e) => s + e.amount, 0);
  return {operationId: row.id, scope: row.scope, cashBeforeDistribution: round(row.cash + distribution),
    cash: row.cash, portfolio: row.portfolio, funding: row.funding, adjustment: row.adjustment, sub: row.sub,
    equityReconciliation: round(row.sub + distribution - old.sub)};
});
const fundingAnchors = baseline.components.flatMap(op => {
  const target = approved.rows.find(o => o.id === op.id);
  if (!target) return [];
  const detail = fundingInput.details.find(o => o.id === op.id);
  return op.components.map((component, index) => {
    const sources = (detail?.parts || []).filter(p => p.component === index);
    const balance = op.id === 'confina-cras-carteira-100' ? 0
      : op.id === 'confina-cra-42-novembro' ? target.funding
      : round(sources.reduce((s, p) => s + p.amountAtCommonDate, 0));
    return {operationId: op.id, component: index, sheet: component.sheet,
      startDate: component.startDate, date, balance, sources};
  });
});
for (const row of approved.rows.filter(o => o.id !== 'confina-caixa-operacao')) {
  assert.equal(round(fundingAnchors.filter(a => a.operationId === row.id).reduce((s, a) => s + a.balance, 0)), row.funding);
}
const data = {
  id: 'fechamento-conciliado-20261110', effectiveDate: date, preserveThrough: '2026-11-09',
  status: 'APPROVED', sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(approvedFile)).digest('hex'),
  recognition: 'Closing balance reconciliation, not a new bank receipt, contribution or financial yield. Historical source dates remain audit metadata.',
  operationClosings, fundingAnchors, capitalDistributions,
  removedSyntheticAdjustmentIds: approved.removedCompensation.map(e => e.manualAdjustmentId),
  titleSettlements: approved.prospectiveSettlements.map(t => ({operationId: 'confina-cra-65-200',
    titleId: t.id, invoice: t.invoice, effectiveDate: date, sourceSettlementDate: t.sourceSettlementDate,
    finalReceipt: t.finalReceipt})),
  cash50Policy: {effectiveDate: date, operationId: 'confina-cras-carteira-50',
    operatingOperationId: 'confina-caixa-operacao', grossBackingAtReference: approved.cash50Policy.grossBackingAtReference,
    initialNetOperatingCash: approved.cash50Policy.initialNetOperatingCash},
  audit: {removedCompensation: approved.removedCompensation, sourceReceipts: approved.addedCashEntries,
    revisions: approved.revisions, priorReconciliation: approved.priorReconciliationAudit,
    reclassification42ToOld100: 6759077.99, transferOld100To65: 2294381.22,
    invalidOld100CashRemoved: 14264468.90, fundingNovember: 'Keep official balance; external control is incomplete.'},
  totals: {lamina: approved.lamina, parallel: approved.parallel, combined: approved.total}
};
assert.equal(data.removedSyntheticAdjustmentIds.length, 3);
assert.ok(data.removedSyntheticAdjustmentIds.every(Boolean));
assert.equal(round(capitalDistributions.reduce((s, e) => s + e.amount, 0)), 3000000);
assert.equal(round(operationClosings.filter(o => o.scope === 'lamina').reduce((s, o) => s + o.equityReconciliation, 0)), 3258102.14);
fs.writeFileSync('data/management/position-reconciliation-confina.js',
  'window.ceresPositionReconciliation = ' + JSON.stringify(data, null, 2) + ';\n');
console.log(JSON.stringify({preservedCalendarDays: baseline.history.length, anchors: fundingAnchors.length,
  settlements: data.titleSettlements.length, totals: data.totals}, null, 2));
