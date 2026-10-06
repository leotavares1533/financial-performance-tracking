#!/usr/bin/env python
"""Collect public DATAGRO cattle indicator SVG values into a local SQLite DB."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sqlite3
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


BASE_URL = "https://pec.datagro.com/pec/mapas"
PRICE_API_BASE_URL = "https://precos.api.datagro.com"
SOURCE_PAGE_URL = "https://www.indicadordoboi.com.br/pt-br#bulletin"
SOURCE_NAME = "DATAGRO Indicador do Boi"
USER_AGENT = "CeresConfinaFundingControl/1.0"
EXPORT_VARIABLE = "ceresCattleQuotes"
SAO_PAULO_TIMEZONE = dt.timezone(dt.timedelta(hours=-3), "America/Sao_Paulo")
KEY_DEFAULTS = {
    "region": "",
    "subregion": "",
    "row_index": -1,
    "column_index": -1,
}

MAIN_MAPS = [
    ("boi.svg", "boi_gordo", "boi", "R$/@"),
    ("vaca.svg", "boi_gordo", "vaca", "R$/@"),
    ("novilha.svg", "boi_gordo", "novilha", "R$/@"),
]

MT_MAPS = [
    ("boletim_mt.svg", "boi_gordo", "boi_mt", "R$/@"),
    ("boletim_mt_vaca.svg", "boi_gordo", "vaca_mt", "R$/@"),
    ("boletim_mt_novilha.svg", "boi_gordo", "novilha_mt", "R$/@"),
]

REPLACEMENT_MAPS = [
    ("nelore.svg", "reposicao", "nelore", "R$/kg"),
    ("anelorado.svg", "reposicao", "anelorado", "R$/kg"),
    ("cruzamento_industrial.svg", "reposicao", "cruzamento_industrial", "R$/kg"),
]

HISTORICAL_SERIES = [
    {
        "code": "D_PEPR_SP_BR",
        "product": "boi_gordo",
        "category": "boi",
        "region": "SP",
        "unit": "R$/@",
        "label": "Boi Sao Paulo R$/@",
    }
]

REGION_BY_Y = {
    374: "BA",
    422: "GO",
    470: "MT",
    518: "MS",
    566: "MG",
    614: "PA",
    664: "RO",
    712: "SP",
    758: "TO",
}

MT_SUBREGION_BY_POSITION = [
    {"x": 430, "y": 430, "code": "N", "label": "Norte", "order": 1},
    {"x": 660, "y": 500, "code": "NE", "label": "Nordeste", "order": 2},
    {"x": 450, "y": 570, "code": "S", "label": "Sul", "order": 3},
    {"x": 590, "y": 630, "code": "SE", "label": "Sudeste", "order": 4},
]

MONTHS_PT = {
    "jan": 1,
    "fev": 2,
    "mar": 3,
    "abr": 4,
    "mai": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "set": 9,
    "out": 10,
    "nov": 11,
    "dez": 12,
}

CREATE_SQL = """
CREATE TABLE IF NOT EXISTS datagro_collection_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collected_at TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  source_page_url TEXT NOT NULL,
  source_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datagro_cattle_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES datagro_collection_runs(id),
  quote_date TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_file TEXT NOT NULL,
  product TEXT NOT NULL,
  category TEXT NOT NULL,
  map_type TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  subregion TEXT NOT NULL DEFAULT '',
  row_index INTEGER NOT NULL DEFAULT -1,
  column_index INTEGER NOT NULL DEFAULT -1,
  x REAL,
  y REAL,
  price REAL,
  variation_percent REAL,
  reference_value REAL,
  unit TEXT NOT NULL,
  raw_price TEXT,
  raw_variation TEXT,
  raw_reference TEXT,
  inserted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (
    quote_date,
    source_file,
    product,
    category,
    map_type,
    region,
    subregion,
    row_index,
    column_index
  )
);

CREATE INDEX IF NOT EXISTS idx_datagro_quotes_date
  ON datagro_cattle_quotes (quote_date, product, category, region);

