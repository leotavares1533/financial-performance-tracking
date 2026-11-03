from __future__ import annotations

import argparse
import contextlib
import csv
import importlib.util
import io
import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "tmp"
DOWNLOADS = Path.home() / "Downloads"
OLD_ANIMALS = DOWNLOADS / "relatorio_GERANIMAL02 (23).csv"
ANIMALS = DOWNLOADS / "relatorio_GERANIMAL02 (24).csv"
GTA = DOWNLOADS / "Relat\u00f3rio de 42_2026-11-03T21_29_23.891Z.csv"
BASE = "2026-10-28"
EXTRACTION = "2026-11-03"
DATES = ("2026-10-29", "2026-10-30")
LIVE = {"PROCESSADO", "EM PROCESSAMENTO"}
STATUS = "STATUS ATUAL"

spec = importlib.util.spec_from_file_location("biological", ROOT / "scripts/build-biological-assets-confina.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.FUNDING_JS = WORK / "fundings-confina-20261030-candidate.js"
original_vehicle = builder.operation_from_vehicle


def operation_from_vehicle(vehicle):
    key = builder.norm(vehicle)
    if all(value in key for value in ("42", "59", "65", "out")):
        return "confina-cra-42a-59a-65a-out-2026"
    if "65" in key and "outubro" in key:
        return "confina-cra-65-outubro"
    return original_vehicle(vehicle)


def quote_lookup(quotes, target):
    rows = [row for row in quotes["historyRows"] if row["map_type"] == "regional_map" and row["quote_date"] <= target]
    selected = max(row["quote_date"] for row in rows)
    return {(row["category"], row["region"]): row["price"] for row in rows if row["quote_date"] == selected}, selected


def key(row):
    return row["SISBOV"].strip() or (row["Fazenda"], row["TAG"].strip())


def csv_reader(handle):
    return csv.DictReader(handle, delimiter=";")


def shipment_key(gta, invoice):
    return builder.digits(gta).lstrip("0"), builder.digits(invoice).lstrip("0")


def stage_animals(target, include_preexisting, previous):
    out = WORK / f"animals-asof-{target}.csv"
    stats = Counter()
    heads_by_shipment = Counter()
    seen = set()
    with ANIMALS.open(encoding="cp1252", newline="") as src, out.open("w", encoding="utf-8-sig", newline="") as dest:
        rows = csv_reader(src)
        fields = [name for name in rows.fieldnames if name]
        cols = {builder.norm(name): name for name in fields}
        columns = ("data de entrada", "data do processamento de entrada", "data de saida real",
                   "data de confirmacao de abate", "data referencia", "quantidade de dias confinado",
                   "peso projetado", "ganho medio diario")
        entry_col, processing_col, exit_col, confirm_col, ref_col, days_col, weight_col, gmd_col = [cols[name] for name in columns]
        writer = csv.DictWriter(dest, fields, delimiter=";", extrasaction="ignore")
        writer.writeheader()

        def emit(row):
            if not builder.status_bucket(row[STATUS]):
                return
            original_date = builder.parse_date(row[ref_col])
            if original_date and original_date > target:
                elapsed = (date.fromisoformat(original_date) - date.fromisoformat(target)).days
                projected = builder.number(row[weight_col])
                gmd = builder.number(row[gmd_col])
                if projected > 0 and 0 <= gmd <= 15 and projected - elapsed * gmd > 0:
                    row[weight_col] = f"{projected - elapsed * gmd:.4f}"
                days = builder.number(row[days_col])
                if days > 0:
                    row[days_col] = str(int(max(0, days - elapsed)))
            row[ref_col] = target
            writer.writerow(row)
            stats["eligibleHeads"] += 1
            stats[builder.status_bucket(row[STATUS])] += 1
            shipment = shipment_key(row["GTA"], row[cols["nota fiscal"]])
            if all(shipment):
                heads_by_shipment[shipment] += 1

        for row in rows:
            ident = key(row)
            if ident in seen:
                stats["duplicateAnimalRows"] += 1
                continue
            seen.add(ident)
            before = previous.get(ident)
            entry, processed, departed, confirmed = (builder.parse_date(row[col]) for col in (entry_col, processing_col, exit_col, confirm_col))
            if processed > EXTRACTION and before is not None:
                stats["invalidFutureProcessingDates"] += 1
                processed = ""
            effective_entry = max(entry, processed)
            if effective_entry > target:
                stats["notYetEnteredOrProcessed"] += 1
                continue
            if before is None and (not effective_entry or (effective_entry <= BASE and not include_preexisting)):
                stats["preexistingNewSourceRowsDeferred"] += 1
                continue
            current_status = row[STATUS]
            if current_status not in LIVE:
                if departed > target or (not departed and confirmed > target):
                    row[STATUS] = before[STATUS] if before is not None else "PROCESSADO"
                    stats["futureDeparturesRolledBack"] += 1
                elif current_status == "ABATIDO" and departed and confirmed > target:
                    row[STATUS] = "AGUARDANDO ABATE"
                    stats["futureSlaughterConfirmationRolledBack"] += 1
                elif not departed and not confirmed and before is not None and before[STATUS] != current_status:
                    row[STATUS] = before[STATUS]
                    stats["undatedStatusChangeDeferred"] += 1
            if before is None and builder.status_bucket(row[STATUS]):
                stats["newPreexistingEligibleHeads" if effective_entry <= BASE else "newDatedEligibleHeads"] += 1
            emit(row)
        for ident in previous.keys() - seen:
            row = previous[ident]
            if builder.parse_date(row[entry_col]) <= target and builder.status_bucket(row[STATUS]):
                stats["missingFromNewReportCarried"] += 1
                emit(dict(row))
    return out, dict(stats), heads_by_shipment


def stage_transit(target, heads_by_shipment):
    out = WORK / f"gta-asof-{target}.csv"
    stats = Counter()
    with GTA.open(encoding="cp1252", newline="") as src, out.open("w", encoding="utf-8-sig", newline="") as dest:
        rows = csv_reader(src)
        fields = [name for name in rows.fieldnames if name]
        cols = {builder.norm(name): name for name in fields}
        writer = csv.DictWriter(dest, fields, delimiter=";", extrasaction="ignore")
        writer.writeheader()
        gta_col = builder.find_col(cols, "n gta", "gta", predicate=lambda name: name.endswith("gta") and "data" not in name)
        invoice_col = builder.find_col(cols, "n nota", "nota")
        heads_col = cols["qtd animais"]
        seen = set()
        for row in rows:
            issued = builder.parse_date(row[cols["data emissao gta"]])
            arrived = builder.parse_date(row[cols["data chegada baixa"]])
            if not issued or issued > target:
                continue
            if (arrived and arrived <= target) or (not arrived and builder.norm(row["Status"]) != "em transito"):
                continue
            ident = (row["Fazenda"], row["Lastro"], row[gta_col], row[invoice_col])
            if ident in seen:
                stats["duplicatesExcluded"] += 1
                continue
            seen.add(ident)
            shipment = shipment_key(row[gta_col], row[invoice_col])
            heads = int(builder.number(row[heads_col]))
            already_counted = min(heads, heads_by_shipment[shipment]) if all(shipment) else 0
            if already_counted:
                heads_by_shipment[shipment] -= already_counted
                stats["alreadyInAnimalReportExcluded"] += already_counted
            heads -= already_counted
            if heads <= 0:
                continue
            row[heads_col] = str(heads)
            if arrived > target:
                stats["laterArrivalsReinstated"] += 1
            row["Status"] = "Em Tr\u00e2nsito"
            writer.writerow(row)
            stats["inTransitRows"] += 1
            stats["inTransitHeads"] += heads
    return out, dict(stats)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--composition", choices=("pending", "dated-only", "include-preexisting"), default="pending")
    args = parser.parse_args()
    builder.operation_from_vehicle = operation_from_vehicle
    builder.quote_lookup = quote_lookup
    with OLD_ANIMALS.open(encoding="cp1252", newline="") as handle:
        previous = {key(row): row for row in csv_reader(handle)}
    for target in DATES:
        animals, animals_stats, heads_by_shipment = stage_animals(target, args.composition == "include-preexisting", previous)
        transit, transit_stats = stage_transit(target, heads_by_shipment)
        output = WORK / f"biological-assets-confina-{target.replace('-', '')}-candidate.js"
        sys.argv = ["build-biological-assets-confina.py", "--animal-csv", str(animals), "--purchased-transit-csv", str(transit),
                    "--reference-date", target, "--portfolio-js", str(WORK / f"portfolio-guarantee-{target}.js"),
                    "--quotes-js", str(WORK / "cotacoes-pecuaria-20261030-candidate.js"),
                    "--output", str(output), "--skip-history"]
        with contextlib.redirect_stdout(io.StringIO()):
            builder.main()
        snapshot = builder.read_js_object(output, "window.ceresBiologicalAssets")
        snapshot.update(sourceFile=ANIMALS.name, purchasedTransitSourceFile=GTA.name,
                        compositionEstimated=True, sourceExtractionDate=EXTRACTION, allocationReferenceDate=target,
                        compositionReferenceDate=target, compositionPolicy=args.composition,
                        quoteUnavailableOnReferenceDate=snapshot["quoteDate"] != target,
                        reconstruction={"priorDate": BASE, "animals": animals_stats, "transit": transit_stats})
        output.write_text("window.ceresBiologicalAssets = " + json.dumps(snapshot, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
        print(json.dumps({"date": target, "quoteDate": snapshot["quoteDate"], **snapshot["reconstruction"]}))


if __name__ == "__main__":
    main()
