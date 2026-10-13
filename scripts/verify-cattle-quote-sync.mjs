import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const quoteArg = process.argv.indexOf("--quotes");
const candidate = quoteArg >= 0 ? process.argv[quoteArg + 1] : "data/pecuaria/cotacoes-pecuaria-latest.js";
const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map((match) => match[1]);
const evalJson = (app, code) => JSON.parse(JSON.stringify(vm.runInContext(code, app.context)));

function loadApp(previous) {
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, { innerHTML: "", textContent: "", value: "", dataset: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
    return elements.get(id);
  };
  const context = vm.createContext({ console, URLSearchParams, Date, Intl, window: { location: { search: "" }, print() {} }, document: { getElementById, querySelectorAll: () => [], activeElement: null } });
  for (const file of files) {
    let source = previous
      ? execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      : fs.readFileSync(file === "data/pecuaria/cotacoes-pecuaria-latest.js" ? candidate : file, "utf8");
    if (file === "assets/app.js") source = source.replace(/\brender\(\);\s*$/, "");
    vm.runInContext(source, context, { filename: file });
  }
  return { context, elements };
}

function position(app, date) {
  return evalJson(app, `guaranteeOperations('${date}').map(op => {
    const cash = op.biologicalOnly ? 0 : cashBalanceAtDate(op, '${date}');
    const funding = op.biologicalOnly ? 0 : fundingBalanceAtDate(op, '${date}');
    const g = guaranteeSummary({ ...op, cash, fundingBalance: funding }, '${date}');
    return { id: op.id, name: op.shortName, controlled: !op.biologicalOnly,
      vp: op.biologicalOnly ? 0 : roundMoney(operationPortfolioPositionAtDate(op, '${date}').portfolioVp), cash, funding,
      heads: g.totalHeads, transitHeads: g.transitHeads, purchasedHeads: g.purchasedTransitHeads,
      weight: g.totalWeightKg, transitWeight: g.transitWeightKg, purchasedWeight: g.purchasedTransitWeightKg,
      guarantee: roundMoney(g.coverageValue), biological: roundMoney(g.value + g.transitValue + g.purchasedTransitValue), quote: g.quoteSource };
  })`);
}

const before = loadApp(true);
const after = loadApp(false);
const closedDates = ["2026-09-27", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"];
for (const date of closedDates) assert.deepEqual(position(after, date), position(before, date), `Data fechada alterada: ${date}`);

const impacts = [];
for (const date of ["2026-10-07", "2026-10-08", "2026-10-09"]) {
  const original = position(before, date);
  const updated = position(after, date);
  const operations = updated.map((row) => {
    const old = original.find((item) => item.id === row.id);
    assert.ok(old, `Veiculo adicionado pela cotacao: ${row.id}`);
    for (const key of ["vp", "cash", "funding", "heads", "transitHeads", "purchasedHeads", "weight", "transitWeight", "purchasedWeight"]) assert.equal(row[key], old[key], `Cotacao alterou ${date} ${row.id} ${key}`);
    return { ...row, previousGuarantee: old.guarantee, delta: Math.round((row.guarantee - old.guarantee) * 100) / 100 };
  });
  const quoteCounts = evalJson(after, `quoteRowsForDate('${date}').reduce((counts, row) => ({...counts, [row.map_type]: (counts[row.map_type] || 0) + 1}), {})`);
  assert.deepEqual(quoteCounts, { regional_map: 27, replacement_grid: 192, mt_bulletin: 12 });
  assert.deepEqual(evalJson(after, `Array.from(new Set(guaranteeRegionalQuoteRows('${date}').map(r => r.quote_date)))`), [date]);
  const replacement = evalJson(after, `quoteRowsForDate('${date}').filter(r => r.map_type === 'replacement_grid')`);
  assert.ok(replacement.every((row) => row.column_index >= 1 && row.column_index <= 8 && row.row_index >= 1));
  evalJson(after, `state.dateKey='${date}'; renderQuotesValidation(); true`);
  assert.ok(!/NaN|undefined|Infinity/.test(after.elements.get("quotes-regional-matrix").innerHTML));
  const totals = (rows) => rows.reduce((sum, row) => sum + row.guarantee, 0);
  impacts.push({ date, before: Math.round(totals(original) * 100) / 100, after: Math.round(totals(updated) * 100) / 100, operations });
}

for (const [date, expected] of [["2026-10-07", 376.13], ["2026-10-08", 378.3], ["2026-10-09", 378.5]]) {
  assert.equal(evalJson(after, `regionalQuote('boi', 'SP', guaranteeRegionalQuoteRows('${date}')).price`), expected);
}
const exactDateValues = position(after, "2026-10-08");
evalJson(after, "quoteSnapshot.rows.push({quote_date:'2099-01-01',product:'boi_gordo',category:'boi',map_type:'regional_map',region:'SP',price:999999}); guaranteeRegionalQuoteCache.clear(); true");
assert.deepEqual(position(after, "2026-10-08"), exactDateValues, "Cotacao futura vazou para o passado");
assert.ok(evalJson(after, "guaranteeRegionalQuoteRows('2026-10-10').every(row => row.quote_date <= '2026-10-10')"));

fs.mkdirSync("tmp", { recursive: true });
fs.writeFileSync("tmp/cattle-quote-sync-impact.json", JSON.stringify({ closedDatesPreserved: closedDates, impacts }, null, 2));
console.log(JSON.stringify({ closedDatesPreserved: closedDates, impacts: impacts.map(({ date, before, after }) => ({ date, before, after, delta: Math.round((after - before) * 100) / 100 })) }, null, 2));
