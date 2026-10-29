from __future__ import annotations

import csv
import argparse
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


PROJECT = Path(__file__).resolve().parents[1]
ANIMAL_CSV = Path(r"C:\Users\leonardo.silva\Downloads\relatorio_GERANIMAL02 (13).csv")
PURCHASED_TRANSIT_CSV = Path(r"C:\Users\leonardo.silva\Downloads\Relatório de 42_2026-10-01T16_55_35.854Z.csv")
PORTFOLIO_JS = PROJECT / "data" / "portfolio" / "portfolio-confina.js"
FUNDING_JS = PROJECT / "data" / "fundings" / "fundings-confina.js"
QUOTES_JS = PROJECT / "data" / "pecuaria" / "cotacoes-pecuaria-latest.js"

OUT_DIR = PROJECT / "data" / "biological"
OUT_JS = OUT_DIR / "biological-assets-confina.js"
HISTORY_DIR = OUT_DIR / "history"
HISTORY_JS = OUT_DIR / "biological-assets-history-confina.js"
OUT_SUMMARY = PROJECT / "tmp" / "biological_asset_connection_summary.json"
OUT_LOTS = PROJECT / "tmp" / "biological_asset_lots.csv"
OUT_TRANSFERS = PROJECT / "tmp" / "biological_asset_transfer_candidates.csv"

LIVE_STATUSES = {"processado", "em processamento"}
TRANSIT_STATUSES = {"aguardando abate"}
PURCHASED_TRANSIT_STATUSES = {
    "comprado em transito",
    "comprado em trânsito",
    "em compra",
    "em compras",
    "comprado",
    "aguardando entrada",
}
ARROBA_KG = 15
PURCHASED_TRANSIT_UNMATCHED_OPERATION = "biologico-comprado-transito-sem-carteira"


