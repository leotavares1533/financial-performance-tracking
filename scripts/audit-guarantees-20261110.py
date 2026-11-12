import collections
import csv
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'outputs/processamento-confina-20261110'
OUT.mkdir(parents=True, exist_ok=True)
ANIMALS = Path.home() / 'Downloads/relatorio_GERANIMAL02.csv-11-11-2026_21-18-23.csv'
GTA = Path.home() / 'Downloads/relatorio_GERGTA01 (1).csv'
spec = importlib.util.spec_from_file_location('biology', ROOT / 'scripts/build-biological-assets-confina.py')
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
TARGETS = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10']


def ident(row):
    sisbov = row['SISBOV'].strip()
    if sisbov and b.compact_number_id(sisbov) not in {'0', ''}:
        return ('sisbov', b.compact_number_id(sisbov))
    if row['TAG'].strip() and row['Fazenda'].strip():
        return ('farm-tag', b.norm(row['Fazenda']), b.compact_number_id(row['TAG']))
    return None


def shipment(gta, invoice):
    return b.digits(gta).lstrip('0'), b.digits(invoice).lstrip('0')


groups = collections.defaultdict(list)
statuses = collections.Counter()
reference_dates = collections.Counter()
unknown_ids = []
with ANIMALS.open(encoding='utf-8-sig', newline='') as f:
    for line, row in enumerate(csv.DictReader(f, delimiter=';'), 2):
        statuses[row['STATUS ATUAL']] += 1
        reference_dates[row['Data referencia']] += 1
        key = ident(row)
        if key is None:
            unknown_ids.append(line)
        else:
            groups[key].append((line, row))

important = ['Fazenda', 'UF da fazenda', 'VEÍCULO DE OPERAÇÃO', 'Lastro', 'Número do título',
             'GTA', 'Nota fiscal', 'STATUS ATUAL', 'Data de entrada', 'Data do processamento de entrada',
             'Data de saída real', 'Data de confirmação de abate', 'Peso de entrada', 'Ganho médio diário',
             'Peso projetado']
duplicates = []
unique = []
conflicting_heads = 0
for key, rows in groups.items():
    if len(rows) > 1:
        diffs = {field: sorted({row[field] for _, row in rows}) for field in important
                 if len({row[field] for _, row in rows}) > 1}
        duplicates.append(dict(identity=key, lines=[line for line, _ in rows], differences=diffs))
        if diffs:
            conflicting_heads += 1
            continue
    unique.append(rows[0][1])

with GTA.open(encoding='cp1252', newline='') as f:
    gta_rows = list(csv.DictReader(f, delimiter=';'))
gta_cols = {b.norm(k): k for k in gta_rows[0] if k}
gta_number = b.find_col(gta_cols, 'n gta', 'gta', predicate=lambda x: x.endswith('gta') and 'data' not in x)
invoice_col = b.find_col(gta_cols, 'n nota', 'nota')
gta_keys = collections.defaultdict(list)
for line, row in enumerate(gta_rows, 2):
    key = (b.norm(row['Fazenda']), b.compact_number_id(row['Lastro']), shipment(row[gta_number], row[invoice_col]))
    gta_keys[key].append((line, row))
gta_duplicates = [dict(identity=key, lines=[line for line, _ in rows],
                       quantities=sorted({row['Qtd. Animais'] for _, row in rows}))
                  for key, rows in gta_keys.items() if len(rows) > 1]
monthly_undated = collections.Counter()
daily = {}
for target in TARGETS:
    count = collections.Counter()
    animal_shipments = collections.Counter()
    for row in unique:
        entry = b.parse_date(row['Data de entrada'])
        process = b.parse_date(row['Data do processamento de entrada'])
        departed = b.parse_date(row['Data de saída real'])
        abate = b.parse_date(row['Data de confirmação de abate'])
        if not entry or entry > target or process > target:
            count['notYetEnteredOrProcessed'] += 1
            continue
        status = row['STATUS ATUAL']
        if departed > target or (not departed and abate > target):
            status = 'PROCESSADO'
        elif departed and departed <= target and abate > target:
            status = 'AGUARDANDO ABATE'
        bucket = b.status_bucket(status)
        if not bucket:
            continue
        count[bucket] += 1
        animal_shipments[shipment(row['GTA'], row['Nota fiscal'])] += 1
        if not departed and not abate and row['STATUS ATUAL'] not in {'PROCESSADO', 'EM PROCESSAMENTO'}:
            count['eligibleOtherStatusWithoutExitDate'] += 1
    eligible_shipments = collections.defaultdict(list)
    for row in gta_rows:
        issued = b.parse_date(row['Data emissão GTA'])
        arrived = b.parse_date(row['Data chegada / baixa'])
        if not issued or issued > target or (arrived and arrived <= target):
            continue
        if not arrived and b.norm(row['Status']) != 'em transito':
            continue
        eligible_shipments[(b.norm(row['Fazenda']), shipment(row[gta_number], row[invoice_col]))].append(row)
    multiple_lastros = []
    transit = []
    for key, rows in eligible_shipments.items():
        signature = {(r['Lastro'], r['Qtd. Animais'], r['Qtd. Animais processados']) for r in rows}
        if len(signature) > 1:
            multiple_lastros.append(dict(farm=key[0], shipment=key[1], rows=[{k:r[k] for k in
                                       ['Lastro', 'Qtd. Animais', 'Qtd. Animais processados']} for r in rows]))
        raw_heads = int(sum(b.number(r['Qtd. Animais']) for r in rows))
        count['gtaRawEligibleHeads'] += raw_heads
        overlap = min(raw_heads, animal_shipments[key[1]]) if all(key[1]) else 0
        count['overlapWithAnimalReportHeads'] += overlap
        transit.append(dict(farm=key[0], shipment=key[1], rawHeads=raw_heads,
                            overlap=overlap, candidateHeads=raw_heads-overlap))
    count['gtaAfterOverlapBeforeDuplicateResolutionHeads'] = sum(r['candidateHeads'] for r in transit)
    daily[target] = dict(counts=dict(count), multipleLastrosForSameShipment=multiple_lastros)

report = dict(sources={str(f): hashlib.sha256(f.read_bytes()).hexdigest() for f in [ANIMALS, GTA]},
              animalRawRows=sum(statuses.values()), statuses=dict(statuses), referenceDates=dict(reference_dates),
              uniqueAnimalKeys=len(groups), duplicateAnimalKeys=len(duplicates),
              duplicateExcessRows=sum(len(r['lines'])-1 for r in duplicates),
              conflictingDuplicateAnimals=conflicting_heads, duplicateDetails=duplicates,
              unknownIdRows=unknown_ids, gtaRows=len(gta_rows), gtaDuplicateKeys=gta_duplicates,
              dailyDiagnostics=daily,
              note='Diagnostico apenas. Nao publica composicao nem valores de garantia. Identidades conflitantes nao sao escolhidas arbitrariamente.')
(OUT / 'validacao-garantias.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k:v for k,v in report.items() if k not in {'sources','duplicateDetails', 'gtaDuplicateKeys', 'dailyDiagnostics'}}, ensure_ascii=True))
print('gta duplicate keys', len(gta_duplicates))
for target, result in daily.items():
    print(target, result['counts'], 'shipments multiple lastros', len(result['multipleLastrosForSameShipment']))
