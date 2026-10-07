from __future__ import annotations

import argparse
import csv
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = PROJECT_ROOT / "data" / "portfolio" / "portfolio-confina.js"
MANUAL_ADJUSTMENTS_PATH = PROJECT_ROOT / "data" / "portfolio" / "manual-portfolio-adjustments-confina.json"
PARTNERSHIP_TITLES_PATH = PROJECT_ROOT / "data" / "portfolio" / "partnership-titles-confina.json"

OPERATION_MAP = {
    "65a confina cra": "confina-cra-65-200",
    "65a confina cra 80mm": "confina-cra-65-80",
    "65a confina cra setembro 2026": "confina-cra-65-setembro",
    "65 confina cra setembro 2026": "confina-cra-65-setembro",
    "42a 65a cra confina 09 2026": "confina-cra-42-65-setembro",
    "confina cras carteira 10 2026": "confina-cras-carteira-10",
    "confina cra interno 50 mm junho 2026": "confina-cras-carteira-50",
    "confina cra s carteiras ceres": "confina-cras-carteira-100",
    "confina btg 100 mm": "confina-cprf-100",
    "confina btg 50 mm": "confina-cprf-50",
    "confina btg 50mm abril 2026": "confina-cprf-50",
    "super cra confina 50 mm": "confina-cra-42-50",
}

OPERATION_START_DATES = {
    "confina-cra-65-200": "2026-07-06",
    "confina-cra-65-80": "2026-08-21",
    "confina-cra-65-setembro": "2026-09-18",
    "confina-cra-42-65-setembro": "2026-09-25",
    "confina-cras-carteira-10": "2026-10-05",
    "confina-cra-42-50": "2025-05-13",
    "confina-cras-carteira-100": "2026-04-01",
    "confina-cras-carteira-50": "2026-06-12",
    "confina-cprf-100": "2026-02-20",
    "confina-cprf-50": "2026-04-27",
}

OPERATION_ORDER = [
    "confina-cra-65-200",
    "confina-cra-65-80",
    "confina-cra-65-setembro",
    "confina-cra-42-65-setembro",
    "confina-cras-carteira-10",
    "confina-cra-42-50",
    "confina-cras-carteira-100",
    "confina-cras-carteira-50",
    "confina-cprf-100",
    "confina-cprf-50",
]

FILE_OPERATION_PATTERNS = [
    ("65a confina cra 200mm", "confina-cra-65-200"),
    ("65a confina cra 80mm", "confina-cra-65-80"),
    ("65a confina cra setembro 2026", "confina-cra-65-setembro"),
    ("65 confina cra setembro 2026", "confina-cra-65-setembro"),
    ("42a 65a cra confina 09 2026", "confina-cra-42-65-setembro"),
    ("confina cras carteira 10 2026", "confina-cras-carteira-10"),
    ("super cra confina 50 mm cra 42", "confina-cra-42-50"),
    ("confina cra s carteiras 100mm", "confina-cras-carteira-100"),
    ("confina cra cartiera 50 mm", "confina-cras-carteira-50"),
    ("confina btg 100 mm cprf", "confina-cprf-100"),
    ("confina btg 50mm cprf", "confina-cprf-50"),
]

SETTLED_STATUS_MARKERS = (
    "liquidado",
    "baixa manual",
    "baixa por recompra",
    "recompr",
    "cancel",
)

ANNUAL_RATE_THRESHOLD = 0.10
PORTFOLIO_ACCRUAL_BASE_DAYS = 360
DEFAULT_ACCRUAL_DAY_COUNT = "calendar_inclusive"
PARTNERSHIP_TARGET_MONTHLY_RATE = 0.017
TRANSFER_VALUE_FROM_REPORTED_VP_OPERATIONS: set[str] = set()
TRANSFER_INITIAL_PORTFOLIO_VALUE_TARGETS = {
    "confina-cras-carteira-10": 74968856.43,
}
BRAZIL_MARKET_HOLIDAYS = {
    "2026-01-01",
    "2026-02-16",
    "2026-02-17",
    "2026-02-18",
    "2026-04-03",
    "2026-04-21",
    "2026-05-01",
    "2026-06-04",
    "2026-09-07",
    "2026-10-12",
    "2026-11-02",
    "2026-11-15",
    "2026-11-20",
    "2026-12-25",
    "2027-01-01",
    "2027-02-08",
    "2027-02-09",
    "2027-02-10",
    "2027-03-26",
    "2027-04-21",
    "2027-05-01",
    "2027-05-27",
    "2027-09-07",
    "2027-10-12",
    "2027-11-02",
    "2027-11-15",
    "2027-11-20",
    "2027-12-25",
}
MANUAL_MONTHLY_RATE_BY_LASTRO = {
    "458070": 0.022,
    "458111": 0.022,
    "458072": 0.022,
    "458071": 0.022,
}
CONTROL_MONTHLY_RATE_BY_LASTRO = {
    **MANUAL_MONTHLY_RATE_BY_LASTRO,
    "458065": 0.022,
    "458066": 0.022,
    "458069": 0.022,
    "458063": 0.022,
    "458062": 0.022,
    "458068": 0.022,
    "458067": 0.022,
    "458064": 0.022,
    "511831": 0.0175,
}
CALENDAR_ACCRUAL_MANUAL_LASTROS = {
    "458070",
    "458111",
    "458072",
    "458071",
    "458065",
    "458066",
    "458069",
    "458063",
    "458062",
    "458068",
    "458067",
    "458064",
}

FUND_PURCHASE_DATE_BY_OPERATION_LASTRO = {
    "confina-cprf-100": {
        "458095": "2026-04-24",
        "458096": "2026-04-24",
        "458097": "2026-04-24",
        "458116": "2026-04-24",
    },
}


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def parse_number(value: Any) -> float:
    text = str(value or "").strip()
    if not text or text == "-":
        return 0.0
    text = text.replace("\u00a0", "").replace("R$", "").strip()
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        number = float(text)
    except ValueError:
        return 0.0
    if not math.isfinite(number):
        return 0.0
    return number


def parse_date(value: Any) -> date | None:
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None


def date_key(value: date | None) -> str:
    return value.isoformat() if value else ""


def id_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    text = str(value).strip()
    if re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return text


def load_partnership_reference(path: Path = PARTNERSHIP_TITLES_PATH) -> dict[str, Any]:
    if not path.exists():
        return {"targetMonthlyRate": PARTNERSHIP_TARGET_MONTHLY_RATE, "titlesByLastro": {}}
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    titles = data.get("titles", []) if isinstance(data, dict) else []
    titles_by_lastro = {}
    for item in titles:
        if not isinstance(item, dict):
            continue
        lastro = id_text(item.get("lastro"))
        if lastro:
            titles_by_lastro[lastro] = item
    return {
        "targetMonthlyRate": parse_number(data.get("targetMonthlyRate")) if isinstance(data, dict) else PARTNERSHIP_TARGET_MONTHLY_RATE,
        "guaranteeFactor": parse_number(data.get("guaranteeFactor")) if isinstance(data, dict) else 0.5,
        "titlesByLastro": titles_by_lastro,
    }


PARTNERSHIP_REFERENCE = load_partnership_reference()
PARTNERSHIP_TITLES_BY_LASTRO = PARTNERSHIP_REFERENCE["titlesByLastro"]


