import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

const baseline="789b90c",candidate=process.argv.includes("--candidate");
const files=[...fs.readFileSync("index.html","utf8").matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map(match=>match[1]);
const overrides={
  "data/portfolio/portfolio-confina.js":"tmp/portfolio-confina-2026-10-19-candidate.js",
  "data/portfolio/portfolio-confina-frozen-2026-10-02.js":"tmp/portfolio-confina-frozen-20261019-candidate.js",
  "data/fundings/fundings-confina.js":"tmp/fundings-confina-20261019-candidate.js",
  "data/fundings/funding-events-confina.js":"tmp/funding-events-confina-20261019-candidate.js"
};
const parse=file=>JSON.parse(fs.readFileSync(file,"utf8").replace(/^[\s\S]*?=\s*/,"").replace(/;\s*$/,""));
const ledger=parse("tmp/processing-confina-20261019-ledger.json");
const money=value=>Math.round(value*100)/100;
function load(previous){
  const elements=new Map();
  const getElementById=id=>{if(!elements.has(id))elements.set(id,{innerHTML:"",textContent:"",value:"",dataset:{},classList:{toggle(){}},setAttribute(){},addEventListener(){}});return elements.get(id);};
  const context=vm.createContext({console,Date,Intl,URLSearchParams,window:{location:{search:""},print(){}},document:{getElementById,querySelectorAll:()=>[],activeElement:null}});
  for(const file of files){
    let source=previous?execFileSync("git",["show",`${baseline}:${file}`],{encoding:"utf8",maxBuffer:64*1024*1024}):fs.readFileSync(candidate?overrides[file]||file:file,"utf8");
    if(file==="assets/app.js")source=source.replace(/\brender\(\);\s*$/,"");
    vm.runInContext(source,context,{filename:file});
  }
  return{context,elements};
}
const evaluate=(app,code)=>JSON.parse(JSON.stringify(vm.runInContext(code,app.context)));
const before=load(true),after=load(false);
assert.equal(evaluate(after,"state.dateKey"),"2026-10-19");
const purchaseActivity=(app)=>evaluate(app,"operationCashPositionAtDate(operations.find(op=>op.id==='confina-cra-65-200'),'2026-09-30').portfolioPurchase");
assert.equal(money(purchaseActivity(after)-purchaseActivity(before)),1718636.65,"Compra retroativa ausente ou duplicada no caixa");
function positions(app,date){return evaluate(app,`operations.map(op=>{
  const vp=roundMoney(operationPortfolioPositionAtDate(op,'${date}').portfolioVp),cash=cashBalanceAtDate(op,'${date}'),funding=fundingBalanceAtDate(op,'${date}');
  const g=guaranteeSummary({...op,cash,fundingBalance:funding},'${date}');
  return{id:op.id,name:op.shortName,vp,cash,funding,sub:roundMoney(vp+cash+operationSyntheticAdjustmentBalanceAtDate(op,'${date}')-funding),heads:g.totalHeads,transitHeads:g.transitHeads,purchasedHeads:g.purchasedTransitHeads,biological:roundMoney(g.value+g.transitValue+g.purchasedTransitValue),guarantee:roundMoney(g.coverageValue)};
})`);}
const dates=["2026-07-06","2026-08-31","2026-09-17","2026-09-29","2026-09-30","2026-10-01","2026-10-02","2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09","2026-10-13"];
const revision=[];
for(const date of dates){
  const original=positions(before,date),current=positions(after,date);
  for(const old of original){
    const next=current.find(row=>row.id===old.id);
    if(old.id!=="confina-cra-65-200"||date<"2026-09-30")assert.deepEqual(next,old,`Alteracao historica nao autorizada: ${date} ${old.id}`);
    else{
      assert.equal(money(next.vp-old.vp),1717502.55);
      assert.equal(next.funding,old.funding);
      for(const key of ["heads","transitHeads","purchasedHeads","biological"])assert.equal(next[key],old[key]);
      assert.ok(Math.abs(money(next.guarantee-old.guarantee)-money(next.cash-old.cash))<0.02);
      assert.ok(next.cash<old.cash);
      revision.push({date,before:old,after:next,delta:{vp:money(next.vp-old.vp),cash:money(next.cash-old.cash),funding:0,sub:money(next.sub-old.sub)}});
    }
  }
  const bornLater=current.find(row=>row.id==="confina-cra-65-outubro");
  for(const key of ["vp","cash","funding","sub"])assert.equal(bornLater[key],0,`Novo papel no passado: ${date} ${key}`);
}
const oldBio=evaluate(before,"biologicalAssetHistoryData"),newBio=evaluate(after,"biologicalAssetHistoryData");
assert.deepEqual(newBio,oldBio,"Composicao historica da garantia alterada sem novo relatorio");
assert.deepEqual(evaluate(after,"biologicalAssetData"),evaluate(before,"biologicalAssetData"));
const previousPortfolio=evaluate(before,"portfolioData.operations"),currentPortfolio=evaluate(after,"portfolioData.operations");
for(const old of previousPortfolio){
  const next=currentPortfolio.find(op=>op.operationId===old.operationId);
  for(const row of old.history){
    const current=next.history.find(item=>item.date===row.date);
    if(old.operationId!=="confina-cra-65-200"||row.date<"2026-09-30")assert.deepEqual(current,row,`Historico bruto alterado: ${old.operationId} ${row.date}`);
    else{
      assert.equal(money(current.presentValue-row.presentValue),1717502.55);
      assert.equal(current.activeTitles-row.activeTitles,6);
      assert.equal(money(current.purchases-row.purchases),row.date==="2026-09-30"?1718636.65:0);
      assert.equal(current.liquidations,row.liquidations);
    }
  }
}
for(const [id,seller]of Object.entries(ledger.sellers)){
  const newOp=currentPortfolio.find(op=>op.operationId===id);
  const event=newOp.cashEvents.filter(row=>row.date==="2026-10-14"&&row.titleId===`venda-65out-${id}`);
  assert.equal(event.length,1);
  assert.equal(event[0].amount,seller.cashReceived);
  const sourceIds=ledger.transferRows.filter(row=>row.sourceOperationId===id).map(row=>row.originalLastro);
  assert.ok(!newOp.cashEvents.some(row=>row.date==="2026-10-14"&&row.type==="portfolio_liquidation"&&sourceIds.includes(row.titleId)),`Venda duplicada: ${id}`);
  for(const titleId of sourceIds){const title=newOp.titles.find(t=>t.id===titleId);assert.equal(title.settledDate,"2026-10-14",`Transferencia sem data correta: ${titleId}`);}
  assert.ok(seller.saleResult>0,`Resultado de venda negativo: ${id}`);
}
const newPaper=currentPortfolio.find(op=>op.operationId==="confina-cra-65-outubro");
assert.equal(newPaper.titles.length,89);
assert.ok(newPaper.titles.every(title=>title.presentValueMethod==="motor"&&title.purchaseDate==="2026-10-14"));
assert.equal(newPaper.cashEvents.filter(row=>row.type==="portfolio_purchase").length,1);
assert.equal(newPaper.cashEvents[0].amount,75790266.29);
assert.ok(!newPaper.cashEvents.some(row=>row.date<"2026-10-14"));
const initial=positions(after,"2026-10-14").find(row=>row.id==="confina-cra-65-outubro");
assert.equal(initial.vp,75108237.81);assert.equal(initial.cash,0);assert.equal(initial.funding,75790266.29);assert.equal(initial.sub,-682028.48);
const title484791=currentPortfolio.find(op=>op.operationId==="confina-cra-65-200").titles.find(t=>t.id==="484791");
assert.equal(title484791.settledDate,"2026-10-16");
const correctedReceipt=currentPortfolio.find(op=>op.operationId==="confina-cra-65-200").cashEvents.filter(row=>row.titleId==="484791"&&row.type==="portfolio_liquidation");
assert.equal(correctedReceipt.length,1);assert.equal(correctedReceipt[0].date,"2026-10-16");assert.equal(correctedReceipt[0].amount,772108.61);
const migration=currentPortfolio.find(op=>op.operationId==="confina-cprf-100").titles.find(t=>t.id==="498048");
assert.equal(migration.settledWithoutDate,false);assert.equal(migration.settledDate,"2026-10-14");
const partial=newPaper.titles.find(t=>t.id==="555143");
assert.equal(partial.acquisitionValue,2979742.92);assert.equal(partial.faceValue,3081438.59);assert.deepEqual(partial.partialLiquidations,[]);
const fundChecks=evaluate(after,`manualFundingEvents.events.filter(e=>e.date==='2026-10-15').map(e=>{const op=operations.find(op=>op.id===e.operationId);return{...e,applied:op.fundingComponents.flatMap(c=>c.events).filter(r=>r.manual&&r.date===e.date&&r.note===e.note).reduce((sum,r)=>sum+r.amount,0)};})`);
assert.equal(fundChecks.length,4);
for(const check of fundChecks)assert.equal(check.applied,check.amount);
assert.equal(money(fundChecks.reduce((sum,row)=>sum+row.amount,0)),18460963.33);
const days=["2026-10-14","2026-10-15","2026-10-16","2026-10-19"].map(date=>{
  const rows=positions(after,date);
  const cash=evaluate(after,`operations.map(op=>{const r=operationCashPositionAtDate(op,'${date}');return{id:op.id,initial:r.initialBalance,purchases:r.portfolioPurchase,receipts:r.portfolioLiquidation,payments:r.fundingAmortization,inflows:r.investorInflow,adjustments:r.adjustment,income:r.investmentIncome,closing:r.currentBalance};})`);
  for(const row of cash)assert.ok(Math.abs(row.initial+row.inflows-row.purchases+row.receipts-row.payments+row.adjustments+row.income-row.closing)<0.03,`Caixa nao concilia: ${date} ${row.id}`);
  assert.equal(evaluate(after,`biologicalAssetDataForDate('${date}').referenceDate`),"2026-10-13");
  evaluate(after,`state.dateKey='${date}';render();true`);
  for(const id of ["result-table","guarantee-management-table","quotes-regional-matrix"])assert.ok(!/NaN|Infinity|undefined/.test(after.elements.get(id).innerHTML));
  assert.ok(after.elements.get("result-table").innerHTML.includes("CRA 65a Out/26"));
  const totals=rows.reduce((sum,row)=>{for(const key of ["vp","cash","funding","sub"])sum[key]=money((sum[key]||0)+row[key]);return sum;},{});
  return{date,guaranteeLabel:evaluate(after,`guaranteeSnapshotLabel('${date}')`),totals,operations:rows,cash};
});
const report={baseline,ledger,portfolioSources:evaluate(after,"portfolioData.sourceFiles"),pendingGuaranteeReport:"Relatorio de 42_2026-10-20T17_23_47.069Z.csv",authorizedHistoricalRevision:revision,historicalBiologicalCompositionUnchanged:true,guaranteePending:true,fundingEventsApplied:fundChecks,days};
fs.writeFileSync("tmp/verified-positions-20261019.json",`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({initialNewPaper:initial,revision30:revision.find(row=>row.date==="2026-09-30"),revision13:revision.find(row=>row.date==="2026-10-13"),days:days.map(({date,guaranteeLabel,totals})=>({date,guaranteeLabel,totals})),fundingPayments:money(fundChecks.reduce((sum,row)=>sum+row.amount,0))},null,2));
