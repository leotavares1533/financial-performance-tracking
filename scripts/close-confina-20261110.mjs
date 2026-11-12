import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const out=path.resolve('../outputs/processamento-confina-20261110');
const apply=process.argv.includes('--apply');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^[\s\S]*?=\s*/,'').replace(/;\s*$/,''));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ledger=JSON.parse(fs.readFileSync(path.join(out,'lancamentos-candidatos.json'),'utf8'));
const verified=JSON.parse(fs.readFileSync(path.join(out,'verificacao-financeira.json'),'utf8'));
const bio=JSON.parse(fs.readFileSync(path.join(out,'garantias-candidatas-resumo.json'),'utf8'));
assert.equal(verified.closedCalendarDaysVerified,217);
assert.equal(verified.pendingFunding.length,0);
assert.equal(ledger.denipotiNonCashSubstitution.amount,4248591.58);
assert.equal(ledger.duplicatesRemovedForward.acquisitionValue,584076.98);
for(const [file,digest]of Object.entries(ledger.baselineHashes))assert.equal(sha(file),digest,`Base alterada: ${file}`);
const audit=JSON.parse(fs.readFileSync(path.join(out,'validacao-titulos.json'),'utf8'));
assert.equal(sha(audit.source),audit.sha256);
const animalAudit=JSON.parse(fs.readFileSync(path.join(out,'validacao-garantias.json'),'utf8'));
for(const [file,digest]of Object.entries(animalAudit.sources))assert.equal(sha(file),digest,`Fonte alterada: ${file}`);

const portfolio=read(path.join(out,'portfolio-candidato.js'));
const op65=portfolio.operations.find(o=>o.operationId==='confina-cra-65-200');
assert.equal(op65.cashEvents.filter(e=>e.date==='2026-11-04'&&e.type==='portfolio_purchase'
  &&ledger.denipotiNonCashSubstitution.ids.includes(e.titleId)).length,0);
assert.ok(ledger.denipotiNonCashSubstitution.ids.every(id=>op65.titles.find(t=>t.id===id)?.isActive));
const carteira=portfolio.operations.find(o=>o.operationId==='confina-cras-carteira-10');
for(const [old,valid]of Object.entries(ledger.duplicatesRemovedForward.aliases)){
  assert.equal(carteira.titles.find(t=>t.id===old).settledDate,'2026-11-04');
  assert.ok(carteira.titles.find(t=>t.id===valid).isActive);
}

const dates=['2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10'];
for(const day of dates){
  assert.ok(bio[day]&&bio[day].unresolved.length===0,`Garantia pendente: ${day}`);
  const snapshot=read(path.join(out,`garantia-${day}.js`));
  assert.equal(snapshot.referenceDate,day);
  assert.equal(snapshot.compositionReferenceDate,day);
  assert.ok(snapshot.quoteDate<=day);
  assert.equal(snapshot.sourceExtractionDate,'2026-11-11');
  assert.equal(snapshot.summary.animalsInMultipleVehicles,0);
  assert.deepEqual(snapshot.assetsByOperationId,Object.fromEntries(snapshot.vehicles.map(v=>[v.operationId,v])));
}

const current='data/biological/biological-assets-confina.js';
const oldHistory='data/biological/biological-assets-history-confina.js';
const currentSnapshot=read(current);
assert.equal(currentSnapshot.referenceDate,'2026-11-03');
const historicalHash=sha(oldHistory);
const archives=[currentSnapshot,...dates.slice(0,-1).map(day=>read(path.join(out,`garantia-${day}.js`)))];
const newFiles={};
for(const snapshot of archives){
  const date=snapshot.referenceDate;
  const rel=`data/biological/biological-assets-snapshot-${date}.js`;
  assert.ok(!fs.existsSync(rel),`Arquivo fechado ja existe: ${rel}`);
  assert.deepEqual(snapshot.assetsByOperationId,Object.fromEntries(snapshot.vehicles.map(v=>[v.operationId,v])));
  const {assetsByOperationId,...payload}=snapshot;
  // Store the lots once, then restore the identical lookup object at load time.
  const source=`(() => { const snapshot = ${JSON.stringify(payload)};\n`
    +`snapshot.assetsByOperationId = Object.fromEntries(snapshot.vehicles.map(row => [row.operationId, row]));\n`
    +`const history = window.ceresBiologicalAssetsHistory;\n`
    +`if (history.referenceDates.includes('${date}')) throw new Error('Snapshot duplicado: ${date}');\n`
    +`history.snapshots.push(snapshot); history.referenceDates.push('${date}'); history.referenceDates.sort();\n`
    +`history.currentReferenceDate='2026-11-10'; })();\n`;
  const file=path.join(out,path.basename(rel));
  fs.writeFileSync(file,source);
  assert.ok(Buffer.byteLength(source)<100*1024*1024);
  newFiles[rel]=file;
}
const replacements={
  'data/portfolio/portfolio-confina.js':path.join(out,'portfolio-candidato.js'),
  'data/portfolio/portfolio-confina-frozen-2026-10-02.js':path.join(out,'historico-candidato.js'),
  'data/portfolio/manual-portfolio-adjustments-confina.json':path.join(out,'ajustes-candidato.json'),
  'data/fundings/fundings-confina.js':path.join(out,'funding-candidato.js'),
  'data/fundings/funding-events-confina.js':path.join(out,'amortizacoes-candidato.js'),
  [current]:path.join(out,'garantia-2026-11-10.js'),
};
const version='20261111-fechamento-1011';
let index=fs.readFileSync('index.html','utf8');
index=index.replace(/(<script src="\.\/)([^"?]+)(?:\?[^\"]*)?(")/g,
  (all,start,file,end)=>replacements[file]?`${start}${file}?v=${version}${end}`:all);
