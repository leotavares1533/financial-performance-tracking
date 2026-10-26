import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const downloads = path.join(os.homedir(), "Downloads");
const names = [
  "Relatório Confina CRAs Carteira 10_2026  (6).csv",
  "Relatório CONFINA - CRA INTERNO - 50 MM - JUNHO_2026 (16).csv",
  "Relatório Confina CRA`s Carteiras CERES  (17).csv",
  "Relatório Confina BTG 50MM - ABRIL_2026 (16).csv",
  "Relatório Super CRA - CONFINA 50 MM (17).csv",
  "Relatório Confina BTG 100 MM (19).csv",
  "Relatório 65ª - Confina Outubro_2026 (2).csv",
  "Relatório 65ª - Confina CRA - SETEMBRO_2026 (14).csv",
  "Relatório 65ª - Confina CRA 80MM (16).csv",
  "Relatório 65ª - Confina CRA (23).csv",
  "Relatório 42ª_65ª CRA CONFINA 09_2026 (12).csv"
];
const normalize = (value) => value.normalize("NFC").replace(/\s+/g, " ").trim();
const available = fs.readdirSync(downloads);
const sources = names.map((name) => {
  const actual = available.find((file) => normalize(file) === normalize(name));
  if (!actual) throw new Error(`Relatorio nao encontrado: ${name}`);
  return path.join(downloads, actual);
});
const output = "tmp/portfolio-confina-2026-10-23-raw-candidate.js";
if (!process.argv.includes("--reuse")) execFileSync(path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"),
  ["scripts/import-confina-portfolio.py", ...sources, "--position-date", "2026-10-23", "--output", output], { stdio: "inherit" });
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const previous = read("data/portfolio/portfolio-confina.js"), incoming = read(output);
const round = (value) => Math.round(value * 100) / 100;
const keys = ["purchaseDate", "acquisitionValue", "faceValue", "discountRateMonthly", "settledDate", "settledWithoutDate", "partialLiquidations", "portfolioEligible", "maturityDate", "accrualBaseDays", "accrualDayCount"];
const operations = incoming.operations.map((op) => {
  const old = previous.operations.find((row) => row.operationId === op.operationId);
  const oldTitles = new Map(old.titles.map((title) => [title.id, title]));
  const newTitles = new Map(op.titles.map((title) => [title.id, title]));
  const changedTitles = [...new Set([...oldTitles.keys(), ...newTitles.keys()])].flatMap((id) => {
    const before = oldTitles.get(id), after = newTitles.get(id);
    const fields = keys.filter((key) => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]));
    return fields.length ? [{ id, invoice: after?.invoice || before?.invoice, originalLastro: after?.originalLastro || before?.originalLastro,
      kind: !before ? "added" : !after ? "removed" : "changed", partner: after?.sacado || before?.sacado,
      differences: Object.fromEntries(fields.map((key) => [key, { before: before?.[key] ?? null, after: after?.[key] ?? null }])) }] : [];
  });
  const group = (events) => {
    const totals = new Map();
    for (const event of events) {
      const key = JSON.stringify([event.date, event.type, event.titleId]);
      const row = totals.get(key) || { date: event.date, type: event.type, titleId: event.titleId, amount: 0 };
      row.amount = round(row.amount + event.amount); totals.set(key, row);
    }
    return totals;
  };
  const before = group(old.cashEvents), after = group(op.cashEvents);
  const events = [...new Set([...before.keys(), ...after.keys()])].map((key) => ({ ...(after.get(key) || before.get(key)),
    before: before.get(key)?.amount || 0, after: after.get(key)?.amount || 0,
    delta: round((after.get(key)?.amount || 0) - (before.get(key)?.amount || 0)) })).filter((row) => Math.abs(row.delta) > 0.01);
  return { id: op.operationId, report: op.reportName, oldCount: old.titles.length, newCount: op.titles.length,
    changedTitles, retroEvents: events.filter((row) => row.date <= "2026-10-21"), newEvents: events.filter((row) => row.date > "2026-10-21") };
});
const report = { baseline: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), preserveThrough: "2026-10-21",
  sources: sources.map((file) => ({ file, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") })), operations };
fs.writeFileSync("tmp/audit-confina-20261023-raw.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(operations.map((op) => ({ ...op, changedTitles: undefined,
  changedTitleCount: op.changedTitles.length, added: op.changedTitles.filter((row) => row.kind === "added").map((row) => ({ id: row.id, origin: row.originalLastro, invoice: row.invoice, purchase: row.differences.purchaseDate?.after, acquisition: row.differences.acquisitionValue?.after })) })), null, 2));
