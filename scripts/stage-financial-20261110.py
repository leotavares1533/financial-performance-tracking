import collections
import copy
import csv
import hashlib
import importlib.util
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'outputs/processamento-confina-20261110'
DATE = '2026-11-10'
CUTOFF = '2026-11-03'
BUYER = 'confina-cra-42-novembro'
spec = importlib.util.spec_from_file_location('portfolio_importer', ROOT / 'scripts/import-confina-portfolio.py')
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


def read_js(file):
    return json.loads(file.read_text(encoding='utf-8-sig').split('=', 1)[1].strip().rstrip(';'))


def write_js(name, variable, value):
    (OUT / name).write_text(f'window.{variable} = {json.dumps(value, ensure_ascii=False, indent=2)};\n', encoding='utf-8')


def title_from_source(r, operation, purchase=None, acquisition=None):
    monthly, annual, daily, rate_source, base, day_count = imp.normalized_rates(
        {'Taxa desconto':r['rate']*100, 'base de dias':r['base']},
        {imp.normalize_text(k):k for k in ['Taxa desconto', 'base de dias']}, r['lastro'])
    item = imp.synthetic_title_from_adjustment(dict(
        titleId=r['lastro'], purchaseDate=purchase or r['purchase'], maturityDate=r['maturity'],
        acquisitionValue=r['acquisition'] if acquisition is None else acquisition,
        faceValue=r['face'], monthlyRate=monthly, accrualBaseDays=base,
        accrualDayCount=day_count, invoice=r['invoice'], cedente=r['cedente'], sacado=r['sacado'],
        rateSource=rate_source, paymentStatus='VINCENDO'), operation, DATE)
    assert item is not None
    item.update(reportName=r['op'], sourceRow=r.get('line',0), titleType=r['titleType'],
                uf=r['uf'], sourceFormat='GER004_veiculo_20261111', sourceLastro=r['lastro'])
    return item


audit = json.loads((OUT / 'validacao-titulos.json').read_text(encoding='utf-8'))
source = json.loads((OUT / 'fonte-normalizada.json').read_text(encoding='utf-8'))
preview = json.loads((OUT / 'previa-cessao-0411.json').read_text(encoding='utf-8'))
original = read_js(ROOT / 'data/portfolio/portfolio-confina.js')
assert all(op['positionDate']==CUTOFF for op in original['operations']), 'O fechamento-base mudou; reconciliar antes de rodar novamente.'
portfolio = copy.deepcopy(original)
ops = {o['operationId']:o for o in portfolio['operations']}
manual=json.loads((ROOT/'data/portfolio/manual-portfolio-adjustments-confina.json').read_text(encoding='utf-8-sig'))
denipoti={'566696':'569101','566697':'569102','566707':'569103'}
for event in manual['events']:
    if event.get('operationId')=='confina-cra-65-200' and event.get('type')=='synthetic_title' and event.get('titleId') in denipoti:
        event.update(cashPurchaseAmount=0,purchaseDateSource='substituicao_confirmada_usuario_sem_caixa',
                     sourceLastro=denipoti[event['titleId']],
                     note='Substituicao de Joao Leopoldo por Jose Denipoti em 04/11, sem nova saida de caixa; confirmado pelo usuario em 11/11. Sem duplicar recebimentos de Joao.')
ops['confina-cra-65-200']['cashEvents']=[e for e in ops['confina-cra-65-200']['cashEvents']
    if not(e['date']=='2026-11-04' and e['type']=='portfolio_purchase' and e.get('titleId') in denipoti)]
for title in ops['confina-cra-65-200']['titles']:
    if title['id'] in denipoti:
        title.update(cashPurchaseAmount=0,sourceLastro=denipoti[title['id']],
                     purchaseDateSource='substituicao_confirmada_usuario_sem_caixa')
duplicate_aliases={'416108':'546165','447894':'546166'}
for title in ops['confina-cras-carteira-10']['titles']:
    if title['id'] in duplicate_aliases:
        title.update(settledDate='2026-11-04',isActive=False,titleStatus='SUBSTITUIDO PELO REGISTRO REPORTADO',
                     paymentStatus='BAIXA POR SUBSTITUICAO',cashPurchaseAmount=0,
                     supersededByTitle=duplicate_aliases[title['id']],
                     exclusionNote='Retirada da copia manual somente de 04/11 em diante, sem caixa, autorizada pelo usuario.')
