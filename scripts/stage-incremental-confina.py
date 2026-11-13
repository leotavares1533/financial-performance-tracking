"""Prepare new dates without changing a closed position or inventing transfer funding."""
import argparse
import collections
import copy
import importlib.util
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('imp', ROOT / 'scripts/import-confina-portfolio.py')
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


def read_js(file):
    return json.loads(Path(file).read_text(encoding='utf-8-sig').split('=', 1)[1].strip().rstrip(';'))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    out = Path(args.output)
    audit = json.loads((out / 'audit-full.json').read_text(encoding='utf-8'))
    cutoff, through = audit['cutoff'], audit['through']
    portfolio = read_js(ROOT / 'data/portfolio/portfolio-confina.js')
    assert all(op['positionDate'] == cutoff for op in portfolio['operations']), 'Fechamento-base diferente.'
    ops = {op['operationId']: op for op in portfolio['operations']}
    reconciliation = read_js(ROOT / 'data/management/position-reconciliation-confina.js')
    for row in reconciliation['titleSettlements']:
        if row['effectiveDate'] <= cutoff:
            title = next(t for t in ops[row['operationId']]['titles'] if t['id'] == row['titleId'])
            title.update(settledDate=row['effectiveDate'], isActive=False)
    purchases, receipts, pending_sales = [], [], []
    for record in audit['paymentChanges']:
        source = record['source']
        if not cutoff < source['paidDate'] <= through or record['paidDelta'] <= 0:
            continue
        if 'venda' in source['paymentStatus'].lower() or source['destination']:
            pending_sales.append(record)
            continue
        if record.get('settled') and record['settled'] <= cutoff:
            continue
        title = next(t for t in ops[record['op']]['titles'] if t['id'] == record['id'])
        event = dict(operationId=record['op'], titleId=title['id'], date=source['paidDate'],
                     type='portfolio_liquidation', amount=record['paidDelta'],
                     source='GER004_incremental_validado',
                     id=f'ger004-{record["op"]}-{title["id"]}-{source["paidDate"]}-{record["paidDelta"]:.2f}')
        assert not any(e.get('id') == event['id'] for e in ops[record['op']]['cashEvents'])
        ops[record['op']]['cashEvents'].append(event)
        receipts.append(event)
        if source['status'] in {'LIQUIDADO', 'BAIXA MANUAL'}:
            title.update(settledDate=source['paidDate'], isActive=False)
        elif source['status'] == 'BAIXA PARCIAL':
            title.setdefault('partialLiquidations', []).append(dict(date=event['date'], amount=event['amount']))
        title.update(paymentStatus=source['paymentStatus'], titleStatus=source['status'])
    for record in audit['newRecords']:
        r = record['source']
        if record['candidates'] or not cutoff < r['purchase'] <= through or r['status'] != 'EM CARTEIRA':
            continue
        monthly, annual, daily, origin, base, convention = imp.normalized_rates(
            {'Taxa desconto': r['rate'] * 100, 'base de dias': r['base']},
            {imp.normalize_text(k): k for k in ['Taxa desconto', 'base de dias']}, r['lastro'])
        title = imp.synthetic_title_from_adjustment(dict(titleId=r['lastro'], invoice=r['invoice'],
            cedente=r['cedente'], sacado=r['sacado'], purchaseDate=r['purchase'], maturityDate=r['maturity'],
            acquisitionValue=r['acquisition'], faceValue=r['face'], monthlyRate=monthly,
            accrualBaseDays=base, accrualDayCount=convention, rateSource=origin), r['op'], through)
        assert title and title['id'] not in {t['id'] for t in ops[r['op']]['titles']}
        title.update(sourceLastro=r['lastro'], sourceRow=r['line'], sourceFormat='GER004_incremental',
                     titleType=r['titleType'], uf=r['uf'])
        ops[r['op']]['titles'].append(title)
        event = dict(operationId=r['op'], titleId=title['id'], date=r['purchase'], type='portfolio_purchase',
                     amount=r['acquisition'], source='GER004_incremental_validado',
                     id=f'ger004-compra-{r["op"]}-{title["id"]}-{r["purchase"]}')
        ops[r['op']]['cashEvents'].append(event)
        purchases.append(event)
    authorization_path = out / 'authorization.json'
    authorization = json.loads(authorization_path.read_text(encoding='utf-8')) if authorization_path.exists() else None
    funding = read_js(ROOT / 'data/fundings/fundings-confina.js')
    transfer = None
    if authorization and (out / 'transfer-valued.json').exists():
        transfer = json.loads((out / 'transfer-valued.json').read_text(encoding='utf-8'))
        trade = authorization['tradeDate']
        buyer_id = authorization['buyer']
        buyer = ops[buyer_id]
        identifiers = collections.Counter(r['lastro'] for r in transfer['rows'])
        for r in transfer['rows']:
            original = copy.deepcopy(r['originTitle'])
            if r['op'] in ops:
                origin = next(t for t in ops[r['op']]['titles'] if t['id'] == r['managerialId'])
                origin.update(settledDate=trade, isActive=False, paymentStatus='Baixa por venda',
                              titleStatus='LIQUIDADO', transferDestination=buyer_id)
            remaining_face = round(original['faceValue'] - sum(p['amount'] for p in original.get('partialLiquidations', []) if p['date'] <= trade), 2)
            ident = r['lastro'] if identifiers[r['lastro']] == 1 else f'{r["lastro"]}~{r["managerialId"]}'
            assert ident not in {t['id'] for t in buyer['titles']}
            monthly = authorization['fundingMonthlyRate']
            original.update(id=ident, lastro=r['lastro'], sourceLastro=r['lastro'], originalLastro=r['managerialId'],
                operationId=buyer_id, purchaseDate=trade, sourcePurchaseDate=r['purchase'],
                purchaseDateSource='cessao_confirmada_usuario', positionDate=through,
                invoice=r['invoice'], cedente=r['cedente'], sacado=r['sacado'], maturityDate=r['maturity'],
                faceValue=remaining_face, acquisitionValue=r['economicVp'], presentValue=r['economicVp'],
                partialLiquidations=[], partialLiquidationAmount=0, cashPurchaseAmount=0,
                settledDate='', settledWithoutDate=False, isActive=True, isIgnored=False, portfolioEligible=True,
                paymentStatus='VINCENDO', titleStatus='EM CARTEIRA',
                discountRateMonthly=monthly, effectiveRateAnnual=(1+monthly)**12-1,
                dailyRate=(1+monthly)**(1/30)-1, rateSource='cessao_confirmada_1_70_am',
                accrualBaseDays=360, accrualDayCount='calendar_inclusive', accrualPeriodsAtPosition=0,
                transferSourceVehicle=r['op'], transferOriginValue=r['economicVp'],
                transferNewAcquisitionValue=r['economicVp'], sourceFormat='GER004_incremental_cessao',
                managerialOccurrence=r['managerialId'], uf=r['uf'], titleType=r['titleType'])
            buyer['titles'].append(original)
        for seller, amount in authorization['cashBySeller'].items():
            if seller not in ops:
                continue
            event = dict(id=f'cessao-{trade}-cash-{seller}', operationId=seller, date=trade,
                type='portfolio_liquidation', titleId=f'cessao-{trade}', amount=amount,
                source='valor_confirmado_usuario', note='Total confirmado da cessao; substitui o Valor Pago do CSV, sem duplicacao.')
            ops[seller]['cashEvents'].append(event)
            receipts.append(event)
        event = dict(id=f'cessao-{trade}-compra-{buyer_id}', operationId=buyer_id, date=trade,
            type='portfolio_purchase', titleId=f'cessao-{trade}', amount=authorization['fundingAmount'],
            source='valor_confirmado_usuario', note='Preco total efetivo, separado do valor economico dos ativos.')
        buyer['cashEvents'].append(event)
        purchases.append(event)
        fund = next(o for o in funding['operations'] if o['id'] == buyer_id)
        component = copy.deepcopy(fund['fundingComponents'][0])
        component.update(sheet=f'{fund["shortName"]} - Aporte {trade}', startDate=trade, issueDate=trade,
            principal=authorization['fundingAmount'], fundingBalance=authorization['fundingAmount'],
            fundingRate=authorization['fundingMonthlyRate']*100, fundingRateType='monthly_fixed',
            fundingRateLabel='1.70% a.m.', baseDays=360, accrueOnStartDate=False, events=[], rateSchedule=[],
            interestPaidToDate=0, amortizationPaidToDate=0, installmentPaidToDate=0)
        assert not any(c['sheet'] == component['sheet'] for c in fund['fundingComponents'])
        fund['fundingComponents'].append(component)
        fund['fundingPrincipal'] = round(fund['fundingPrincipal'] + authorization['fundingAmount'], 2)
        pending_sales = []
    for op in portfolio['operations']:
        op['positionDate'] = through
        for t in op['titles']:
            t['positionDate'] = through
            t['presentValue'] = round(imp.accrued_value(t, through), 2)
            t['isActive'] = not t.get('isIgnored') and t['presentValue'] > 0
            if t.get('maturityDate'):
                t['daysToMaturity'] = (date.fromisoformat(t['maturityDate']) - date.fromisoformat(through)).days
    preserve = set(authorization.get('preserveConfessions', [])) if authorization else set()
    pending = dict(fundingForNewSales=len(pending_sales),
                   sales=[dict(op=r['op'], id=r['id'], invoice=r['source']['invoice'],
                               reportedPaid=r['paidDelta'], date=r['source']['paidDate'],
                               destination=r['source']['destination']) for r in pending_sales],
                   retroactiveChanges=[dict(op=r['op'], id=r['id'], differences=r['differences']) for r in audit['economicChanges'] if r['id'] not in preserve],
                   newHistoricalActive=[r for r in audit['newRecords'] if r['retroactive'] and r['source']['status']=='EM CARTEIRA'
                     and (not authorization or r['source']['lastro'] != authorization.get('excludePendingHistoricalTitle'))])
    status = 'PREVIA_PENDENTE_NAO_PUBLICAR' if any([pending_sales, pending['retroactiveChanges'], pending['newHistoricalActive']]) else 'CANDIDATO'
    portfolio['incrementalPreview'] = dict(cutoff=cutoff, through=through, status=status)
    (out / 'portfolio-candidato.js').write_text('window.ceresPortfolioData = '+json.dumps(portfolio, ensure_ascii=False)+';\n', encoding='utf-8')
    funding['positionDate'] = through
    portfolio['updatedAt'] = str(date.today())
    (out / 'funding-candidato.js').write_text('window.ceresFundingData = '+json.dumps(funding, ensure_ascii=False)+';\n', encoding='utf-8')
    report = dict(status=status, cutoff=cutoff, through=through, purchases=purchases, receipts=receipts, pending=pending,
                  authorization=authorization, transferSummary={k:v for k,v in (transfer or {}).items() if k!='rows'})
    (out / 'staging-summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(status=status, purchases=len(purchases), acquisition=round(sum(e['amount'] for e in purchases),2),
                         receipts=len(receipts), receiptsValue=round(sum(e['amount'] for e in receipts),2),
                         pendingSales=len(pending_sales), historicalFilesChanged=0), ensure_ascii=True))


if __name__ == '__main__':
    main()