def partnership_reference_for_title(key: Any, row: dict[str, Any], column_map: dict[str, str]) -> dict[str, Any] | None:
    identifiers = [
        id_text(key),
        id_text(row_get(row, column_map, "Lastro")),
        id_text(row_get(row, column_map, "Lastro de origem")),
    ]
    for identifier in identifiers:
        if identifier and identifier in PARTNERSHIP_TITLES_BY_LASTRO:
            return PARTNERSHIP_TITLES_BY_LASTRO[identifier]
    return None


def read_csv(path: Path) -> list[dict[str, Any]]:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                rows = list(csv.DictReader(handle, delimiter=";"))
            if rows:
                return rows
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Nao foi possivel ler o CSV: {path}")


def row_get(row: dict[str, Any], column_map: dict[str, str], *names: str) -> Any:
    for name in names:
        key = column_map.get(normalize_text(name))
        if key in row:
            return row.get(key)
    return ""


def infer_position_date(rows: list[dict[str, Any]], column_map: dict[str, str]) -> str:
    inferred: list[str] = []
    for row in rows:
        maturity = parse_date(row_get(row, column_map, "Data de vencimento"))
        days_text = row_get(row, column_map, "Dias ate o vencimento")
        if not maturity or str(days_text or "").strip() == "":
            continue
        try:
            days = int(float(str(days_text).replace(",", ".")))
        except ValueError:
            continue
        inferred.append((maturity - timedelta(days=days)).isoformat())
    if not inferred:
        return date.today().isoformat()
    return Counter(inferred).most_common(1)[0][0]


def operation_id_for_name(name: str, source_file: str = "") -> str:
    normalized_file = normalize_text(source_file)
    for pattern, operation_id in FILE_OPERATION_PATTERNS:
        if pattern in normalized_file:
            return operation_id

    normalized = normalize_text(name)
    if normalized in OPERATION_MAP:
        return OPERATION_MAP[normalized]
    if "btg" in normalized and "100" in normalized:
        return "confina-cprf-100"
    if "btg" in normalized and "50" in normalized:
        return "confina-cprf-50"
    return normalized.replace(" ", "-") or "carteira-sem-nome"


def is_settled(status: str) -> bool:
    normalized = normalize_text(status)
    return any(marker in normalized for marker in SETTLED_STATUS_MARKERS)


def is_pending(status: str) -> bool:
    return normalize_text(status) == "pendente"


def is_open_position(status: str, payment_status: str = "") -> bool:
    normalized_status = normalize_text(status)
    if normalized_status:
        return normalized_status == "em carteira"
    return normalize_text(payment_status) in {"em carteira", "vincendo"}


def is_partial_settlement(status: str, payment_status: str = "") -> bool:
    normalized = normalize_text(f"{status} {payment_status}")
    return any(marker in normalized for marker in ("baixa parcial", "lq parcial", "liquidacao parcial"))


def fund_purchase_date_override(operation_id: str, lastro: Any) -> date | None:
    return parse_date(FUND_PURCHASE_DATE_BY_OPERATION_LASTRO.get(operation_id, {}).get(id_text(lastro)))


def load_manual_adjustments(path: Path = MANUAL_ADJUSTMENTS_PATH) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(data, list):
        return data
    events = data.get("events", [])
    return events if isinstance(events, list) else []


def load_title_overrides(operation_id: str) -> dict[str, dict[str, Any]]:
    overrides: dict[str, dict[str, Any]] = {}
    for item in load_manual_adjustments():
        if item.get("operationId") != operation_id:
            continue
        if str(item.get("type") or "").strip() != "title_override":
            continue
        title_id = str(item.get("titleId") or item.get("lastro") or "").strip()
        if title_id:
            overrides[title_id] = item
    return overrides


def load_title_exclusions(operation_id: str) -> list[dict[str, Any]]:
    exclusions: list[dict[str, Any]] = []
    for item in load_manual_adjustments():
        if item.get("operationId") != operation_id:
            continue
        if str(item.get("type") or "").strip() != "title_exclusion":
            continue
        title_id = str(item.get("titleId") or item.get("lastro") or "").strip()
        title_prefix = str(item.get("titlePrefix") or item.get("lastroPrefix") or "").strip()
        if title_id or title_prefix:
            exclusions.append(item)
    return exclusions


def load_synthetic_titles(operation_id: str) -> list[dict[str, Any]]:
    titles: list[dict[str, Any]] = []
    for item in load_manual_adjustments():
        if item.get("operationId") != operation_id:
            continue
        if str(item.get("type") or "").strip() != "synthetic_title":
            continue
        title_id = str(item.get("titleId") or item.get("lastro") or "").strip()
        if title_id:
            titles.append(item)
    return titles


def title_override_partial_liquidations(title_override: dict[str, Any]) -> list[dict[str, Any]]:
    partials: list[dict[str, Any]] = []
    raw_items = title_override.get("partialLiquidations")
    if not isinstance(raw_items, list):
        return partials
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        item_date = parse_date(item.get("date") or item.get("settlementDate"))
        amount = round(parse_number(item.get("amount")), 2)
        if item_date and amount > 0:
            partials.append({
                "date": item_date.isoformat(),
                "amount": amount,
                "source": str(item.get("source") or title_override.get("id") or "ajuste_manual").strip(),
            })
    return partials


def cash_liquidation_is_suppressed(title_override: dict[str, Any], payment_date_key: str, paid: float) -> bool:
    raw_items = title_override.get("suppressCashLiquidations")
    if not isinstance(raw_items, list):
        return False
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        item_date = date_key(parse_date(item.get("date") or item.get("settlementDate")))
        item_amount = round(parse_number(item.get("amount")), 2)
        if item_date == payment_date_key and (not item_amount or abs(item_amount - round(paid, 2)) <= 0.01):
            return True
    return False


def find_title_exclusion(exclusions: list[dict[str, Any]], key: Any, title: dict[str, Any]) -> dict[str, Any] | None:
    identifiers = {
        id_text(key),
        id_text(title.get("id")),
        id_text(title.get("lastro")),
        id_text(title.get("originalLastro")),
    }
    identifiers.discard("")
    for item in exclusions:
        title_id = str(item.get("titleId") or item.get("lastro") or "").strip()
        if title_id and title_id in identifiers:
            return item
        title_prefix = str(item.get("titlePrefix") or item.get("lastroPrefix") or "").strip()
        if title_prefix and any(identifier.startswith(title_prefix) for identifier in identifiers):
            return item
    return None