for event in manual['events']:
    if event.get('operationId')=='confina-cras-carteira-10' and event.get('type')=='synthetic_title' and event.get('titleId') in duplicate_aliases:
        event.update(settledDate='2026-11-04',cashPurchaseAmount=0,
                     supersededByTitle=duplicate_aliases[event['titleId']],
                     note='Copia manual substituida pelo titulo reportado somente a partir de 04/11, sem novo recebimento. Historico ate 03/11 preservado.')
old_receipts = collections.Counter()
old_raw = imp.read_csv(Path.home() / 'Downloads/CRA_GER004 - Títulos (3).csv')
columns = {imp.normalize_text(k):k for k in old_raw[0] if k}
for r in old_raw:
    paid_date = imp.date_key(imp.parse_date(imp.row_get(r, columns, 'Data do pagamento')))
    if paid_date and paid_date <= CUTOFF:
        op = imp.operation_id_for_name(imp.row_get(r, columns, 'Nome CRA'), '')
        old_receipts[(op, str(imp.row_get(r, columns, 'Lastro')).strip())] += imp.parse_number(imp.row_get(r, columns, 'Valor pago'))

november_keys = {(r['op'],r['lastro']) for r in audit['novemberTransfers']}
receipt_events, purchase_events, warnings = [], [], []
for match in audit['matches']:
    opid, ident = match['op'], match['id']
    op = ops[opid]
    title = next(t for t in op['titles'] if t['id']==ident)
    r = match['source']
    title['sourceLastro'] = r['lastro']
    if title.get('isIgnored') or (title.get('settledDate') and title['settledDate'] <= CUTOFF):
        continue
    if (opid,r['lastro']) in november_keys:
        continue
    paid_date = r['paidDate']
    if not paid_date or paid_date <= CUTOFF or paid_date > DATE:
        continue
    paid = round(r['paid'] - old_receipts[(opid,ident)],2)
    if paid < 0:
        warnings.append(dict(type='negative_new_payment', op=opid, id=ident, amount=paid))
        continue
    if paid:
        event=dict(operationId=opid, titleId=ident, date=paid_date, type='portfolio_liquidation',
                   amount=paid, source='GER004_20261111_incremental',
                   note='Diferenca do Valor Pago acumulado contra o relatorio anterior; nunca repetir recebimentos ja fechados.')
        op['cashEvents'].append(event)
        receipt_events.append(event)
    if r['status'] in {'LIQUIDADO','BAIXA MANUAL'}:
        title.update(settledDate=paid_date, isActive=False, paymentStatus=r['paymentStatus'], titleStatus=r['status'])
    elif r['status']=='BAIXA PARCIAL' and paid:
        title.setdefault('partialLiquidations',[]).append(dict(date=paid_date,amount=paid))
        title['partialLiquidationAmount']=round(sum(p['amount'] for p in title['partialLiquidations']),2)
        title.update(paymentStatus=r['paymentStatus'],titleStatus=r['status'])

# Exclusao expressamente autorizada somente para os novos dias, sem entrada de caixa.
fs135=next(t for t in ops['confina-cprf-100']['titles'] if t['id']=='519622')
fs135.update(settledDate='2026-11-04', isActive=False, titleStatus='BAIXA POR EXCLUSAO',
             paymentStatus='BAIXA POR EXCLUSAO', exclusionEffectiveDate='2026-11-04',
             exclusionNote='Usuario confirmou retirada somente de 04/11 em diante, sem refazer a compra passada e sem supor devolucao de caixa.')
manual['events'].append(dict(id='exclusao-prospectiva-20261104-519622',operationId='confina-cprf-100',
    type='title_override',titleId='519622',settledDate='2026-11-04',
    note='Retirada somente de 04/11 em diante confirmada pelo usuario. Historico ate 03/11 preservado; sem recebimento ficticio.'))

new_raw = {(r['op'],r['lastro']):r for r in source}
new_ids = collections.defaultdict(set)
for r in audit['newRecords']:
    if not CUTOFF < r['purchase'] <= DATE or r['status']!='EM CARTEIRA':
        continue
    op=ops[r['op']]
    assert r['lastro'] not in {t['id'] for t in op['titles']}
    raw = new_raw[(r['op'],r['lastro'])]
    title=title_from_source(raw,r['op'])
    op['titles'].append(title)
    new_ids[r['op']].add(title['id'])
    event=dict(operationId=r['op'],titleId=title['id'],date=r['purchase'],type='portfolio_purchase',
               amount=title['acquisitionValue'],source='GER004_20261111_incremental')
    op['cashEvents'].append(event)
    purchase_events.append(event)

