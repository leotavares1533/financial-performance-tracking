import collections
import contextlib
import copy
import csv
import gc
import importlib.util
import io
import json
import sys
from datetime import date
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'outputs/processamento-confina-20261110'
DOWNLOADS=Path.home()/'Downloads'
ANIMALS=DOWNLOADS/'relatorio_GERANIMAL02.csv-11-11-2026_21-18-23.csv'
PREVIOUS=DOWNLOADS/'relatorio_GERANIMAL02 (25).csv'
GTA=DOWNLOADS/'relatorio_GERGTA01 (1).csv'
TARGETS=['2026-11-04','2026-11-05','2026-11-06','2026-11-09','2026-11-10']


def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


b=module('biological',ROOT/'scripts/build-biological-assets-confina.py')
imp=module('portfolio_importer',ROOT/'scripts/import-confina-portfolio.py')
original_vehicle=b.operation_from_vehicle


def vehicle(text):
    normalized=b.norm(text)
    if 'novembro' in normalized and '42' in normalized:
        return 'confina-cra-42-novembro'
    if all(token in normalized for token in ['42','59','65','out']):
        return 'confina-cra-42a-59a-65a-out-2026'
    if '65' in normalized and 'outubro' in normalized:
        return 'confina-cra-65-outubro'
    return original_vehicle(text)


def read_js(path):
    return json.loads(path.read_text(encoding='utf-8-sig').split('=',1)[1].strip().rstrip(';'))


def write_js(path,variable,value):
    path.write_text(f'window.{variable} = {json.dumps(value,ensure_ascii=False)};\n',encoding='utf-8')


def identity(r):
    sisbov=b.compact_number_id(r['SISBOV'])
    if sisbov and sisbov!='0':
        return 'sisbov',sisbov
    return 'farm-tag',b.norm(r['Fazenda']),r['TAG'].strip()


def shipment(gta,invoice):
    return b.digits(gta).lstrip('0'),b.digits(invoice).lstrip('0')


def signature(r):
    return tuple(r[k].strip() for k in ['TAG','GTA','Nota fiscal','Data de entrada'])


def eligible_asof(r,target,stats,previous):
    entry=b.parse_date(r['Data de entrada'])
    processed=b.parse_date(r['Data do processamento de entrada'])
    if processed>'2026-11-11' and previous is not None:
        processed=b.parse_date(previous['Data do processamento de entrada'])
        if processed>'2026-11-11':
            processed=''
        stats['futureProcessingDateCarriedFromPrior']+=1
    if not entry or max(entry,processed)>target:
        return None
    departed=b.parse_date(r['Data de saída real'])
    confirmed=b.parse_date(r['Data de confirmação de abate'])
    status=r['STATUS ATUAL']
    if departed>target or (not departed and confirmed>target):
        status='PROCESSADO'
        stats['futureExitsRolledBack']+=1
    elif departed and departed<=target and confirmed>target:
        status='AGUARDANDO ABATE'
    elif status not in {'PROCESSADO','EM PROCESSAMENTO'} and not departed and not confirmed:
        if previous is not None and b.status_bucket(previous['STATUS ATUAL']):
            status=previous['STATUS ATUAL']
            stats['undatedStatusChangeCarriedFromPrior']+=1
        else:
            stats['undatedExitNotReconstructed']+=1
            return None
    if not b.status_bucket(status):
        return None
    result=dict(r)
    result['STATUS ATUAL']=status
    ref=b.parse_date(r['Data referencia'])
    elapsed=max(0,(date.fromisoformat(ref)-date.fromisoformat(target)).days) if ref else 0
    projected=b.number(r['Peso projetado'])
    gmd=b.number(r['Ganho médio diário'])
    if elapsed and projected>0 and 0<=gmd<=15 and projected-elapsed*gmd>0:
        result['Peso projetado']=f'{projected-elapsed*gmd:.4f}'
    days=b.number(r['Quantidade de dias confinado'])
    result['Quantidade de dias confinado']=str(int(max(0,days-elapsed))) if days>0 else '0'
    result['Data referencia']=target
    return result


