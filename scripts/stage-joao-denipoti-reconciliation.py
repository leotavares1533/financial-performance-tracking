import copy
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'outputs/reconciliacao-joao-denipoti-20261104'
BASE=OUT/'backup-anterior'
DATE='2026-11-04'
CUTOFF='2026-11-03'
DESTINATION='confina-cra-65-200'
GROUP='conciliacao-joao-denipoti-20261104'
PROVISIONAL='conciliacao-sem-caixa-joao-denipoti-20261104'
PORTFOLIO='data/portfolio/portfolio-confina.js'
MANUAL='data/portfolio/manual-portfolio-adjustments-confina.json'


def read_js(file):
    return json.loads(file.read_text(encoding='utf-8-sig').split('=',1)[1].strip().rstrip(';'))


def sha(file):
    return hashlib.sha256(file.read_bytes()).hexdigest()


def money(value):
    return round(value,2)


original=read_js(BASE/PORTFOLIO)
current=read_js(ROOT/PORTFOLIO)
original_manual=json.loads((BASE/MANUAL).read_text(encoding='utf-8-sig'))
current_manual=json.loads((ROOT/MANUAL).read_text(encoding='utf-8-sig'))
base_ops={o['operationId']:o for o in original['operations']}
for op in current['operations']:
    base=base_ops[op['operationId']]
    assert op['titles']==base['titles'], 'A carteira mudou; reconciliar novamente antes de aplicar.'
    baseline_events=sorted(base['cashEvents'],key=lambda e:json.dumps(e,sort_keys=True))
    current_events=sorted([e for e in op['cashEvents'] if e.get('manualAdjustmentId')!=PROVISIONAL],key=lambda e:json.dumps(e,sort_keys=True))
    assert current_events==baseline_events, 'Movimento concorrente ou conciliacao ja aplicada.'
assert [e for e in current_manual['events'] if e.get('id')!=PROVISIONAL]==original_manual['events']
next_portfolio=copy.deepcopy(original)
next_manual=copy.deepcopy(original_manual)
next_ops={o['operationId']:o for o in next_portfolio['operations']}
source_ids={DESTINATION:['485013','485014'],
            'confina-cras-carteira-100':['466107','466115'],
            'confina-cras-carteira-50':['481185','481199']}
confession_ids=[str(n) for n in range(542982,542988)]
denipoti_ids=['566696','566697','566707']
events=[]
old_receipts=[]
confession_purchases=[]
corrections={op:0 for op in source_ids}


def add_event(opid,title_id,amount,suffix,kind,note,source_date='2026-09-30',event_type='cash_adjustment'):
    ident=f'{GROUP}-{suffix}'
    assert not any(e.get('id')==ident for e in next_manual['events'])
    event=dict(operationId=opid,date=DATE,type=event_type,amount=money(amount),titleId=title_id,
               source='manual-portfolio-adjustments-confina.json',manualAdjustmentId=ident,
               reconciliationKind=kind,reconciliationId=GROUP,sourceEventDate=source_date,
               bankMovement=False,fundingImpact=0,note=note)
    next_ops[opid]['cashEvents'].append(event)
    next_manual['events'].append({**event,'id':ident,'mode':'replace_same_day'})
    events.append(event)


for opid,ids in source_ids.items():
    op=base_ops[opid]
    for ident in ids:
        title=next(t for t in op['titles'] if t['id']==ident)
        assert title['settledDate']=='2026-09-30'
        receipts=[e for e in op['cashEvents'] if e.get('titleId')==ident and e['date']=='2026-09-30' and e['type']=='portfolio_liquidation']
        assert receipts
        amount=money(sum(e['amount'] for e in receipts))
        old_receipts.append(dict(operationId=opid,titleId=ident,invoice=title['invoice'],bookedAmount=amount,
                                 bookedDate='2026-09-30',actualBankReceipt=0,sourceEvents=receipts))
        corrections[opid]=money(corrections[opid]-amount)
        add_event(opid,ident,-amount,f'estorno-recebimento-{ident}','non_cash_historical_balance_correction',
                  'Regularizacao prospectiva de saldo: a baixa de Joao em 30/09 foi substituicao sem recebimento. Nao e pagamento bancario em 04/11; o historico ate 03/11 permanece intacto.')

for ident in confession_ids:
    op=base_ops[DESTINATION]
    title=next(t for t in op['titles'] if t['id']==ident)
    assert not title.get('settledDate') and title['isActive']
    purchases=[e for e in op['cashEvents'] if e.get('titleId')==ident and e['date']=='2026-09-30' and e['type']=='portfolio_purchase']
    assert len(purchases)==1 and money(purchases[0]['amount'])==money(title['acquisitionValue'])
    amount=money(purchases[0]['amount'])
    confession_purchases.append(dict(titleId=ident,bookedAmount=amount,actualBankPayment=0))
    corrections[DESTINATION]=money(corrections[DESTINATION]+amount)
    add_event(DESTINATION,ident,amount,f'estorno-compra-confissao-{ident}','non_cash_historical_balance_correction',
              'Regularizacao prospectiva de saldo: a confissao faz parte da renegociacao sem pagamento. O ativo continua aberto. Nao e novo recebimento bancario em 04/11.')