def strip_accents(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    return "".join(ch for ch in value if not unicodedata.combining(ch))


def norm(value: object) -> str:
    text = strip_accents(str(value or "")).lower().replace("\ufffd", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slug(value: object) -> str:
    text = norm(value)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "sem-veiculo"


def digits(value: object) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def compact_number_id(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if re.fullmatch(r"\d+(\.0+)?", text):
        return str(int(float(text)))
    return text


def number(value: object) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        value = float(value)
        return value if math.isfinite(value) else 0.0
    text = str(value).strip().replace("R$", "").replace(" ", "").replace("%", "")
    if not text or text in {"-", "nan", "NaN"}:
        return 0.0
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        out = float(text)
        return out if math.isfinite(out) else 0.0
    except ValueError:
        return 0.0


def parse_date(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    if re.match(r"^\d{4}-\d{2}-\d{2}", text):
        return text[:10]
    for fmt in ("%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(text[:10], fmt).date().isoformat()
        except ValueError:
            pass
    return ""


def days_between(start_date: str, end_date: str) -> float:
    if not start_date or not end_date:
        return 0.0
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        return 0.0
    delta = (end - start).days
    return float(delta) if delta > 0 else 0.0


def read_csv(path: Path) -> tuple[list[dict[str, str]], str]:
    last_error: Exception | None = None
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                sample = handle.read(8192)
                handle.seek(0)
                try:
                    dialect = csv.Sniffer().sniff(sample, delimiters=";,")
                except csv.Error:
                    dialect = csv.excel
                    dialect.delimiter = ";"
                rows = list(csv.DictReader(handle, dialect=dialect))
            if rows and len(rows[0]) > 1:
                return rows, encoding
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"Nao foi possivel ler {path}: {last_error}")


def read_js_object(path: Path, variable: str) -> dict:
    text = path.read_text(encoding="utf-8-sig")
    match = re.search(rf"{re.escape(variable)}\s*=\s*(\{{.*\}})\s*;?\s*$", text, flags=re.S)
    if not match:
        raise RuntimeError(f"Nao foi possivel ler {variable} em {path}")
    return json.loads(match.group(1))


def biological_snapshot_date(snapshot: dict) -> str:
    return str(snapshot.get("referenceDate") or snapshot.get("summary", {}).get("referenceDate") or "")[:10]


def add_biological_history_snapshot(by_date: dict[str, dict], snapshot: dict) -> None:
    if not isinstance(snapshot, dict):
        return
    if not snapshot.get("assetsByOperationId") and not snapshot.get("vehicles"):
        return
    date_key = biological_snapshot_date(snapshot)
    if not date_key:
        return
    current = by_date.get(date_key)
    if not current or str(snapshot.get("updatedAt") or "") >= str(current.get("updatedAt") or ""):
        by_date[date_key] = snapshot


def write_biological_history(new_snapshot: dict) -> None:
    by_date: dict[str, dict] = {}

    if HISTORY_JS.exists():
        try:
            history = read_js_object(HISTORY_JS, "window.ceresBiologicalAssetsHistory")
            for snapshot in history.get("snapshots", []):
                add_biological_history_snapshot(by_date, snapshot)
        except Exception:
            pass

    for folder in (HISTORY_DIR, PROJECT / "tmp"):
        if not folder.exists():
            continue
        for path in folder.glob("biological-assets-confina*.js"):
            try:
                add_biological_history_snapshot(by_date, read_js_object(path, "window.ceresBiologicalAssets"))
            except Exception:
                pass

    if OUT_JS.exists():
        try:
            add_biological_history_snapshot(by_date, read_js_object(OUT_JS, "window.ceresBiologicalAssets"))
        except Exception:
            pass

    add_biological_history_snapshot(by_date, new_snapshot)
    snapshots = [by_date[date_key] for date_key in sorted(by_date)]
    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "referenceDates": [biological_snapshot_date(snapshot) for snapshot in snapshots],
        "snapshots": snapshots,
    }
    HISTORY_JS.write_text(
        "window.ceresBiologicalAssetsHistory = "
        + json.dumps(payload, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )


def columns(rows: list[dict[str, str]]) -> dict[str, str]:
    return {norm(key): key for key in rows[0].keys() if key}


def find_col(cols: dict[str, str], *candidates: str, predicate=None) -> str:
    for candidate in candidates:
        key = norm(candidate)
        if key in cols:
            return cols[key]
    for candidate in candidates:
        key = norm(candidate)
        for normalized, original in cols.items():
            if key and key in normalized:
                return original
    if predicate:
        for normalized, original in cols.items():
            if predicate(normalized):
                return original
    raise KeyError(f"Coluna nao encontrada: {candidates}")


def title_number_key(value: object) -> str:
    text = norm(value).replace(" ", "")
    text = re.sub(r"(?:1)+$", "", text)
    return text


def operation_from_vehicle(vehicle: str) -> str:
    key = norm(vehicle)
    if "42" in key and "65" in key and "cra" in key and ("09" in key or "2026" in key):
        return "confina-cra-42-65-setembro"
    if "btg" in key and "100" in key:
        return "confina-cprf-100"
    if "btg" in key and "50" in key:
        return "confina-cprf-50"
    if "interno" in key and "50" in key:
        return "confina-cras-carteira-50"
    if "carteira" in key and ("ceres" in key or "100" in key):
        return "confina-cras-carteira-100"
    if "super" in key and "cra" in key:
        return "confina-cra-42-50"
    if "65" in key and "80" in key:
        return "confina-cra-65-80"
    if "65" in key and "setembro" in key:
        return "confina-cra-65-setembro"
    if "65" in key and "cra" in key:
        return "confina-cra-65-200"
    if "ceres confina ltda" in key or "confina fidc" in key or "fidc" in key:
        return "biologico-confina-fidc"
    if "cra one" in key or "cra two" in key:
        return "confina-cra-65-200"
    return f"biologico-{slug(vehicle)}"


def force_cra_one_two_to_65_200(vehicle: str) -> bool:
    key = norm(vehicle)
    return "cra one" in key or "cra two" in key


EXTERNAL_ASSET_NAMES = {
    "biologico-confina-fidc": "Confina FIDC / Ceres Confina LTDA",
    "biologico-transferencias-a-lastrear": "Transferencias a lastrear",
    "biologico-sem-veiculo": "Sem veiculo",
    PURCHASED_TRANSIT_UNMATCHED_OPERATION: "Comprado em transito sem carteira",
}


def operation_label(operation_id: str, source_vehicle: str, fundings_by_id: dict[str, dict]) -> tuple[str, str, str]:
    funding = fundings_by_id.get(operation_id)
    if funding:
        return (
            funding.get("name") or operation_id,
            funding.get("shortName") or funding.get("name") or operation_id,
            funding.get("investor") or "",
        )
    label = EXTERNAL_ASSET_NAMES.get(operation_id) or source_vehicle or operation_id
    return label, label, "Ativo biologico"


def prettify(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return "-"
    text = text.replace("_", " ").lower()
    small = {"de", "da", "do", "das", "dos", "e"}
    return " ".join(word if word in small else word.capitalize() for word in text.split())


def quote_category(row: dict[str, str], type_col: str, sex_col: str) -> tuple[str, str]:
    raw_type = norm(row.get(type_col))
    raw_sex = norm(row.get(sex_col))
    if "novilha" in raw_type:
        return "novilha", "Novilha"
    if "vaca" in raw_type or "femea" in raw_type or raw_sex in {"f", "femea"}:
        return "vaca", "Vaca"
    return "boi", prettify(row.get(type_col)) if row.get(type_col) else "Boi"


def quote_lookup(quotes: dict, target_date: str = "") -> tuple[dict[tuple[str, str], float], str]:
    rows = list(quotes.get("rows", [])) + list(quotes.get("historyRows", []))
    available_dates = sorted({
        str(row.get("quote_date") or "")
        for row in rows
        if row.get("product") == "boi_gordo"
        and row.get("quote_date")
        and row.get("map_type") in {"regional_map", "historical_series"}
    })
    if target_date:
        latest_date = max((date_key for date_key in available_dates if date_key <= target_date), default="")
    else:
        latest_date = available_dates[-1] if available_dates else ""
    out: dict[tuple[str, str], float] = {}
    for row in rows:
        if row.get("product") != "boi_gordo":
            continue
        if row.get("quote_date") != latest_date:
            continue
        if row.get("map_type") not in {"regional_map", "historical_series"}:
            continue
        category = row.get("category")
        region = row.get("region")
        price = number(row.get("price"))
        if category and region and price:
            out[(category, region)] = price
    return out, latest_date


def quote_for_row(row: dict[str, str], quote_map: dict[tuple[str, str], float], uf_col: str, type_col: str, sex_col: str, arroba_col: str) -> tuple[str, str, float]:
    source_quote = number(row.get(arroba_col))
    category_key, category_label = quote_category(row, type_col, sex_col)
    uf = str(row.get(uf_col) or "").strip().upper()
    if source_quote:
        return category_key, category_label, source_quote
    if (category_key, uf) in quote_map:
        return category_key, category_label, quote_map[(category_key, uf)]
    if ("boi", uf) in quote_map:
        return category_key, category_label, quote_map[("boi", uf)]
    boi_prices = [price for (cat, _region), price in quote_map.items() if cat == "boi"]
    fallback = sum(boi_prices) / len(boi_prices) if boi_prices else 0.0
    return category_key, category_label, fallback


def selected_live_weight(
    row: dict[str, str],
    proj_col: str,
    entrada_peso_col: str,
    alvo_col: str,
    dias_confinado_col: str,
    entrada_col: str,
    reference_date: str,
) -> tuple[float, str]:
    candidates = [
        ("peso_projetado", number(row.get(proj_col))),
        ("peso_alvo", number(row.get(alvo_col))),
        ("peso_entrada", number(row.get(entrada_peso_col))),
    ]
    for source, value in candidates:
        if 0 < value <= 1200:
            entry_weight = number(row.get(entrada_peso_col))
            confined_days = number(row.get(dias_confinado_col))
            if not confined_days:
                confined_days = days_between(parse_date(row.get(entrada_col)), reference_date)
            adjusted_weight = entry_weight + 1.4 * confined_days if entry_weight and confined_days else 0.0
            if source == "peso_projetado" and value > 620 and 0 < adjusted_weight < value:
                return adjusted_weight, "peso_projetado_ajustado_gmd_140"
            return value, source
    for source, value in candidates:
        if value > 0:
            return value, f"{source}_fora_faixa"
    return 0.0, "sem_peso"


def flatten_titles(portfolio: dict) -> list[dict]:
    titles: list[dict] = []
    for operation in portfolio.get("operations", []):
        op_id = operation.get("operationId")
        report_name = operation.get("reportName")
        for title in operation.get("titles", []) or operation.get("portfolio", []):
            row = dict(title)
            row["operationId"] = row.get("operationId") or op_id
            row["reportName"] = row.get("reportName") or report_name
            titles.append(row)
    return titles


def funding_lookup(fundings: dict) -> dict[str, dict]:
    return {operation.get("id"): operation for operation in fundings.get("operations", [])}


def make_title_indexes(titles: list[dict]) -> tuple[dict[str, list[dict]], dict[str, list[dict]]]:
    by_lastro: dict[str, list[dict]] = defaultdict(list)
    by_number: dict[str, list[dict]] = defaultdict(list)
    for title in titles:
        for field in ("id", "lastro", "originalLastro", "controlReferenceLastro"):
            key = digits(title.get(field))
            if key:
                by_lastro[key].append(title)
        for field in ("invoice", "document", "documento"):
            key = title_number_key(title.get(field))
            if key:
                by_number[key].append(title)
    return by_lastro, by_number


def status_is_live(value: object) -> bool:
    return norm(value) in LIVE_STATUSES


def status_bucket(value: object) -> str:
    status = norm(value)
    if status in LIVE_STATUSES:
        return "live"
    if status in TRANSIT_STATUSES:
        return "transit"
    if status in PURCHASED_TRANSIT_STATUSES:
        return "purchasedTransit"
    return ""


def active_title(title: dict) -> bool:
    if title.get("isActive") is False:
        return False
    status = norm(title.get("paymentStatus"))
    return status not in {"liquidado", "baixa manual", "baixado"}


def purchased_title_value(title: dict) -> float:
    for field in ("acquisitionValue", "presentValue", "faceValue"):
        value = number(title.get(field))
        if value:
            return value
    return 0.0


def unique_titles(titles: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for index, title in enumerate(titles):
        key = (
            title.get("operationId") or "",
            compact_number_id(title.get("id") or title.get("lastro") or f"idx-{index}"),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(title)
    return out


def main() -> None:
    global ANIMAL_CSV, PURCHASED_TRANSIT_CSV, PORTFOLIO_JS, QUOTES_JS, OUT_JS

    parser = argparse.ArgumentParser(description="Monta a garantia biologica do Confina.")
    parser.add_argument("--animal-csv", default=str(ANIMAL_CSV), help="Relatorio GERANIMAL.")
    parser.add_argument("--purchased-transit-csv", default=str(PURCHASED_TRANSIT_CSV), help="Relatorio de titulos comprados em transito.")
    parser.add_argument("--reference-date", default="", help="Data-base da garantia no formato YYYY-MM-DD.")
    parser.add_argument("--skip-history", action="store_true", help="Arquivar separadamente com scripts/update-biological-history.mjs.")
    parser.add_argument("--portfolio-js", default=str(PORTFOLIO_JS), help="Base de carteira para conexoes.")
    parser.add_argument("--quotes-js", default=str(QUOTES_JS), help="Cotacoes para validar antes de publicar.")
    parser.add_argument("--output", default=str(OUT_JS), help="Arquivo JS de saida.")
    args = parser.parse_args()

    ANIMAL_CSV = Path(args.animal_csv)
    PURCHASED_TRANSIT_CSV = Path(args.purchased_transit_csv)
    PORTFOLIO_JS = Path(args.portfolio_js)
    QUOTES_JS = Path(args.quotes_js)
    OUT_JS = Path(args.output)
    reference_date_override = str(args.reference_date or "").strip()
    if reference_date_override:
        datetime.strptime(reference_date_override, "%Y-%m-%d")

    animal_rows, animal_encoding = read_csv(ANIMAL_CSV)
    portfolio = read_js_object(PORTFOLIO_JS, "window.ceresPortfolioData")
    fundings = read_js_object(FUNDING_JS, "window.ceresFundingData")
    quotes = read_js_object(QUOTES_JS, "window.ceresCattleQuotes")

    cols = columns(animal_rows)
    farm_col = find_col(cols, "fazenda")
    uf_col = find_col(cols, "uf da fazenda", predicate=lambda key: key.startswith("uf"))
    vehicle_col = find_col(cols, "veiculo de operacao", predicate=lambda key: "opera" in key and ("veiculo" in key or "culo" in key))
    lot_col = find_col(cols, "lote")
    curral_col = find_col(cols, "curral")
    tag_col = find_col(cols, "tag", "id do animal", predicate=lambda key: key in {"tag"} or "animal" in key)
    sisbov_col = find_col(cols, "sisbov", "codigo sisbov", predicate=lambda key: "sisbov" in key)
    type_col = find_col(cols, "tipo do animal", predicate=lambda key: "tipo" in key and "animal" in key)
    sex_col = find_col(cols, "sexo")
    status_col = find_col(cols, "status atual")
    gta_col = find_col(cols, "gta")
    nf_col = find_col(cols, "nota fiscal")
    cedente_col = find_col(cols, "cedente")
    lastro_col = find_col(cols, "lastro")
    title_col = find_col(cols, "numero do titulo", predicate=lambda key: "mero" in key and ("titulo" in key or "tulo" in key))
    arroba_col = find_col(cols, "valor do arroba", predicate=lambda key: "arroba" in key)
    ref_col = find_col(cols, "data referencia")
    entrada_col = find_col(cols, "data de entrada")
    proj_col = find_col(cols, "peso projetado")
    entrada_peso_col = find_col(cols, "peso de entrada")
    dias_confinado_col = find_col(cols, "quantidade de dias confinado", predicate=lambda key: "dias" in key and "confin" in key)
    alvo_col = find_col(cols, "peso alvo de saida esperado", predicate=lambda key: "peso alvo" in key)

    titles = flatten_titles(portfolio)
    by_lastro, by_title_number = make_title_indexes(titles)
    fundings_by_id = funding_lookup(fundings)
    controlled_ids = set(fundings_by_id)
    quote_map, quote_date = quote_lookup(quotes, reference_date_override)

    guarantee_rows = [row for row in animal_rows if status_bucket(row.get(status_col))]
    live_rows = [row for row in guarantee_rows if status_bucket(row.get(status_col)) == "live"]
    transit_rows = [row for row in guarantee_rows if status_bucket(row.get(status_col)) == "transit"]
    purchased_transit_rows = [row for row in guarantee_rows if status_bucket(row.get(status_col)) == "purchasedTransit"]
    reference_dates = Counter(parse_date(row.get(ref_col)) for row in guarantee_rows if parse_date(row.get(ref_col)))
    if reference_date_override:
        reference_dates = Counter({reference_date_override: len(guarantee_rows)})

    purchased_title_rows = []
    purchased_title_encoding = ""
    if PURCHASED_TRANSIT_CSV.exists():
        raw_purchased_rows, purchased_title_encoding = read_csv(PURCHASED_TRANSIT_CSV)
        purchased_cols = columns(raw_purchased_rows)
        purchased_farm_col = find_col(purchased_cols, "fazenda")
        purchased_lastro_col = find_col(purchased_cols, "lastro")
        purchased_nf_col = find_col(purchased_cols, "n nota", "nota", predicate=lambda key: "nota" in key)
        purchased_gta_col = find_col(purchased_cols, "n gta", "gta", predicate=lambda key: "gta" in key)
        purchased_heads_col = find_col(purchased_cols, "qtd animais", predicate=lambda key: "qtd" in key and "animais" in key and "process" not in key)
        purchased_status_col = find_col(purchased_cols, "status")
        purchased_emission_col = find_col(purchased_cols, "data emissao gta", predicate=lambda key: "data" in key and "gta" in key)
        purchased_days_col = find_col(purchased_cols, "tempo em transito dias", predicate=lambda key: "tempo" in key and "trans" in key)
        for row in raw_purchased_rows:
            if norm(row.get(purchased_status_col)) != "em transito":
                continue
            lastro_key = digits(row.get(purchased_lastro_col))
            heads = number(row.get(purchased_heads_col))
            if not lastro_key or heads <= 0:
                continue
            purchased_title_rows.append(
                {
                    "farm": str(row.get(purchased_farm_col) or "Sem fazenda").strip(),
                    "lastro": lastro_key,
                    "note": compact_number_id(row.get(purchased_nf_col)),
                    "gta": compact_number_id(row.get(purchased_gta_col)),
                    "heads": heads,
                    "status": str(row.get(purchased_status_col) or "").strip(),
                    "emissionDate": parse_date(row.get(purchased_emission_col)),
                    "daysInTransit": number(row.get(purchased_days_col)),
                }
            )

    grouped: dict[tuple, dict] = {}
    seen_animals_by_group: dict[tuple, set[str]] = defaultdict(set)
    connection_counter = Counter()
    vehicle_counter = Counter()
    vehicle_status_counter = Counter()
    weight_source_counter = Counter()
    transfer_candidates: dict[tuple, dict] = {}
    duplicate_animals: dict[str, set[str]] = defaultdict(set)

    for row_index, row in enumerate(guarantee_rows, start=1):
        bucket = status_bucket(row.get(status_col))
        vehicle = str(row.get(vehicle_col) or "Sem veiculo").strip()
        reported_operation_id = operation_from_vehicle(vehicle)
        force_65_200 = force_cra_one_two_to_65_200(vehicle)
        is_controlled_vehicle = reported_operation_id in controlled_ids
        vehicle_counter[vehicle] += 1
        vehicle_status_counter[(vehicle, row.get(status_col) or "")] += 1

        lastro = compact_number_id(row.get(lastro_col))
        lastro_key = digits(lastro)
        title_num = str(row.get(title_col) or "").strip()
        title_key = title_number_key(title_num)
        matched_lastro_titles = by_lastro.get(lastro_key, []) if lastro_key else []
        matched_number_titles = by_title_number.get(title_key, []) if title_key else []

        matched_ops = {title.get("operationId") for title in matched_lastro_titles}
        active_matched_ops = {title.get("operationId") for title in matched_lastro_titles if active_title(title)}
        active_number_ops = {title.get("operationId") for title in matched_number_titles if active_title(title)}

        operation_id = reported_operation_id
        allocation_method = "veiculo_relatorio"
        if force_65_200:
            operation_id = "confina-cra-65-200"
            allocation_method = "cra_one_two_para_65_200"
        elif len(active_matched_ops) == 1:
            operation_id = next(iter(active_matched_ops))
            allocation_method = "lastro_ativo_mesmo_veiculo" if operation_id == reported_operation_id else "transferencia_lastro_ativo"
        elif len(active_matched_ops) > 1:
            if reported_operation_id in active_matched_ops:
                operation_id = reported_operation_id
                allocation_method = "lastro_ativo_multiplo_mantido_veiculo"
            else:
                operation_id = sorted(active_matched_ops)[0]
                allocation_method = "transferencia_lastro_ativo_multiplo"
        elif len(active_number_ops) == 1:
            operation_id = next(iter(active_number_ops))
            allocation_method = "numero_titulo_ativo_mesmo_veiculo" if operation_id == reported_operation_id else "transferencia_numero_titulo_ativo"

        if allocation_method == "cra_one_two_para_65_200":
            connection = "cra_one_two_para_65_200"
        elif allocation_method.startswith("transferencia"):
            connection = allocation_method
        elif matched_lastro_titles and operation_id in matched_ops:
            connection = "lastro_mesmo_veiculo"
        elif matched_lastro_titles:
            connection = "lastro_veiculo_divergente"
        elif matched_number_titles and operation_id in {title.get("operationId") for title in matched_number_titles}:
            connection = "numero_titulo_mesmo_veiculo"
        elif matched_number_titles:
            connection = "numero_titulo_veiculo_divergente"
        elif is_controlled_vehicle:
            connection = "veiculo_relatorio"
        else:
            connection = "veiculo_nao_controlado"
        connection_counter[connection] += 1

        if matched_lastro_titles and not force_65_200 and (operation_id != reported_operation_id or operation_id not in matched_ops or len(matched_ops) > 1):
            key = (lastro_key, vehicle, reported_operation_id, operation_id)
            candidate = transfer_candidates.setdefault(
                key,
                {
                    "lastro": lastro_key,
                    "numeroTituloAnimal": title_num,
                    "veiculoAnimal": vehicle,
                    "operationIdRelatorio": reported_operation_id,
                    "operationIdAlocado": operation_id,
                    "operationIdsCarteira": sorted(value for value in matched_ops if value),
                    "operationIdsCarteiraAtivos": sorted(value for value in active_matched_ops if value),
                    "linhasAnimais": 0,
                    "cabecas": 0,
                    "fazendas": set(),
                    "cedentesAnimal": set(),
                    "titulosCarteira": set(),
                    "statusCarteira": set(),
                    "metodo": connection,
                    "criterioAlocacao": allocation_method,
                },
            )
            candidate["linhasAnimais"] += 1
            candidate["fazendas"].add(str(row.get(farm_col) or ""))
            candidate["cedentesAnimal"].add(str(row.get(cedente_col) or ""))
            for title in matched_lastro_titles:
                candidate["titulosCarteira"].add(str(title.get("invoice") or title.get("id") or ""))
                candidate["statusCarteira"].add(str(title.get("paymentStatus") or ""))

        animal_key = str(row.get(tag_col) or row.get(sisbov_col) or f"linha-{row_index}")
        if animal_key:
            duplicate_animals[animal_key].add(operation_id)

        ref_date = reference_date_override or parse_date(row.get(ref_col))
        weight, weight_source = selected_live_weight(
            row,
            proj_col,
            entrada_peso_col,
            alvo_col,
            dias_confinado_col,
            entrada_col,
            ref_date,
        )
        weight_source_counter[weight_source] += 1
        category_key, category_label, quote = quote_for_row(row, quote_map, uf_col, type_col, sex_col, arroba_col)
        uf = str(row.get(uf_col) or "").strip().upper()
        farm = str(row.get(farm_col) or "Sem fazenda").strip()
        lote = str(row.get(lot_col) or "Sem lote").strip()
        curral = str(row.get(curral_col) or "").strip()
        location_parts = [farm, f"Lote {lote}"]
        if curral:
            location_parts.append(f"Curral {curral}")
        location = " / ".join(location_parts)
        group_key = (
            operation_id,
            bucket,
            vehicle,
            farm,
            lote,
            curral,
            uf,
            category_key,
            category_label,
            round(quote, 4),
        )
        if animal_key in seen_animals_by_group[group_key]:
            continue
        seen_animals_by_group[group_key].add(animal_key)

        group = grouped.setdefault(
            group_key,
            {
                "operationId": operation_id,
                "reportedOperationId": reported_operation_id,
                "bucket": bucket,
                "sourceVehicleName": vehicle,
                "location": location,
                "farm": farm,
                "uf": uf,
                "categoryKey": category_key,
                "category": category_label,
                "quotePerArroba": quote,
                "heads": 0,
                "totalWeightKg": 0.0,
                "lastros": set(),
                "numeroTitulos": set(),
                "cedentes": set(),
                "status": Counter(),
                "connectionMethods": Counter(),
                "referenceDates": Counter(),
                "entryDates": Counter(),
                "weightSources": Counter(),
            },
        )
        group["heads"] += 1
        group["totalWeightKg"] += weight
        if lastro_key:
            group["lastros"].add(lastro_key)
        if title_num:
            group["numeroTitulos"].add(title_num)
        if row.get(cedente_col):
            group["cedentes"].add(str(row.get(cedente_col)))
        group["status"][str(row.get(status_col) or "")] += 1
        group["connectionMethods"][connection] += 1
        group["weightSources"][weight_source] += 1
        entry_date = parse_date(row.get(entrada_col))
        if ref_date:
            group["referenceDates"][ref_date] += 1
        if entry_date:
            group["entryDates"][entry_date] += 1

    purchased_heads_by_lastro = Counter()
    for row in purchased_title_rows:
        purchased_heads_by_lastro[row["lastro"]] += row["heads"]

    purchased_title_info = {}
    for lastro_key, heads_total in purchased_heads_by_lastro.items():
        active_titles = unique_titles([title for title in by_lastro.get(lastro_key, []) if active_title(title)])
        if active_titles:
            operation_id = active_titles[0].get("operationId") or PURCHASED_TRANSIT_UNMATCHED_OPERATION
            selected_titles = [title for title in active_titles if title.get("operationId") == operation_id]
            connection = "comprado_transito_titulo_ativo"
        else:
            operation_id = PURCHASED_TRANSIT_UNMATCHED_OPERATION
            selected_titles = []
            connection = "comprado_transito_sem_titulo_ativo"
        purchased_title_info[lastro_key] = {
            "operationId": operation_id,
            "titles": selected_titles,
            "connection": connection,
            "value": sum(purchased_title_value(title) for title in selected_titles),
            "heads": heads_total,
        }

    for row in purchased_title_rows:
        info = purchased_title_info[row["lastro"]]
        operation_id = info["operationId"]
        funding = fundings_by_id.get(operation_id, {})
        vehicle = funding.get("shortName") or funding.get("name") or EXTERNAL_ASSET_NAMES.get(operation_id) or "Comprado em transito"
        farm = row["farm"]
        gta = row["gta"] or "Sem GTA"
        note = row["note"] or "Sem NF"
        title_ids = {compact_number_id(title.get("id") or title.get("lastro")) for title in info["titles"] if title.get("id") or title.get("lastro")}
        value_override = info["value"] * row["heads"] / info["heads"] if info["heads"] and info["value"] else 0.0
        location = f"{farm} / GTA {gta} / NF {note}"
        group_key = (
            operation_id,
            "purchasedTransit",
            vehicle,
            farm,
            gta,
            note,
            "",
            "comprado-transito",
            "Comprado em transito",
            0.0,
        )
        group = grouped.setdefault(
            group_key,
            {
                "operationId": operation_id,
                "reportedOperationId": "relatorio-compras-em-transito",
                "bucket": "purchasedTransit",
                "sourceVehicleName": vehicle,
                "location": location,
                "farm": farm,
                "uf": "",
                "categoryKey": "comprado-transito",
                "category": "Comprado em transito",
                "quotePerArroba": 0.0,
                "heads": 0,
                "totalWeightKg": 0.0,
                "valueOverride": 0.0,
                "lastros": set(),
                "numeroTitulos": set(),
                "cedentes": set(),
                "status": Counter(),
                "connectionMethods": Counter(),
                "referenceDates": Counter(),
                "entryDates": Counter(),
                "weightSources": Counter(),
                "gtas": set(),
                "notas": set(),
            },
        )
        group["heads"] += row["heads"]
        group["valueOverride"] += value_override
        group["lastros"].add(row["lastro"])
        group["numeroTitulos"].update(value for value in title_ids if value)
        group["status"][row["status"]] += int(row["heads"])
        group["connectionMethods"][info["connection"]] += int(row["heads"])
        connection_counter[info["connection"]] += int(row["heads"])
        group["weightSources"]["valor_aquisicao_titulo"] += int(row["heads"]) if value_override else 0
        group["gtas"].add(gta)
        group["notas"].add(note)
        if row["emissionDate"]:
            group["entryDates"][row["emissionDate"]] += int(row["heads"])

    assets: dict[str, dict] = {}
    lot_rows = []
    for group in grouped.values():
        operation_id = group["operationId"]
        asset_name, asset_short_name, asset_investor = operation_label(operation_id, group["sourceVehicleName"], fundings_by_id)
        asset = assets.setdefault(
            operation_id,
            {
                "operationId": operation_id,
                "name": asset_name,
                "shortName": asset_short_name,
                "investor": asset_investor,
                "sourceVehicleName": group["sourceVehicleName"],
                "controlledOperation": operation_id in controlled_ids,
                "quoteSource": f"DATAGRO Indicador do Boi {quote_date}" if quote_date else "Cotacao nao informada",
                "quoteDate": quote_date,
                "quotePerArroba": 0.0,
                "lots": [],
                "transitLots": [],
                "purchasedTransitLots": [],
                "connectionSummary": Counter(),
                "_liveValue": 0.0,
                "_liveArrobas": 0.0,
                "_transitValue": 0.0,
                "_transitArrobas": 0.0,
                "_purchasedTransitValue": 0.0,
                "_purchasedTransitArrobas": 0.0,
                "_sourceVehicles": set(),
                "_reportedOperationIds": set(),
                "_referenceDates": Counter(),
                "_entryDates": Counter(),
            },
        )
        heads = group["heads"]
        avg_weight = group["totalWeightKg"] / heads if heads else 0.0
        arrobas = group["totalWeightKg"] / ARROBA_KG
        value_override = group.get("valueOverride", 0.0)
        value = value_override if value_override else arrobas * group["quotePerArroba"]
        if group["bucket"] == "transit":
            asset["_transitValue"] += value
            asset["_transitArrobas"] += arrobas
            lot_target = "transitLots"
        elif group["bucket"] == "purchasedTransit":
            asset["_purchasedTransitValue"] += value
            asset["_purchasedTransitArrobas"] += arrobas
            lot_target = "purchasedTransitLots"
        else:
            asset["_liveValue"] += value
            asset["_liveArrobas"] += arrobas
            lot_target = "lots"
        asset["_sourceVehicles"].add(group["sourceVehicleName"])
        asset["_reportedOperationIds"].add(group["reportedOperationId"])
        asset["connectionSummary"].update(group["connectionMethods"])
        asset["_referenceDates"].update(group["referenceDates"])
        asset["_entryDates"].update(group["entryDates"])
        lot_meta = {
            "farm": group["farm"],
            "uf": group["uf"],
            "sourceVehicleName": group["sourceVehicleName"],
            "reportedOperationId": group["reportedOperationId"],
            "bucket": group["bucket"],
            "lastros": sorted(group["lastros"])[:20],
            "lastrosCount": len(group["lastros"]),
            "numeroTitulos": sorted(group["numeroTitulos"])[:20],
            "numeroTitulosCount": len(group["numeroTitulos"]),
            "cedentes": sorted(group["cedentes"])[:10],
            "status": dict(group["status"]),
            "connections": dict(group["connectionMethods"]),
            "weightSources": dict(group["weightSources"]),
            "gtas": sorted(group.get("gtas", set()))[:20],
            "notas": sorted(group.get("notas", set()))[:20],
            "valueOverride": round(value_override, 2) if value_override else 0.0,
            "referenceDate": group["referenceDates"].most_common(1)[0][0] if group["referenceDates"] else "",
            "entryDate": group["entryDates"].most_common(1)[0][0] if group["entryDates"] else "",
        }
        lot = [
            group["location"],
            group["category"],
            heads,
            round(avg_weight, 4),
            group["uf"],
            round(group["quotePerArroba"], 4),
            lot_meta,
        ]
        asset[lot_target].append(lot)
        lot_rows.append(
            {
                "operationId": operation_id,
                "operationIdRelatorio": group["reportedOperationId"],
                "tipoGarantia": group["bucket"],
                "veiculo": group["sourceVehicleName"],
                "fazenda": group["farm"],
                "uf": group["uf"],
                "categoria": group["category"],
                "cabecas": heads,
                "pesoTotalKg": round(group["totalWeightKg"], 4),
                "pesoMedioKg": round(avg_weight, 4),
                "arrobas": round(arrobas, 4),
                "cotacao": round(group["quotePerArroba"], 4),
                "valorGarantia": round(value, 2),
                "lastros": ", ".join(sorted(group["lastros"])[:30]),
                "numeroTitulos": ", ".join(sorted(group["numeroTitulos"])[:30]),
                "metodosLigacao": json.dumps(dict(group["connectionMethods"]), ensure_ascii=False),
            }
        )

    vehicle_assets = []
    for asset in assets.values():
        for lot_key in ("lots", "transitLots", "purchasedTransitLots"):
            asset[lot_key].sort(key=lambda row: (row[0], row[1]))
        total_value_for_quote = asset["_liveValue"] + asset["_transitValue"] + asset["_purchasedTransitValue"]
        total_arrobas_for_quote = asset["_liveArrobas"] + asset["_transitArrobas"] + asset["_purchasedTransitArrobas"]
        asset["quotePerArroba"] = round(total_value_for_quote / total_arrobas_for_quote, 4) if total_arrobas_for_quote else 0.0
        asset["totalHeads"] = sum(Number_row[2] for Number_row in asset["lots"])
        asset["totalWeightKg"] = round(sum(Number_row[2] * Number_row[3] for Number_row in asset["lots"]), 4)
        asset["totalArrobas"] = round(asset["totalWeightKg"] / ARROBA_KG, 4)
        asset["totalValue"] = round(asset["_liveValue"], 2)
        asset["transitHeads"] = sum(Number_row[2] for Number_row in asset["transitLots"])
        asset["transitWeightKg"] = round(sum(Number_row[2] * Number_row[3] for Number_row in asset["transitLots"]), 4)
        asset["transitValue"] = round(asset["_transitValue"], 2)
        asset["purchasedTransitHeads"] = sum(Number_row[2] for Number_row in asset["purchasedTransitLots"])
        asset["purchasedTransitWeightKg"] = round(sum(Number_row[2] * Number_row[3] for Number_row in asset["purchasedTransitLots"]), 4)
        asset["purchasedTransitValue"] = round(asset["_purchasedTransitValue"], 2)
        asset["coverageValue"] = round(asset["_liveValue"] + asset["_transitValue"] + asset["_purchasedTransitValue"], 2)
        asset["sourceVehicleNames"] = sorted(asset["_sourceVehicles"])
        asset["reportedOperationIds"] = sorted(asset["_reportedOperationIds"])
        asset["connectionSummary"] = dict(asset["connectionSummary"])
        asset["referenceDate"] = asset["_referenceDates"].most_common(1)[0][0] if asset["_referenceDates"] else ""
        asset["entryDate"] = asset["_entryDates"].most_common(1)[0][0] if asset["_entryDates"] else ""
        for key in (
            "_liveValue",
            "_liveArrobas",
            "_transitValue",
            "_transitArrobas",
            "_purchasedTransitValue",
            "_purchasedTransitArrobas",
            "_sourceVehicles",
            "_reportedOperationIds",
            "_referenceDates",
            "_entryDates",
        ):
            asset.pop(key, None)
        vehicle_assets.append(asset)

    vehicle_assets.sort(key=lambda item: (not item["controlledOperation"], item["shortName"]))
    assets_by_operation_id = {asset["operationId"]: asset for asset in vehicle_assets}

    transfer_rows = []
    for candidate in transfer_candidates.values():
        row = dict(candidate)
        row["fazendas"] = sorted(row["fazendas"])
        row["cedentesAnimal"] = sorted(row["cedentesAnimal"])
        row["titulosCarteira"] = sorted(row["titulosCarteira"])
        row["statusCarteira"] = sorted(row["statusCarteira"])
        row["cabecas"] = row["linhasAnimais"]
        transfer_rows.append(row)
    transfer_rows.sort(key=lambda row: (row["operationIdAlocado"], row["lastro"]))

    repeated_animals = {
        animal: sorted(ops)
        for animal, ops in duplicate_animals.items()
        if animal and not animal.startswith("linha-") and len(ops) > 1
    }

    data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sourceFile": str(ANIMAL_CSV),
        "sourceEncoding": animal_encoding,
        "referenceDate": reference_dates.most_common(1)[0][0] if reference_dates else "",
        "liveStatusFilter": ["PROCESSADO", "EM PROCESSAMENTO"],
            "quoteDate": quote_date,
            "purchasedTransitSourceFile": str(PURCHASED_TRANSIT_CSV) if PURCHASED_TRANSIT_CSV.exists() else "",
            "purchasedTransitSourceEncoding": purchased_title_encoding,
            "summary": {
                "totalAnimalRows": len(animal_rows),
                "liveRows": len(live_rows),
                "transitRows": len(transit_rows),
                "purchasedTransitRows": len(purchased_transit_rows),
                "purchasedTransitTitleRows": len(purchased_title_rows),
                "purchasedTransitTitleHeads": sum(row["heads"] for row in purchased_title_rows),
                "coverageRows": len(guarantee_rows),
            "vehicles": len(vehicle_assets),
            "controlledVehicles": sum(1 for asset in vehicle_assets if asset["controlledOperation"]),
            "biologicalOnlyVehicles": sum(1 for asset in vehicle_assets if not asset["controlledOperation"]),
            "connectionMethods": dict(connection_counter),
            "weightSources": dict(weight_source_counter),
            "transferCandidates": len(transfer_rows),
            "animalsInMultipleVehicles": len(repeated_animals),
            "statusByVehicle": {
                f"{vehicle} | {status}": count
                for (vehicle, status), count in vehicle_status_counter.items()
            },
        },
        "vehicles": vehicle_assets,
        "assetsByOperationId": assets_by_operation_id,
        "transferCandidates": transfer_rows[:500],
        "duplicateAnimalsAcrossVehicles": dict(list(repeated_animals.items())[:500]),
    }

    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    if not args.skip_history:
        write_biological_history(data)
    OUT_JS.write_text(
        "window.ceresBiologicalAssets = "
        + json.dumps(data, ensure_ascii=False, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    OUT_SUMMARY.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    with OUT_LOTS.open("w", encoding="utf-8-sig", newline="") as handle:
        fields = [
            "operationId",
            "operationIdRelatorio",
            "tipoGarantia",
            "veiculo",
            "fazenda",
            "uf",
            "categoria",
            "cabecas",
            "pesoTotalKg",
            "pesoMedioKg",
            "arrobas",
            "cotacao",
            "valorGarantia",
            "lastros",
            "numeroTitulos",
            "metodosLigacao",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter=";")
        writer.writeheader()
        writer.writerows(lot_rows)

    with OUT_TRANSFERS.open("w", encoding="utf-8-sig", newline="") as handle:
        fields = [
            "lastro",
            "numeroTituloAnimal",
            "veiculoAnimal",
            "operationIdRelatorio",
            "operationIdAlocado",
            "operationIdsCarteira",
            "operationIdsCarteiraAtivos",
            "linhasAnimais",
            "cabecas",
            "fazendas",
            "cedentesAnimal",
            "titulosCarteira",
            "statusCarteira",
            "metodo",
            "criterioAlocacao",
        ]
        writer = csv.DictWriter(handle, fieldnames=fields, delimiter=";")
        writer.writeheader()
        for row in transfer_rows:
            writer.writerow({
                key: json.dumps(value, ensure_ascii=False) if isinstance(value, list) else value
                for key, value in row.items()
                if key in fields
            })

    compact = {
        "arquivo": str(OUT_JS),
        "linhasAnimais": len(animal_rows),
        "linhasVivas": len(live_rows),
        "veiculos": [
            {
                "operationId": asset["operationId"],
                "nome": asset["shortName"],
                "controlado": asset["controlledOperation"],
                "cabecas": asset["totalHeads"],
                "pesoTon": round(asset["totalWeightKg"] / 1000, 2),
                "valorGarantia": asset["totalValue"],
                "cabecasTransito": asset["transitHeads"],
                "valorTransito": asset["transitValue"],
                "cabecasCompradoTransito": asset["purchasedTransitHeads"],
                "valorCompradoTransito": asset["purchasedTransitValue"],
                "valorCoberturaGado": asset["coverageValue"],
                "metodos": asset["connectionSummary"],
            }
            for asset in vehicle_assets
        ],
        "metodosLigacao": dict(connection_counter),
        "candidatosTransferencia": len(transfer_rows),
        "arquivosAuditoria": [str(OUT_SUMMARY), str(OUT_LOTS), str(OUT_TRANSFERS)],
    }
    print(json.dumps(compact, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