def apply_manual_adjustments(
    operation_id: str,
    titles: list[dict[str, Any]],
    cash_events: list[dict[str, Any]],
) -> dict[str, Any]:
    adjustments = [
        item for item in load_manual_adjustments()
        if item.get("operationId") == operation_id
    ]
    title_by_id = {str(title.get("id") or ""): title for title in titles}
    applied = []
    skipped_pre_purchase_liquidations = []

    for adjustment in adjustments:
        event_type = str(adjustment.get("type") or "portfolio_liquidation").strip()
        if event_type in {"title_override", "title_exclusion", "synthetic_title"}:
            continue
        event_date = str(adjustment.get("date") or "").strip()
        title_id = str(adjustment.get("titleId") or adjustment.get("lastro") or "").strip()
        amount = round(parse_number(adjustment.get("amount")), 2)
        if not event_type or not event_date or not title_id or amount <= 0:
            continue

        title = title_by_id.get(title_id)
        title_purchase_date = str(title.get("purchaseDate") or "").strip() if title else ""
        if event_type == "portfolio_liquidation" and title and (not title_purchase_date or event_date < title_purchase_date):
            skipped_pre_purchase_liquidations.append({
                "id": str(adjustment.get("id") or "").strip(),
                "titleId": title_id,
                "date": event_date,
                "purchaseDate": title_purchase_date,
                "amount": amount,
                "source": MANUAL_ADJUSTMENTS_PATH.name,
            })
            continue

        adjustment_mode = str(adjustment.get("mode") or "replace_same_day")
        if adjustment_mode == "replace_title":
            cash_events[:] = [
                event for event in cash_events
                if not (
                    event.get("operationId") == operation_id
                    and event.get("type") == event_type
                    and str(event.get("titleId") or "") == title_id
                )
            ]
        elif adjustment_mode == "replace_same_day":
            cash_events[:] = [
                event for event in cash_events
                if not (
                    event.get("operationId") == operation_id
                    and event.get("type") == event_type
                    and event.get("date") == event_date
                    and str(event.get("titleId") or "") == title_id
                )
            ]
        elif adjustment_mode == "replace_operation_day_type":
            cash_events[:] = [
                event for event in cash_events
                if not (
                    event.get("operationId") == operation_id
                    and event.get("type") == event_type
                    and event.get("date") == event_date
                )
            ]

        cash_events.append({
            "operationId": operation_id,
            "date": event_date,
            "type": event_type,
            "amount": amount,
            "titleId": title_id,
            "note": str(adjustment.get("note") or "Ajuste manual de carteira").strip(),
            "source": MANUAL_ADJUSTMENTS_PATH.name,
            "manualAdjustmentId": str(adjustment.get("id") or "").strip(),
        })

        if title and event_type == "portfolio_liquidation":
            title["settledDate"] = str(adjustment.get("settledDate") or event_date)
            title["paymentStatus"] = str(adjustment.get("paymentStatus") or title.get("paymentStatus") or "BAIXA MANUAL")
            title["titleStatus"] = str(adjustment.get("titleStatus") or title.get("titleStatus") or "BAIXA MANUAL")
            title["presentValue"] = 0
            title["isActive"] = False

        applied.append({
            "id": str(adjustment.get("id") or "").strip(),
            "titleId": title_id,
            "date": event_date,
            "type": event_type,
            "amount": amount,
            "titleFound": bool(title),
        })

    return {
        "file": MANUAL_ADJUSTMENTS_PATH.name,
        "eventsApplied": len(applied),
        "cashImpact": round(sum(item["amount"] for item in applied), 2),
        "missingTitles": [item["titleId"] for item in applied if not item["titleFound"]],
        "skippedPrePurchaseLiquidations": skipped_pre_purchase_liquidations,
    }


def choose_master_row(rows: list[dict[str, Any]], column_map: dict[str, str]) -> dict[str, Any]:
    def score(row: dict[str, Any]) -> tuple[float, int]:
        face = parse_number(row_get(row, column_map, "Valor face"))
        acquisition = parse_number(row_get(row, column_map, "Valor aquisicao"))
        present = parse_number(row_get(row, column_map, "Valor presente"))
        filled = sum(1 for value in row.values() if str(value or "").strip())
        return (face + acquisition + present, filled)

    return max(rows, key=score)


def daily_rate_from_monthly(monthly_rate: float, base_days: int) -> float:
    return (1 + monthly_rate) ** (12 / base_days) - 1 if monthly_rate > 0 and base_days > 0 else 0.0


def accrual_period_from_source(row: dict[str, Any], column_map: dict[str, str]) -> tuple[int, str, str]:
    candidates = [
        ("Dias de accrual", "calendar_inclusive"),
        ("Dias accrual", "calendar_inclusive"),
        ("Periodo de accrual", "calendar_inclusive"),
        ("Período de accrual", "calendar_inclusive"),
        ("Periodo accrual", "calendar_inclusive"),
        ("Período accrual", "calendar_inclusive"),
        ("Dias corridos accrual", "calendar_inclusive"),
        ("Dias corridos acumulados", "calendar_inclusive"),
        ("Dias uteis accrual", "business_exclusive"),
        ("Dias úteis accrual", "business_exclusive"),
    ]
    for name, day_count in candidates:
        key = column_map.get(normalize_text(name))
        if not key or key not in row:
            continue
        periods = int(round(parse_number(row.get(key))))
        if periods > 0:
            return periods, day_count, key
    return 0, "", ""


def accrual_day_count_from_source(row: dict[str, Any], column_map: dict[str, str]) -> str:
    raw = " ".join(
        str(row_get(row, column_map, name) or "")
        for name in ("Regime accrual", "Regime de accrual", "Tipo accrual", "Tipo de accrual", "Tipo")
    )
    normalized = normalize_text(raw)
    if any(marker in normalized for marker in ("corrido", "corridos", "calendar", "dc", "360")):
        return "calendar_inclusive"
    return DEFAULT_ACCRUAL_DAY_COUNT


def normalized_rates(row: dict[str, Any], column_map: dict[str, str], lastro: Any) -> tuple[float, float, float, str, int, str]:
    discount_rate = parse_number(row_get(row, column_map, "Taxa desconto")) / 100
    effective_rate = parse_number(row_get(row, column_map, "Taxa efetiva")) / 100
    base_days = PORTFOLIO_ACCRUAL_BASE_DAYS
    day_count = accrual_day_count_from_source(row, column_map)

    lastro_id = id_text(lastro)
    manual_monthly = CONTROL_MONTHLY_RATE_BY_LASTRO.get(lastro_id)
    if manual_monthly and not discount_rate and not effective_rate:
        if lastro_id in CALENDAR_ACCRUAL_MANUAL_LASTROS:
            day_count = "calendar_inclusive"
        annual_rate = (1 + manual_monthly) ** 12 - 1
        return manual_monthly, annual_rate, daily_rate_from_monthly(manual_monthly, base_days), "taxa_manual_relacao", base_days, day_count

    if discount_rate:
        if manual_monthly:
            if lastro_id in CALENDAR_ACCRUAL_MANUAL_LASTROS:
                day_count = "calendar_inclusive"
            annual_rate = (1 + manual_monthly) ** 12 - 1
            return manual_monthly, annual_rate, daily_rate_from_monthly(manual_monthly, base_days), "taxa_controle_usuario", base_days, day_count
        if discount_rate > ANNUAL_RATE_THRESHOLD:
            annual_rate = discount_rate
            monthly_rate = (1 + annual_rate) ** (1 / 12) - 1
            return monthly_rate, annual_rate, daily_rate_from_monthly(monthly_rate, base_days), "taxa_desconto_ano_convertida_mes", base_days, day_count
        annual_rate = (1 + discount_rate) ** 12 - 1
        return discount_rate, annual_rate, daily_rate_from_monthly(discount_rate, base_days), "taxa_desconto_mes", base_days, day_count

    if effective_rate:
        monthly_rate = (1 + effective_rate) ** (1 / 12) - 1
        return monthly_rate, effective_rate, daily_rate_from_monthly(monthly_rate, base_days), "taxa_efetiva_ano", base_days, day_count

    annual_rate = (1 + PARTNERSHIP_TARGET_MONTHLY_RATE) ** 12 - 1
    return (
        PARTNERSHIP_TARGET_MONTHLY_RATE,
        annual_rate,
        daily_rate_from_monthly(PARTNERSHIP_TARGET_MONTHLY_RATE, base_days),
        "taxa_alvo_parceria",
        base_days,
        day_count,
    )