denipoti=[next(t for t in base_ops[DESTINATION]['titles'] if t['id']==ident) for ident in denipoti_ids]
assert all(t['purchaseDate']==DATE and t['cashPurchaseAmount']==0 for t in denipoti)
principal=money(sum(t['acquisitionValue'] for t in denipoti))
assert principal==4248591.58
intercompany=[]
for opid in source_ids:
    if opid==DESTINATION:
        continue
    amount=-corrections[opid]
    assert amount>0
    intercompany.append(dict(origin=opid,destination=DESTINATION,amount=amount,interestRate=0,
                             sourceTitleIds=source_ids[opid],cashImpact=0,externalFundingImpact=0))
    add_event(opid,'grupo-direitos-joao-denipoti',amount,f'direito-interno-{opid}',
              'non_cash_opening_substitution',
              'Compensacao patrimonial a receber do CRA 65a 200MM pelos direitos transferidos no acordo Joao/Denipoti. Nao e caixa, funding novo ou ativo biologico. Sem accrual proprio.',event_type='synthetic_adjustment')
internal_total=money(sum(r['amount'] for r in intercompany))
add_event(DESTINATION,'grupo-direitos-joao-denipoti',-internal_total,'contrapartida-interna-65',
          'non_cash_opening_substitution',
          'Contrapartida das compensacoes a receber nos dois CRAs Carteira segregados. Saldo interno reciproco, sem caixa ou novo funding; impede classificar direitos recebidos de outro veiculo como rendimento.',event_type='synthetic_adjustment')
assert money(sum(e['amount'] for e in events if e['type']=='synthetic_adjustment'))==0
assert money(sum(r['bookedAmount'] for r in old_receipts))==6975721.29
assert money(sum(r['bookedAmount'] for r in confession_purchases))==1718636.65
assert corrections[DESTINATION]==-658822.33
assert internal_total==4598262.31
assert money(sum(corrections.values()))==-5257084.64
economic_effect=money(principal+sum(corrections.values()))
assert economic_effect==-1008493.06

for opid,op in next_ops.items():
    added=[e for e in events if e['operationId']==opid]
    if not added:
        continue
    op['cashEvents'].sort(key=lambda e:(e['date'],e['type'],str(e.get('titleId',''))))
    stats=op['manualAdjustments']
    stats['file']='manual-portfolio-adjustments-confina.json'
    stats['eventsApplied']=stats.get('eventsApplied',0)+len(added)
    stats['cashImpact']=money(stats.get('cashImpact',0)+sum(e['amount'] for e in added if e['type']=='cash_adjustment'))
    stats['syntheticImpact']=money(stats.get('syntheticImpact',0)+sum(e['amount'] for e in added if e['type']=='synthetic_adjustment'))
    op['totals']['cashReconciliationAdjustments']=money(sum(e['amount'] for e in added if e['type']=='cash_adjustment'))
    assert op['titles']==base_ops[opid]['titles']

OUT.mkdir(parents=True,exist_ok=True)
(OUT/'portfolio-final-candidato.js').write_text('window.ceresPortfolioData = '+json.dumps(next_portfolio,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
(OUT/'ajustes-finais-candidatos.json').write_text(json.dumps(next_manual,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
report=dict(effectiveDate=DATE,cutoff=CUTOFF,sourceSettlements=old_receipts,confessionPurchases=confession_purchases,
            denipoti=[dict(id=t['id'],sourceLastro=t['sourceLastro'],invoice=t['invoice'],acquisition=t['acquisitionValue']) for t in denipoti],
            principal=principal,bookedNoCashReceipts=6975721.29,bookedNoCashPurchases=1718636.65,
            cashCorrections=corrections,intercompany=intercompany,internalCompensationTotal=internal_total,
            netCashCorrection=money(sum(corrections.values())),economicEffectD0=economic_effect,
            newActualBankMovements=0,newExternalFunding=0,events=events,
            note='Valores regularizados pelos lancamentos exatos do fechamento, sem rateio. As compensacoes internas sao reciprocas, nao dinheiro nem funding externo; nao tem accrual. Nenhum registro ate 03/11 e alterado.',
            currentHashes={file:sha(ROOT/file) for file in [PORTFOLIO,MANUAL,'index.html','assets/app.js']})
(OUT/'journal-final.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:report[k] for k in ['cashCorrections','internalCompensationTotal','netCashCorrection','economicEffectD0','newActualBankMovements','newExternalFunding']},ensure_ascii=True))
