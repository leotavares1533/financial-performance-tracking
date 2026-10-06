from __future__ import annotations

import csv
import datetime as dt
import json
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tmp" / "datagro-screen-quotes-2026-10-01.json"
HISTORY = Path.home() / "Downloads" / "serie-historica-2026-01-01-2026-09-30.csv"
QUOTE_DATE = "2026-10-01"
SOURCE_URL = "https://www.indicadordoboi.com.br/pt-br#bulletin"
collected_at = dt.datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds")
rows: list[dict] = []

regional = {
    "boi": [("BA",335.94,-0.98,65.03),("GO",348.16,0.20,67.39),("MT",343.50,1.05,66.49),("MS",360.35,0.10,69.75),("MG",353.41,0.04,68.41),("PA",350.96,0.45,67.94),("RO",346.61,0.81,67.09),("SP",365.40,0.50,70.73),("TO",348.35,-0.33,67.43)],
    "vaca": [("BA",316.61,0.00,61.29),("GO",326.35,-0.10,63.17),("MT",315.49,-0.28,61.07),("MS",337.68,0.29,65.37),("MG",329.74,-0.64,63.83),("PA",335.89,0.39,65.02),("RO",313.46,0.18,60.68),("SP",333.02,-0.03,64.46),("TO",325.74,-0.43,63.05)],
    "novilha": [("BA",326.96,0.09,63.29),("GO",334.80,-0.81,64.81),("MT",323.96,0.21,62.71),("MS",347.04,1.40,67.18),("MG",330.00,0.00,63.88),("PA",328.80,0.23,63.65),("RO",322.20,-0.12,62.37),("SP",348.66,-0.45,67.49),("TO",336.47,1.41,65.13)],
}
for category, values in regional.items():
    for i, (uf, price, variation, reference) in enumerate(values):
        rows.append({"map_type":"regional_map","product":"boi_gordo","category":category,"region":uf,"row_index":i,"column_index":0,"price":price,"variation_percent":variation,"reference_value":reference,"unit":"R$/@","raw_price":f"{price:.2f}","raw_variation":f"{variation:.2f}%","raw_reference":f"{reference:.2f}"})

replacement_columns = ["macho_desmama","macho_bezerro","macho_garrote","macho_boi_magro","femea_desmama","femea_bezerra","femea_novilha","femea_vaca_magra"]
replacement = {
    "nelore": [("SP",[17.83,16.34,14.49,13.67,15.82,15.17,13.88,13.11]),("MG",[16.45,15.48,13.79,13.19,14.85,13.84,12.39,11.67]),("MS",[19.24,17.26,15.14,13.50,15.40,13.81,13.06,12.27]),("MT",[18.28,17.05,15.08,13.60,14.82,14.01,12.27,11.89]),("GO",[17.85,16.18,13.83,13.29,14.47,13.75,12.26,11.67]),("TO",[17.45,15.71,14.50,13.27,15.83,14.37,13.28,11.96]),("PA",[16.40,15.03,13.95,12.83,14.20,13.73,11.31,10.86]),("PR",[17.63,16.60,15.27,14.17,16.53,14.58,13.72,13.09]),("RS",[22.76,20.40,18.28,16.65,19.12,17.51,15.68,14.64]),("RO",[16.35,14.97,13.49,12.97,13.66,12.42,11.30,10.64])],
    "anelorado": [("SP",[17.29,15.51,13.62,12.85,15.15,14.14,12.83,11.50]),("MG",[16.16,14.73,13.62,12.23,13.82,12.68,11.50,10.42]),("MS",[16.13,14.82,13.49,12.72,14.55,13.15,11.69,10.79]),("MT",[16.47,15.14,13.45,12.52,14.51,12.72,11.50,10.58]),("GO",[18.67,16.76,14.73,12.89,15.52,13.89,12.40,11.67]),("PR",[18.22,16.56,14.91,14.03,15.58,14.30,12.83,12.04]),("RS",[20.59,18.50,16.70,15.61,17.36,15.76,14.50,13.04])],
    "cruzamento_industrial": [("SP",[19.44,17.28,15.58,14.83,15.84,14.67,14.58,14.28]),("MG",[18.46,17.07,15.62,14.56,16.08,14.63,13.18,12.40]),("MS",[19.05,17.47,15.77,14.54,16.48,15.31,13.93,12.59]),("MT",[18.88,17.50,15.83,14.91,16.46,14.19,13.04,12.48]),("GO",[18.52,16.63,15.00,14.39,15.04,14.60,14.05,13.62]),("PR",[21.50,19.65,18.01,16.72,18.59,16.90,14.92,13.82]),("RS",[23.81,22.17,19.16,18.35,20.27,18.84,16.52,15.21])],
}
for category, values in replacement.items():
    for row_index, (uf, prices) in enumerate(values):
        for column_index, (column, price) in enumerate(zip(replacement_columns, prices)):
            rows.append({"map_type":"replacement_grid","product":"reposicao","category":category,"region":uf,"subregion":column,"row_index":row_index,"column_index":column_index,"price":price,"unit":"R$/kg","raw_price":f"{price:.2f}"})

mt = {"boi_mt":[340.13,344.45,347.39,339.82],"vaca_mt":[317.59,313.11,310.37,315.86],"novilha_mt":[327.39,320.78,324.11,320.94]}
for category, prices in mt.items():
    for i, (subregion, price) in enumerate(zip(["N (Norte)","NE (Nordeste)","S (Sul)","SE (Sudeste)"], prices)):
        rows.append({"map_type":"mt_bulletin","product":"boi_gordo","category":category,"region":"MT","subregion":subregion,"row_index":i,"column_index":0,"price":price,"unit":"R$/@","raw_price":f"{price:.2f}"})

with HISTORY.open(encoding="utf-8-sig", newline="") as f:
    for i, record in enumerate(csv.DictReader(f)):
        date = dt.datetime.strptime(record["Data"], "%d/%m/%Y").date().isoformat()
        price = float(record["Boi São Paulo R$/@"].replace(",", "."))
        rows.append({"map_type":"historical_series","product":"boi_gordo","category":"boi","region":"SP","subregion":"São Paulo","row_index":i,"column_index":0,"quote_date":date,"price":price,"unit":"R$/@","raw_price":record["Boi São Paulo R$/@"],"code":"boi_sp"})

OUT.write_text(json.dumps({"quote_date":QUOTE_DATE,"collected_at":collected_at,"source_url":SOURCE_URL,"rows":rows}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote {OUT} rows={len(rows)} collected_at={collected_at}")