const historyTag=index.match(/  <script src="\.\/data\/biological\/biological-assets-history-confina\.js[^\"]*"><\/script>/)?.[0];
assert.ok(historyTag);
index=index.replace(historyTag,historyTag+'\n'+Object.keys(newFiles).map(file=>`  <script src="./${file}?v=${version}"></script>`).join('\n'));
fs.writeFileSync(path.join(out,'index-candidato.html'),index);

const nodes=new Map();
const element=id=>{
  if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',dataset:{},classList:{toggle(){}},
    setAttribute(){},addEventListener(){}});
  return nodes.get(id);
};
const window={location:{search:''},ceresFinanceEngineOnly:true,ceresParallelControlEngineOnly:true};
const context=vm.createContext({console,Date,Intl,URLSearchParams,window,
  document:{getElementById:element,querySelectorAll:()=>[],activeElement:null}});
for(const match of index.matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)){
  const rel=match[1];
  vm.runInContext(fs.readFileSync(replacements[rel]||newFiles[rel]||rel,'utf8'),context,{filename:rel});
}
const evaluate=s=>JSON.parse(JSON.stringify(vm.runInContext(s,context)));
assert.deepEqual(evaluate("biologicalAssetDataForDate('2026-11-03')"),currentSnapshot);
for(const day of dates){
  assert.equal(evaluate(`biologicalAssetDataForDate('${day}').referenceDate`),day);
  assert.equal(evaluate(`biologicalAssetDataForDate('${day}').quoteDate`),bio[day].quoteDate);
  vm.runInContext(`state.dateKey='${day}';state.view='gerencial';window.ceresFinanceEngineOnly=false;render();`,context);
  assert.ok(nodes.get('result-table')?.innerHTML.includes('Nov/26'));
  const rows=evaluate(`guaranteeOperations('${day}').map(op=>({id:op.id}))`);
  assert.ok(rows.some(op=>op.id===ledger.buyer));
}
assert.equal(sha(oldHistory),historicalHash);
const summary={status:apply?'EFETIVADO_LOCAL':'VALIDADO_NAO_EFETIVADO',dates,closedCalendarDaysVerified:217,
  closedBiologicalHistoryUnchanged:true,archivedPriorCurrentDate:'2026-11-03',
  newFunding:verified.initialBuyer,negativeCash:verified.negativeCash,
  prospectiveCorrections:{denipoti:ledger.denipotiNonCashSubstitution,duplicates:ledger.duplicatesRemovedForward,
                         excluded:ledger.exclusions,preserved:ledger.preservedMissing},
  quoteDates:Object.fromEntries(dates.map(d=>[d,bio[d].quoteDate])),
  note:'Caixas negativos preservados como saldo gerencial a conciliar. Nao foi presumido aporte ou recebimento repetido.'};
if(apply){
  for(const [file,digest]of Object.entries(ledger.baselineHashes))assert.equal(sha(file),digest,`Base alterada antes da efetivacao: ${file}`);
  const backup=path.join(out,'backup-anterior-efetivacao');
  assert.ok(!fs.existsSync(backup),'Backup ja existe. Nao efetivar duas vezes.');
  for(const file of Object.keys(ledger.baselineHashes)){
    const dest=path.join(backup,file);
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.copyFileSync(file,dest);
  }
  for(const [dest,source]of Object.entries({...replacements,...newFiles})){
    fs.mkdirSync(path.dirname(dest),{recursive:true});
    fs.copyFileSync(source,dest);
  }
  fs.copyFileSync(path.join(out,'index-candidato.html'),'index.html');
  assert.equal(sha(oldHistory),historicalHash);
}
fs.writeFileSync(path.join(out,'fechamento-validado.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({status:summary.status,dates,closedCalendarDaysVerified:217,
  newFunding:summary.newFunding,archiveBytes:Object.values(newFiles).reduce((sum,file)=>sum+fs.statSync(file).size,0)}));
