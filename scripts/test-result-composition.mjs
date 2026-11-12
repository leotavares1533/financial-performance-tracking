import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context = vm.createContext({ console, Date, Intl, URLSearchParams,
  window: { location: { search: '' }, ceresFinanceEngineOnly: true },
  document: { getElementById: () => null, querySelectorAll: () => [] } });
for (const file of ['data/fundings/fundings-confina.js', 'data/fundings/funding-events-confina.js',
  'data/portfolio/partnership-titles-confina.js', 'data/portfolio/portfolio-confina-frozen-2026-10-02.js',
  'data/portfolio/portfolio-confina.js', 'data/indices/di.js', 'data/cash/cash-events-confina.js',
  'data/management/presentation-policy-confina.js', 'data/management/position-reconciliation-confina.js', 'assets/app.js']) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}
const evaluate = code => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
const results = [];
for (const date of ['2026-09-30', '2026-10-19', '2026-10-20', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-10']) {
  const row = evaluate(`(() => {
    state.dateKey='${date}'; recalculateFundingPositions();
    const scope = laminaOperationsForDate();
    return { date: state.dateKey, ...managementResultComposition(scope),
      sourceSub: roundMoney(scope.reduce((sum,o)=>sum+o.syntheticSub,0)),
      sourceFunding: roundMoney(scope.reduce((sum,o)=>sum+o.fundingBalance,0)),
      operationIds: scope.map(o=>o.id) };
  })()`);
  assert.equal(row.assets, Math.round((row.portfolio + row.cash) * 100) / 100);
  assert.equal(row.beforeAdjustments, Math.round((row.assets - row.liabilities) * 100) / 100);
  assert.equal(row.sub, row.sourceSub, `Sub must match the existing closing: ${date}`);
  assert.equal(row.liabilities, row.sourceFunding);
  if (date >= '2026-10-20') {
    assert.ok(!row.operationIds.includes('confina-cras-carteira-100'));
    assert.ok(!row.operationIds.includes('confina-cras-carteira-50'));
  }
  results.push(row);
}
const current = results.at(-1);
assert.equal(current.portfolio, 841160914.75);
assert.equal(current.cash, 18245616.33);
assert.equal(current.assets, 859406531.08);
assert.equal(current.liabilities, 842498055.96);
assert.equal(current.beforeAdjustments, 16908475.12);
assert.equal(current.adjustments, 3072102.83);
assert.equal(current.sub, 19980577.95);
const btg100 = evaluate("managementResultComposition([operations.find(o=>o.id==='confina-cprf-100')])");
assert.equal(btg100.cash, -10439403.72, 'Negative cash must not be concealed.');
assert.equal(btg100.adjustments, 1108934.48);
assert.equal(btg100.sub, 7860963.10);
const empty = evaluate('managementResultComposition([])');
assert.ok(Object.values(empty).every(n => n === 0));
console.log(JSON.stringify({ historicalDatesChecked: results.length, current, negativeCashScope: btg100 }, null, 2));
