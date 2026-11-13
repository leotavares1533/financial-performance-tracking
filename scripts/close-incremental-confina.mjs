import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const out=path.resolve(process.argv[2]);
const apply=process.argv.includes('--apply');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').split(/=([\s\S]*)/)[1].trim().replace(/;$/,''));
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const ledger=JSON.parse(fs.readFileSync(path.join(out,'staging-summary.json'),'utf8'));
assert.equal(ledger.status,'CANDIDATO');
const {cutoff,through}=ledger;
const dates=[];
for(let d=new Date(`${cutoff}T12:00:00Z`);;){d.setUTCDate(d.getUTCDate()+1);const k=d.toISOString().slice(0,10);if(k>through)break;dates.push(k);}
const audit=JSON.parse(fs.readFileSync(path.join(out,'audit-full.json'),'utf8'));
for(const [file,hash]of Object.entries(audit.sources))assert.equal(sha(file),hash,`Fonte alterada: ${file}`);
const portfolioPath='data/portfolio/portfolio-confina.js';
const fundingPath='data/fundings/fundings-confina.js';
const biologicalPath='data/biological/biological-assets-confina.js';
const originalPortfolio=read(portfolioPath);
assert.ok(originalPortfolio.operations.every(o=>o.positionDate===cutoff));
const originalBiological=read(biologicalPath);
assert.equal(originalBiological.referenceDate,cutoff);
const frozenFile=`data/portfolio/portfolio-confina-frozen-${cutoff}.js`;
assert.ok(!fs.existsSync(frozenFile));
const frozenOperations=originalPortfolio.operations.map(o=>({...o,freezeThroughDate:cutoff}));
const frozenSource=`window.ceresFrozenPortfolioData.operations.push(...${JSON.stringify(frozenOperations)});\n`;
fs.writeFileSync(path.join(out,'portfolio-frozen.js'),frozenSource);
const replacements={
  [portfolioPath]:path.join(out,'portfolio-candidato.js'),
  [fundingPath]:path.join(out,'funding-candidato.js'),
  [frozenFile]:path.join(out,'portfolio-frozen.js'),
  [biologicalPath]:path.join(out,`garantia-${through}.js`)
};
const quoteDates={};
for(const day of [cutoff,...dates.slice(0,-1)]){
  const snapshot=day===cutoff?originalBiological:read(path.join(out,`garantia-${day}.js`));
  const file=`data/biological/biological-assets-snapshot-${day}.js`;
  assert.ok(!fs.existsSync(file));
  const {assetsByOperationId,...payload}=snapshot;
  assert.deepEqual(assetsByOperationId,Object.fromEntries(snapshot.vehicles.map(v=>[v.operationId,v])));
  const source=`(() => {const snapshot=${JSON.stringify(payload)};\n`
    +`snapshot.assetsByOperationId=Object.fromEntries(snapshot.vehicles.map(v=>[v.operationId,v]));\n`
    +`const h=window.ceresBiologicalAssetsHistory;if(h.referenceDates.includes('${day}'))throw new Error('Snapshot duplicado');\n`
    +`h.snapshots.push(snapshot);h.referenceDates.push('${day}');h.referenceDates.sort();h.currentReferenceDate='${through}';})();\n`;
  const staged=path.join(out,path.basename(file));fs.writeFileSync(staged,source);replacements[file]=staged;
}
for(const day of dates){
  const snapshot=read(path.join(out,`garantia-${day}.js`));
  assert.equal(snapshot.referenceDate,day);
  assert.ok(snapshot.quoteDate<=day);
  assert.equal(snapshot.summary.animalsInMultipleVehicles,0);
  assert.equal(snapshot.reconstruction.unresolvedDuplicateIdentities.length,0);
  quoteDates[day]=snapshot.quoteDate;
}
let index=fs.readFileSync('index.html','utf8');
const version=`20261113-fechamento-${through.replaceAll('-','')}`;
index=index.replace(/(<script src="\.\/)([^"?]+)(?:\?[^"]*)?(")/g,(all,a,file,b)=>replacements[file]?`${a}${file}?v=${version}${b}`:all);
const oldFreeze=index.match(/  <script src="\.\/data\/portfolio\/portfolio-confina-frozen-[^"]+"><\/script>/)?.[0];
assert.ok(oldFreeze);index=index.replace(oldFreeze,oldFreeze+`\n  <script src="./${frozenFile}?v=${version}"></script>`);
const oldBio=index.match(/  <script src="\.\/data\/biological\/biological-assets-history-confina.js[^"]*"><\/script>/)?.[0];
assert.ok(oldBio);index=index.replace(oldBio,oldBio+'\n'+Object.keys(replacements).filter(f=>f.includes('biological-assets-snapshot-')).map(f=>`  <script src="./${f}?v=${version}"></script>`).join('\n'));
fs.writeFileSync(path.join(out,'index-candidato.html'),index);
function engine(candidate){
  const ctx=vm.createContext({console,Date,Intl,URLSearchParams,window:{location:{search:''},ceresFinanceEngineOnly:true},
    document:{getElementById:()=>null,querySelectorAll:()=>[]}});
  const html=candidate?index:fs.readFileSync('index.html','utf8');
  for(const m of html.matchAll(/<script src="\.\/([^"?]+)(?:\?[^"]*)?"/g)){
    if(/^data\/(biological|pecuaria)\//.test(m[1]))continue;
    vm.runInContext(fs.readFileSync(candidate&&replacements[m[1]]?replacements[m[1]]:m[1],'utf8'),ctx,{filename:m[1]});
  }
  const evaluate=s=>JSON.parse(JSON.stringify(vm.runInContext(s,ctx)));
  const positions=date=>evaluate(`(()=>{state.dateKey='${date}';recalculateFundingPositions();return [...operations,operatingCashOperation].filter(Boolean).map(o=>({id:o.id,portfolio:o.portfolioVp,cash:o.cash,funding:o.fundingBalance,adjustment:o.syntheticAdjustment,sub:o.syntheticSub}));})()`);
  return {ctx,evaluate,positions};
}
const before=engine(false),after=engine(true);
const preservedDates=['2026-09-30','2026-10-19','2026-10-20','2026-11-03','2026-11-04','2026-11-09',cutoff];
for(const date of preservedDates)assert.deepEqual(after.positions(date),before.positions(date),`Historico alterado: ${date}`);
assert.deepEqual(after.evaluate(`portfolioDataForOperationAtDate(operations[0],'${cutoff}')`),
  {...before.evaluate(`portfolioDataForOperationAtDate(operations[0],'${cutoff}')`),freezeThroughDate:cutoff});
const auth=ledger.authorization;
const buyer=auth.buyer;
const trade=auth.tradeDate;
assert.equal(after.evaluate(`calculateComponentBalance(operations.find(o=>o.id==='${buyer}').fundingComponents.at(-1),'${cutoff}')`),0);
assert.equal(after.evaluate(`calculateComponentBalance(operations.find(o=>o.id==='${buyer}').fundingComponents.at(-1),'${trade}')`),auth.fundingAmount);
assert.equal(after.evaluate(`fundingCashInflowAtDate(operations.find(o=>o.id==='${buyer}'),'${trade}')`),auth.fundingAmount);
assert.equal(after.evaluate(`operationCashEventActivity(operations.find(o=>o.id==='${buyer}'),'${trade}').portfolioPurchase`),auth.fundingAmount);
assert.equal(after.evaluate(`cashBalanceAtDate(operations.find(o=>o.id==='${buyer}'),'${trade}')`),0);
const buyerTitles=after.evaluate(`portfolioDataForOperation(operations.find(o=>o.id==='${buyer}')).titles.filter(t=>t.purchaseDate==='${trade}')`);
const expectedCount=Object.values(auth.expectedCountsBySeller).reduce((s,n)=>s+n,0);
assert.equal(buyerTitles.length,expectedCount);
assert.equal(new Set(buyerTitles.map(t=>t.id)).size,expectedCount);
for(const [seller,cash]of Object.entries(auth.cashBySeller).filter(([s])=>s!=='ceres-confina-ltda')){
  assert.equal(after.evaluate(`operationCashEventActivity(operations.find(o=>o.id==='${seller}'),'${trade}').portfolioLiquidation`),cash);
}
const closings={};
for(const day of dates){
  const rows=after.positions(day);
  const composition=after.evaluate('managementResultComposition()');
  assert.equal(composition.sub,after.evaluate('roundMoney(laminaOperationsForDate().reduce((s,o)=>s+o.syntheticSub,0))'));
  closings[day]={composition,rows,quoteDate:quoteDates[day]};
}
const protectedFiles=['data/portfolio/portfolio-confina-frozen-2026-10-02.js',
  'data/management/position-reconciliation-confina.js','data/fundings/funding-events-confina.js',
  'data/biological/biological-assets-history-confina.js','data/pecuaria/cotacoes-pecuaria-latest.js'];
const currentBiological=read(path.join(out,`garantia-${through}.js`));
const sourceNames=[...new Set([...Object.keys(audit.sources).map(f=>path.basename(f)),
  originalBiological.sourceFile,currentBiological.sourceFile,currentBiological.purchasedTransitSourceFile])];
const sourceHashes=Object.fromEntries(sourceNames.map(name=>[name,sha(path.join(process.env.USERPROFILE,'Downloads',name))]));
const report={status:apply?'EFETIVADO_LOCAL':'VALIDADO_NAO_EFETIVADO',cutoff,through,dates,preservedDates,
  historicalPreservation:'Identical frozen input through cutoff; earlier archives unchanged; seven representative financial dates compared.',
  protectedHashes:Object.fromEntries(protectedFiles.map(f=>[f,sha(f)])),closings,
  authorization:auth,transfer:ledger.transferSummary,quoteDates,sourceHashes,
  note:'Tres recebimentos de ativos em12/11 nao foram tratados como pagamentos de funding sem comprovante.'};
for(const file of Object.values(replacements))assert.ok(fs.statSync(file).size<100*1024*1024);
if(apply){
  const backup=path.join(out,'backup-before-apply');assert.ok(!fs.existsSync(backup),'Ja aplicado; nao repetir.');
  for(const dest of [portfolioPath,fundingPath,biologicalPath,'index.html']){
    const target=path.join(backup,dest);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(dest,target);
  }
  for(const [dest,file]of Object.entries(replacements))fs.copyFileSync(file,dest);
  fs.copyFileSync(path.join(out,'index-candidato.html'),'index.html');
  for(const [file,hash]of Object.entries(report.protectedHashes))assert.equal(sha(file),hash);
  fs.writeFileSync(`data/validations/processing-confina-${through}.json`,JSON.stringify(report,null,2)+'\n');
}
fs.writeFileSync(path.join(out,'closing-verified.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,dates,closedHistoryPreserved:true,
  transferCount:buyerTitles.length,closings:Object.fromEntries(dates.map(d=>[d,closings[d].composition])),quoteDates}));
