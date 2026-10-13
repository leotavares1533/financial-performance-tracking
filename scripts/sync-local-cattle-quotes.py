"""Publish local DATAGRO observations without repricing closed guarantee dates."""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT.parent / "landing-page-responsiva/financial-performance-tracking/data/pecuaria/cotacoes-pecuaria.sqlite"
OUTPUT = ROOT / "data/pecuaria/cotacoes-pecuaria-latest.js"
CLOSED_THROUGH = "2026-10-06"
# These bulletin dates were recorded in the collection log before the date rule was corrected.
LEGACY_RUN_REFERENCE_DATES = {47: ("2026-10-06", "2026-10-05"), 48: ("2026-10-07", "2026-10-06"), 49: ("2026-10-08", "2026-10-07"), 50: ("2026-10-09", "2026-10-08"), 51: ("2026-10-13", "2026-10-09"), 54: ("2026-10-13", "2026-10-09")}
STATES = {"bahia": "BA", "goias": "GO", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", "para": "PA", "rondonia": "RO", "sao paulo": "SP", "tocantins": "TO", "parana": "PR", "rio grande do sul": "RS"}
REPLACEMENT_REGIONS = {"nelore": ["SP", "MG", "MS", "MT", "GO", "TO", "PA", "PR", "RS", "RO"], "anelorado": ["SP", "MG", "MS", "MT", "GO", "PR", "RS"], "cruzamento_industrial": ["SP", "MG", "MS", "MT", "GO", "PR", "RS"]}
REPLACEMENT_TYPES = ["macho_desmama", "macho_bezerro", "macho_garrote", "macho_boi_magro", "femea_desmama", "femea_bezerra", "femea_novilha", "femea_vaca_magra"]
FIELDS = ["quote_date", "collected_at", "source_name", "source_url", "source_file", "product", "category", "map_type", "region", "subregion", "row_index", "column_index", "x", "y", "price", "variation_percent", "reference_value", "unit", "raw_price", "raw_variation", "raw_reference"]


def norm(value):
    return " ".join(re.sub(r"[^a-z0-9]+", " ", "".join(c for c in unicodedata.normalize("NFKD", str(value or "").lower()) if not unicodedata.combining(c))).split())


def read_snapshot(path):
    source = path.read_text(encoding="utf-8-sig")
    return json.loads(source[source.index("=") + 1:].strip().rstrip(";"))


def row_key(row):
    base = (row["quote_date"], row["product"], row["category"], row["map_type"], row.get("region") or "")
    if row["map_type"] in {"regional_map", "historical_series"}:
        return base
    if row["map_type"] == "mt_bulletin":
        return (*base, row.get("subregion") or "")
    return (*base, row.get("row_index", -1), row.get("column_index", -1))


def normalize_row(raw):
    row = {key: raw[key] for key in FIELDS}
    original_date = row["quote_date"]
    legacy = LEGACY_RUN_REFERENCE_DATES.get(raw["run_id"])
    legacy_collection = bool(legacy and original_date == legacy[0] and row["collected_at"][:10] == legacy[0])
    if row["map_type"] != "historical_series" or int(row["row_index"]) < 0:
        row["quote_date"] = legacy[1] if legacy_collection else original_date
    row["reference_date"] = row["quote_date"]
    row["collection_date"] = row["collected_at"][:10]
    row["recorded_quote_date"] = original_date
    row["source_run_id"] = raw["run_id"]
    row["region"] = STATES.get(norm(row["region"]), str(row["region"] or "").upper())
    if row["map_type"] == "replacement_grid":
        # The collection log used zero-based columns; the screen uses one-based columns.
        if legacy_collection:
            row["column_index"] = int(row["column_index"]) + 1
        regions = REPLACEMENT_REGIONS.get(row["category"], [])
        if row["region"] not in regions or not 1 <= row["column_index"] <= 8:
            raise ValueError(f"Grade de reposicao sem rotulo conhecido: {row}")
        row["row_index"] = regions.index(row["region"]) + 1
        row["subregion"] = REPLACEMENT_TYPES[row["column_index"] - 1]
    elif row["map_type"] == "mt_bulletin":
        row["region"] = "MT"
        row["column_index"] = -1
    elif row["map_type"] == "historical_series":
        row["row_index"] = -1
        row["column_index"] = -1
    return row


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    published = read_snapshot(OUTPUT)
    frozen = published.get("frozenGuaranteeQuotes")
    if not frozen:
        keys = ["quote_date", "product", "category", "map_type", "region", "price"]
        frozen = {
            "throughDate": CLOSED_THROUGH,
            "rows": [{k: row.get(k) for k in keys} for row in published["rows"]],
            "historyRows": [{k: row.get(k) for k in keys} for row in published["historyRows"]],
        }
    connection = sqlite3.connect(args.source_db.resolve().as_uri() + "?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    raw_rows = connection.execute("SELECT q.* FROM datagro_cattle_quotes q JOIN datagro_collection_runs r ON r.id=q.run_id WHERE r.status='SUCCESS' ORDER BY q.collected_at, q.id").fetchall()
    incoming = {}
    for raw in raw_rows:
        if raw["quote_date"] <= CLOSED_THROUGH:
            continue
        row = normalize_row(raw)
        if row["quote_date"] > CLOSED_THROUGH and row["price"] is not None:
            incoming[row_key(row)] = row
    connection.close()

    previous_new = {row_key(row): row for row in published["historyRows"] if row["quote_date"] > CLOSED_THROUGH}
    for key, row in incoming.items():
        old = previous_new.get(key)
        if old and float(old.get("price") or 0) != float(row["price"]):
            raise ValueError(f"Cotacao publicada mudou. Revisar antes de substituir {key}: {old['price']} -> {row['price']}")
    previous_new.update(incoming)
    closed_rows = [row for row in published["historyRows"] if row["quote_date"] <= CLOSED_THROUGH]
    history = closed_rows + sorted(previous_new.values(), key=lambda row: row_key(row))
    current_date = max(row["quote_date"] for row in history if row["map_type"] == "regional_map")
    rows = [row for row in history if row["map_type"] != "historical_series" and row["quote_date"] == current_date]
    counts = defaultdict(Counter)
    for row in previous_new.values():
        counts[row["quote_date"]][row["map_type"]] += 1
    for date, day in counts.items():
        if day["regional_map"] not in {0, 27}:
            raise ValueError(f"Boletim regional incompleto em {date}: {day['regional_map']}")
    # A downloaded SP series corroborates the bulletin date instead of the collection date.
    for date in counts:
        sp = [row for row in previous_new.values() if row["quote_date"] == date and row["category"] == "boi" and row["region"] == "SP"]
        bulletin = next((row for row in sp if row["map_type"] == "regional_map"), None)
        series = next((row for row in sp if row["map_type"] == "historical_series"), None)
        if bulletin and series and abs(bulletin["price"] - series["price"]) > 0.005:
            raise ValueError(f"Data do boletim SP nao confere com a serie em {date}.")
    payload = {
        "sourceName": published["sourceName"],
        "sourcePageUrl": published["sourcePageUrl"],
        "exportedAt": max(row["collected_at"] for row in incoming.values()),
        "syncedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sourceDatabase": str(args.source_db.resolve()),
        "dateRule": "source_reference_date",
        "frozenGuaranteeQuotes": frozen,
        "rows": rows,
        "historyRows": history,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("window.ceresCattleQuotes = " + json.dumps(payload, ensure_ascii=True, indent=2) + ";\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "marketReferenceDate": current_date, "collectedAt": payload["exportedAt"], "preservedThrough": CLOSED_THROUGH, "dates": counts}, indent=2))


if __name__ == "__main__":
    main()
