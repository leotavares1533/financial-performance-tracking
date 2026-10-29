import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const date = "2026-10-28";
const cutoff = "2026-10-23";
const downloads = path.join(os.homedir(), "Downloads");
const names = [
  "Relatório Confina - CRA 42ª _59ª _65ª Out-2026.csv",
  "Relatório Confina CRAs Carteira 10_2026 (8).csv",
  "Relatório CONFINA - CRA INTERNO - 50 MM - JUNHO_2026 (17).csv",
  "Relatório Confina CRA`s Carteiras CERES (18).csv",
  "Relatório Confina BTG 50MM - ABRIL_2026 (17).csv",
  "Relatório Super CRA - CONFINA 50 MM (18).csv",
  "Relatório Confina BTG 100 MM (20).csv",
  "Relatório 65ª - Confina Outubro_2026 (3).csv",
  "Relatório 65ª - Confina CRA - SETEMBRO_2026 (15).csv",
  "Relatório 65ª - Confina CRA 80MM (17).csv",
  "Relatório 65ª - Confina CRA (24).csv",
  "Relatório 42ª_65ª CRA CONFINA 09_2026 (13).csv"
];
const normalized = (value) => value.normalize("NFC").replace(/\s+/g, " ").trim();
const files = fs.readdirSync(downloads);
const sources = names.map((name) => {
  const actual = files.find((file) => normalized(file) === normalized(name));
  if (!actual) throw new Error(`Relatorio nao encontrado: ${name}`);
  return path.join(downloads, actual);
});
const output = `tmp/portfolio-confina-${date}-raw-candidate.js`;
if (!process.argv.includes("--reuse")) {
  execFileSync(path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe"),
    ["scripts/import-confina-portfolio.py", ...sources, "--position-date", date, "--output", output], { stdio: "inherit" });
}
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const previous = read("data/portfolio/portfolio-confina.js");
const incoming = read(output);
const round = (value) => Math.round(value * 100) / 100;
const fields = ["purchaseDate", "acquisitionValue", "faceValue", "discountRateMonthly", "settledDate", "settledWithoutDate", "partialLiquidations", "portfolioEligible", "maturityDate", "accrualBaseDays", "accrualDayCount"];
const group = (events) => {
  const result = new Map();
  for (const event of events) {
    const key = JSON.stringify([event.date, event.type, event.titleId]);
    const row = result.get(key) || { date: event.date, type: event.type, titleId: event.titleId, amount: 0 };
    row.amount = round(row.amount + event.amount);
    result.set(key, row);
  }
  return result;
};
const operations = incoming.operations.map((operation) => {
  const old = previous.operations.find((row) => row.operationId === operation.operationId);
  const oldTitles = new Map((old?.titles || []).map((title) => [title.id, title]));
  const newTitles = new Map(operation.titles.map((title) => [title.id, title]));
  const changedTitles = [...new Set([...oldTitles.keys(), ...newTitles.keys()])].flatMap((id) => {
    const before = oldTitles.get(id), after = newTitles.get(id);
    const keys = fields.filter((field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field]));
    return keys.length ? [{ id, invoice: after?.invoice || before?.invoice, origin: after?.originalLastro || before?.originalLastro,
      kind: !before ? "added" : !after ? "removed" : "changed", partner: after?.sacado || before?.sacado,
      differences: Object.fromEntries(keys.map((field) => [field, { before: before?.[field] ?? null, after: after?.[field] ?? null }])) }] : [];
  });
  const beforeEvents = group(old?.cashEvents || []), afterEvents = group(operation.cashEvents);
  const events = [...new Set([...beforeEvents.keys(), ...afterEvents.keys()])].map((key) => ({ ...(afterEvents.get(key) || beforeEvents.get(key)),
    before: beforeEvents.get(key)?.amount || 0, after: afterEvents.get(key)?.amount || 0,
    delta: round((afterEvents.get(key)?.amount || 0) - (beforeEvents.get(key)?.amount || 0)) })).filter((row) => Math.abs(row.delta) > 0.01);
  return { id: operation.operationId, report: operation.reportName, oldCount: old?.titles.length || 0, newCount: operation.titles.length,
    changedTitles, retroEvents: events.filter((row) => row.date <= cutoff), newEvents: events.filter((row) => row.date > cutoff) };
});
const attachments = ["relatorio_GERANIMAL02 (23).csv", "Relatório de 42_2026-10-29T20_43_37.377Z.csv"];
const report = { baseline: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), preserveThrough: cutoff,
  sources: [...sources, ...attachments.map((name) => path.join(downloads, name))].map((file) => ({ file, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") })), operations };
fs.writeFileSync("tmp/audit-confina-20261028-raw.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(operations.map((operation) => ({ id: operation.id, oldCount: operation.oldCount, newCount: operation.newCount,
  changedTitles: operation.changedTitles.length, retroEvents: operation.retroEvents,
  additions: operation.changedTitles.filter((row) => row.kind === "added").map((row) => ({ id: row.id, origin: row.origin, purchase: row.differences.purchaseDate?.after, acquisition: row.differences.acquisitionValue?.after })),
  newEventTotals: Object.fromEntries([...new Set(operation.newEvents.map((row) => `${row.date} ${row.type}`))].map((key) => [key, round(operation.newEvents.filter((row) => `${row.date} ${row.type}` === key).reduce((sum, row) => sum + row.delta, 0))])) })), null, 2));
