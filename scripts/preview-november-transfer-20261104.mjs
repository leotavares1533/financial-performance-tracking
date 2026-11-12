import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const out = path.resolve('../outputs/processamento-confina-20261110');
const audit = JSON.parse(fs.readFileSync(path.join(out, 'validacao-titulos.json'), 'utf8'));
const cash = {
  'ceres-confina-ltda': 32838115.49,
  'confina-cprf-100': 18247328.90,
  'confina-cprf-50': 7972901.22,
};
const expected = {'ceres-confina-ltda':27, 'confina-cprf-100':13, 'confina-cprf-50':6};
const round = x => Math.round(x * 100) / 100;
const context = vm.createContext({ console, Date, Intl, URLSearchParams,
  window: {location:{search:''}, ceresFinanceEngineOnly:true, ceresParallelControlEngineOnly:true},
  document:{getElementById:()=>null, querySelectorAll:()=>[]} });
const scripts = [...fs.readFileSync('index.html','utf8').matchAll(/<script src="\.\/([^"?]+)(?:\?[^"]*)?"/g)]
  .map(match=>match[1]).filter(file=>!/^data\/(biological|pecuaria)\//.test(file));
for (const file of scripts) vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const read = file => JSON.parse(fs.readFileSync(file,'utf8').split(/=([\s\S]*)/)[1].trim().replace(/;$/,''));
const portfolio = read('data/portfolio/portfolio-confina.js');
const rows=[];
for (const source of audit.novemberTransfers) {
  let title;
  let method;
  if (source.op in expected && source.op !== 'ceres-confina-ltda') {
    const op=portfolio.operations.find(o=>o.operationId===source.op);
    const candidates=op.titles.filter(t=>t.id===source.lastro && !t.isIgnored);
    assert.equal(candidates.length,1, `Ambiguous origin ${source.op}/${source.lastro}`);
    title=structuredClone(candidates[0]);
    assert.ok(!title.settledDate || title.settledDate>'2026-11-03');
    method='motor gerencial da origem, sem VP do sistema';
  } else {
    const raw=audit.novemberTransfers.find(r=>r.lastro===source.lastro);
    title={id:source.lastro, lastro:source.lastro, invoice:source.invoice,
      purchaseDate:source.purchase, maturityDate:source.maturity, faceValue:source.face,
      acquisitionValue:source.acquisition, discountRateMonthly:source.rate,
      accrualBaseDays:360, accrualDayCount:'calendar_inclusive', portfolioEligible:true,
      paymentStatus:'VINCENDO', settledDate:'', partialLiquidations:[]};
    assert.ok(title.discountRateMonthly>0 && title.discountRateMonthly<.1);
    method='previa pela aquisicao e taxa da origem externa; sem controle do resultado da LTDA';
  }
  context.title=title;
  const value=vm.runInContext("portfolioTitleValueAtDate(title,'2026-11-04','2026-11-10')",context);
  rows.push({...source,sourceEconomicVp:round(value),sourceEconomicRate:title.discountRateMonthly,
    sourceDayCount:title.accrualDayCount, method, managerialId:title.id});
}
const groups=Object.fromEntries(Object.entries(expected).map(([op,count])=>{
  const titles=rows.filter(r=>r.op===op);
  assert.equal(titles.length,count);
  assert.equal(new Set(titles.map(r=>r.lastro)).size,count);
  const sourceVp=round(titles.reduce((sum,r)=>sum+r.sourceEconomicVp,0));
  return [op,{count,cashConfirmed:cash[op],sourceVp,
    saleGainPreview:op==='ceres-confina-ltda'?null:round(cash[op]-sourceVp)}];
}));
assert.equal(rows.length,46);
const initialFunding=round(Object.values(cash).reduce((a,b)=>a+b,0));
assert.equal(initialFunding,59058345.61);
const acquisition=round(rows.reduce((sum,r)=>sum+r.sourceEconomicVp,0));
const result={status:'RASCUNHO_NAO_PUBLICADO', tradeDate:'2026-11-04', fundingMonthlyRate:.017,
  initialFunding, sourceVpPreview:acquisition, initialGapPreview:round(acquisition-initialFunding),
  groups, titles:rows, notes:[
    'Os tres lastros 553579, 558700 e 558701 foram incluidos conforme orientacao expressa.',
    'Na origem, baixa de ativo e entrada de caixa sao movimentos diferentes. Nao somar o Valor Pago do CSV ao caixa confirmado.',
    'As origens externas nao adicionam caixa ou resultado a nenhum veiculo controlado.',
    'Previa de validacao. Nao altera carteira, funding, caixa, garantias, fechamentos ou site.',
  ]};
fs.writeFileSync(path.join(out,'previa-cessao-0411.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,initialFunding,sourceVpPreview:acquisition,
  initialGapPreview:result.initialGapPreview, groups}));
