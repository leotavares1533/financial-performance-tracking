#!/usr/bin/env python
"""Import DATAGRO cattle quotes collected from the rendered public website."""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
COLLECTOR_PATH = SCRIPT_DIR / "collect-datagro-cattle.py"


def load_collector_module():
    spec = importlib.util.spec_from_file_location("collect_datagro_cattle", COLLECTOR_PATH)
    if spec is None or spec.loader is None:
      raise RuntimeError(f"Nao foi possivel carregar {COLLECTOR_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


collector = load_collector_module()


DEFAULT_SOURCE_FILE_BY_MAP_TYPE = {
    "regional_map": "screen_bulletin_regional",
    "mt_bulletin": "screen_bulletin_mt",
    "replacement_grid": "screen_bulletin_reposicao",
    "historical_series": "screen_serie_historica",
}

DEFAULT_UNIT_BY_MAP_TYPE = {
    "regional_map": "R$/@",
    "mt_bulletin": "R$/@",
    "replacement_grid": "R$/kg",
    "historical_series": "R$/@",
}

DEFAULT_PRODUCT_BY_CATEGORY = {
    "boi": "boi_gordo",
    "vaca": "boi_gordo",
    "novilha": "boi_gordo",
    "boi_mt": "boi_gordo",
    "vaca_mt": "boi_gordo",
    "novilha_mt": "boi_gordo",
    "nelore": "reposicao",
    "anelorado": "reposicao",
    "cruzamento_industrial": "reposicao",
}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_json", help="Arquivo JSON montado pelo agente a partir da tela renderizada")
    parser.add_argument("--db", default=str(collector.default_db_path()))
    parser.add_argument("--export-js", default=str(collector.default_export_path()))
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args(argv)


def as_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return collector.parse_number(str(value))


def now_utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def normalize_input(payload: Any) -> tuple[str, list[dict[str, Any]]]:
    if isinstance(payload, list):
        quote_date = ""
        raw_rows = payload
    elif isinstance(payload, dict):
        quote_date = str(payload.get("quote_date") or payload.get("date") or "")
        raw_rows = []
        for key in ("rows", "historyRows", "history_rows"):
            rows = payload.get(key)
            if isinstance(rows, list):
                raw_rows.extend(rows)
    else:
        raise ValueError("JSON precisa ser uma lista de linhas ou um objeto com rows")

    if not raw_rows:
        raise ValueError("Nenhuma linha de cotacao informada")

    return quote_date, raw_rows


def build_quote(row: dict[str, Any], default_quote_date: str, collected_at: str) -> dict[str, Any]:
    map_type = str(row.get("map_type") or row.get("type") or "regional_map")
    category = str(row.get("category") or "").strip()
    if not category:
        raise ValueError(f"Linha sem category: {row}")

    quote_date = str(row.get("quote_date") or row.get("date") or default_quote_date)
    if not quote_date:
        raise ValueError(f"Linha sem quote_date: {row}")

    source_file = str(row.get("source_file") or DEFAULT_SOURCE_FILE_BY_MAP_TYPE.get(map_type, "screen_bulletin"))
    if map_type == "historical_series" and row.get("code"):
        source_file = f"serie_historica_{row['code']}"

    product = str(row.get("product") or DEFAULT_PRODUCT_BY_CATEGORY.get(category) or "boi_gordo")
    unit = str(row.get("unit") or DEFAULT_UNIT_BY_MAP_TYPE.get(map_type) or "R$/@")

    return {
        "quote_date": quote_date,
        "collected_at": str(row.get("collected_at") or collected_at),
        "source_name": str(row.get("source_name") or collector.SOURCE_NAME),
        "source_url": str(row.get("source_url") or collector.SOURCE_PAGE_URL),
        "source_file": source_file,
        "product": product,
        "category": category,
        "map_type": map_type,
        "region": row.get("region"),
        "subregion": row.get("subregion"),
        "row_index": row.get("row_index"),
        "column_index": row.get("column_index"),
        "x": as_number(row.get("x")),
        "y": as_number(row.get("y")),
        "price": as_number(row.get("price") if "price" in row else row.get("raw_price")),
        "variation_percent": as_number(row.get("variation_percent") if "variation_percent" in row else row.get("raw_variation")),
        "reference_value": as_number(row.get("reference_value") if "reference_value" in row else row.get("raw_reference")),
        "unit": unit,
        "raw_price": None if row.get("raw_price") is None else str(row.get("raw_price")),
        "raw_variation": None if row.get("raw_variation") is None else str(row.get("raw_variation")),
        "raw_reference": None if row.get("raw_reference") is None else str(row.get("raw_reference")),
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    input_path = Path(args.input_json)
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    default_quote_date, raw_rows = normalize_input(payload)
    collected_at = now_utc()
    quotes = [build_quote(row, default_quote_date, collected_at) for row in raw_rows]

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    collector.init_db(connection)
    run_id = collector.create_run(connection, collected_at)
    try:
        if args.summary:
            collector.print_summary(quotes)

        if args.dry_run:
            collector.finish_run(connection, run_id, "DRY_RUN", f"{len(quotes)} registros lidos da tela")
            connection.rollback()
            print(f"Dry run DATAGRO tela concluido: {len(quotes)} registros lidos")
            return 0

        saved = collector.upsert_quotes(connection, run_id, quotes)
        exported = collector.export_latest_snapshot(connection, Path(args.export_js))
        collector.finish_run(
            connection,
            run_id,
            "SUCCESS",
            f"{saved} registros de tela gravados; {exported} registros exportados",
        )
        connection.commit()
        print(f"Importacao visual DATAGRO concluida: {saved} registros em {db_path}")
        print(f"Snapshot visual atualizado: {args.export_js}")
        return 0
    except Exception as exc:
        collector.finish_run(connection, run_id, "FAILED", str(exc))
        connection.commit()
        print(f"Falha na importacao visual DATAGRO: {exc}", file=sys.stderr)
        return 1
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