buyer_titles=[]
for r in preview['titles']:
    raw=new_raw[(r['op'],r['lastro'])]
    if r['op'] in ops:
        origin=next(t for t in ops[r['op']]['titles'] if t['id']==r['managerialId'])
        buyer_title=copy.deepcopy(origin)
        remaining_face=imp.accrued_value({**origin,'settledDate':''},'2026-11-04')
        buyer_title['faceValue']=round(origin['faceValue']-sum(p['amount'] for p in origin.get('partialLiquidations',[]) if p['date']<='2026-11-04'),2)
        buyer_title.update(partialLiquidations=[],partialLiquidationAmount=0)
        origin.update(settledDate='2026-11-04',isActive=False,paymentStatus='Baixa por venda',titleStatus='LIQUIDADO',transferDestination=BUYER)
    else:
        buyer_title=title_from_source(raw,BUYER,purchase='2026-11-04',acquisition=r['sourceEconomicVp'])
    buyer_title.update(operationId=BUYER, id=r['lastro'],lastro=r['lastro'],sourceLastro=r['lastro'],
                       originalLastro=r['lastro'], purchaseDate='2026-11-04',
                       acquisitionValue=r['sourceEconomicVp'],presentValue=r['sourceEconomicVp'],
                       settledDate='', settledWithoutDate=False,isActive=True,paymentStatus='VINCENDO',titleStatus='EM CARTEIRA',
                       positionDate=DATE, accrualPeriodsAtPosition=0,accrualPeriodsSource='',
                       transferSourceVehicle=r['op'],transferOriginValue=r['sourceEconomicVp'],
                       transferNewAcquisitionValue=r['sourceEconomicVp'],transferCessionValue=0,
                       purchaseDateSource='cessao_confirmada_20261104', manualTitleOverrideId='',
                       sourceNote='D0 pelo VP economico da origem; titulo baixado na origem. Caixa total pago separado do valor economico do ativo.')
    buyer_titles.append(buyer_title)
    if r['op'] in ops:
        manual['events'].append(dict(id=f'cessao-20261104-origem-{r["lastro"]}',operationId=r['op'],
            titleId=r['managerialId'],type='title_override',settledDate='2026-11-04',
            suppressCashLiquidations=[dict(date='2026-11-04',amount=0)],
            note='Cessao de 04/11: baixa na origem; caixa pelo total confirmado do veiculo, sem somar Valor Pago do sistema.'))
    manual['events'].append(dict(id=f'cessao-20261104-destino-{r["lastro"]}',operationId=BUYER,
        titleId=r['lastro'],type='synthetic_title',reconcileReported=True,originalLastro=r['lastro'],
        invoice=buyer_title['invoice'],cedente=buyer_title['cedente'],sacado=buyer_title['sacado'],
        purchaseDate='2026-11-04',maturityDate=buyer_title['maturityDate'],
        acquisitionValue=buyer_title['acquisitionValue'],faceValue=buyer_title['faceValue'],
        monthlyRate=buyer_title['discountRateMonthly'],cashPurchaseAmount=0,
        accrualBaseDays=buyer_title['accrualBaseDays'],accrualDayCount=buyer_title['accrualDayCount'],
        note='Valor economico D0 pelo VP calculado na origem. Caixa de compra agregado no valor efetivo de R$ 59.058.345,61.'))

for opid in ['confina-cprf-100','confina-cprf-50']:
    event=dict(operationId=opid,date='2026-11-04',type='portfolio_liquidation',
               amount=preview['groups'][opid]['cashConfirmed'],titleId='cessao-20261104',
               source='valor_confirmado_usuario', note='Entrada total de caixa da cessao de 04/11. Substitui, nao soma, os Valores Pagos do CSV para esses titulos.')
    ops[opid]['cashEvents'].append(event)
    receipt_events.append(event)
    manual['events'].append(dict(id=f'caixa-confirmado-cessao-20261104-{opid}',operationId=opid,
        type='portfolio_liquidation',titleId='cessao-20261104',date='2026-11-04',amount=event['amount'],
        mode='replace_same_day',note=event['note']))

buyer=copy.deepcopy(ops['confina-cra-42a-59a-65a-out-2026'])
buyer.update(operationId=BUYER,reportName='42a - CRA CONFINA NOVEMBRO/2026',positionDate=DATE,
             titles=buyer_titles,ignoredTitles=[],history=[],manualAdjustments=[],skippedPrePurchaseLiquidations=[],
             cashEvents=[dict(operationId=BUYER,date='2026-11-04',type='portfolio_purchase',amount=preview['initialFunding'],
                              titleId='cessao-20261104',source='valor_confirmado_usuario',
                              note='Preco total efetivamente pago na cessao; separado da soma dos VPs economicos dos ativos.')])