CREATE VIEW IF NOT EXISTS datagro_cattle_quotes_latest AS
SELECT q.*
FROM datagro_cattle_quotes q
JOIN (
  SELECT product, category, map_type, region, subregion, row_index, column_index,
         MAX(quote_date) AS quote_date
  FROM datagro_cattle_quotes
  GROUP BY product, category, map_type, region, subregion, row_index, column_index
) latest
ON latest.product = q.product
AND latest.category = q.category
AND latest.map_type = q.map_type
AND COALESCE(latest.region, '') = COALESCE(q.region, '')
AND COALESCE(latest.subregion, '') = COALESCE(q.subregion, '')
AND COALESCE(latest.row_index, -1) = COALESCE(q.row_index, -1)
AND COALESCE(latest.column_index, -1) = COALESCE(q.column_index, -1)
AND latest.quote_date = q.quote_date;
"""


def fetch_text(url: str, headers: dict[str, str] | None = None) -> str:
    request_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    request = urllib.request.Request(url, headers=request_headers)
    with urllib.request.urlopen(request, timeout=45) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def fetch_json(url: str) -> object:
    text = fetch_text(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
            ),
            "Referer": "https://www.indicadordoboi.com.br/pt-br",
            "Origin": "https://www.indicadordoboi.com.br",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    return json.loads(text)


def text_content(element: ET.Element) -> str:
    return " ".join("".join(element.itertext()).split())


def parse_svg_texts(svg: str) -> list[dict[str, object]]:
    root = ET.fromstring(svg)
    entries: list[dict[str, object]] = []
    for element in root.iter():
        if not str(element.tag).endswith("text"):
            continue
        text = text_content(element)
        if not text:
            continue
        x, y = parse_position(element)
        entries.append(
            {
                "text": text,
                "x": x,
                "y": y,
                "font_weight": element.attrib.get("font-weight", ""),
            }
        )
    return entries


def parse_position(element: ET.Element) -> tuple[float | None, float | None]:
    transform = element.attrib.get("transform", "")
    match = re.search(r"matrix\(1 0 0 1 ([\d.]+) ([\d.]+)\)", transform)
    if match:
        return float(match.group(1)), float(match.group(2))

    x = element.attrib.get("x")
    y = element.attrib.get("y")
    return maybe_float(x), maybe_float(y)


def maybe_float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_number(text: str) -> float | None:
    cleaned = (
        text.replace("R$", "")
        .replace("/ @", "")
        .replace("%", "")
        .replace("@", "")
        .replace(" ", "")
        .strip()
    )
    cleaned = cleaned.replace(".", "").replace(",", ".")
    if not cleaned or not re.search(r"\d", cleaned):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_quote_date(entries: list[dict[str, object]], today: dt.date) -> str:
    for entry in entries:
        text = str(entry["text"]).strip()
        numeric = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
        if numeric:
            day, month, year = map(int, numeric.groups())
            return dt.date(year, month, day).isoformat()

        named = re.fullmatch(r"(\d{1,2})/([A-Za-z]{3})/(\d{4})", text)
        if named:
            day = int(named.group(1))
            month = MONTHS_PT[named.group(2).lower()]
            year = int(named.group(3))
            return dt.date(year, month, day).isoformat()

        named_short = re.fullmatch(r"(\d{1,2})/([A-Za-z]{3})", text)
        if named_short:
            day = int(named_short.group(1))
            month = MONTHS_PT[named_short.group(2).lower()]
            year = today.year
            return dt.date(year, month, day).isoformat()

    return today.isoformat()


def daily_quote_date_override(now: dt.datetime) -> dt.date | None:
    local_now = now.astimezone(SAO_PAULO_TIMEZONE)
    if local_now.weekday() >= 5:
        return None
    return local_now.date()


def resolve_quote_date(
    entries: list[dict[str, object]],
    today: dt.date,
    quote_date_override: dt.date | None,
) -> str:
    if quote_date_override:
        return quote_date_override.isoformat()
    return parse_quote_date(entries, today)


def nearest_region(y: float | None) -> str | None:
    if y is None:
        return None
    closest_y = min(REGION_BY_Y, key=lambda expected: abs(expected - y))
    if abs(closest_y - y) <= 3:
        return REGION_BY_Y[closest_y]
    return None


def nearest_mt_subregion(x: float | None, y: float | None) -> dict[str, object] | None:
    if x is None or y is None:
        return None
    closest = min(
        MT_SUBREGION_BY_POSITION,
        key=lambda expected: (float(expected["x"]) - x) ** 2 + (float(expected["y"]) - y) ** 2,
    )
    distance = ((float(closest["x"]) - x) ** 2 + (float(closest["y"]) - y) ** 2) ** 0.5
    return closest if distance <= 40 else None


def parse_main_map(
    svg: str,
    source_file: str,
    product: str,
    category: str,
    unit: str,
    collected_at: str,
    today: dt.date,
    quote_date_override: dt.date | None,
) -> list[dict[str, object]]:
    entries = parse_svg_texts(svg)
    quote_date = resolve_quote_date(entries, today, quote_date_override)
    rows: dict[str, dict[str, object]] = {}

    for entry in entries:
        x = entry["x"]
        y = entry["y"]
        if not isinstance(x, float) or not isinstance(y, float):
            continue
        region = nearest_region(y)
        if not region:
            continue

        rows.setdefault(region, {"region": region, "x": x, "y": y})
        text = str(entry["text"])
        if abs(x - 460) <= 8:
            rows[region]["raw_price"] = text
            rows[region]["price"] = parse_number(text)
        elif abs(x - 640) <= 8:
            rows[region]["raw_variation"] = text
            rows[region]["variation_percent"] = parse_number(text)
        elif abs(x - 780) <= 8:
            rows[region]["raw_reference"] = text
            rows[region]["reference_value"] = parse_number(text)

    quotes = []
    for index, region in enumerate(sorted(rows), start=1):
        row = rows[region]
        if row.get("price") is None:
            continue
        quotes.append(
            {
                "quote_date": quote_date,
                "collected_at": collected_at,
                "source_name": SOURCE_NAME,
                "source_url": f"{BASE_URL}/{source_file}",
                "source_file": source_file,
                "product": product,
                "category": category,
                "map_type": "regional_map",
                "region": region,
                "subregion": None,
                "row_index": index,
                "column_index": None,
                "x": row.get("x"),
                "y": row.get("y"),
                "price": row.get("price"),
                "variation_percent": row.get("variation_percent"),
                "reference_value": row.get("reference_value"),
                "unit": unit,
                "raw_price": row.get("raw_price"),
                "raw_variation": row.get("raw_variation"),
                "raw_reference": row.get("raw_reference"),
            }
        )
    return quotes


def parse_mt_map(
    svg: str,
    source_file: str,
    product: str,
    category: str,
    unit: str,
    collected_at: str,
    today: dt.date,
    quote_date_override: dt.date | None,
) -> list[dict[str, object]]:
    entries = parse_svg_texts(svg)
    quote_date = resolve_quote_date(entries, today, quote_date_override)
    numeric_entries = [entry for entry in entries if parse_number(str(entry["text"])) is not None]
    quotes = []

    for row_index, entry in enumerate(numeric_entries, start=1):
        raw = str(entry["text"])
        subregion = nearest_mt_subregion(entry.get("x"), entry.get("y"))
        subregion_label = str(subregion["label"]) if subregion else f"MT-{row_index:02d}"
        subregion_code = str(subregion["code"]) if subregion else ""
        subregion_order = int(subregion["order"]) if subregion else row_index
        quotes.append(
            {
                "quote_date": quote_date,
                "collected_at": collected_at,
                "source_name": SOURCE_NAME,
                "source_url": f"{BASE_URL}/{source_file}",
                "source_file": source_file,
                "product": product,
                "category": category,
                "map_type": "mt_bulletin",
                "region": "MT",
                "subregion": subregion_label,
                "row_index": subregion_order,
                "column_index": None,
                "x": entry.get("x"),
                "y": entry.get("y"),
                "price": parse_number(raw),
                "variation_percent": None,
                "reference_value": None,
                "unit": unit,
                "raw_price": raw,
                "raw_variation": None,
                "raw_reference": f"macro_regiao={subregion_code}" if subregion_code else None,
            }
        )
    return quotes


def parse_replacement_map(
    svg: str,
    source_file: str,
    product: str,
    category: str,
    unit: str,
    collected_at: str,
    today: dt.date,
    quote_date_override: dt.date | None,
) -> list[dict[str, object]]:
    entries = parse_svg_texts(svg)
    quote_date = resolve_quote_date(entries, today, quote_date_override)
    numeric_entries = [
        entry
        for entry in entries
        if parse_number(str(entry["text"])) is not None
        and not re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", str(entry["text"]))
    ]

    xs = sorted({round(float(entry["x"])) for entry in numeric_entries if isinstance(entry["x"], float)})
    ys = sorted({round(float(entry["y"])) for entry in numeric_entries if isinstance(entry["y"], float)})
    col_by_x = {x: index + 1 for index, x in enumerate(xs)}
    row_by_y = {y: index + 1 for index, y in enumerate(ys)}

    quotes = []
    for entry in numeric_entries:
        x = round(float(entry["x"])) if isinstance(entry["x"], float) else None
        y = round(float(entry["y"])) if isinstance(entry["y"], float) else None
        raw = str(entry["text"])
        row_index = row_by_y.get(y)
        column_index = col_by_x.get(x)
        quotes.append(
            {
                "quote_date": quote_date,
                "collected_at": collected_at,
                "source_name": SOURCE_NAME,
                "source_url": f"{BASE_URL}/{source_file}",
                "source_file": source_file,
                "product": product,
                "category": category,
                "map_type": "replacement_grid",
                "region": None,
                "subregion": f"row-{row_index:02d}-col-{column_index:02d}",
                "row_index": row_index,
                "column_index": column_index,
                "x": entry.get("x"),
                "y": entry.get("y"),
                "price": parse_number(raw),
                "variation_percent": None,
                "reference_value": None,
                "unit": unit,
                "raw_price": raw,
                "raw_variation": None,
                "raw_reference": None,
            }
        )
    return quotes


def init_db(connection: sqlite3.Connection) -> None:
    connection.executescript(CREATE_SQL)
    connection.executescript(
        """
        DELETE FROM datagro_cattle_quotes
        WHERE id NOT IN (
          SELECT MAX(id)
          FROM datagro_cattle_quotes
          GROUP BY
            quote_date,
            source_file,
            product,
            category,
            map_type,
            COALESCE(region, ''),
            COALESCE(subregion, ''),
            COALESCE(row_index, -1),
            COALESCE(column_index, -1)
        );

        UPDATE datagro_cattle_quotes SET region = '' WHERE region IS NULL;
        UPDATE datagro_cattle_quotes SET subregion = '' WHERE subregion IS NULL;
        UPDATE datagro_cattle_quotes SET row_index = -1 WHERE row_index IS NULL;
        UPDATE datagro_cattle_quotes SET column_index = -1 WHERE column_index IS NULL;

        DELETE FROM datagro_cattle_quotes
        WHERE map_type = 'regional_map'
        AND row_index = -1;

        DELETE FROM datagro_cattle_quotes
        WHERE map_type = 'historical_series'
        AND row_index <> -1;

        DELETE FROM datagro_cattle_quotes
        WHERE map_type = 'mt_bulletin'
        AND subregion LIKE 'MT-%';
        """
    )


def create_run(connection: sqlite3.Connection, collected_at: str) -> int:
    cursor = connection.execute(
        """
        INSERT INTO datagro_collection_runs (
          collected_at, status, message, source_page_url, source_name
        ) VALUES (?, ?, ?, ?, ?)
        """,
        (collected_at, "RUNNING", None, SOURCE_PAGE_URL, SOURCE_NAME),
    )
    return int(cursor.lastrowid)


def finish_run(connection: sqlite3.Connection, run_id: int, status: str, message: str) -> None:
    connection.execute(
        "UPDATE datagro_collection_runs SET status = ?, message = ? WHERE id = ?",
        (status, message, run_id),
    )


def upsert_quotes(connection: sqlite3.Connection, run_id: int, quotes: list[dict[str, object]]) -> int:
    count = 0
    for quote in quotes:
        normalized_quote = normalize_quote_key(quote)
        connection.execute(
            """
            INSERT INTO datagro_cattle_quotes (
              run_id, quote_date, collected_at, source_name, source_url, source_file,
              product, category, map_type, region, subregion, row_index, column_index,
              x, y, price, variation_percent, reference_value, unit,
              raw_price, raw_variation, raw_reference
            ) VALUES (
              :run_id, :quote_date, :collected_at, :source_name, :source_url, :source_file,
              :product, :category, :map_type, :region, :subregion, :row_index, :column_index,
              :x, :y, :price, :variation_percent, :reference_value, :unit,
              :raw_price, :raw_variation, :raw_reference
            )
            ON CONFLICT (
              quote_date, source_file, product, category, map_type, region,
              subregion, row_index, column_index
            ) DO UPDATE SET
              run_id = excluded.run_id,
              collected_at = excluded.collected_at,
              source_name = excluded.source_name,
              source_url = excluded.source_url,
              x = excluded.x,
              y = excluded.y,
              price = excluded.price,
              variation_percent = excluded.variation_percent,
              reference_value = excluded.reference_value,
              unit = excluded.unit,
              raw_price = excluded.raw_price,
              raw_variation = excluded.raw_variation,
              raw_reference = excluded.raw_reference,
              updated_at = CURRENT_TIMESTAMP
            """,
            {"run_id": run_id, **normalized_quote},
        )
        count += 1
    return count


def export_latest_snapshot(connection: sqlite3.Connection, export_path: Path) -> int:
    rows = connection.execute(
        """
        SELECT
          quote_date,
          collected_at,
          source_name,
          source_url,
          source_file,
          product,
          category,
          map_type,
          region,
          subregion,
          row_index,
          column_index,
          x,
          y,
          price,
          variation_percent,
          reference_value,
          unit,
          raw_price,
          raw_variation,
          raw_reference
        FROM datagro_cattle_quotes_latest
        WHERE map_type <> 'historical_series'
        ORDER BY quote_date DESC, product, category, map_type, region, row_index, column_index
        """
    ).fetchall()
    history_rows = connection.execute(
        """
        SELECT
          quote_date,
          collected_at,
          source_name,
          source_url,
          source_file,
          product,
          category,
          map_type,
          region,
          subregion,
          row_index,
          column_index,
          x,
          y,
          price,
          variation_percent,
          reference_value,
          unit,
          raw_price,
          raw_variation,
          raw_reference
        FROM datagro_cattle_quotes
        WHERE quote_date >= date('now', 'start of year')
        ORDER BY quote_date ASC, product, category, map_type, region, row_index, column_index
        """
    ).fetchall()
    snapshot = {
        "sourceName": SOURCE_NAME,
        "sourcePageUrl": SOURCE_PAGE_URL,
        "exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "rows": [dict(row) for row in rows],
        "historyRows": [dict(row) for row in history_rows],
    }
    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_path.write_text(
        f"window.{EXPORT_VARIABLE} = {json.dumps(snapshot, ensure_ascii=True, indent=2)};\n",
        encoding="utf-8",
    )
    return len(rows) + len(history_rows)


def normalize_quote_key(quote: dict[str, object]) -> dict[str, object]:
    normalized = dict(quote)
    for key, default in KEY_DEFAULTS.items():
        if normalized.get(key) is None:
            normalized[key] = default
    return normalized


def collect_historical_series(
    series: dict[str, str],
    start_date: dt.date,
    end_date: dt.date,
    collected_at: str,
) -> list[dict[str, object]]:
    params = urllib.parse.urlencode(
        {
            "indicadordoboi": 1,
            "a": series["code"],
            "i": start_date.isoformat(),
            "f": end_date.isoformat(),
        }
    )
    source_url = f"{PRICE_API_BASE_URL}/dados/?{params}"
    payload = fetch_json(source_url)
    if not isinstance(payload, list):
        raise ValueError(f"Resposta inesperada na serie historica {series['code']}")

    quotes = []
    previous_price: float | None = None
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            continue
        quote_date = str(item.get("dia") or "")
        price = maybe_float(str(item.get("ult"))) if item.get("ult") is not None else None
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", quote_date) or price is None:
            continue
        variation = ((price / previous_price) - 1) * 100 if previous_price else None
        previous_price = price
        quotes.append(
            {
                "quote_date": quote_date,
                "collected_at": collected_at,
                "source_name": SOURCE_NAME,
                "source_url": source_url,
                "source_file": f"serie_historica_{series['code']}",
                "product": series["product"],
                "category": series["category"],
                "map_type": "historical_series",
                "region": series["region"],
                "subregion": "",
                "row_index": -1,
                "column_index": -1,
                "x": None,
                "y": None,
                "price": price,
                "variation_percent": variation,
                "reference_value": None,
                "unit": series["unit"],
                "raw_price": str(item.get("ult")),
                "raw_variation": None if variation is None else f"{variation:.6f}",
                "raw_reference": f"bolsa={item.get('bolsa')}; idbolsa={item.get('idbolsa')}",
            }
        )
    return quotes


def collect(include_history: bool, history_start: dt.date, history_end: dt.date) -> list[dict[str, object]]:
    collected_at_dt = dt.datetime.now(dt.timezone.utc)
    collected_at = collected_at_dt.isoformat(timespec="seconds")
    today = collected_at_dt.astimezone(SAO_PAULO_TIMEZONE).date()
    quote_date_override = daily_quote_date_override(collected_at_dt)
    quotes: list[dict[str, object]] = []

    for source_file, product, category, unit in MAIN_MAPS:
        svg = fetch_text(f"{BASE_URL}/{source_file}")
        quotes.extend(parse_main_map(svg, source_file, product, category, unit, collected_at, today, quote_date_override))

    for source_file, product, category, unit in MT_MAPS:
        svg = fetch_text(f"{BASE_URL}/{source_file}")
        quotes.extend(parse_mt_map(svg, source_file, product, category, unit, collected_at, today, quote_date_override))

    for source_file, product, category, unit in REPLACEMENT_MAPS:
        svg = fetch_text(f"{BASE_URL}/{source_file}")
        quotes.extend(parse_replacement_map(svg, source_file, product, category, unit, collected_at, today, quote_date_override))

    if include_history:
        for series in HISTORICAL_SERIES:
            quotes.extend(collect_historical_series(series, history_start, history_end, collected_at))

    return quotes


def print_summary(quotes: list[dict[str, object]]) -> None:
    history_quotes = [quote for quote in quotes if quote.get("map_type") == "historical_series"]
    daily_quotes = [quote for quote in quotes if quote.get("map_type") != "historical_series"]
    grouped: dict[tuple[str, str, str], int] = {}
    for quote in daily_quotes:
        key = (str(quote["quote_date"]), str(quote["product"]), str(quote["category"]))
        grouped[key] = grouped.get(key, 0) + 1
    for (quote_date, product, category), count in sorted(grouped.items()):
        print(f"{quote_date} | {product} | {category}: {count} registros")
    if history_quotes:
        by_series: dict[tuple[str, str, str], list[str]] = {}
        for quote in history_quotes:
            key = (str(quote["source_file"]), str(quote["product"]), str(quote["category"]))
            by_series.setdefault(key, []).append(str(quote["quote_date"]))
        for (source_file, product, category), dates in sorted(by_series.items()):
            print(
                f"{min(dates)} a {max(dates)} | {product} | {category} | "
                f"{source_file}: {len(dates)} registros historicos"
            )


def default_db_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "pecuaria" / "cotacoes-pecuaria.sqlite"


def default_export_path() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "pecuaria" / "cotacoes-pecuaria-latest.js"


def parse_iso_date(value: str) -> dt.date:
    return dt.date.fromisoformat(value)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=str(default_db_path()))
    parser.add_argument("--export-js", default=str(default_export_path()))
    parser.add_argument("--history-start")
    parser.add_argument("--history-end")
    parser.add_argument("--skip-history", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--export-only", action="store_true")
    args = parser.parse_args(argv)
    today = dt.datetime.now(dt.timezone.utc).astimezone(SAO_PAULO_TIMEZONE).date()
    history_start = parse_iso_date(args.history_start) if args.history_start else dt.date(today.year, 1, 1)
    history_end = parse_iso_date(args.history_end) if args.history_end else today

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    init_db(connection)

    if args.export_only:
        exported = export_latest_snapshot(connection, Path(args.export_js))
        connection.close()
        print(f"Snapshot visual atualizado: {args.export_js}")
        print(f"{exported} registros exportados")
        return 0

    collected_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    run_id = create_run(connection, collected_at)
    try:
        quotes = collect(not args.skip_history, history_start, history_end)
        if args.summary:
            print_summary(quotes)

        if not args.dry_run:
            saved = upsert_quotes(connection, run_id, quotes)
            exported = export_latest_snapshot(connection, Path(args.export_js))
            finish_run(connection, run_id, "SUCCESS", f"{saved} registros gravados; {exported} registros exportados")
            connection.commit()
            print(f"Coleta DATAGRO concluida: {saved} registros em {db_path}")
            print(f"Snapshot visual atualizado: {args.export_js}")
        else:
            finish_run(connection, run_id, "DRY_RUN", f"{len(quotes)} registros lidos")
            connection.rollback()
            print(f"Dry run DATAGRO concluido: {len(quotes)} registros lidos")
        return 0
    except Exception as exc:
        finish_run(connection, run_id, "FAILED", str(exc))
        connection.commit()
        print(f"Falha na coleta DATAGRO: {exc}", file=sys.stderr)
        return 1
    finally:
        connection.close()


if __name__ == "__main__":
    raise SystemExit(main())
