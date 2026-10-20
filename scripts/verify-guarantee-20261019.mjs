import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const baseline = "9de8724";
const candidate = process.argv.includes("--candidate");
const date = "2026-10-19";
const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map(match => match[1]);
const previousSource = file => execFileSync("git", ["show", `${baseline}:${file}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const parse = source => JSON.parse(source.replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const candidateBio = "tmp/biological-assets-confina-20261019-candidate.js";
const candidateQuotes = "tmp/cotacoes-pecuaria-20261019-candidate.js";
const bioFile = "data/biological/biological-assets-confina.js";
const historyFile = "data/biological/biological-assets-history-confina.js";
const quotesFile = "data/pecuaria/cotacoes-pecuaria-latest.js";
const previousHistory = parse(previousSource(historyFile));
const previousCurrent = parse(previousSource(bioFile));
const effectivePreviousSnapshots = previousHistory.snapshots.map(snapshot => snapshot.referenceDate === previousCurrent.referenceDate ? previousCurrent : snapshot);
const previousQuotes = parse(previousSource(quotesFile));
const currentBio = parse(fs.readFileSync(candidate ? candidateBio : bioFile, "utf8"));
const currentHistory = candidate
  ? { ...previousHistory, snapshots: [...effectivePreviousSnapshots, currentBio] }
  : parse(fs.readFileSync(historyFile, "utf8"));
const currentQuotes = parse(fs.readFileSync(candidate ? candidateQuotes : quotesFile, "utf8"));

assert.equal(currentBio.referenceDate, date);
assert.equal(currentBio.quoteDate, date);
assert.ok(currentBio.sourceFile.endsWith("relatorio_GERANIMAL02 (20).csv"));
assert.ok(currentBio.purchasedTransitSourceFile.endsWith("Relatório de 42_2026-10-20T19_59_17.484Z.csv"));
assert.deepEqual(currentBio.liveStatusFilter, ["PROCESSADO", "EM PROCESSAMENTO"]);
for (const snapshot of effectivePreviousSnapshots) {
  assert.deepEqual(currentHistory.snapshots.find(row => row.referenceDate === snapshot.referenceDate), snapshot, `Composicao historica alterada: ${snapshot.referenceDate}`);
}
assert.equal(currentHistory.snapshots.length, previousHistory.snapshots.length + 1);
assert.deepEqual(currentQuotes.frozenGuaranteeQuotes, previousQuotes.frozenGuaranteeQuotes);
assert.deepEqual(currentQuotes.historyRows.filter(row => row.quote_date < date), previousQuotes.historyRows);
assert.equal(currentQuotes.rows.length, 27);
assert.ok(currentQuotes.rows.every(row => row.quote_date === date && row.map_type === "regional_map"));
for (const category of ["boi", "vaca", "novilha"]) {
  const rows = currentQuotes.rows.filter(row => row.category === category);
  assert.equal(rows.length, 9);
  assert.equal(new Set(rows.map(row => row.region)).size, 9);
}
const protectedFiles = files.filter(file => ![bioFile, historyFile, quotesFile].includes(file));
for (const file of protectedFiles) {
  assert.equal(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"), previousSource(file).replace(/\r\n/g, "\n"), `Arquivo financeiro ou regra alterada: ${file}`);
}

function loadApp(previous) {
  const elements = new Map();
  const getElementById = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: "", textContent: "", value: "", dataset: {}, classList: { toggle() {} }, setAttribute() {}, addEventListener() {} });
    return elements.get(id);
  };
  const context = vm.createContext({ console, Date, Intl, URLSearchParams, window: { location: { search: "" }, print() {} }, document: { getElementById, querySelectorAll: () => [], activeElement: null } });
  for (const file of files) {
    let source = previous ? previousSource(file) : fs.readFileSync(file, "utf8");
    if (!previous && candidate) {
      if (file === bioFile) source = fs.readFileSync(candidateBio, "utf8");
      if (file === quotesFile) source = fs.readFileSync(candidateQuotes, "utf8");
      if (file === historyFile) source = `window.ceresBiologicalAssetsHistory = ${JSON.stringify(currentHistory)};`;
    }
    if (file === "assets/app.js") source = source.replace(/\brender\(\);\s*$/, "");
    vm.runInContext(source, context, { filename: file });
  }
  return { context, elements };
}
const evaluate = (app, code) => JSON.parse(JSON.stringify(vm.runInContext(code, app.context)));
const before = loadApp(true);
const after = loadApp(false);
function financial(app, day) {
  return evaluate(app, `operations.map(op => ({id:op.id, vp:roundMoney(operationPortfolioPositionAtDate(op,'${day}').portfolioVp), cash:cashBalanceAtDate(op,'${day}'), funding:fundingBalanceAtDate(op,'${day}'), adjustment:operationSyntheticAdjustmentBalanceAtDate(op,'${day}')}))`);
}
function guarantees(app, day) {
  return evaluate(app, `guaranteeOperations('${day}').map(op => {
    const cash=op.biologicalOnly?0:cashBalanceAtDate(op,'${day}');
    const funding=op.biologicalOnly?0:fundingBalanceAtDate(op,'${day}');
    const g=guaranteeSummary({...op,cash,fundingBalance:funding},'${day}');
    return {id:op.id,name:op.shortName,controlled:!op.biologicalOnly,heads:g.totalHeads,weight:Math.round(g.totalWeightKg*1e4)/1e4,value:roundMoney(g.value),transitHeads:g.transitHeads,transitWeight:Math.round(g.transitWeightKg*1e4)/1e4,transitValue:roundMoney(g.transitValue),purchasedHeads:g.purchasedTransitHeads,purchasedValue:roundMoney(g.purchasedTransitValue),cash,funding,total:roundMoney(g.coverageValue),coverage:g.coverage,quote:g.quoteSource};
  })`);
}
const closedDates = [...new Set([...previousHistory.snapshots.map(snapshot => snapshot.referenceDate), "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-18"])].sort();
for (const day of closedDates) {
  assert.deepEqual(guarantees(after, day), guarantees(before, day), `Garantia fechada alterada: ${day}`);
  assert.deepEqual(financial(after, day), financial(before, day), `Posicao financeira alterada: ${day}`);
}
assert.deepEqual(financial(after, date), financial(before, date));
assert.equal(evaluate(after, `biologicalAssetDataForDate('${date}').referenceDate`), date);
assert.equal(evaluate(after, `guaranteeSnapshotLabel('${date}')`), "Garantia 19/10/2026");
assert.deepEqual(evaluate(after, `Array.from(new Set(guaranteeRegionalQuoteRows('${date}').map(row=>row.quote_date)))`), [date]);
const lots = evaluate(after, `guaranteeOperations('${date}').flatMap(op=>['lots','transitLots','purchasedTransitLots'].flatMap(key=>guaranteeLots(op,key,key,'${date}').map(lot=>({id:op.id,bucket:key,heads:lot.heads,weight:lot.averageWeightKg,value:lot.value,guaranteeValue:lot.guaranteeValue,factor:lot.guaranteeFactor,partnership:lot.isPartnershipGuarantee,quoteDate:lot.quoteDate}))))`);
assert.ok(lots.length > 0);
assert.ok(lots.some(lot => lot.partnership));
for (const lot of lots) {
  assert.ok(lot.heads >= 0 && lot.weight >= 0);
  assert.equal(lot.factor, lot.partnership ? 0.5 : 1);
  assert.ok(Math.abs(lot.guaranteeValue - lot.value * lot.factor) < 0.001);
  assert.equal(lot.quoteDate, date);
  assert.ok(!["biologico-sem-veiculo", "biologico-comprado-transito-sem-carteira"].includes(lot.id));
}
const positionsBefore = guarantees(before, date);
const positions = guarantees(after, date);
assert.ok(positions.find(row => row.id === "confina-cra-65-outubro").heads > 0);
assert.ok(positions.find(row => row.id === "biologico-confina-fidc" && !row.controlled));
evaluate(after, `state.dateKey='${date}';render();true`);
for (const id of ["result-table", "guarantee-management-table", "guarantee-management-print-table", "quotes-regional-matrix"]) {
  assert.ok(!/NaN|Infinity|undefined/.test(after.elements.get(id).innerHTML), `Valor invalido na tela: ${id}`);
}
assert.ok(after.elements.get("guarantee-management-table").innerHTML.includes("CRA 65a Out/26"));
const totals = positions.reduce((sum,row) => {
  for (const key of ["heads", "weight", "value", "transitHeads", "transitWeight", "transitValue", "purchasedHeads", "purchasedValue", "cash", "total"]) sum[key] = Math.round(((sum[key] || 0) + row[key])*100)/100;
  return sum;
}, {});
const sources = [currentBio.sourceFile, currentBio.purchasedTransitSourceFile].map(path => ({ path, sha256:crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex") }));
const report = { baseline, date, sourceExtractionDate:"2026-10-20", dateRule:"D-1", sources, quoteDate:date, quoteCollectionMethod:"Leitura da tela do DATAGRO", closedDatesPreserved:closedDates, financialPositionsUnchanged:true, sourceSummary:currentBio.summary, positionsBefore, positions, totals, partnershipHeads:lots.filter(lot=>lot.partnership).reduce((sum,lot)=>sum+lot.heads,0), guaranteeDates:currentHistory.snapshots.map(snapshot=>snapshot.referenceDate) };
fs.writeFileSync("tmp/verified-guarantee-20261019.json", `${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({ date, closedDatesPreserved:closedDates, sourceSummary:report.sourceSummary, totals, positions, partnershipHeads:report.partnershipHeads },null,2));
