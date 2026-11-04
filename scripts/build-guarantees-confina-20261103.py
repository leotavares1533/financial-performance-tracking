from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tmp"
TARGET = "2026-11-03"
spec = importlib.util.spec_from_file_location("prior_stage", ROOT / "scripts/build-guarantees-confina-20261030.py")
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)
stage.OLD_ANIMALS = stage.DOWNLOADS / "relatorio_GERANIMAL02 (24).csv"
stage.ANIMALS = stage.DOWNLOADS / "relatorio_GERANIMAL02 (25).csv"
stage.GTA = stage.DOWNLOADS / "Relat\u00f3rio de 42_2026-11-04T18_37_33.517Z.csv"
stage.BASE = "2026-10-30"
stage.EXTRACTION = "2026-11-04"
builder = stage.builder
builder.FUNDING_JS = WORK / "fundings-confina-20261103-candidate.js"
builder.operation_from_vehicle = stage.operation_from_vehicle
REGIONS = {"BA", "GO", "MT", "MS", "MG", "PA", "RO", "SP", "TO"}
REQUIRED = {(category, region) for region in REGIONS for category in ("boi", "vaca", "novilha")}


def complete_quotes(quotes, target):
    days = defaultdict(dict)
    for row in quotes["historyRows"]:
        if (row["map_type"] == "regional_map" and row["product"] == "boi_gordo"
                and row["quote_date"] <= target and (row["price"] or 0) > 0):
            days[row["quote_date"]][row["category"], row["region"]] = row["price"]
    selected = max(date for date, rows in days.items() if REQUIRED <= rows.keys())
    return days[selected], selected


def main():
    builder.quote_lookup = complete_quotes
    with stage.OLD_ANIMALS.open(encoding="cp1252", newline="") as handle:
        previous = {stage.key(row): row for row in stage.csv_reader(handle)}
    animals, stats, by_shipment = stage.stage_animals(TARGET, False, previous)
    transit, transit_stats = stage.stage_transit(TARGET, by_shipment)
    output = WORK / "biological-assets-confina-20261103-candidate.js"
    sys.argv = ["build-biological-assets-confina.py", "--animal-csv", str(animals),
                "--purchased-transit-csv", str(transit), "--reference-date", TARGET,
                "--portfolio-js", str(WORK / "portfolio-confina-20261103-candidate.js"),
                "--quotes-js", str(ROOT / "data/pecuaria/cotacoes-pecuaria-latest.js"),
                "--output", str(output), "--skip-history"]
    with contextlib.redirect_stdout(io.StringIO()):
        builder.main()
    snapshot = builder.read_js_object(output, "window.ceresBiologicalAssets")
    snapshot.update(sourceFile=stage.ANIMALS.name, purchasedTransitSourceFile=stage.GTA.name,
                    compositionEstimated=True, sourceExtractionDate=stage.EXTRACTION,
                    allocationReferenceDate=TARGET, compositionReferenceDate=TARGET,
                    compositionPolicy="dated-only", quoteUnavailableOnReferenceDate=snapshot["quoteDate"] != TARGET,
                    reconstruction={"priorDate": stage.BASE, "animals": stats, "transit": transit_stats})
    output.write_text("window.ceresBiologicalAssets = " + json.dumps(snapshot, ensure_ascii=False, indent=2) + ";\n",
                      encoding="utf-8")
    print(json.dumps({"quoteDate": snapshot["quoteDate"], **snapshot["reconstruction"]}))


if __name__ == "__main__":
    main()
