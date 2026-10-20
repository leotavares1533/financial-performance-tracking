import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

const file="data/portfolio/portfolio-confina-frozen-2026-10-02.js";
const context={window:{}};
vm.runInNewContext(execFileSync("git",["show",`789b90c:${file}`],{encoding:"utf8",maxBuffer:64*1024*1024}),context);
const data=JSON.parse(JSON.stringify(context.window.ceresFrozenPortfolioData));
const operation=data.operations.find(op=>op.operationId==="confina-cra-65-200");
const ids=new Set(["542982","542983","542984","542985","542986","542987"]);
const titles=operation.ignoredTitles.filter(title=>ids.has(title.id));
const money=value=>Math.round(value*100)/100;
assert.equal(titles.length,6,"As seis confissoes devem existir no snapshot como pendentes.");
const purchase=titles.reduce((sum,title)=>sum+title.acquisitionValue,0);
const face=titles.reduce((sum,title)=>sum+title.faceValue,0);
assert.equal(money(purchase),1718636.65);
assert.equal(money(face),1717502.55);
const date="2026-09-30",revisionId="confissoes-20260930-autorizadas-20261020";
const oldTotals={...operation.totals};
for(const title of titles){
  assert.equal(title.purchaseDate,date);
  title.portfolioEligible=true;title.isActive=true;
  title.titleStatus="EM CARTEIRA";title.paymentStatus="VINCENDO";
  title.presentValue=title.faceValue;
  title.authorizedRevisionId=revisionId;
  operation.titles.push(title);
  operation.cashEvents.push({operationId:operation.operationId,date,type:"portfolio_purchase",amount:title.acquisitionValue,titleId:title.id,note:"Compra em 30/09 confirmada pelo usuario em 20/10, com saida efetiva de caixa.",source:"autorizacao_usuario_2026-10-20",authorizedRevisionId:revisionId});
}
operation.ignoredTitles=operation.ignoredTitles.filter(title=>!ids.has(title.id));
operation.titles.sort((a,b)=>a.purchaseDate.localeCompare(b.purchaseDate)||a.maturityDate.localeCompare(b.maturityDate)||a.id.localeCompare(b.id));
operation.cashEvents.sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type)||a.titleId.localeCompare(b.titleId));
for(const row of operation.history){
  if(row.date<date)continue;
  row.activeTitles+=titles.length;
  row.faceValue=money(row.faceValue+face);
  row.presentValue=money(row.presentValue+face);
  if(row.date===date)row.purchases=money(row.purchases+purchase);
}
operation.totals={...oldTotals,uniqueTitles:oldTotals.uniqueTitles+6,ignoredTitles:oldTotals.ignoredTitles-6,activeTitles:oldTotals.activeTitles+6,portfolioVn:money(oldTotals.portfolioVn+face),portfolioVp:money(oldTotals.portfolioVp+face),acquisitionValue:money(oldTotals.acquisitionValue+purchase),cashPurchases:money(oldTotals.cashPurchases+purchase)};
operation.totals.weightedRateMonthly=(oldTotals.weightedRateMonthly*oldTotals.portfolioVp+titles.reduce((sum,title)=>sum+title.faceValue*title.discountRateMonthly,0))/operation.totals.portfolioVp;
const daysBetween=(start,end)=>Math.round((Date.parse(end)-Date.parse(start))/86400000);
operation.totals.weightedDaysToMaturity=(oldTotals.weightedDaysToMaturity*oldTotals.portfolioVp+titles.reduce((sum,title)=>sum+title.faceValue*Math.max(0,daysBetween(operation.positionDate,title.maturityDate)),0))/operation.totals.portfolioVp;
data.updatedAt=new Date().toISOString();
data.authorizedRevisions=[...(data.authorizedRevisions||[]),{id:revisionId,operationId:operation.operationId,effectiveDate:date,authorizedAt:"2026-10-20",titleIds:[...ids],purchaseAmount:money(purchase),portfolioFaceValue:money(face),note:"Usuario confirmou saida de caixa em 30/09 e autorizou corrigir o historico. Nenhuma outra revisao retroativa."}];
const output="tmp/portfolio-confina-frozen-20261019-candidate.js";
fs.writeFileSync(output,`window.ceresFrozenPortfolioData = ${JSON.stringify(data,null,2)};\n`);
console.log(JSON.stringify({output,revision:data.authorizedRevisions.at(-1),oldTotals: {vp:oldTotals.portfolioVp,purchases:oldTotals.cashPurchases},newTotals:{vp:operation.totals.portfolioVp,purchases:operation.totals.cashPurchases}},null,2));
