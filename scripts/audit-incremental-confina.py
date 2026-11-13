"""Compare a unified GER004 with its prior extraction; print only actionable deltas."""
import argparse
import collections
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('importer', ROOT / 'scripts/import-confina-portfolio.py')
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


def read_js(file):
    return json.loads(Path(file).read_text(encoding='utf-8-sig').split('=', 1)[1].strip().rstrip(';'))


def normalized(file):
    digest = hashlib.sha256(Path(file).read_bytes()).hexdigest()
    parser_digest = hashlib.sha256(Path(__file__).read_bytes() + (ROOT / 'scripts/import-confina-portfolio.py').read_bytes()).hexdigest()[:12]
    cache = ROOT.parent / 'outputs/cache-confina' / f'ger004-{parser_digest}-{digest}.json'
    if cache.exists():
        return json.loads(cache.read_text(encoding='utf-8'))
    rows = imp.read_csv(Path(file))
    required = {'Veículo', 'Lastro', 'Número do Ativo', 'Valor Aquisição', 'Data Cessão', 'Valor Pago'}
    assert rows and required.issubset(rows[0]), 'Formato GER004 unificado diferente do esperado.'
    def dt(value):
        return imp.date_key(imp.parse_date(value))
    result = [dict(op=imp.operation_id_for_name(r['Veículo'], ''), vehicle=r['Veículo'], lastro=r['Lastro'].strip(),
                 invoice=r['Número do Ativo'], cedente=r['Nome Cedente'], sacado=r['Nome Sacado'],
                 titleType=r['Tipo do Ativo'], uf=r['UF Sacado'], face=imp.parse_number(r['Valor Nominal']),
                 acquisition=imp.parse_number(r['Valor Aquisição']), purchase=dt(r['Data Cessão']),
                 maturity=dt(r['Data Vencimento']), approval=dt(r['Data Aprovação']),
                 rate=imp.parse_number(r['Taxa Cessão']), base=r['Base de Dias'],
                 status=r['Situação do Ativo'], paymentStatus=r['Status de Pagamento'],
                 paidDate=dt(r['Data Pagamento']), paid=imp.parse_number(r['Valor Pago']),
                 destination=r['Operação Atual'], line=i) for i, r in enumerate(rows, 2)]
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--previous-source', required=True)
    parser.add_argument('--cutoff', required=True)
    parser.add_argument('--through', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    source, prior = normalized(args.source), normalized(args.previous_source)
    oldraw = collections.defaultdict(list)
    for r in prior:
        oldraw[(r['op'], r['lastro'])].append(r)
    portfolio = read_js(ROOT / 'data/portfolio/portfolio-confina.js')
    ops = {o['operationId']: o for o in portfolio['operations']}
    indexes = collections.defaultdict(list)
    for op in ops.values():
        for title in op['titles']:
            for ident in set(str(title.get(k) or '') for k in ['id', 'lastro', 'sourceLastro', 'originalLastro', 'controlReferenceLastro']):
                if ident:
                    indexes[(op['operationId'], ident)].append(title)
    matches, changes, new, duplicates, payments, missing, future = [], [], [], [], [], [], []
    keys = collections.Counter((r['op'], r['lastro']) for r in source)
    duplicates = [dict(op=k[0], lastro=k[1], count=n) for k, n in keys.items() if n > 1 and k[0] in ops]
    seen = set()
    economic = ['face', 'acquisition', 'purchase', 'maturity', 'rate', 'base', 'invoice', 'sacado']
    for r in source:
        if r['op'] not in ops:
            continue
        old_versions = oldraw.get((r['op'], r['lastro']), [])
        precise_versions = [v for v in old_versions if v['purchase'] == r['purchase']]
        previous = precise_versions[0] if len(precise_versions) == 1 else old_versions[0] if len(old_versions) == 1 else None
        candidates = indexes.get((r['op'], r['lastro']), [])
        exact = [t for t in candidates if t['id'] == r['lastro']]
        if len(exact) == 1:
            candidates = exact
        if not candidates:
            candidates = [t for t in ops[r['op']]['titles'] if imp.normalize_text(t.get('invoice', '').split('-')[0]) == imp.normalize_text(r['invoice'].split('-')[0])
                          and imp.normalize_text(t.get('sacado')) == imp.normalize_text(r['sacado'])
                          and abs(t['faceValue'] - r['face']) < .02]
        if len(candidates) > 1:
            precise = [t for t in candidates if t.get('purchaseDate') == r['purchase'] and abs(t['acquisitionValue'] - r['acquisition']) < .02]
            if len(precise) == 1:
                candidates = precise
        if len(candidates) != 1:
            new.append(dict(source=r, candidates=[t['id'] for t in candidates],
                            retroactive=bool(r['purchase'] and r['purchase'] <= args.cutoff)))
            continue
        t = candidates[0]
        seen.add((r['op'], t['id']))
        diffs = {}
        if previous:
            diffs = {k: [previous[k], r[k]] for k in economic if previous[k] != r[k]}
        delta_paid = round(r['paid'] - (previous['paid'] if previous else 0), 2)
        record = dict(op=r['op'], id=t['id'], active=t.get('isActive'), settled=t.get('settledDate'),
                      source=r, previousSource=previous, differences=diffs, paidDelta=delta_paid)
        matches.append(record)
        if diffs:
            changes.append(record)
        if abs(delta_paid) >= .005:
            payments.append(record)
        if r['paidDate'] > args.through or r['purchase'] > args.through:
            future.append(dict(op=r['op'], lastro=r['lastro'], purchase=r['purchase'], paidDate=r['paidDate']))
    for op in ops.values():
        missing.extend(dict(op=op['operationId'], id=t['id'], invoice=t['invoice'], acquisition=t['acquisitionValue'],
                            purchase=t['purchaseDate'], settled=t.get('settledDate')) for t in op['titles']
                       if t.get('isActive') and (op['operationId'], t['id']) not in seen)
    report = dict(cutoff=args.cutoff, through=args.through, sources={str(Path(f).resolve()): hashlib.sha256(Path(f).read_bytes()).hexdigest()
                  for f in [args.source, args.previous_source]}, rows=len(source), priorRows=len(prior),
                  vehicles=dict(collections.Counter(r['vehicle'] for r in source)),
                  duplicatesWithinVehicle=duplicates, matches=matches, economicChanges=changes,
                  newRecords=new, missingActive=missing, paymentChanges=payments, futureRecords=future)
    (out / 'audit-full.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (out / 'source-normalized.json').write_text(json.dumps(source, ensure_ascii=False), encoding='utf-8')
    summary = {k: report[k] for k in ['cutoff', 'through', 'rows', 'priorRows', 'vehicles', 'duplicatesWithinVehicle', 'missingActive']}
    summary.update(economicChanges=[dict(op=r['op'], id=r['id'], active=r['active'], differences=r['differences']) for r in changes],
                   newRecords=new, payments=[dict(op=r['op'], id=r['id'], delta=r['paidDelta'], date=r['source']['paidDate'],
                                                 status=r['source']['status'], previouslySettled=r['settled']) for r in payments], futureCount=len(future))
    (out / 'audit-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(dict(rows=len(source), matched=len(matches), economicChanges=len(changes),
                         newRecords=len(new), newHistoricalActive=sum(r['retroactive'] and r['source']['status']=='EM CARTEIRA' for r in new),
                         missingActive=len(missing), paymentChanges=len(payments), futureRecords=len(future),
                         details=str(out / 'audit-summary.json')), ensure_ascii=True))


if __name__ == '__main__':
    main()