portfolio['operations'].append(buyer)
manual['events'].append(dict(id='caixa-compra-cessao-20261104-novembro',operationId=BUYER,
    type='portfolio_purchase',titleId='cessao-20261104',date='2026-11-04',amount=preview['initialFunding'],
    mode='replace_operation_day_type',note='Compra efetiva da carteira de novembro. Valor de caixa separado dos VPs economicos dos titulos.'))
portfolio['sourceFiles'].append(dict(file=audit['source'],rows=audit['rows'],sha256=audit['sha256'],format='GER004_veiculo_20261111'))
portfolio['updatedAt']='2026-11-11'
for op in portfolio['operations']:
    op['positionDate']=DATE
    op['cashEvents'].sort(key=lambda e:(e['date'],e['type'],str(e.get('titleId',''))))
    for t in op['titles']:
        t['positionDate']=DATE
        t['presentValue']=round(imp.accrued_value(t,DATE),2)
        t['isActive']=not t.get('isIgnored') and t['presentValue']>0
        if t.get('maturityDate'):
            t['daysToMaturity']=(date.fromisoformat(t['maturityDate'])-date.fromisoformat(DATE)).days
    active=[t for t in op['titles'] if t['isActive']]
    vp=sum(t['presentValue'] for t in active)
    totals=dict(rows=len(op['titles']),uniqueTitles=len(op['titles']),
                ignoredTitles=sum(bool(t.get('isIgnored')) for t in op['titles']),activeTitles=len(active),
                settledTitles=sum(bool(t.get('settledDate') and t['settledDate']<=DATE) for t in op['titles']),
                portfolioVp=round(vp,2),portfolioVn=round(sum(max(0,t['faceValue']-sum(p['amount'] for p in t.get('partialLiquidations',[]) if p['date']<=DATE)) for t in active),2),
                acquisitionValue=round(sum(t['acquisitionValue'] for t in active),2),
                weightedRateMonthly=sum(t['presentValue']*t['discountRateMonthly'] for t in active)/(vp or 1),
                weightedDaysToMaturity=sum(t['presentValue']*max(0,t.get('daysToMaturity',0)) for t in active)/(vp or 1),
                overdueVp=round(sum(t['presentValue'] for t in active if t.get('daysToMaturity',0)<0),2),
                cashPurchases=round(sum(e['amount'] for e in op['cashEvents'] if e['type']=='portfolio_purchase' and e['date']<=DATE),2),
                cashLiquidations=round(sum(e['amount'] for e in op['cashEvents'] if e['type']=='portfolio_liquidation' and e['date']<=DATE),2))
    op['totals']=totals

fundings=read_js(ROOT / 'data/fundings/fundings-confina.js')
template=next(f for f in fundings['operations'] if f['id']=='confina-cra-42a-59a-65a-out-2026')
funding=copy.deepcopy(template)
funding.update(id=BUYER,name='Confina CRA 42a - Novembro/2026',shortName='CRA 42a Nov/26',
               issueDate='2026-11-04',positionDate=DATE,fundingPrincipal=preview['initialFunding'],
               fundingBalance=preview['initialFunding'],fundingPrevious=0,fundingMonthStart=0,
               sourceSheets=['CESSAO_04_11_2026'],portfolio=[],cash=0,syntheticSub=preview['initialGapPreview'],
               previousSyntheticSub=0,monthStartSyntheticSub=0)
component=copy.deepcopy(template['fundingComponents'][0])
component.update(sheet='CRA 42a Novembro/2026',principal=preview['initialFunding'],startDate='2026-11-04',
                 issueDate='2026-11-04',accrueOnStartDate=False,fundingBalance=preview['initialFunding'],
                 fundingRate=1.7,fundingRateType='monthly_fixed',fundingRateLabel='1.70% a.m.',events=[],
                 interestPaidToDate=0,amortizationPaidToDate=0,installmentPaidToDate=0)
funding['fundingComponents']=[component]
fundings['operations'].append(funding)
fundings['positionDate']=DATE
events=read_js(ROOT / 'data/fundings/funding-events-confina.js')
events['updatedAt']='2026-11-11'

