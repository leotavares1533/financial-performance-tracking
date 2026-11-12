import collections
import csv
import hashlib
import importlib.util
import json
import re
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'outputs' / 'processamento-confina-20261110'
OUT.mkdir(parents=True, exist_ok=True)
SOURCE = Path.home() / 'Downloads' / 'ger004-titulos-ativos-11-11-2026_21-02-33.csv'
spec = importlib.util.spec_from_file_location('portfolio_importer', ROOT / 'scripts/import-confina-portfolio.py')
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


def read_js(path):
    return json.loads(path.read_text(encoding='utf-8-sig').split('=', 1)[1].strip().rstrip(';'))


def num(value):
    text = ''.join(str(value).replace('R$', '').replace('.', '').replace(',', '.').split())
    return float(Decimal(text or '0'))


def dt(value):
    parsed = imp.parse_date(value)
    return parsed.isoformat() if parsed else ''


def invoice(value):
    return imp.normalize_text(str(value).split('-')[0])


def brief(row):
    return {k: row[k] for k in ['op', 'lastro', 'invoice', 'face', 'acquisition', 'purchase', 'maturity',
                                 'rate', 'base', 'cedente', 'sacado', 'titleType', 'uf',
                                 'status', 'paymentStatus', 'paidDate', 'paid', 'destination']}


portfolio = read_js(ROOT / 'data/portfolio/portfolio-confina.js')
ops = {o['operationId']: o for o in portfolio['operations']}
rows = []
with SOURCE.open(encoding='utf-8-sig', newline='') as handle:
    for line, r in enumerate(csv.DictReader(handle, delimiter=';'), 2):
        r = {k: v.strip() for k, v in r.items() if k}
        op = imp.operation_id_for_name(r['Veículo'], '')
        rows.append(dict(op=op, lastro=r['Lastro'], invoice=r['Número do Ativo'],
                         cedente=r['Nome Cedente'], sacado=r['Nome Sacado'], titleType=r['Tipo do Ativo'], uf=r['UF Sacado'],
                         party=imp.normalize_text(r['Nome Sacado']), face=num(r['Valor Nominal']),
                         acquisition=num(r['Valor Aquisição']), purchase=dt(r['Data Cessão']),
                         maturity=dt(r['Data Vencimento']), approval=dt(r['Data Aprovação']),
                         rate=num(r['Taxa Cessão']), base=r['Base de Dias'], status=r['Situação do Ativo'],
                         paymentStatus=r['Status de Pagamento'], paidDate=dt(r['Data Pagamento']),
                         paid=num(r['Valor Pago']), destination=r['Operação Atual'], raw=r, line=line))

byop = collections.defaultdict(list)
for row in rows:
    byop[row['op']].append(row)
matched_rows = set()
unmatched = []
changes = []
matches = []
for opid, operation in ops.items():
    for title in operation['titles']:
        possibilities = [r for r in byop[opid] if r['lastro'] == title['id']]
        mode = 'id'
        if not possibilities and title.get('originalLastro'):
            possibilities = [r for r in byop[opid] if r['lastro'] == title['originalLastro']]
            mode = 'originalLastro'
        if not possibilities:
            possibilities = [r for r in byop[opid] if invoice(r['invoice']) == invoice(title['invoice'])
                             and r['party'] == imp.normalize_text(title['sacado'])
                             and abs(r['face'] - title['faceValue']) < .02]
            mode = 'invoice-party-face'
        if len(possibilities) != 1:
            unmatched.append(dict(op=opid, id=title['id'], invoice=title['invoice'],
                                  active=title.get('isActive'), ignored=title.get('isIgnored'),
                                  settled=title.get('settledDate'), purchase=title.get('purchaseDate'),
                                  face=title['faceValue'], acquisition=title['acquisitionValue'],
                                  candidates=[brief(r) for r in possibilities]))
            continue
        r = possibilities[0]
        matched_rows.add(r['line'])
        deltas = {}
        for rawkey, oldkey in [('face', 'faceValue'), ('acquisition', 'acquisitionValue'), ('rate', 'discountRateMonthly')]:
            tolerance = .00000051 if rawkey == 'rate' else .02
            if abs(r[rawkey] - title.get(oldkey, 0)) > tolerance:
                deltas[rawkey] = [title.get(oldkey), r[rawkey]]
        for rawkey, oldkey in [('purchase', 'purchaseDate'), ('maturity', 'maturityDate')]:
            if r[rawkey] != (title.get(oldkey) or ''):
                deltas[rawkey] = [title.get(oldkey), r[rawkey]]
        old_paid = round(sum(e['amount'] for e in operation['cashEvents']
                             if e.get('titleId') == title['id'] and e['type'] == 'portfolio_liquidation'
                             and e['date'] <= '2026-11-03'), 2)
        record = dict(op=opid, id=title['id'], sourceId=r['lastro'], invoice=title['invoice'], matchMode=mode,
                      active=title.get('isActive'), ignored=title.get('isIgnored'),
                      settled=title.get('settledDate'), partials=title.get('partialLiquidations'),
                      historicalReceipts=old_paid, source=brief(r), differences=deltas)
        matches.append(record)
        if deltas:
            changes.append(record)

new = [brief(r) | {'approval': r['approval']} for r in rows if r['op'] in ops and r['line'] not in matched_rows]
transfers = [brief(r) for r in rows if 'NOVEMBRO' in r['destination'] or r['lastro'] in {'558701', '558700', '553579'}]
duplicates = {str(k): len(v) for k, v in collections.defaultdict(list).items()}
keys = collections.Counter((r['op'], r['lastro']) for r in rows)
duplicates = {str(k): count for k, count in keys.items() if count > 1}
report = dict(source=str(SOURCE), sha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
              rows=len(rows), vehicles=dict(collections.Counter(r['raw']['Veículo'] for r in rows)),
              duplicatesWithinVehicle=duplicates, matches=matches, unmatchedOld=unmatched,
              newRecords=new, economicDifferences=changes, novemberTransfers=transfers)
(OUT / 'fonte-normalizada.json').write_text(json.dumps([brief(r) | {'line':r['line'], 'approval':r['approval']} for r in rows],
                                                     ensure_ascii=False, indent=2), encoding='utf-8')
(OUT / 'validacao-titulos.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
summary = dict(rows=len(rows), matched=len(matches), duplicates=duplicates,
               unmatchedActive=[r for r in unmatched if r['active']],
               unmatchedInactive=len([r for r in unmatched if not r['active']]),
               newRecords=len(new), newHistoricalActive=[r for r in new if r['purchase'] <= '2026-11-03'
                                                        and r['status'] in {'EM CARTEIRA', 'BAIXA PARCIAL'}],
               differences=len(changes), differencesActive=sum(bool(r['active']) for r in changes),
               paymentsAfterCutoff=[r for r in matches if r['source']['paidDate'] > '2026-11-03'],
               novemberCounts=dict(collections.Counter(r['op'] for r in transfers)))
(OUT / 'resumo-validacao.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in summary.items() if k not in {'paymentsAfterCutoff', 'newHistoricalActive'}}, ensure_ascii=True, indent=2))
print('new historical active', len(summary['newHistoricalActive']))
print('payments after cutoff', len(summary['paymentsAfterCutoff']))