old_by_id={}
old_rows,_=b.read_csv(PREVIOUS)
for r in old_rows:
    old_by_id.setdefault(identity(r),r)
del old_rows
groups=collections.defaultdict(list)
with ANIMALS.open(encoding='utf-8-sig',newline='') as f:
    reader=csv.DictReader(f,delimiter=';')
    fields=[k for k in reader.fieldnames if k]
    for r in reader:
        groups[identity(r)].append(r)
gta_rows,_=b.read_csv(GTA)
gta_fields=[k for k in gta_rows[0] if k]
quotes=read_js(ROOT/'data/pecuaria/cotacoes-pecuaria-latest.js')
required={(category,region) for category in ['boi','vaca','novilha'] for region in ['BA','GO','MT','MS','MG','PA','RO','SP','TO']}


def quote_lookup(q,target):
    by_date=collections.defaultdict(dict)
    for r in q['historyRows']:
        if r['map_type']=='regional_map' and r['quote_date']<=target and r['price']>0:
            by_date[r['quote_date']][(r['category'],r['region'])]=r['price']
    selected=max(day for day,rows in by_date.items() if required.issubset(rows))
    return by_date[selected],selected


b.operation_from_vehicle=vehicle
b.quote_lookup=quote_lookup
b.FUNDING_JS=OUT/'funding-candidato.js'
portfolio=read_js(OUT/'portfolio-candidato.js')
daily={}
for target in TARGETS:
    stats=collections.Counter()
    animal_path=OUT/'animals-guarantee-working.csv'
    heads_by_shipment=collections.Counter()
    unresolved=[]
    with animal_path.open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,fields,delimiter=';',extrasaction='ignore')
        writer.writeheader()
        for key,rows in groups.items():
            previous=old_by_id.get(key)
            valid=[item for r in rows if (item:=eligible_asof(r,target,stats,previous)) is not None]
            if not valid:
                continue
            if len(valid)>1:
                matching=[r for r in valid if previous is not None and signature(r)==signature(previous)]
                if len(matching)==1:
                    valid=matching
                    stats['conflictingDuplicatesCarriedFromPrior']+=1
                else:
                    unresolved.append(dict(identity=key,rows=[{k:r[k] for k in ['Fazenda','Lastro','TAG','GTA','STATUS ATUAL']} for r in valid]))
                    stats['conflictingDuplicatesQuarantined']+=1
                    continue
            elif len(rows)>1:
                stats['duplicatesResolvedByDatedEligibility']+=1
            row=valid[0]
            writer.writerow(row)
            stats[b.status_bucket(row['STATUS ATUAL'])]+=1
            stats['eligibleHeads']+=1
            key_shipment=shipment(row['GTA'],row['Nota fiscal'])
            if all(key_shipment):
                heads_by_shipment[key_shipment]+=1
        for key,r in old_by_id.items():
            if key in groups:
                continue
            row=eligible_asof(r,target,stats,r)
            if row is not None:
                writer.writerow(row)
                stats['missingFromCurrentSourceCarriedFromPrior']+=1
                stats['eligibleHeads']+=1
                stats[b.status_bucket(row['STATUS ATUAL'])]+=1
                heads_by_shipment[shipment(row['GTA'],row['Nota fiscal'])]+=1
    asof=copy.deepcopy(portfolio)
    active_lastros=set()
    for op in asof['operations']:
        op['positionDate']=target
        for title in op['titles']:
            title['positionDate']=target
            title['presentValue']=round(imp.accrued_value(title,target),2)
            title['isActive']=not title.get('isIgnored') and title['presentValue']>0
            if title['isActive']:
                active_lastros.update(b.digits(title.get(k)) for k in ['id','lastro','originalLastro','sourceLastro'] if title.get(k))
    portfolio_path=OUT/'portfolio-guarantee-working.js'
    write_js(portfolio_path,'ceresPortfolioData',asof)
    del asof
    transit_path=OUT/'gta-guarantee-working.csv'
    shipments=collections.defaultdict(list)
    for row in gta_rows:
        issued=b.parse_date(row['Data emissão GTA'])
        arrived=b.parse_date(row['Data chegada / baixa'])
        if not issued or issued>target or (arrived and arrived<=target):
            continue
        if not arrived and b.norm(row['Status'])!='em transito':
            continue
        shipments[(b.norm(row['Fazenda']),shipment(row['Nº GTA'],row['Nº Nota']),issued)].append(row)
    with transit_path.open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.DictWriter(f,gta_fields,delimiter=';',extrasaction='ignore')
        writer.writeheader()
        for (_,ship,_),rows in shipments.items():
            quantities=collections.defaultdict(list)
            for r in rows:
                quantities[int(b.number(r['Qtd. Animais']))].append(r)
            for quantity,versions in quantities.items():
                active=[r for r in versions if b.digits(r['Lastro']) in active_lastros]
                chosen=dict(active[0] if active else versions[0])
                if len(versions)>1:
                    stats['gtaDuplicateShipmentRowsExcluded']+=len(versions)-1
                    stats['gtaDuplicateShipmentHeadsExcluded']+=(len(versions)-1)*quantity
                overlap=min(quantity,heads_by_shipment[ship]) if all(ship) else 0
                heads_by_shipment[ship]-=overlap
                stats['alreadyInAnimalReportExcluded']+=overlap
                quantity-=overlap
                if quantity<=0:
                    continue
                chosen['Qtd. Animais']=str(quantity)
                chosen['Status']='Em Trânsito'
                writer.writerow(chosen)
                stats['purchasedTransitHeadsBeforeOwnershipFilter']+=quantity
    output=OUT/f'garantia-{target}.js'
    sys.argv=['build-biological-assets-confina.py','--animal-csv',str(animal_path),
              '--purchased-transit-csv',str(transit_path),'--portfolio-js',str(portfolio_path),
              '--quotes-js',str(ROOT/'data/pecuaria/cotacoes-pecuaria-latest.js'),
              '--reference-date',target,'--skip-history','--output',str(output)]
    with contextlib.redirect_stdout(io.StringIO()):
        b.main()
    snapshot=read_js(output)
    snapshot.update(sourceFile=ANIMALS.name,purchasedTransitSourceFile=GTA.name,
                    referenceDate=target,compositionReferenceDate=target,allocationReferenceDate=target,
                    sourceExtractionDate='2026-11-11',sourceReferenceDate='2026-11-12',compositionEstimated=True,
                    compositionPolicy='dated-asof-with-immutable-closed-history',
                    quoteUnavailableOnReferenceDate=snapshot['quoteDate']!=target,
                    reconstruction=dict(counts=dict(stats),unresolvedDuplicateIdentities=unresolved,
                                        duplicatePolicy='One animal per SISBOV. Dated eligibility first; preserve prior record when two versions remain eligible. GTA physical shipment counted once across lastros.'))
    write_js(output,'ceresBiologicalAssets',snapshot)
    daily[target]=dict(quoteDate=snapshot['quoteDate'],quoteFallback=snapshot['quoteDate']!=target,
                      sourceReference='2026-11-12',counts=dict(stats),unresolved=unresolved,
                      summary=snapshot['summary'])
    print(json.dumps(dict(date=target,quote=snapshot['quoteDate'],counts=dict(stats),unresolved=len(unresolved)),ensure_ascii=True),flush=True)
    del snapshot
    gc.collect()
(OUT/'garantias-candidatas-resumo.json').write_text(json.dumps(daily,ensure_ascii=False,indent=2),encoding='utf-8')