payments=[
 ('2026-11-04','confina-cra-65-200','484617','GF101',1057343.91,9516.10),
 ('2026-11-04','confina-cra-65-200','484618','GF102',118286.84,0),
 ('2026-11-04','confina-cra-65-200','485214','BP17',888199.54,3552.80),
 ('2026-11-04','confina-cra-65-200','494177','BP18',1360696.46,4989.22),
 ('2026-11-04','confina-cra-42-65-setembro','542592','BP18',1360696.46,4989.22),
 ('2026-11-04','confina-cra-65-200','485106','BP19',1916343.31,2555.12),
 ('2026-11-04','confina-cra-65-80','506654','BP20',61638.65,0),
 ('2026-11-04','confina-cra-42-65-setembro','546510','RM14',27382.24,0),
 ('2026-11-04','confina-cra-42-65-setembro','546511','RM15',252901.48,0),
 ('2026-11-04','confina-cra-42-65-setembro','546513','RM17',569576.18,0),
 ('2026-11-04','confina-cra-65-200','485223','RM30',414807.29,0),
 ('2026-11-05','confina-cra-65-200','484469','GF104',975434.10,7803.47),
 ('2026-11-05','confina-cra-65-200','484478','GF108',1250136.00,2916.98),
 ('2026-11-05','confina-cra-65-200','484618','GF102',106921.26,997.93),
 ('2026-11-05','confina-cra-65-200','484620','GF103',217540.50,1957.86),
 ('2026-11-05','confina-cra-65-200','484623','GF105',793036.30,4493.87),
 ('2026-11-05','confina-cra-65-200','484629','GF107',120698.60,402.33),
 ('2026-11-05','confina-cra-65-200','485238','GF106',658573.42,2634.29),
]
for day,opid,lastro,invoice,principal,interest in payments:
    events['events'].append(dict(date=day,operationId=opid,realLastro=lastro,invoice=invoice,
                                 amortization=principal,interestPaid=interest,amount=round(principal+interest,2),
                                 note='Alocacao gerencial por titulo ou pelo criterio anterior da mesma emissao Green Farming. Dois BP18 em fundings distintos confirmados pelo usuario.'))

frozen=read_js(ROOT / 'data/portfolio/portfolio-confina-frozen-2026-10-02.js')
for op in frozen['operations']:
    op.setdefault('freezeThroughDate',frozen.get('freezeThroughDate') or frozen.get('snapshotDate') or op['positionDate'])
frozen['operations'].extend([{**copy.deepcopy(op),'freezeThroughDate':CUTOFF,'preservedFromPositionDate':CUTOFF}
                             for op in original['operations']])
frozen['freezeThroughDate']=frozen['snapshotDate']=CUTOFF
write_js('portfolio-candidato.js','ceresPortfolioData',portfolio)
write_js('historico-candidato.js','ceresFrozenPortfolioData',frozen)
write_js('funding-candidato.js','ceresFundingData',fundings)
write_js('amortizacoes-candidato.js','ceresFundingManualEvents',events)
(OUT/'ajustes-candidato.json').write_text(json.dumps(manual,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
files=['data/portfolio/portfolio-confina.js','data/portfolio/portfolio-confina-frozen-2026-10-02.js',
       'data/portfolio/manual-portfolio-adjustments-confina.json','data/fundings/fundings-confina.js',
       'data/fundings/funding-events-confina.js','data/biological/biological-assets-confina.js',
       'data/biological/biological-assets-history-confina.js','data/pecuaria/cotacoes-pecuaria-latest.js','index.html']
ledger=dict(status='RASCUNHO_NAO_PUBLICAR',date=DATE,cutoff=CUTOFF,buyer=BUYER,
            baselineHashes={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in files},
            received=receipt_events,purchased=purchase_events,payments=payments,
            pendingFunding=[],
            warnings=warnings, exclusions=[dict(operationId='confina-cprf-100',titleId='519622',date='2026-11-04',cash=0)],
            preservedMissing=['555170','559270'],
            duplicatesRemovedForward=dict(date='2026-11-04',aliases=duplicate_aliases,cash=0,acquisitionValue=584076.98),
            denipotiNonCashSubstitution=dict(date='2026-11-04',amount=4248591.58,ids=list(denipoti),sourceIds=list(denipoti.values())),
            pending=['Validar datas e repeticoes das garantias',
                     'Concluir reconciliacao por dia antes de aplicar ou publicar'])
(OUT/'lancamentos-candidatos.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(status=ledger['status'],newPurchases=len(purchase_events),
                      purchaseTotal=round(sum(p['amount'] for p in purchase_events),2),
                      receipts=len(receipt_events),fundingPayments=len(payments),warnings=warnings),ensure_ascii=True))