def parse_monthly_rate_override(value: Any) -> float:
    rate = parse_number(value)
    if rate <= 0:
        return 0.0
    return rate / 100 if rate > 0.5 else rate


def business_days_between_exclusive(start_key: str, end_key: str) -> int:
    if not start_key or not end_key:
        return 0
    start = datetime.strptime(start_key, "%Y-%m-%d").date()
    end = datetime.strptime(end_key, "%Y-%m-%d").date()
    if end <= start:
        return 0
    days = 0
    current = start + timedelta(days=1)
    while current <= end:
        if current.weekday() < 5 and current.isoformat() not in BRAZIL_MARKET_HOLIDAYS:
            days += 1
        current += timedelta(days=1)
    return days


def accrual_periods(purchase_date: str, target_date: str, day_count: str) -> int:
    if not purchase_date or not target_date:
        return 0
    days = (datetime.strptime(target_date, "%Y-%m-%d").date() - datetime.strptime(purchase_date, "%Y-%m-%d").date()).days
    if day_count == "calendar_inclusive":
        return max(days, 0)
    if day_count == "business_exclusive":
        return business_days_between_exclusive(purchase_date, target_date)
    return max(days, 0)


def accrued_value_from_rate(
    acquisition_value: float,
    daily_rate: float,
    purchase_date: str,
    target_date: str,
    *,
    day_count: str = DEFAULT_ACCRUAL_DAY_COUNT,
    cap_value: float = 0.0,
    periods_override: int = 0,
) -> float:
    if not purchase_date or not acquisition_value:
        return 0.0
    periods = accrual_periods(purchase_date, target_date, day_count)
    estimated = acquisition_value * ((1 + daily_rate) ** periods) if daily_rate else acquisition_value
    return min(estimated, cap_value) if cap_value > 0 else estimated


def accrued_value(title: dict[str, Any], target_date: str) -> float:
    if title.get("portfolioEligible") is False:
        return 0.0
    if title.get("settledWithoutDate"):
        return 0.0
    purchase_date = title.get("purchaseDate") or title.get("sentDate") or title.get("issueDate")
    if not purchase_date or target_date < purchase_date:
        return 0.0
    if title.get("settledDate") and title["settledDate"] <= target_date:
        return 0.0
    face = float(title.get("faceValue") or 0.0)
    cap_value = 0.0 if title.get("allowPresentValueAboveFace") else face
    value = accrued_value_from_rate(
        float(title.get("acquisitionValue") or 0.0),
        float(title.get("dailyRate") or 0.0),
        purchase_date,
        target_date,
        day_count=str(title.get("accrualDayCount") or DEFAULT_ACCRUAL_DAY_COUNT),
        cap_value=cap_value,
    )
    partial_paid = sum(
        float(item.get("amount") or 0.0)
        for item in title.get("partialLiquidations", [])
        if str(item.get("date") or "") <= target_date
    )
    return max(0.0, value - partial_paid)


def synthetic_title_from_adjustment(
    adjustment: dict[str, Any],
    operation_id: str,
    position_date: str,
) -> dict[str, Any] | None:
    title_id = str(adjustment.get("titleId") or adjustment.get("lastro") or "").strip()
    purchase_date = date_key(parse_date(adjustment.get("purchaseDate") or adjustment.get("date")))
    maturity_date = date_key(parse_date(adjustment.get("maturityDate")))
    acquisition_value = round(parse_number(adjustment.get("acquisitionValue") or adjustment.get("amount")), 2)
    face_value = round(parse_number(adjustment.get("faceValue") or adjustment.get("valorFace")), 2)
    if not title_id or not purchase_date or acquisition_value <= 0:
        return None

    monthly_rate = parse_monthly_rate_override(
        adjustment.get("monthlyRate")
        or adjustment.get("discountRateMonthly")
        or adjustment.get("manualMonthlyRate")
    )
    if not monthly_rate:
        monthly_rate = PARTNERSHIP_TARGET_MONTHLY_RATE
    base_days = int(parse_number(adjustment.get("accrualBaseDays")) or PORTFOLIO_ACCRUAL_BASE_DAYS)
    day_count = str(adjustment.get("accrualDayCount") or DEFAULT_ACCRUAL_DAY_COUNT).strip()
    annual_rate = (1 + monthly_rate) ** 12 - 1
    daily_rate = daily_rate_from_monthly(monthly_rate, base_days)
    partnership_same_value = bool(acquisition_value > 0 and face_value > 0 and abs(acquisition_value - face_value) <= 0.01)
    allow_present_value_above_face = bool(adjustment.get("allowPresentValueAboveFace", partnership_same_value))
    cap_value = 0.0 if allow_present_value_above_face else face_value
    active_as_of_position = purchase_date <= position_date
    calculated_present_value = accrued_value_from_rate(
        acquisition_value,
        daily_rate,
        purchase_date,
        position_date,
        day_count=day_count,
        cap_value=cap_value,
    ) if active_as_of_position else 0.0
    if adjustment.get("settledDate") and str(adjustment.get("settledDate")) <= position_date:
        active_as_of_position = False
        calculated_present_value = 0.0
    days_to_maturity = 0
    if maturity_date:
        days_to_maturity = (datetime.strptime(maturity_date, "%Y-%m-%d").date() - datetime.strptime(position_date, "%Y-%m-%d").date()).days

    return {
        "id": title_id,
        "sourceRow": None,
        "operationId": operation_id,
        "reportName": str(adjustment.get("reportName") or "").strip(),
        "positionDate": position_date,
        "lastro": str(adjustment.get("lastro") or title_id).strip(),
        "originalLastro": str(adjustment.get("originalLastro") or "").strip(),
        "cedente": str(adjustment.get("cedente") or "").strip(),
        "sacado": str(adjustment.get("sacado") or "").strip(),
        "documentoSacado": str(adjustment.get("documentoSacado") or "").strip(),
        "titleType": str(adjustment.get("titleType") or "NP").strip(),
        "invoice": str(adjustment.get("invoice") or "").strip(),
        "installment": str(adjustment.get("installment") or "1").strip(),
        "sentDate": str(adjustment.get("sentDate") or "").strip(),
        "issueDate": str(adjustment.get("issueDate") or "").strip(),
        "purchaseDate": purchase_date,
        "purchaseDateSource": str(adjustment.get("purchaseDateSource") or "ajuste_manual_transferencia").strip(),
        "maturityDate": maturity_date,
        "controlReferenceLastro": str(adjustment.get("controlReferenceLastro") or "").strip(),
        "manualTitleOverrideId": str(adjustment.get("id") or "").strip(),
        "settledDate": str(adjustment.get("settledDate") or "").strip(),
        "faceValue": face_value,
        "outstandingFaceValue": face_value,
        "acquisitionValue": acquisition_value,
        "presentValue": round(calculated_present_value, 2),
        "reportedPresentValue": round(parse_number(adjustment.get("reportedPresentValue")), 2),
        "partialLiquidationAmount": 0,
        "partialLiquidations": [],
        "discountRateMonthly": monthly_rate,
        "effectiveRateAnnual": annual_rate,
        "dailyRate": daily_rate,
        "rateSource": str(adjustment.get("rateSource") or "transferencia_manual").strip(),
        "partnershipTargetMonthlyRate": PARTNERSHIP_TARGET_MONTHLY_RATE if monthly_rate == PARTNERSHIP_TARGET_MONTHLY_RATE else 0,
        "presentValueMethod": "motor",
        "accrualBaseDays": base_days,
        "accrualDayCount": day_count,
        "accrualPeriodsAtPosition": 0,
        "accrualPeriodsSource": "",
        "allowPresentValueAboveFace": allow_present_value_above_face,
        "partnershipBySameFaceAndAcquisition": partnership_same_value,
        "daysToMaturity": int(days_to_maturity),
        "paymentStatus": str(adjustment.get("paymentStatus") or "EM CARTEIRA").strip(),
        "titleStatus": str(adjustment.get("titleStatus") or "EM CARTEIRA").strip(),
        "portfolioEligible": True,
        "settledWithoutDate": False,
        "operationType": str(adjustment.get("operationType") or "Pré fixado").strip(),
        "farmName": str(adjustment.get("farmName") or "").strip(),
        "animalCount": parse_number(adjustment.get("animalCount")),
        "uf": str(adjustment.get("uf") or "").strip(),
        "municipality": str(adjustment.get("municipality") or "").strip(),
        "validation": str(adjustment.get("validation") or "VÁLIDO").strip(),
        "isActive": bool(calculated_present_value > 0 and active_as_of_position),
        "syntheticTitle": True,
        "manualSyntheticTitleId": str(adjustment.get("id") or "").strip(),
        "note": str(adjustment.get("note") or "").strip(),
    }


