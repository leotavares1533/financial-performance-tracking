import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const apply=process.argv.includes('--apply');
const date='2026-11-04',cutoff='2026-11-03',destination='confina-cra-65-200';
const out=path.resolve('../outputs/reconciliacao-joao-denipoti-20261104');
const privateRoot=path.resolve('../outputs/controle-paralelo-confina');
const portfolioFile='data/portfolio/portfolio-confina.js';
const manualFile='data/portfolio/manual-portfolio-adjustments-confina.json';
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^[\s\S]*?=\s*/,'').replace(/;\s*$/,''));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const round=n=>Math.round(n*100)/100;
const journal=JSON.parse(fs.readFileSync(path.join(out,'journal-final.json'),'utf8'));
for(const [file,digest]of Object.entries(journal.currentHashes))assert.equal(sha(file),digest,`Fonte mudou: ${file}`);
const index=fs.readFileSync('index.html','utf8');
const scripts=[...index.matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map(m=>m[1]);
const protectedFiles=scripts.filter(f=>f.startsWith('data/')&&f!==portfolioFile);
const protectedHashes=Object.fromEntries(protectedFiles.map(f=>[f,sha(f)]));
const original=read(path.join(out,'backup-anterior',portfolioFile));
const next=read(path.join(out,'portfolio-final-candidato.js'));
assert.equal(journal.netCashCorrection,-5257084.64);
assert.equal(journal.economicEffectD0,-1008493.06);
assert.equal(journal.newActualBankMovements,0);
assert.equal(journal.newExternalFunding,0);
assert.equal(journal.events.length,15);
assert.equal(round(journal.events.filter(e=>e.type==='synthetic_adjustment').reduce((s,e)=>s+e.amount,0)),0);
for(const op of next.operations)assert.deepEqual(op.titles,original.operations.find(o=>o.operationId===op.operationId).titles);

function engine(data){
  const nodes=new Map();
  const element=id=>{
    if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',dataset:{},classList:{toggle(){}},setAttribute(){},addEventListener(){}});
    return nodes.get(id);
  };
  const context=vm.createContext({console,Date,Intl,URLSearchParams,
    window:{location:{search:''},ceresFinanceEngineOnly:true,ceresParallelControlEngineOnly:true},
    document:{getElementById:element,querySelectorAll:()=>[],activeElement:null}});
  for(const file of scripts.filter(f=>!/^data\/(biological|pecuaria)\//.test(f))){
    if(file===portfolioFile)context.window.ceresPortfolioData=structuredClone(data);
    else vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  return {context,nodes};
}
const before=engine(original),after=engine(next);
const evaluate=(app,s)=>JSON.parse(JSON.stringify(vm.runInContext(s,app.context)));
function positions(app,day){return evaluate(app,`[...operations,...(operatingCashOperation?[operatingCashOperation]:[])].map(op=>{
  const p=operationPortfolioPositionAtDate(op,'${day}');return {id:op.id,vp:roundMoney(p.portfolioVp),
    vn:roundMoney(p.portfolioVn),count:p.titleCount,cash:cashBalanceAtDate(op,'${day}'),
    funding:fundingBalanceAtDate(op,'${day}'),adjustment:roundMoney(operationSyntheticAdjustmentBalanceAtDate(op,'${day}')),
    sub:syntheticAtDate(op,'${day}')};})`);}
const closed=evaluate(before,`calendarDatesBetween('2026-04-01','${cutoff}')`);
for(const day of closed)assert.deepEqual(positions(after,day),positions(before,day),`Historico alterado: ${day}`);
const visibleIds=day=>new Set(evaluate(after,`laminaOperationsForDate('${day}').map(op=>op.id)`));
const total=(rows,ids)=>({sub:round(rows.filter(r=>ids.has(r.id)).reduce((s,r)=>s+r.sub,0)),
  cash:round(rows.filter(r=>ids.has(r.id)).reduce((s,r)=>s+r.cash,0))});
const daily=[];
const dates=[cutoff,...evaluate(after,`calendarDatesBetween('${date}','2026-11-10')`)];
for(const day of dates){
  const old=positions(before,day),current=positions(after,day),ids=visibleIds(day);
  for(const row of current){
    const baseline=old.find(r=>r.id===row.id);
    for(const key of ['vp','vn','count','funding'])assert.equal(row[key],baseline[key],`${key} alterado: ${day}/${row.id}`);
    if(day<date||!Object.keys(journal.cashCorrections).includes(row.id))assert.deepEqual(row,baseline);
    if(day>=date&&row.id===destination){
      assert.equal(round(row.cash-baseline.cash),-658822.33);
      assert.equal(round(row.adjustment-baseline.adjustment),-4598262.31);
      assert.equal(round(row.sub-baseline.sub),-5257084.64);
    }
  }
  daily.push({date:day,before:total(old,ids),after:total(current,ids),
    operationBefore:old.find(r=>r.id===destination),operationAfter:current.find(r=>r.id===destination)});
}
for(const day of [cutoff,date,'2026-11-10']){
  for(const app of [before,after])vm.runInContext(`state.dateKey='${day}';state.view='gerencial';window.ceresFinanceEngineOnly=false;render();`,app.context);
  if(day===cutoff){
    assert.equal(after.nodes.get('result-table').innerHTML,before.nodes.get('result-table').innerHTML);
    assert.equal(after.nodes.get('cash-table').innerHTML,before.nodes.get('cash-table').innerHTML);
    assert.ok(!after.nodes.get('result-table').innerHTML.includes('reconciliation-note'));
  }else{
    assert.ok(after.nodes.get('result-table').innerHTML.includes('reconciliation-note'));
    assert.ok(after.nodes.get('cash-table').innerHTML.includes('cash-reconciliation-note'));
  }
}
const privateFile=path.join(privateRoot,'posicoes.js');
const privateOriginal=read(path.join(out,'private-base/posicoes.js'));
assert.deepEqual(read(privateFile),privateOriginal,'Controle paralelo mudou durante a conciliacao.');
const privateNext=structuredClone(privateOriginal);
after.context.window.ceresParallelManagementData=privateNext;
vm.runInContext(fs.readFileSync(path.join(privateRoot,'controle.js'),'utf8'),after.context);
const comparable=rows=>rows.map(({portfolioSourceDate,...row})=>row);
let privatePreserved=0,privateRevised=0;
for(const position of privateNext.positions){
  const computed=evaluate(after,`parallelComputeDay('${position.dateKey}')`);
  if(position.dateKey<=cutoff){
    assert.deepEqual(comparable(computed),comparable(position.accounts));
    privatePreserved++;
  }else{
    const old=privateOriginal.positions.find(r=>r.dateKey===position.dateKey);
    for(const row of computed){
      const prior=old.accounts.find(r=>r.operationId===row.operationId);
      for(const key of ['debt','previousDebt','interest','payment','portfolioVp','cashIncome'])assert.equal(row[key],prior[key]);
      assert.equal(round(row.cash-prior.cash),journal.cashCorrections[row.operationId]);
      assert.equal(row.internalReceivable,-journal.cashCorrections[row.operationId]);
      assert.equal(row.economicDifference,prior.difference);
    }
    position.accounts=computed;
    position.status='reconciled_non_cash_substitution';
    position.reconciliationId='conciliacao-joao-denipoti-20261104';
    privateRevised++;
  }
}
assert.deepEqual(privateNext.positions.filter(r=>r.dateKey<=cutoff),privateOriginal.positions.filter(r=>r.dateKey<=cutoff));
privateNext.revisions=[...(privateNext.revisions||[]),{authorizationDate:'2026-11-11',effectiveDate:date,
  reason:'Baixas e confissoes de Joao sem banco, confirmadas pelo usuario. Correcao de saldo e compensacoes internas reciprocas, sem novo funding.',
  sourceTitleIds:journal.sourceSettlements.map(r=>r.titleId),reconciliationId:'conciliacao-joao-denipoti-20261104'}];
const privateLatest=privateNext.positions.find(r=>r.dateKey==='2026-11-10').accounts;
const report={status:apply?'APLICADO_LOCAL':'VALIDADO_NAO_APLICADO',effectiveDate:date,cutoff,
  closedCalendarDaysVerified:closed.length,journal,daily,privatePreserved,privateRevised,
  privateLatest:privateLatest.map(r=>({id:r.operationId,cash:r.cash,internalReceivable:r.internalReceivable,
    debt:r.debt,liquidityDifference:r.difference,economicDifference:r.economicDifference})),
  protectedHashes,notes:[
    'O efeito economico negativo nao foi anulado por ajuste de valor. Custos dos novos ativos e valores exatos dos registros antigos foram mantidos.',
    'As compensacoes internas sao iguais e opostas. Nao sao caixa nem novo funding externo. Nenhum VP dos titulos, taxa ou composicao de gado foi alterado.',
    'O lancamento provisoriamente preparado de -4.248.591,58 foi substituido por esta conciliacao completa, antes de publicacao.'
  ]};
fs.writeFileSync(path.join(out,'conciliacao-final.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(out,'posicoes-paralelas-candidatas.js'),`window.ceresParallelManagementData = ${JSON.stringify(privateNext,null,2)};\n`);
for(const [file,digest]of Object.entries(protectedHashes))assert.equal(sha(file),digest,`Arquivo protegido alterado: ${file}`);
for(const [file,digest]of Object.entries(journal.currentHashes))assert.equal(sha(file),digest,`Fonte mudou antes de aplicar: ${file}`);
if(apply){
  const backup=path.join(out,'backup-before-final');
  assert.ok(!fs.existsSync(backup),'Conciliacao final ja efetivada; nao aplicar novamente.');
  for(const file of [portfolioFile,manualFile,'index.html']){
    fs.mkdirSync(path.dirname(path.join(backup,file)),{recursive:true});
    fs.copyFileSync(file,path.join(backup,file));
  }
  fs.copyFileSync(privateFile,path.join(backup,'posicoes-paralelas.js'));
  fs.copyFileSync(path.join(out,'portfolio-final-candidato.js'),portfolioFile);
  fs.copyFileSync(path.join(out,'ajustes-finais-candidatos.json'),manualFile);
  fs.copyFileSync(path.join(out,'posicoes-paralelas-candidatas.js'),privateFile);
  fs.writeFileSync('index.html',index.replace(/(<script src="\.\/)([^"?]+)(?:\?[^\"]*)?(")/g,
    (all,start,file,end)=>[portfolioFile,'assets/app.js'].includes(file)?`${start}${file}?v=20261111-conciliacao-jl-jd-final${end}`:all));
  for(const [file,digest]of Object.entries(protectedHashes))assert.equal(sha(file),digest,`Arquivo protegido alterado: ${file}`);
}
console.log(JSON.stringify({status:report.status,closedDays:closed.length,privatePreserved,privateRevised,
  cashCorrections:journal.cashCorrections,economicEffectD0:journal.economicEffectD0,
  positions:daily.filter(r=>[cutoff,date,'2026-11-10'].includes(r.date)),privateLatest:report.privateLatest},null,2));
