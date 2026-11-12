import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const out=path.resolve('../outputs/processamento-confina-20261110');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^[\s\S]*?=\s*/,'').replace(/;\s*$/,''));
const ledger=JSON.parse(fs.readFileSync(path.join(out,'lancamentos-candidatos.json'),'utf8'));
const index=fs.readFileSync('index.html','utf8');
const scripts=[...index.matchAll(/<script src="\.\/([^"?]+)(?:\?[^"]*)?"/g)].map(m=>m[1])
  .filter(f=>!/^data\/(biological|pecuaria)\//.test(f));
const overrides={
  'data/portfolio/portfolio-confina.js':'portfolio-candidato.js',
  'data/portfolio/portfolio-confina-frozen-2026-10-02.js':'historico-candidato.js',
  'data/fundings/fundings-confina.js':'funding-candidato.js',
  'data/fundings/funding-events-confina.js':'amortizacoes-candidato.js',
};
function load(candidate){
  const window={location:{search:''},ceresFinanceEngineOnly:true,ceresParallelControlEngineOnly:true};
  const context=vm.createContext({console,Date,Intl,URLSearchParams,window,
    document:{getElementById:()=>null,querySelectorAll:()=>[]}});
  for(const f of scripts)vm.runInContext(fs.readFileSync(candidate&&overrides[f]?path.join(out,overrides[f]):f,'utf8'),context,{filename:f});
  return context;
}
const before=load(false),after=load(true);
const evaluate=(c,s)=>JSON.parse(JSON.stringify(vm.runInContext(s,c)));
function positions(c,day){return evaluate(c,`operations.map(op=>{const p=operationPortfolioPositionAtDate(op,'${day}');return {
  id:op.id,vp:roundMoney(p.portfolioVp),vn:roundMoney(p.portfolioVn),count:p.titleCount,
  cash:cashBalanceAtDate(op,'${day}'),funding:fundingBalanceAtDate(op,'${day}'),sub:syntheticAtDate(op,'${day}')};})`)}
const days=evaluate(before,`calendarDatesBetween('2026-04-01','2026-11-03')`);
for(const day of days){
  const previous=positions(before,day),current=positions(after,day);
  assert.deepEqual(current.filter(r=>r.id!==ledger.buyer),previous,`Historico alterado: ${day}`);
  const next=current.find(r=>r.id===ledger.buyer);
  assert.ok(next&&next.vp===0&&next.cash===0&&next.funding===0,`Novo funding apareceu no passado: ${day}`);
}
const dates=['2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10'];
const daily=Object.fromEntries(dates.map(day=>[day,positions(after,day)]));
const preview=JSON.parse(fs.readFileSync(path.join(out,'previa-cessao-0411.json'),'utf8'));
const born=daily['2026-11-04'].find(r=>r.id===ledger.buyer);
assert.equal(born.count,46);
assert.equal(born.funding,59058345.61);
assert.equal(born.cash,0);
assert.equal(born.vp,preview.sourceVpPreview);
assert.equal(born.sub,preview.initialGapPreview);
const perTitle=evaluate(after,`operations.flatMap(op=>{const p=operationPortfolioPositionAtDate(op,'2026-11-04');return p.titles.map(t=>({op:op.id,id:t.id,vp:t.calculatedPresentValue}));})`);
const candidate=read(path.join(out,'portfolio-candidato.js'));
for(const row of preview.titles.filter(t=>t.op!=='ceres-confina-ltda')){
  const origin=candidate.operations.find(o=>o.operationId===row.op).titles.find(t=>t.id===row.managerialId);
  assert.equal(origin.settledDate,'2026-11-04');
  assert.ok(!perTitle.some(t=>t.op===row.op&&t.id===row.managerialId));
}
for(const [file,hash]of Object.entries(ledger.baselineHashes)){
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,`Arquivo oficial alterado: ${file}`);
}
const negativeCash=Object.entries(daily).flatMap(([date,rows])=>rows.filter(r=>r.cash<0).map(r=>({date,...r})));
const report={status:'PREVIA_INCOMPLETA_NAO_PUBLICADA',closedCalendarDaysVerified:days.length,
  dates,initialBuyer:born,negativeCash,daily,pending:ledger.pending,pendingFunding:ledger.pendingFunding};
fs.writeFileSync(path.join(out,'verificacao-financeira.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({closedCalendarDaysVerified:days.length,initialBuyer:born,negativeCash:negativeCash.map(r=>({date:r.date,id:r.id,cash:r.cash})),pendingFunding:ledger.pendingFunding.length}));
