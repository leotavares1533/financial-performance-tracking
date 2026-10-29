from __future__ import annotations

import importlib.util
import contextlib
import io
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILDER_PATH = ROOT / "scripts/build-biological-assets-confina.py"
spec = importlib.util.spec_from_file_location("confina_biological_builder", BUILDER_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Construtor de garantia indisponivel: {BUILDER_PATH}")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.FUNDING_JS = ROOT / "tmp/fundings-confina-20261028-candidate.js"
original_operation_from_vehicle = builder.operation_from_vehicle


def operation_from_vehicle(vehicle: str) -> str:
    key = builder.norm(vehicle)
    if all(value in key for value in ("42", "59", "65", "out")):
        return "confina-cra-42a-59a-65a-out-2026"
    if "65" in key and "outubro" in key:
        return "confina-cra-65-outubro"
    return original_operation_from_vehicle(vehicle)


def quote_lookup(quotes: dict, target_date: str = "") -> tuple[dict, str]:
    rows = list(quotes.get("rows", [])) + list(quotes.get("historyRows", []))
    dates = {str(row.get("quote_date") or "") for row in rows
             if row.get("product") == "boi_gordo" and row.get("map_type") == "regional_map"}
    selected = max((date for date in dates if date and (not target_date or date <= target_date)), default="")
    return {(row["category"], row["region"]): builder.number(row["price"])
            for row in rows if row.get("quote_date") == selected
            and row.get("product") == "boi_gordo" and row.get("map_type") == "regional_map"}, selected


builder.operation_from_vehicle = operation_from_vehicle
builder.quote_lookup = quote_lookup
downloads = Path.home() / "Downloads"
for date in ("2026-10-26", "2026-10-27", "2026-10-28"):
    current = date == "2026-10-28"
    animal = downloads / ("relatorio_GERANIMAL02 (23).csv" if current else "relatorio_GERANIMAL02 (22).csv")
    transit = downloads / ("Relatório de 42_2026-10-29T20_43_37.377Z.csv" if current else "Relatório de 42_2026-10-26T19_00_25.756Z.csv")
    output = ROOT / f"tmp/biological-assets-confina-{date.replace('-', '')}-candidate.js"
    sys.argv = [str(BUILDER_PATH), "--animal-csv", str(animal), "--purchased-transit-csv", str(transit),
                "--reference-date", date, "--portfolio-js", str(ROOT / f"tmp/portfolio-guarantee-{date}.js"),
                "--quotes-js", str(ROOT / "tmp/cotacoes-pecuaria-20261028-candidate.js"),
                "--output", str(output), "--skip-history"]
    with contextlib.redirect_stdout(io.StringIO()):
        builder.main()
    text = output.read_text(encoding="utf-8-sig")
    snapshot = json.loads(text[text.index("=") + 1:].strip().rstrip(";"))
    snapshot["sourceExtractionDate"] = "2026-10-29" if current else "2026-10-26"
    snapshot["compositionReferenceDate"] = date if current else "2026-10-23"
    snapshot["allocationReferenceDate"] = date
    snapshot["compositionPolicy"] = "reported_D1_composition" if current else "last_known_composition_reallocated_by_titles_owned_on_reference_date"
    snapshot["dateRule"] = "D-1_business_day"
    snapshot["quotePolicy"] = "regional_bulletin_at_or_before_reference_date_never_future"
    snapshot["quoteUnavailableOnReferenceDate"] = snapshot.get("quoteDate") != date
    for asset in snapshot["vehicles"]:
        asset["compositionReferenceDate"] = snapshot["compositionReferenceDate"]
        asset["allocationReferenceDate"] = date
    snapshot["assetsByOperationId"] = {asset["operationId"]: asset for asset in snapshot["vehicles"]}
    output.write_text("window.ceresBiologicalAssets = " + json.dumps(snapshot, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    print(json.dumps({"date": date, "quoteDate": snapshot.get("quoteDate"),
                      "compositionDate": snapshot["compositionReferenceDate"],
                      "weightSources": snapshot["summary"].get("weightSources")}, ensure_ascii=True))
