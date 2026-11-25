import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import assert from 'node:assert/strict';

const arg = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const out = path.resolve(arg('out') || '../outputs/premio-aquisicao-20261125');
const source = arg('source');
assert.ok(source, 'Provide --source with the animal CSV');
fs.mkdirSync(out, {recursive: true});
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const code = fs.readFileSync('premio/assets/premio.js', 'utf8');
const ctx = vm.createContext({console, Date, Intl, TextDecoder, document: {getElementById: () => null}, window: {}});
vm.runInContext(code.slice(0, code.indexOf('nodes.fileInput.addEventListener')), ctx);
const run = code => JSON.parse(JSON.stringify(vm.runInContext(code, ctx)));
ctx.csv = fs.readFileSync(source, 'utf8');
const coreFields = ['key', 'heads', 'issueDate', 'paymentDate', 'days', 'monthlyRate', 'costPerHead', 'revenue', 'principal', 'operationCost', 'gta', 'tags', 'monitoringFee', 'deathCost', 'premium', 'amortization'];
ctx.coreFields = coreFields;
const actual = run(`(() => {
 premiumState.rows = parsePremiumCsv(csv);
 const records = [];
 for (const date of premiumDateOptions()) {
  premiumState.selectedDate = date;
  for (const row of premiumCalculatedRows()) records.push({date, ...Object.fromEntries(coreFields.map(key => [key, row[key]]))});
 }
 return {count: premiumState.rows.length, dates: premiumDateOptions(), records};
})()`);
const financialFiles = cp.execFileSync('git', ['ls-files', 'assets', 'data', 'index.html'], {encoding: 'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const financialHashes = Object.fromEntries(financialFiles.map(file => [file, hash(file)]));
const baselineFile = path.join(out, 'baseline.json');
if (process.argv.includes('--capture-baseline')) {
 fs.writeFileSync(baselineFile, JSON.stringify({sourceSha256: hash(source), actual, financialHashes}, null, 2) + '\n');
 console.log(JSON.stringify({status: 'BASELINE_SAVED', rows: actual.count, dates: actual.dates.length, termDates: actual.records.length}));
 process.exit(0);
}
const checks = [];
const check = (name, fn) => {fn(); checks.push(name);};
const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
check('Existing report: every date and financial term result unchanged when column V is empty', () => {
 assert.equal(hash(source), baseline.sourceSha256);
 assert.deepEqual(actual, baseline.actual);
 assert.deepEqual(financialHashes, baseline.financialHashes);
});
ctx.raw = {Fazenda: 'Fazenda A', Parceiro: 'GREEN FARMING FAZENDAS RENOVAVEIS LTDA', 'Status atual': 'ABATIDO',
 'Número do título': 'QA012026', 'Data de saída real': '09/10/2026', 'Data de entrada': '05/10/2026',
 'Data do termo de cessão': '01/10/2026', 'Data de pagamento': '20/10/2026', 'Valor de aquisição': '300000',
 'Quantidade de animais do lote': '100', 'Taxa do termo de cessão': '1,7%', 'Valor Pago': '7000',
 TAG: '123456', SISBOV: '105520467288140', 'Peso de carcaça': '240,40'};
run(`premiumState.selectedDate='2026-10-09';premiumState.rowOverrides={};premiumState.termSettings={};premiumState.partnerFees={};premiumState.paymentDate='';`);
const rows = () => run('premiumCalculatedRows()');
check('Column V is identified by header and outranks acquisition total / quantity', () => {
 run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor do animal':'4.400,25'})];`);
 const r = rows()[0];
 assert.equal(r.costPerHead, 4400.25);assert.equal(r.principal, -4400.25);assert.equal(r.reportAcquisitionHeads, 1);assert.equal(r.fallbackAcquisitionHeads, 0);
 assert.equal(r.calculatedVpAtAbate, Math.round(4400.25 * Math.pow(1.017, 19 / 30) * 100) / 100);
});
check('Different animal values are weighted by actual heads, not term totals or mean of lots', () => {
 run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor do animal':'4000','Quantidade de animais':'2'}),normalizePremiumCsvRecord({...raw,'Valor do animal':'5500',Fazenda:'Fazenda B'})];`);
 const r=rows()[0];assert.equal(r.heads,3);assert.equal(r.costPerHead,4500);assert.equal(r.principal,-13500);
 assert.equal(r.farmsLabel, 'Fazenda A, Fazenda B');
});
check('Blank animal value falls back to acquisition / original heads once; override is editable', () => {
 run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor do animal':' '})];`);
 assert.equal(rows()[0].costPerHead,3000);
 run(`premiumState.termSettings.QA012026={costPerHead:2800};`);
 assert.equal(rows()[0].costPerHead,2800);assert.equal(rows()[0].principal,-2800);
 assert.ok(run('premiumStatement(premiumCalculatedRows()[0])').includes('data-premium-field="costPerHead"'));
 run(`delete premiumState.termSettings.QA012026.costPerHead;`);assert.equal(rows()[0].costPerHead,3000);
});
check('Mixed term: edit only missing values; reported animal acquisition remains unchanged', () => {
 run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor do animal':'4000'}),normalizePremiumCsvRecord({...raw,'Valor do animal':''})];premiumState.termSettings.QA012026={costPerHead:2500};`);
 const r=rows()[0];assert.equal(r.principal,-6500);assert.equal(r.costPerHead,3250);assert.equal(r.reportAcquisitionHeads,1);assert.equal(r.fallbackAcquisitionHeads,1);
 run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor do animal':'4000'})];`);
 assert.equal(rows()[0].costPerHead,4000);assert.ok(!run('premiumStatement(premiumCalculatedRows()[0])').includes('data-premium-field="costPerHead"'));
});
check('Explicit zero or invalid animal value stays pending and never becomes an invented fallback', () => {
 for(const value of ['0','invalido','-20']){
  ctx.value=value;run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor do animal':value})];`);
  assert.equal(rows()[0].premium,null);assert.ok(rows()[0].pendingReasons.some(reason=>reason.includes('animal')));
 }
});
check('Missing historical sources can be supplied manually; stale total/count conflicts do not block column V', () => {
 run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor de aquisição':'','Quantidade de animais do lote':''})];premiumState.termSettings={};`);
 assert.equal(rows()[0].premium,null);
 run(`premiumState.termSettings.QA012026={costPerHead:4200};`);assert.notEqual(rows()[0].premium,null);
 run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor do animal':'4000'}),normalizePremiumCsvRecord({...raw,'Valor do animal':'4200','Valor de aquisição':'400000','Quantidade de animais do lote':'200'})];premiumState.termSettings={};`);
 assert.equal(rows()[0].principal,-8200);assert.notEqual(rows()[0].premium,null);
});
check('High acquisition is not capped and no longer has a 5000-per-head indicator', () => {
 run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor do animal':'9000'})];`);
 assert.equal(rows()[0].costPerHead,9000);assert.ok(!rows()[0].warnings.some(w=>w.includes('5.000')));
});
check('Manual acquisition follows a term across dates but never affects another term', () => {
 run(`premiumState.rows=[normalizePremiumCsvRecord(raw),normalizePremiumCsvRecord({...raw,'Data de saída real':'10/10/2026'}),normalizePremiumCsvRecord({...raw,'Número do título':'QA022026'})];premiumState.termSettings.QA012026={costPerHead:3500};`);
 assert.equal(rows().find(r=>r.key==='QA012026').costPerHead,3500);assert.equal(rows().find(r=>r.key==='QA022026').costPerHead,3000);
 run(`premiumState.selectedDate='2026-10-10';`);assert.equal(rows()[0].costPerHead,3500);
 run(`premiumState.selectedDate='2026-10-09';`);
});
check('Fee, deaths, discount and payment-date bridge remain consistent with the selected acquisition', () => {
 run(`premiumState.rows=[normalizePremiumCsvRecord({...raw,'Valor do animal':'4000'})];premiumState.termSettings={};premiumState.rowOverrides={'2026-10-09__QA012026':{deaths:1,gtaCost:10,additionalDiscount:25,discountNote:'Ajuste comprovado'}};`);
 const r=rows()[0], vp=Math.round(4000*Math.pow(1.017,19/30)*100)/100;
 assert.equal(r.deathCost,-vp);assert.equal(r.calculatedVpAtAbate,vp);
 assert.equal(r.premium,Math.round((7000-vp-vp-10-2.5-Math.round(vp*.0075*100)/100-25)*100)/100);
 assert.equal(r.revenue,Math.round((r.premium+r.amortization)*100)/100);
 run(`premiumState.termSettings.QA012026={feeEnabled:false};`);assert.equal(rows()[0].monitoringFee,0);
 run(`premiumState.paymentDate='2026-10-25';`);assert.equal(rows()[0].days,24);
});
check('Streamlined statement preserves discount justification and audit details, without repeated field notes', () => {
 const html=run('premiumStatement(premiumCalculatedRows()[0])');
 assert.ok(!html.includes('<small>'));assert.ok(html.includes('Observacao do desconto'));assert.ok(html.includes('<details'));
 assert.ok(!html.includes('data-premium-field="issueDate"'));assert.ok(!html.includes('data-premium-field="paymentDate"'));
});
const result={status:'PASS',checks,sourceSha256:hash(source),actual:{rows:actual.count,dates:actual.dates.length,termDates:actual.records.length},financialFilesUnchanged:financialFiles.length,
 files:['premio/assets/premio.js','premio/assets/premio.css','premio/index.html'].map(file=>({file,sha256:hash(file)}))};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checks:checks.length,actual:result.actual,financialFilesUnchanged:financialFiles.length}));
