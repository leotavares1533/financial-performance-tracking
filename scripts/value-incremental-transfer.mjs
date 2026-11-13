import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const out=path.resolve(process.argv[2]);
const audit=JSON.parse(fs.readFileSync(path.join(out,'audit-full.json'),'utf8'));
const source=JSON.parse(fs.readFileSync(path.join(out,'source-normalized.json'),'utf8'));
const authorization=JSON.parse(fs.readFileSync(path.join(out,'authorization.json'),'utf8'));
const ctx=vm.createContext({console,Date,Intl,URLSearchParams,window:{location:{search:''},ceresFinanceEngineOnly:true},
  document:{getElementById:()=>null,querySelectorAll:()=>[]}});
for(const m of fs.readFileSync('index.html','utf8').matchAll(/<script src="\.\/([^"?]+)(?:\?[^"]*)?"/g)){
  if(!/^data\/(biological|pecuaria)\//.test(m[1]))vm.runInContext(fs.readFileSync(m[1],'utf8'),ctx,{filename:m[1]});
}
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').split(/=([\s\S]*)/)[1].trim().replace(/;$/,''));
const portfolio=read('data/portfolio/portfolio-confina.js');
const date=authorization.tradeDate;
const rows=[];
const sales=audit.paymentChanges.filter(r=>r.source.paidDate===date&&r.source.destination.includes(authorization.destinationText));
for(const sale of sales){
  const op=portfolio.operations.find(o=>o.operationId===sale.op);
  const title=op.titles.find(t=>t.id===sale.id);
  assert.ok(title&&!title.isIgnored&&(!title.settledDate||title.settledDate>audit.cutoff));
  ctx.title=title;
  const value=vm.runInContext(`roundMoney(portfolioTitleValueAtDate(title,'${date}','${audit.cutoff}'))`,ctx);
  assert.ok(value>0);
  rows.push({...sale.source,managerialId:title.id,economicVp:value,originTitle:title});
}
for(const r of source.filter(r=>r.op==='ceres-confina-ltda'&&r.paidDate===date&&r.destination.includes(authorization.destinationText))){
  const title={id:r.lastro,lastro:r.lastro,invoice:r.invoice,purchaseDate:r.purchase,maturityDate:r.maturity,
    acquisitionValue:r.acquisition,faceValue:r.face,discountRateMonthly:r.rate,
    accrualBaseDays:360,accrualDayCount:'calendar_inclusive',portfolioEligible:true,isActive:true,partialLiquidations:[]};
  ctx.title=title;
  const value=vm.runInContext(`roundMoney(portfolioTitleValueAtDate(title,'${date}','${audit.cutoff}'))`,ctx);
  assert.ok(value>0,`External origin must be priced: ${r.lastro}`);
  rows.push({...r,managerialId:r.lastro,economicVp:value,originTitle:title});
}
const expectedCount=Object.values(authorization.expectedCountsBySeller).reduce((s,n)=>s+n,0);
assert.equal(rows.length,expectedCount);
assert.equal(new Set(rows.map(r=>`${r.op}|${r.managerialId}`)).size,expectedCount);
const round=n=>Math.round(n*100)/100;
const groups=Object.fromEntries(Object.entries(authorization.cashBySeller).map(([op,cash])=>{
  const items=rows.filter(r=>r.op===op);const economicVp=round(items.reduce((s,r)=>s+r.economicVp,0));
  assert.equal(items.length,authorization.expectedCountsBySeller[op]);
  return [op,{count:items.length,cash,economicVp,gain:op==='ceres-confina-ltda'?null:round(cash-economicVp)}];
}));
const result={date,rows,groups,acquisition:round(rows.reduce((s,r)=>s+r.economicVp,0)),
  funding:authorization.fundingAmount,roundingDifference:round(authorization.fundingAmount-Object.values(authorization.cashBySeller).reduce((s,n)=>s+n,0))};
assert.equal(result.roundingDifference,.01);
fs.writeFileSync(path.join(out,'transfer-valued.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({date,count:rows.length,groups,acquisition:result.acquisition,funding:result.funding,
  initialGap:round(result.acquisition-result.funding),roundingDifference:result.roundingDifference}));