def build_import(path: Path, position_date_override: str = "") -> dict[str, Any]:
    rows = read_csv(path)
    if not rows:
        raise ValueError("CSV sem linhas.")

    column_map = {normalize_text(header): header for header in rows[0].keys() if header}
    position_date = position_date_override or infer_position_date(rows, column_map)
    position_day = datetime.strptime(position_date, "%Y-%m-%d").date()
    report_name = str(row_get(rows[0], column_map, "Nome CRA") or "").strip()
    operation_id = operation_id_for_name(report_name, path.name)

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for index, row in enumerate(rows, start=2):
        lastro = str(row_get(row, column_map, "Lastro") or "").strip()
        invoice = str(row_get(row, column_map, "Numero NF") or "").strip()
        installment = str(row_get(row, column_map, "Parcela") or "").strip()
        key = lastro or f"{invoice}-{installment}-{index}"
        row["_sourceRow"] = index
        groups[key].append(row)

    titles: list[dict[str, Any]] = []
    ignored_titles: list[dict[str, Any]] = []
    cash_events: list[dict[str, Any]] = []
    skipped_pre_purchase_liquidations: list[dict[str, Any]] = []
    title_overrides = load_title_overrides(operation_id)
    title_exclusions = load_title_exclusions(operation_id)

    for key, grouped_rows in groups.items():
        candidate_rows = [
            row for row in grouped_rows
            if parse_number(row_get(row, column_map, "Valor face"))
            or parse_number(row_get(row, column_map, "Valor aquisicao"))
            or parse_number(row_get(row, column_map, "Valor presente"))
        ]
        if not candidate_rows:
            candidate_rows = grouped_rows
        master = choose_master_row(candidate_rows, column_map)
        monthly_rate, effective_rate_annual, daily_rate, rate_source, accrual_base_days, accrual_day_count = normalized_rates(master, column_map, key)
        title_override = title_overrides.get(id_text(key), {})
        manual_monthly_rate = parse_monthly_rate_override(
            title_override.get("monthlyRate")
            or title_override.get("discountRateMonthly")
            or title_override.get("manualMonthlyRate")
        )
        if manual_monthly_rate:
            monthly_rate = manual_monthly_rate
            effective_rate_annual = (1 + monthly_rate) ** 12 - 1
            daily_rate = daily_rate_from_monthly(monthly_rate, accrual_base_days)
            rate_source = str(title_override.get("rateSource") or "taxa_manual_override")
        partnership_reference = partnership_reference_for_title(key, master, column_map)
        partnership_target_monthly_rate = 0.0
        if partnership_reference:
            partnership_target_monthly_rate = (
                parse_number(partnership_reference.get("targetMonthlyRate"))
                or parse_number(PARTNERSHIP_REFERENCE.get("targetMonthlyRate"))
                or PARTNERSHIP_TARGET_MONTHLY_RATE
            )
            monthly_rate = partnership_target_monthly_rate
            effective_rate_annual = (1 + monthly_rate) ** 12 - 1
            daily_rate = daily_rate_from_monthly(monthly_rate, accrual_base_days)
            rate_source = "taxa_alvo_parceria"
        accrual_periods_at_position, accrual_periods_day_count, accrual_periods_source = accrual_period_from_source(master, column_map)
        if accrual_periods_day_count:
            accrual_day_count = accrual_periods_day_count
        if title_override.get("accrualDayCount"):
            accrual_day_count = str(title_override.get("accrualDayCount") or "").strip()

        sent = parse_date(row_get(master, column_map, "Data de envio titulos"))
        issue = parse_date(row_get(master, column_map, "Data de emissao"))
        maturity = parse_date(row_get(master, column_map, "Data de vencimento"))
        purchase_override = fund_purchase_date_override(operation_id, key)
        if title_override.get("purchaseDate"):
            purchase_override = parse_date(title_override.get("purchaseDate"))
        if title_override.get("maturityDate"):
            maturity = parse_date(title_override.get("maturityDate")) or maturity
        purchase = purchase_override or parse_date(row_get(master, column_map, "Data de cessao")) or sent or issue
        operation_start = OPERATION_START_DATES.get(operation_id, "")
        if operation_id == "confina-cras-carteira-10" and purchase and operation_start and date_key(purchase) < operation_start:
            purchase = parse_date(operation_start) or purchase
        days_to_maturity = (maturity - position_day).days if maturity else int(parse_number(row_get(master, column_map, "Dias ate o vencimento")))
        payment_dates = [
            parse_date(row_get(row, column_map, "Data do pagamento"))
            for row in grouped_rows
            if parse_number(row_get(row, column_map, "Valor pago")) > 0
        ]
        payment_dates = [item for item in payment_dates if item]
        title_status = str(row_get(master, column_map, "Status do titulo") or "").strip()
        payment_status = str(row_get(master, column_map, "Status do Pagamento") or "").strip()
        status = title_status or payment_status
        is_eligible = not is_pending(title_status)
        raw_settled_date = max(payment_dates) if payment_dates and is_settled(status) else None
        settled_date = raw_settled_date.isoformat() if raw_settled_date and raw_settled_date <= position_day else ""
        settled_without_date = bool(is_settled(status) and not payment_dates and not is_open_position(title_status, payment_status))
        purchase_is_in_position = bool(purchase and purchase <= position_day)
        active_as_of_position = bool(
            is_eligible
            and purchase_is_in_position
            and not settled_without_date
            and not (raw_settled_date and raw_settled_date <= position_day)
        )
        reported_present_value = parse_number(row_get(master, column_map, "Valor presente"))
        acquisition_value = round(parse_number(row_get(master, column_map, "Valor aquisicao")), 2)
        face_value = round(parse_number(row_get(master, column_map, "Valor face")), 2)
        if title_override.get("acquisitionValue") is not None:
            acquisition_value = round(parse_number(title_override.get("acquisitionValue")), 2)
        if title_override.get("faceValue") is not None:
            face_value = round(parse_number(title_override.get("faceValue")), 2)
        if operation_id in TRANSFER_VALUE_FROM_REPORTED_VP_OPERATIONS and not title_override:
            acquisition_value = round(reported_present_value, 2)
        partial_liquidations: list[dict[str, Any]] = []
        has_intermediate_payments = bool(
            raw_settled_date
            and any(payment_date < raw_settled_date for payment_date in payment_dates)
        )
        collect_partial_liquidations = bool(is_partial_settlement(status, payment_status) or has_intermediate_payments)
        if collect_partial_liquidations:
            for row in grouped_rows:
                payment_date = parse_date(row_get(row, column_map, "Data do pagamento"))
                paid = parse_number(row_get(row, column_map, "Valor pago"))
                if not payment_date or paid <= 0 or payment_date > position_day:
                    continue
                if has_intermediate_payments and not is_partial_settlement(status, payment_status) and raw_settled_date and payment_date >= raw_settled_date:
                    continue
                payment_date_key = payment_date.isoformat()
                if not date_key(purchase) or payment_date_key < date_key(purchase):
                    continue
                if operation_start and payment_date_key < operation_start:
                    continue
                partial_liquidations.append({
                    "date": payment_date_key,
                    "amount": round(paid, 2),
                })
        partial_liquidation_amount = round(sum(item["amount"] for item in partial_liquidations), 2)
        partial_reported_zero = bool(
            partial_liquidations
            and reported_present_value <= 0.01
            and not raw_settled_date
        )
        partnership_same_value = bool(acquisition_value > 0 and face_value > 0 and abs(acquisition_value - face_value) <= 0.01)
        allow_present_value_above_face = bool(
            rate_source in {"taxa_manual_relacao", "taxa_alvo_parceria"}
            or partnership_same_value
        )
        if "allowPresentValueAboveFace" in title_override:
            allow_present_value_above_face = bool(title_override.get("allowPresentValueAboveFace"))
        cap_value = 0.0 if allow_present_value_above_face else face_value
        calculated_present_value = accrued_value_from_rate(
            acquisition_value,
            daily_rate,
            date_key(purchase),
            position_date,
            day_count=accrual_day_count,
            cap_value=cap_value,
            periods_override=accrual_periods_at_position,
        ) if active_as_of_position else 0
        if partial_reported_zero:
            settled_date = max(item["date"] for item in partial_liquidations)
            calculated_present_value = 0
            active_as_of_position = False
        elif partial_liquidation_amount > 0 and active_as_of_position:
            calculated_present_value = max(0.0, calculated_present_value - partial_liquidation_amount)
        manual_partial_liquidations = title_override_partial_liquidations(title_override)
        if manual_partial_liquidations:
            existing_partial_keys = {
                (item.get("date"), round(float(item.get("amount") or 0.0), 2))
                for item in partial_liquidations
            }
            for item in manual_partial_liquidations:
                key_pair = (item.get("date"), round(float(item.get("amount") or 0.0), 2))
                if key_pair not in existing_partial_keys:
                    partial_liquidations.append(item)
                    existing_partial_keys.add(key_pair)
            partial_liquidations.sort(key=lambda item: (item.get("date") or "", item.get("amount") or 0))
            partial_liquidation_amount = round(sum(item["amount"] for item in partial_liquidations), 2)
            if active_as_of_position:
                calculated_present_value = max(0.0, calculated_present_value - partial_liquidation_amount)
        outstanding_face_value = max(0.0, face_value - partial_liquidation_amount) if partial_liquidation_amount > 0 else face_value
        if partial_reported_zero:
            outstanding_face_value = 0.0

        title = {
            "id": str(key),
            "sourceRow": master.get("_sourceRow"),
            "operationId": operation_id,
            "reportName": report_name,
            "positionDate": position_date,
            "lastro": str(row_get(master, column_map, "Lastro") or "").strip(),
            "originalLastro": str(row_get(master, column_map, "Lastro de origem") or "").strip(),
            "cedente": str(row_get(master, column_map, "Nome da cedente") or "").strip(),
            "sacado": str(row_get(master, column_map, "Nome sacado") or "").strip(),
            "documentoSacado": str(row_get(master, column_map, "Documento sacado") or "").strip(),
            "titleType": str(row_get(master, column_map, "Tipo de titulo") or "").strip(),
            "invoice": str(row_get(master, column_map, "Numero NF") or "").strip(),
            "installment": str(row_get(master, column_map, "Parcela") or "").strip(),
            "sentDate": date_key(sent),
            "issueDate": date_key(issue),
            "purchaseDate": date_key(purchase),
            "purchaseDateSource": (
                str(title_override.get("purchaseDateSource") or "").strip()
                if title_override.get("purchaseDate")
                else "dt_aquisicao_fundo_controle" if purchase_override else "relatorio"
            ),
            "maturityDate": date_key(maturity),
            "controlReferenceLastro": str(title_override.get("controlReferenceLastro") or "").strip(),
            "manualTitleOverrideId": str(title_override.get("id") or "").strip(),
            "settledDate": settled_date,
            "faceValue": face_value,
            "outstandingFaceValue": round(outstanding_face_value, 2),
            "acquisitionValue": acquisition_value,
            "presentValue": round(calculated_present_value, 2),
            "reportedPresentValue": round(reported_present_value, 2),
            "partialLiquidationAmount": partial_liquidation_amount,
            "partialLiquidations": partial_liquidations,
            "discountRateMonthly": monthly_rate,
            "effectiveRateAnnual": effective_rate_annual,
            "dailyRate": daily_rate,
            "rateSource": rate_source,
            "partnershipTitle": bool(partnership_reference),
            "partnershipPartner": str(partnership_reference.get("partner") if partnership_reference else "").strip(),
            "partnershipSourceFile": str(partnership_reference.get("sourceFile") if partnership_reference else "").strip(),
            "partnershipTargetMonthlyRate": partnership_target_monthly_rate if partnership_reference else (PARTNERSHIP_TARGET_MONTHLY_RATE if rate_source == "taxa_alvo_parceria" else 0),
            "presentValueMethod": "motor",
            "accrualBaseDays": accrual_base_days,
            "accrualDayCount": accrual_day_count,
            "accrualPeriodsAtPosition": accrual_periods_at_position,
            "accrualPeriodsSource": accrual_periods_source,
            "allowPresentValueAboveFace": allow_present_value_above_face,
            "partnershipBySameFaceAndAcquisition": partnership_same_value,
            "daysToMaturity": int(days_to_maturity),
            "paymentStatus": payment_status,
            "titleStatus": status,
            "portfolioEligible": is_eligible,
            "settledWithoutDate": settled_without_date,
            "operationType": str(row_get(master, column_map, "Tipo de operacao") or "").strip(),
            "farmName": str(row_get(master, column_map, "Nome da Fazenda") or "").strip(),
            "animalCount": parse_number(row_get(master, column_map, "Quant. Animais")),
            "uf": str(row_get(master, column_map, "UF sacado") or "").strip(),
            "municipality": str(row_get(master, column_map, "Municipio sacado") or "").strip(),
            "validation": str(row_get(master, column_map, "Validacao do titulo") or "").strip(),
        }
        title["isActive"] = bool(title["presentValue"] > 0 and active_as_of_position)

        title_exclusion = find_title_exclusion(title_exclusions, key, title)
        if title_exclusion:
            title["portfolioEligible"] = False
            title["isActive"] = False
            title["presentValue"] = 0
            title["ignoredReason"] = str(title_exclusion.get("note") or "Titulo desconsiderado manualmente").strip()
            title["manualTitleExclusionId"] = str(title_exclusion.get("id") or "").strip()

        if not title["portfolioEligible"]:
            ignored_titles.append(title)
            continue

        titles.append(title)

        operation_start = OPERATION_START_DATES.get(operation_id, "")
        settled_before_start = bool(title["settledDate"] and operation_start and title["settledDate"] < operation_start)

        if (
            title["portfolioEligible"]
            and title["acquisitionValue"] > 0
            and title["purchaseDate"]
            and title["purchaseDate"] <= position_date
            and not settled_before_start
        ):
            cash_purchase_date = max(title["purchaseDate"], operation_start) if operation_start else title["purchaseDate"]
            cash_events.append({
                "operationId": operation_id,
                "date": cash_purchase_date,
                "type": "portfolio_purchase",
                "amount": title["acquisitionValue"],
                "titleId": title["id"],
                "note": f"Compra carteira {title['titleType']} {title['lastro']}".strip(),
                "source": path.name,
                "sourceDate": title["purchaseDate"],
            })

        for row in grouped_rows:
            if not title["portfolioEligible"]:
                continue
            payment_date = parse_date(row_get(row, column_map, "Data do pagamento"))
            paid = parse_number(row_get(row, column_map, "Valor pago"))
            if not payment_date or paid <= 0 or payment_date > position_day:
                continue
            payment_date_key = payment_date.isoformat()
            if not title["purchaseDate"] or payment_date_key < title["purchaseDate"]:
                if operation_id == "confina-cra-65-200" and title["purchaseDate"] == OPERATION_START_DATES.get(operation_id, ""):
                    payment_date_key = title["purchaseDate"]
                else:
                    skipped_pre_purchase_liquidations.append({
                        "operationId": operation_id,
                        "date": payment_date_key,
                        "purchaseDate": title["purchaseDate"],
                        "amount": round(paid, 2),
                        "titleId": title["id"],
                        "note": f"Liquidacao ignorada antes da entrada no funding {title['titleType']} {title['lastro']}".strip(),
                        "source": path.name,
                    })
                    continue
            if cash_liquidation_is_suppressed(title_override, payment_date_key, paid):
                skipped_pre_purchase_liquidations.append({
                    "operationId": operation_id,
                    "date": payment_date_key,
                    "purchaseDate": title["purchaseDate"],
                    "amount": round(paid, 2),
                    "titleId": title["id"],
                    "note": f"Liquidacao tratada apenas como reducao de nominal {title['titleType']} {title['lastro']}".strip(),
                    "source": path.name,
                })
                continue
            if operation_start and payment_date_key < operation_start:
                continue
            cash_events.append({
                "operationId": operation_id,
                "date": payment_date_key,
                "type": "portfolio_liquidation",
                "amount": round(paid, 2),
                "titleId": title["id"],
                "note": f"Liquidacao carteira {title['titleType']} {title['lastro']}".strip(),
                "source": path.name,
            })

    for adjustment in load_synthetic_titles(operation_id):
        synthetic_title = synthetic_title_from_adjustment(adjustment, operation_id, position_date)
        if not synthetic_title:
            continue
        if not synthetic_title.get("reportName"):
            synthetic_title["reportName"] = report_name
        titles.append(synthetic_title)
        if (
            synthetic_title["portfolioEligible"]
            and synthetic_title["acquisitionValue"] > 0
            and synthetic_title["purchaseDate"]
            and synthetic_title["purchaseDate"] <= position_date
        ):
            cash_events.append({
                "operationId": operation_id,
                "date": synthetic_title["purchaseDate"],
                "type": "portfolio_purchase",
                "amount": synthetic_title["acquisitionValue"],
                "titleId": synthetic_title["id"],
                "note": str(adjustment.get("note") or f"Compra manual carteira {synthetic_title['titleType']} {synthetic_title['lastro']}").strip(),
                "source": MANUAL_ADJUSTMENTS_PATH.name,
                "manualAdjustmentId": str(adjustment.get("id") or "").strip(),
            })

    transfer_target_value = TRANSFER_INITIAL_PORTFOLIO_VALUE_TARGETS.get(operation_id)
    if transfer_target_value and position_date == OPERATION_START_DATES.get(operation_id):
        active_titles_for_target = [
            title for title in titles
            if title.get("portfolioEligible") is not False
            and title.get("isActive")
            and not title.get("syntheticTitle")
        ]
        synthetic_active_value = round(sum(
            float(title.get("presentValue") or 0.0)
            for title in titles
            if title.get("portfolioEligible") is not False
            and title.get("isActive")
            and title.get("syntheticTitle")
        ), 2)
        raw_current_value = round(sum(float(title.get("presentValue") or 0.0) for title in active_titles_for_target), 2)
        raw_target_value = round(float(transfer_target_value) - synthetic_active_value, 2)
        if active_titles_for_target and raw_current_value > 0 and raw_target_value > 0:
            factor = raw_target_value / raw_current_value
            for title in active_titles_for_target:
                original_acquisition = round(float(title.get("acquisitionValue") or 0.0), 2)
                original_present = round(float(title.get("presentValue") or 0.0), 2)
                scaled_acquisition = round(original_acquisition * factor, 2)
                scaled_present = round(original_present * factor, 2)
                title["transferUnscaledAcquisitionValue"] = original_acquisition
                title["transferUnscaledPresentValue"] = original_present
                title["transferInitialValueTarget"] = float(transfer_target_value)
                title["transferAllocationFactor"] = factor
                title["transferValueMethod"] = "rateio_proporcional_vp_transferencia"
                title["acquisitionValue"] = scaled_acquisition
                title["presentValue"] = scaled_present
            rounded_total = round(sum(float(title.get("presentValue") or 0.0) for title in active_titles_for_target) + synthetic_active_value, 2)
            residual = round(float(transfer_target_value) - rounded_total, 2)
            if abs(residual) >= 0.01:
                residual_title = max(active_titles_for_target, key=lambda item: float(item.get("presentValue") or 0.0))
                residual_title["acquisitionValue"] = round(float(residual_title.get("acquisitionValue") or 0.0) + residual, 2)
                residual_title["presentValue"] = round(float(residual_title.get("presentValue") or 0.0) + residual, 2)
                residual_title["transferAllocationResidual"] = residual
            adjusted_purchase_amounts = {
                str(title.get("id") or ""): round(float(title.get("acquisitionValue") or 0.0), 2)
                for title in active_titles_for_target
            }
            for event in cash_events:
                if (
                    event.get("operationId") == operation_id
                    and event.get("type") == "portfolio_purchase"
                    and str(event.get("titleId") or "") in adjusted_purchase_amounts
                ):
                    event["amount"] = adjusted_purchase_amounts[str(event.get("titleId") or "")]

    manual_adjustments = apply_manual_adjustments(operation_id, titles, cash_events)
    skipped_pre_purchase_liquidations.extend(manual_adjustments.get("skippedPrePurchaseLiquidations", []))

    titles.sort(key=lambda item: (item.get("purchaseDate") or "", item.get("maturityDate") or "", item.get("id") or ""))
    cash_events.sort(key=lambda item: (item.get("date") or "", item.get("type") or "", item.get("titleId") or ""))

    position_titles = [title for title in titles if title["isActive"]]
    title_count = len(position_titles)
    portfolio_vp = sum(title["presentValue"] for title in position_titles)
    portfolio_vn = sum(title.get("outstandingFaceValue", title["faceValue"]) for title in position_titles)
    acquisition_total = sum(title["acquisitionValue"] for title in position_titles)
    weighted_rate_monthly = (
        sum(title["presentValue"] * title["discountRateMonthly"] for title in position_titles) / portfolio_vp
        if portfolio_vp else 0.0
    )
    weighted_days = (
        sum(title["presentValue"] * max(0, title["daysToMaturity"]) for title in position_titles) / portfolio_vp
        if portfolio_vp else 0.0
    )
    overdue_vp = sum(title["presentValue"] for title in position_titles if title["daysToMaturity"] < 0)

    all_dates = [event["date"] for event in cash_events]
    if all_dates:
        start = datetime.strptime(min(all_dates), "%Y-%m-%d").date()
        end = datetime.strptime(position_date, "%Y-%m-%d").date()
    else:
        start = end = datetime.strptime(position_date, "%Y-%m-%d").date()

    daily_purchase = defaultdict(float)
    daily_liquidation = defaultdict(float)
    for event in cash_events:
        if event["type"] == "portfolio_purchase":
            daily_purchase[event["date"]] += event["amount"]
        elif event["type"] == "portfolio_liquidation":
            daily_liquidation[event["date"]] += event["amount"]

    history: list[dict[str, Any]] = []
    current = start
    while current <= end:
        key = current.isoformat()
        active_today = [
            title for title in titles
            if title.get("portfolioEligible") is not False
            and (title.get("purchaseDate") and title["purchaseDate"] <= key)
            and not title.get("settledWithoutDate")
            and not (title.get("settledDate") and title["settledDate"] <= key)
        ]
        active_vp_today = sum(accrued_value(title, key) for title in active_today)
        active_vn_today = sum(max(0.0, float(title.get("faceValue") or 0.0) - sum(
            float(item.get("amount") or 0.0)
            for item in title.get("partialLiquidations", [])
            if str(item.get("date") or "") <= key
        )) for title in active_today)
        history.append({
            "date": key,
            "purchases": round(daily_purchase[key], 2),
            "liquidations": round(daily_liquidation[key], 2),
            "activeTitles": len(active_today),
            "faceValue": round(active_vn_today, 2),
            "presentValue": round(active_vp_today, 2),
        })
        current += timedelta(days=1)

    imported_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    return {
        "updatedAt": imported_at,
        "sourceFiles": [{
            "file": path.name,
            "operationId": operation_id,
            "reportName": report_name,
            "positionDate": position_date,
            "rows": len(rows),
        }],
        "operations": [{
            "operationId": operation_id,
            "reportName": report_name,
            "positionDate": position_date,
            "sourceFile": path.name,
            "totals": {
                "rows": len(rows),
                "uniqueTitles": len(titles),
                "ignoredTitles": len(ignored_titles),
                "activeTitles": title_count,
                "settledTitles": len([title for title in titles if title.get("settledDate")]),
                "portfolioVn": round(portfolio_vn, 2),
                "portfolioVp": round(portfolio_vp, 2),
                "acquisitionValue": round(acquisition_total, 2),
                "weightedRateMonthly": weighted_rate_monthly,
                "weightedDaysToMaturity": weighted_days,
                "overdueVp": round(overdue_vp, 2),
                "cashPurchases": round(sum(event["amount"] for event in cash_events if event["type"] == "portfolio_purchase"), 2),
                "cashLiquidations": round(sum(event["amount"] for event in cash_events if event["type"] == "portfolio_liquidation"), 2),
                "manualPortfolioAdjustments": manual_adjustments["eventsApplied"],
                "manualPortfolioAdjustmentCashImpact": manual_adjustments["cashImpact"],
                "skippedPrePurchaseLiquidations": len(skipped_pre_purchase_liquidations),
                "skippedPrePurchaseLiquidationAmount": round(sum(event["amount"] for event in skipped_pre_purchase_liquidations), 2),
            },
            "titles": titles,
            "ignoredTitles": ignored_titles,
            "cashEvents": cash_events,
            "history": history,
            "manualAdjustments": manual_adjustments,
            "skippedPrePurchaseLiquidations": skipped_pre_purchase_liquidations,
        }],
    }


