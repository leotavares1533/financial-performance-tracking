import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const output = path.resolve('../outputs/publicacao-conciliacao-20261110');
const baseline = JSON.parse(fs.readFileSync(path.join(output, 'baseline-before-publication.json'), 'utf8'));
const approved = JSON.parse(fs.readFileSync('../outputs/analise-funding-20261110-20261112/simulacao-premio-sub-3mm-20261110.json', 'utf8'));
const round = n => Math.round(n * 100) / 100;
const ctx = vm.createContext({console, Date, Intl, URLSearchParams,
  window: {location: {search: ''}, ceresFinanceEngineOnly: true, ceresParallelControlEngineOnly: true},
  document: {getElementById: () => null, querySelectorAll: () => []}});
for (const file of ['data/fundings/fundings-confina.js', 'data/fundings/funding-events-confina.js',
  'data/portfolio/partnership-titles-confina.js', 'data/portfolio/portfolio-confina-frozen-2026-10-02.js',
  'data/portfolio/portfolio-confina.js', 'data/indices/di.js', 'data/cash/cash-events-confina.js',
  'data/management/presentation-policy-confina.js', 'data/management/position-reconciliation-confina.js', 'assets/app.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, {filename: file});
}
const evaluate = code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)));
const positions = date => evaluate(`(()=>{state.dateKey='${date}';recalculateFundingPositions();
  return [...operations,operatingCashOperation].filter(Boolean).map(o=>({id:o.id,
    portfolio:o.portfolioVp,cash:o.cash,funding:o.fundingBalance,adjustment:o.syntheticAdjustment,sub:o.syntheticSub}));})()`);
for (const day of baseline.history) assert.deepEqual(positions(day.date), day.rows, `Closed history changed: ${day.date}`);
console.log(`Unchanged: ${baseline.history.length} historical calendar closings`);
const rows = positions('2026-11-10');
for (const expected of approved.rows) {
  const actual = rows.find(o => o.id === expected.id);
  for (const key of ['portfolio', 'cash', 'funding', 'adjustment', 'sub']) assert.equal(actual[key], expected[key], `${expected.id} ${key}`);
}
const totals = Object.fromEntries(['portfolio', 'cash', 'funding', 'adjustment', 'sub'].map(key => [key,
  round(approved.rows.filter(o => o.scope === 'lamina').reduce((s, o) => s + rows.find(r => r.id === o.id)[key], 0))]));
assert.deepEqual(totals, approved.lamina);
const dayResult = evaluate("roundMoney(laminaOperationsForDate().reduce((s,o)=>s+syntheticResultBetween(o,'2026-11-09','2026-11-10'),0))");
const oldDayResult = round(baseline.closing.filter(o => approved.rows.some(a => a.id === o.id && a.scope === 'lamina'))
  .reduce((s, o) => s + o.sub - baseline.history.at(-1).rows.find(p => p.id === o.id).sub, 0));
assert.equal(dayResult, oldDayResult, 'Closing adjustments and distribution must not become daily yield.');
const distribution = evaluate("roundMoney(positionReconciliation.capitalDistributions.reduce((s,e)=>s+e.amount,0))");
assert.equal(distribution, 3000000);
assert.equal(evaluate("fundingCashInflowAtDate(operations.find(o=>o.id==='confina-cra-65-200'),'2026-11-10')"), 0);
for (const projection of approved.cash50Policy.dailyProjection) {
  const actual = evaluate(`({split:reservedCash50AtDate('${projection.date}'),
    operatingCash:cashBalanceAtDate(operatingCashOperation,'${projection.date}'),
    reserve:cashBalanceAtDate(operations.find(o=>o.id==='confina-cras-carteira-50'),'${projection.date}')})`);
  assert.equal(actual.split.funding, projection.funding, `Funding50 ${projection.date}`);
  assert.equal(actual.split.netOperatingCash, projection.netOperatingCash, `Net cash50 ${projection.date}`);
  assert.equal(actual.operatingCash, projection.totalOperatingCash, `Operating cash ${projection.date}`);
  assert.equal(actual.reserve, projection.funding);
}
// A real payment reduces gross backing and debt together; no second gain is released.
const repayment = evaluate(`(()=>{
  const op=operations.find(o=>o.id==='confina-cras-carteira-50');
  const before=reservedCash50AtDate('2026-11-12');
  const components=op.fundingComponents;
  const originals=components.map(c=>c._eventAmountByDate.get('2026-11-12'));
  components.forEach(c=>{
    c._eventAmountByDate.set('2026-11-12',calculateComponentBalance(c,'2026-11-12'));
    c.events.push({date:'2026-11-12',amount:calculateComponentBalance(c,'2026-11-12'),testOnly:true});
    c._balanceCache.delete('2026-11-12');
  });
  op._reservedCashCache.delete('2026-11-12');
  const after=reservedCash50AtDate('2026-11-12');
  components.forEach((c,i)=>{
    c.events=c.events.filter(e=>!e.testOnly);
    if(originals[i]===undefined)c._eventAmountByDate.delete('2026-11-12');
    else c._eventAmountByDate.set('2026-11-12',originals[i]);
    c._balanceCache.delete('2026-11-12');
  });
  op._reservedCashCache.delete('2026-11-12');
  return {before,after};
})()`);
assert.equal(repayment.after.funding, 0);
assert.equal(repayment.after.netOperatingCash, repayment.before.netOperatingCash);
for (const [file, hash] of Object.entries(baseline.protectedHashes)) {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'), hash, `Source changed: ${file}`);
}
for (const file of ['../outputs/controle-paralelo-confina/posicoes.js', '../outputs/controle-paralelo-confina/controle.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, {filename: file});
}
const oldCtx = vm.createContext({window: {}});
vm.runInContext(baseline.privatePositions, oldCtx);
for (const day of oldCtx.window.ceresParallelManagementData.positions.filter(p => p.dateKey < '2026-11-10')) {
  assert.deepEqual(evaluate(`parallelPositionsAtDate('${day.dateKey}')`), JSON.parse(JSON.stringify(day.accounts)));
}
const parallel = evaluate("parallelDayTotals('2026-11-10')");
assert.equal(parallel.cash, approved.parallel.cash);
assert.equal(parallel.debt, approved.parallel.funding);
assert.equal(parallel.difference, 0);
if (process.argv.includes('--freeze-parallel')) {
  const data = evaluate('window.ceresParallelManagementData');
  const accounts = evaluate("parallelComputeDay('2026-11-10')");
  data.positions = data.positions.filter(p => p.dateKey !== '2026-11-10');
  data.positions.push({dateKey: '2026-11-10', status: 'approved_reconciled_closing', accounts});
  data.positions.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  data.reconciledClosing = {date: '2026-11-10', old100CashAndDebt: 0,
    cash50: 'Reserved cash equals accrued debt; net cash already released to operating cash.',
    priorClosingsPreservedThrough: '2026-11-09'};
  fs.writeFileSync('../outputs/controle-paralelo-confina/posicoes.js',
    'window.ceresParallelManagementData = ' + JSON.stringify(data, null, 2) + ';\n');
}
fs.writeFileSync(path.join(output, 'verified-closing.json'), JSON.stringify({preservedDays: baseline.history.length,
  rows, totals, distribution, dayResult, parallel, repayment, protectedSourceFiles: Object.keys(baseline.protectedHashes).length}, null, 2) + '\n');
console.log(JSON.stringify({totals, dayResult, distribution, parallel, preservedDays: baseline.history.length}, null, 2));
