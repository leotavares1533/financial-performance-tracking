import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

const baseline="789b90c";
const read=(file)=>JSON.parse(fs.readFileSync(file,"utf8").replace(/^[\s\S]*?=\s*/,"").replace(/;\s*$/,""));
const readBaseline=file=>execFileSync("git",["show",`${baseline}:${file}`],{encoding:"utf8",maxBuffer:64*1024*1024});
const baselineObject=file=>{
  const source=readBaseline(file);
  if(file.endsWith(".json"))return JSON.parse(source);
  const scope={window:{}};
  vm.runInNewContext(source,scope,{filename:file});
  return JSON.parse(JSON.stringify(Object.values(scope.window)[0]));
};
const writeJson=(file,data)=>fs.writeFileSync(file,`${JSON.stringify(data,null,2)}\n`);
const writeJs=(file,name,data)=>fs.writeFileSync(file,`window.${name} = ${JSON.stringify(data,null,2)};\n`);
const round=value=>Math.round((value+Number.EPSILON)*100)/100;
const newId="confina-cra-65-outubro";
const date="2026-10-14";
const principal=75790266.29;
const now=new Date().toISOString();
const previous=baselineObject("data/portfolio/portfolio-confina.js");
const incoming=read("tmp/portfolio-new-65-outubro-candidate.js").operations[0];
const files=[...fs.readFileSync("index.html","utf8").matchAll(/<script src="\.\/([^"?]+)(?:\?[^\"]*)?"/g)].map(match=>match[1]).filter(file=>!/^data\/(biological|pecuaria)\//.test(file));
const node={value:"",innerHTML:"",dataset:{},classList:{toggle(){}},setAttribute(){},addEventListener(){}};
const context=vm.createContext({console,Date,Intl,URLSearchParams,window:{location:{search:""}},document:{getElementById:()=>node,querySelectorAll:()=>[]}});
for(const file of files)vm.runInContext(readBaseline(file).replace(/\brender\(\);\s*$/,""),context,{filename:file});
const evaluate=code=>JSON.parse(JSON.stringify(vm.runInContext(code,context)));
const manual=baselineObject("data/portfolio/manual-portfolio-adjustments-confina.json");
const append=event=>{assert.ok(!manual.events.some(row=>row.id===event.id),`Ajuste repetido: ${event.id}`);manual.events.push(event);};
append({id:"correcao-pagamento-484791-20261016",operationId:"confina-cra-65-200",type:"title_override",titleId:"484791",paymentDateOverrides:[{fromDate:"2026-07-03",toDate:"2026-10-16",amount:772108.61}],note:"Data efetiva 16/10 confirmada pelo usuario em 20/10; nao registrar recebimento anterior a compra."});
append({id:"transferencia-498048-555142-20261014",operationId:"confina-cprf-100",type:"title_override",titleId:"498048",settledDate:date,note:"Baixa por venda ao novo CRA 65a Outubro, lastro 555142, cessao de 14/10. Preservar posicoes anteriores."});
for(const titleId of ["542982","542983","542984","542985","542986","542987"]){
  append({id:`confissao-${titleId}-compra-autorizada-20260930`,operationId:"confina-cra-65-200",type:"title_override",titleId,purchaseDate:"2026-09-30",purchaseDateSource:"compra_confirmada_usuario",portfolioEligible:true,note:"Usuario confirmou em 20/10 a compra com saida de caixa em 30/09 e autorizou corrigir o historico; o status pendente anterior foi superado."});
}
const sellerAmounts={"confina-cprf-100":33787444.78,"confina-cprf-50":9042510.79,"confina-cra-42-50":12857333.84};
const transferRows=[];
for(const title of incoming.titles){
  const matches=previous.operations.flatMap(op=>op.titles.filter(t=>[t.id,t.originalLastro,t.controlReferenceLastro].filter(Boolean).includes(title.originalLastro)).map(t=>({operationId:op.operationId,title:t})));
  assert.ok(matches.length<=1,`Lastro de origem ambiguo: ${title.originalLastro}`);
  if(!matches.length){transferRows.push({newLastro:title.id,originalLastro:title.originalLastro,sourceOperationId:null,acquisitionValue:title.acquisitionValue,reportedAcquisitionValue:title.acquisitionValue});continue;}
  const match=matches[0];
  assert.ok(sellerAmounts[match.operationId],`Origem nao prevista: ${match.operationId}`);
  context.originTitle=match.title;
  const value=evaluate(`roundMoney(portfolioTitleValueAtDate(originTitle,'${date}','${date}'))`);
  const face=evaluate(`roundMoney(portfolioTitleFaceValueAtDate(originTitle,'${date}','${date}'))`);
  const monthlyRate=evaluate("portfolioMonthlyRateDecimal(originTitle)");
  assert.ok(value>0,`Titulo cedido sem VP calculado: ${title.originalLastro}`);
  append({id:`base-transferencia-65out-20261014-${title.id}`,operationId:newId,type:"title_override",titleId:title.id,acquisitionValue:value,faceValue:face,monthlyRate,rateSource:"taxa_origem_transferencia",allowPresentValueAboveFace:match.title.allowPresentValueAboveFace,controlReferenceLastro:title.originalLastro,note:"D0 pelo VP calculado na origem em 14/10, liquido das baixas anteriores; sem usar VP do sistema e sem rateio."});
  transferRows.push({newLastro:title.id,originalLastro:title.originalLastro,sourceOperationId:match.operationId,acquisitionValue:value,reportedAcquisitionValue:title.acquisitionValue,outstandingFaceValue:face,monthlyRate});
}
for(const [operationId,amount]of Object.entries(sellerAmounts)){
  const rows=transferRows.filter(row=>row.sourceOperationId===operationId);
  append({id:`venda-65out-20261014-${operationId}`,operationId,date,type:"portfolio_liquidation",mode:"replace_title_group_day_type",titleId:`venda-65out-${operationId}`,replaceTitleIds:rows.map(row=>row.originalLastro),amount,note:"Recebimento total efetivo pela venda ao CRA 65a Outubro, informado pelo usuario. Substitui apenas os recebimentos dos titulos transferidos, sem duplicacao."});
}
append({id:"compra-total-65out-20261014",operationId:newId,date,type:"portfolio_purchase",mode:"replace_operation_day_type",titleId:"compra-total-65out",amount:principal,note:"Custo financeiro integral do novo papel em 14/10, igual ao funding; caixa D0 zerado. Valor economico independente, pelo motor de precificacao."});
manual.updatedAt="2026-10-20";
manual.description="Ajustes persistidos, incluindo transferencia de 14/10 e correcao autorizada das seis confissoes em 30/09.";
manual.totals={...manual.totals,rows:manual.events.length,amount:round(manual.events.reduce((sum,event)=>sum+Number(event.amount||0),0))};
writeJson("tmp/manual-portfolio-adjustments-20261019-candidate.json",manual);
const fundings=baselineObject("data/fundings/fundings-confina.js");
const template=structuredClone(fundings.operations.find(op=>op.id==="confina-cras-carteira-10"));
const name="Confina CRA 65a - Outubro/2026",shortName="CRA 65a Out/26";
const component={...template.fundingComponents[0],sheet:name,operationLabel:shortName,principal,startDate:date,issueDate:date,fundingBalance:principal,workbookBalanceAtPosition:principal,calculatedBalanceAtPosition:principal,events:[],rateSchedule:[]};
const operation={...template,id:newId,name,shortName,positionDate:date,sourceSheets:[name],issueDate:date,fundingPrincipal:principal,fundingBalance:principal,syntheticSub:-principal,fundingComponents:[component]};
fundings.operations.splice(fundings.operations.findIndex(op=>op.id==="confina-cra-65-setembro")+1,0,operation);
fundings.positionDate="2026-10-19";fundings.exportedAt=now;
writeJs("tmp/fundings-confina-20261019-candidate.js","ceresFundingData",fundings);
const fundingEvents=baselineObject("data/fundings/funding-events-confina.js");
const events=[
  {operationId:"confina-cra-65-200",date:"2026-10-15",amount:485522.13,interestPaid:0,amortization:485522.13,note:"BoiPremium FR28/FR29: baixa apenas do principal confirmada no e-mail; juros R$ 1.737,76 pendentes, nao pagos."},
  {operationId:"confina-cra-65-200",date:"2026-10-15",amount:7956495.72,interestPaid:3315.56,amortization:7953180.16,note:"Amortizacao Fabio Schmitt FS65 a FS75, total/parcial conforme demonstrativo de 15/10."},
  {operationId:"confina-cra-65-200",date:"2026-10-15",amount:2728261.81,interestPaid:21250.60,amortization:2707011.21,note:"Amortizacao Green Farming GF93/GF95/GF96/GF97 conforme demonstrativo de 15/10."},
  {operationId:"confina-cra-42-50",date:"2026-10-15",amount:7290683.67,interestPaid:0,amortization:7290683.67,note:"Pagamento do funding CRA 42a 50MM em 15/10, valor informado diretamente pelo usuario."}
];
for(const event of events){assert.ok(!fundingEvents.events.some(row=>row.operationId===event.operationId&&row.date===event.date&&row.note===event.note));fundingEvents.events.push(event);}
fundingEvents.updatedAt="2026-10-20";
writeJs("tmp/funding-events-confina-20261019-candidate.js","ceresFundingManualEvents",fundingEvents);
const rowsByOperation=Object.fromEntries(Object.entries(sellerAmounts).map(([id,cash])=>{const rows=transferRows.filter(row=>row.sourceOperationId===id);const vp=round(rows.reduce((sum,row)=>sum+row.acquisitionValue,0));return[id,{titleCount:rows.length,carryingValue14:vp,cashReceived:cash,saleResult:round(cash-vp)}];}));
const acquisitionValue=round(transferRows.reduce((sum,row)=>sum+row.acquisitionValue,0));
const ledger={baseline,authorizedHistoricalRevision:{operationId:"confina-cra-65-200",date:"2026-09-30",titleIds:["542982","542983","542984","542985","542986","542987"],purchaseAmount:1718636.65,userAuthorizationDate:"2026-10-20"},newOperation:{operationId:newId,date,principal,acquisitionValue,initialCash:0,initialSyntheticSub:round(acquisitionValue-principal),titles:transferRows.length},sellers:rowsByOperation,externalSeller:{name:"Ceres Confina LTDA",cashAmount:20102976.89,controlled:false},sourceRoundingDifference:round(20102976.89+Object.values(sellerAmounts).reduce((sum,amount)=>sum+amount,0)-principal),transferRows,fundingPayments:events,guaranteePending:true};
writeJson("tmp/processing-confina-20261019-ledger.json",ledger);
console.log(JSON.stringify({...ledger,transferRows:undefined},null,2));
