import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const out=path.resolve(process.argv[2]);
const report=JSON.parse(fs.readFileSync(path.join(out,'closing-verified.json'),'utf8'));
const nodes=new Map();
const element=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:''});return nodes.get(id);};
const ctx=vm.createContext({console,Date,Intl,URLSearchParams,
  window:{location:{search:''},ceresFinanceEngineOnly:true},document:{getElementById:element,querySelectorAll:()=>[]}});
for(const m of fs.readFileSync('index.html','utf8').matchAll(/<script src="\.\/([^"?]+)(?:\?[^"]*)?"/g)){
  vm.runInContext(fs.readFileSync(m[1],'utf8'),ctx,{filename:m[1]});
}
const evaluate=code=>JSON.parse(JSON.stringify(vm.runInContext(code,ctx)));
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').split(/=([\s\S]*)/)[1].trim().replace(/;$/,''));
const prior=read(path.join(out,'backup-before-apply/data/biological/biological-assets-confina.js'));
const current=read('data/biological/biological-assets-confina.js');
const audit=JSON.parse(fs.readFileSync(path.join(out,'audit-full.json'),'utf8'));
const sourceNames=[...new Set([...Object.keys(audit.sources).map(f=>path.basename(f)),prior.sourceFile,current.sourceFile,current.purchasedTransitSourceFile])];
const hashes=Object.fromEntries(sourceNames.map(name=>[name,crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(process.env.USERPROFILE,'Downloads',name))).digest('hex')]));
if(report.sourceHashes)assert.deepEqual(hashes,report.sourceHashes);
else {
  report.sourceHashes=hashes;
  fs.writeFileSync(path.join(out,'closing-verified.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(`data/validations/processing-confina-${report.through}.json`,JSON.stringify(report,null,2)+'\n');
}
assert.deepEqual(evaluate(`biologicalAssetDataForDate('${report.cutoff}')`),prior);
for(const [file,hash]of Object.entries(report.protectedHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);
const rows=[];
for(const date of report.dates){
  evaluate(`state.dateKey='${date}';recalculateFundingPositions();renderManagementResultComposition(laminaOperationsForDate());true`);
  const composition=evaluate('managementResultComposition()');
  assert.deepEqual(composition,report.closings[date].composition);
  const scoped=evaluate('laminaOperationsForDate().map(o=>({id:o.id,sub:o.syntheticSub,fields:managementResultComposition([o])}))');
  assert.ok(scoped.every(o=>o.sub===o.fields.sub));
  const html=nodes.get('result-composition-values').innerHTML;
  assert.equal((html.match(/data-paper-id=/g)||[]).length,scoped.length);
  for(const row of scoped)assert.ok(html.includes(`data-paper-id="${row.id}"`));
  assert.ok(!html.includes('data-paper-id="confina-cras-carteira-50"'));
  assert.ok(!html.includes('data-paper-id="confina-cras-carteira-100"'));
  const snapshot=evaluate(`biologicalAssetDataForDate('${date}')`);
  assert.equal(snapshot.referenceDate,date);
  assert.equal(snapshot.quoteDate,report.quoteDates[date]);
  assert.equal(snapshot.summary.animalsInMultipleVehicles,0);
  const guarantees=evaluate(`guaranteeOperations('${date}').map(o=>({id:o.id,live:guaranteeSummary(o,'${date}').totalHeads,
    transit:guaranteeSummary(o,'${date}').transitHeads,purchased:guaranteeSummary(o,'${date}').purchasedTransitHeads}))`);
  const biologicalTotals=guarantees.reduce((s,r)=>({live:s.live+r.live,transit:s.transit+r.transit,purchased:s.purchased+r.purchased}),{live:0,transit:0,purchased:0});
  rows.push({date,composition,papers:scoped.length,biologicalTotals,quoteDate:snapshot.quoteDate});
}
const portfolio=read('data/portfolio/portfolio-confina.js');
const before=read(path.join(out,'backup-before-apply/data/portfolio/portfolio-confina.js'));
for(const id of report.authorization.preserveConfessions){
  const old=before.operations.find(o=>o.operationId==='confina-cra-65-200').titles.find(t=>t.id===id);
  const now=portfolio.operations.find(o=>o.operationId==='confina-cra-65-200').titles.find(t=>t.id===id);
  for(const key of ['acquisitionValue','faceValue','discountRateMonthly','settledDate'])assert.equal(now[key],old[key]);
}
assert.ok(!portfolio.operations.find(o=>o.operationId==='confina-cra-65-200').titles.some(t=>t.id==='537494'));
fs.writeFileSync(path.join(out,'final-verification.json'),JSON.stringify({status:'PASS',rows,oldGuaranteeIdentical:true},null,2)+'\n');
console.log(JSON.stringify({status:'PASS',rows,oldGuaranteeIdentical:true}));