def write_js(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    path.write_text(f"window.ceresPortfolioData = {payload};\n", encoding="utf-8")


def operation_sort_key(operation: dict[str, Any]) -> tuple[int, str]:
    operation_id = str(operation.get("operationId") or "")
    try:
        order = OPERATION_ORDER.index(operation_id)
    except ValueError:
        order = len(OPERATION_ORDER)
    return order, operation_id


def merge_imports(imports: list[dict[str, Any]]) -> dict[str, Any]:
    operation_by_id: dict[str, dict[str, Any]] = {}
    source_files: list[dict[str, Any]] = []

    for imported in imports:
        source_files.extend(imported.get("sourceFiles", []))
        for operation in imported.get("operations", []):
            operation_id = str(operation.get("operationId") or "")
            current = operation_by_id.get(operation_id)
            if not current or str(operation.get("positionDate") or "") >= str(current.get("positionDate") or ""):
                operation_by_id[operation_id] = operation

    operations = sorted(operation_by_id.values(), key=operation_sort_key)
    latest_update = max((str(item.get("updatedAt") or "") for item in imports), default="")
    return {
        "updatedAt": latest_update or datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "sourceFiles": source_files,
        "operations": operations,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa relatorio de carteira do Confina.")
    parser.add_argument("csv_path", nargs="+", help="Caminho do CSV exportado.")
    parser.add_argument("--output", default=str(OUTPUT_PATH), help="Arquivo JS de saida.")
    parser.add_argument("--position-date", default="", help="Data-base da posicao no formato YYYY-MM-DD.")
    parser.add_argument("--summary", action="store_true", help="Mostra resumo no terminal.")
    args = parser.parse_args()

    if args.position_date:
        datetime.strptime(args.position_date, "%Y-%m-%d")

    imports = [build_import(Path(csv_path), args.position_date) for csv_path in args.csv_path]
    data = merge_imports(imports)
    write_js(Path(args.output), data)

    if args.summary:
        print(json.dumps({
            "operations": [
                {
                    "operationId": operation["operationId"],
                    "reportName": operation["reportName"],
                    "positionDate": operation["positionDate"],
                    **operation["totals"],
                }
                for operation in data["operations"]
            ],
            "output": str(Path(args.output).resolve()),
        }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
