import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const downloads = path.join(os.homedir(), "Downloads");
const filenames = [
  "Relatório Confina CRAs Carteira 10_2026  (5).csv",
  "Relatório CONFINA - CRA INTERNO - 50 MM - JUNHO_2026 (15).csv",
  "Relatório Confina CRA`s Carteiras CERES  (16).csv",
  "Relatório Confina BTG 50MM - ABRIL_2026 (15).csv",
  "Relatório Super CRA - CONFINA 50 MM (16).csv",
  "Relatório Confina BTG 100 MM (18).csv",
  "Relatório 65ª - Confina Outubro_2026 (1).csv",
  "Relatório 65ª - Confina CRA - SETEMBRO_2026 (13).csv",
  "Relatório 65ª - Confina CRA 80MM (15).csv",
  "Relatório 65ª - Confina CRA (22).csv",
  "Relatório 42ª_65ª CRA CONFINA 09_2026 (11).csv"
];
const normalizeFilename = (value) => value.normalize("NFC").replace(/\s+/g, " ").trim();
const available = fs.readdirSync(downloads);
const sources = filenames.map((name) => {
  const actual = available.find((item) => normalizeFilename(item) === normalizeFilename(name));
  if (!actual) throw new Error(`Relatorio nao encontrado: ${name}`);
  return path.join(downloads, actual);
});
const candidateFile = "tmp/portfolio-confina-2026-10-21-candidate.js";
if (!process.argv.includes("--reuse-candidate")) {
  const python = path.join(os.homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe");
  execFileSync(python, ["scripts/import-confina-portfolio.py", ...sources,
    "--position-date", "2026-10-21", "--output", candidateFile], { stdio: "inherit" });
}
const parse = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^[\s\S]*?=\s*/, "").replace(/;\s*$/, ""));
const previous = parse("data/portfolio/portfolio-confina.js");
const candidate = parse(candidateFile);
const files = [...fs.readFileSync("index.html", "utf8").matchAll(/<script src="\.\/([^"?]+)/g)]
  .map((match) => match[1]).filter((file) => !/^data\/(biological|pecuaria)\//.test(file));
function load(next) {
  const context = vm.createContext({ console, Date, Intl, URLSearchParams,
    window: { location: { search: "" }, ceresFinanceEngineOnly: true },
    document: { getElementById: () => null, querySelectorAll: () => [] }
  });
  for (const file of files) vm.runInContext(fs.readFileSync(next && file === "data/portfolio/portfolio-confina.js" ? candidateFile : file, "utf8"), context, { filename: file });
  return context;
}
const before = load(false), after = load(true);
const evaluate = (context, code) => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
const money = (number) => Math.round(number * 100) / 100;
const position = (context, date) => evaluate(context, `operations.map(op=>({
  id:op.id,name:op.shortName,vp:roundMoney(operationPortfolioPositionAtDate(op,'${date}').portfolioVp),
  cash:cashBalanceAtDate(op,'${date}'),funding:fundingBalanceAtDate(op,'${date}'),sub:syntheticAtDate(op,'${date}')
}))`);
const financialChanges = [];
for (const date of evaluate(before, "calendarDatesBetween('2026-10-05','2026-10-19')")) {
  const oldRows = position(before, date), newRows = position(after, date);
  for (const old of oldRows) {
    const next = newRows.find((row) => row.id === old.id);
    const delta = Object.fromEntries(["vp", "cash", "funding", "sub"].map((key) => [key, money(next[key] - old[key])]));
    if (Object.values(delta).some((value) => Math.abs(value) > 0.01)) financialChanges.push({ date, operationId: old.id, name: old.name, before: old, after: next, delta });
  }
}
const fields = ["acquisitionValue", "faceValue", "purchaseDate", "settledDate", "settledWithoutDate", "discountRateMonthly", "accrualBaseDays", "accrualDayCount", "portfolioEligible", "partialLiquidations", "maturityDate"];
function eventTotals(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = JSON.stringify([event.date, event.type, event.titleId]);
    const current = grouped.get(key) || { date: event.date, type: event.type, titleId: event.titleId, amount: 0 };
    current.amount = money(current.amount + event.amount);
    grouped.set(key, current);
  }
  return grouped;
}
const operations = candidate.operations.map((next) => {
  const old = previous.operations.find((row) => row.operationId === next.operationId);
  const oldTitles = new Map((old?.titles || []).map((title) => [title.id, title]));
  const nextTitles = new Map(next.titles.map((title) => [title.id, title]));
  const changed = [];
  for (const id of new Set([...oldTitles.keys(), ...nextTitles.keys()])) {
    const original = oldTitles.get(id), title = nextTitles.get(id);
    const differences = fields.filter((key) => JSON.stringify(original?.[key]) !== JSON.stringify(title?.[key]));
    if (!differences.length) continue;
    const values = {};
    for (const [label, context, item] of [["before", before, original], ["after", after, title]]) {
      context.auditTitle = item || null;
      values[label] = item ? evaluate(context, "roundMoney(portfolioTitleValueAtDate(auditTitle,'2026-10-19','2026-10-19'))") : 0;
    }
    changed.push({ id, partner: title?.sacado || original?.sacado,
      kind: !original ? "added" : !title ? "removed" : "changed",
      differences: Object.fromEntries(differences.map((key) => [key, { before: original?.[key] ?? null, after: title?.[key] ?? null }])),
      vp19: values, deltaVp19: money(values.after - values.before) });
  }
  const oldEvents = eventTotals(old?.cashEvents || []), newEvents = eventTotals(next.cashEvents);
  const eventChanges = [...new Set([...oldEvents.keys(), ...newEvents.keys()])].map((key) => {
    const original = oldEvents.get(key), event = newEvents.get(key);
    return { ...(event || original), beforeAmount: original?.amount || 0, afterAmount: event?.amount || 0,
      delta: money((event?.amount || 0) - (original?.amount || 0)) };
  }).filter((event) => Math.abs(event.delta) > 0.01).sort((a, b) => a.date.localeCompare(b.date));
  return { operationId: next.operationId, reportName: next.reportName, beforeCount: old?.titles.length || 0,
    afterCount: next.titles.length, totals: next.totals, changedTitles: changed,
    retroactiveEventChanges: eventChanges.filter((event) => event.date < "2026-10-20"),
    currentEventChanges: eventChanges.filter((event) => event.date >= "2026-10-20") };
});
const report = { baseline: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  referenceDates: ["2026-10-20", "2026-10-21"], preserveThroughDate: "2026-10-19",
  sources: sources.map((file) => ({ file, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") })),
  financialChanges, operations,
  candidatePositions: ["2026-10-20", "2026-10-21"].map((date) => ({ date, operations: position(after, date) })) };
fs.writeFileSync("tmp/audit-confina-20261021.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ baseline: report.baseline,
  changesAt19: financialChanges.filter((row) => row.date === "2026-10-19"),
  operations: operations.map((row) => ({ id: row.operationId, beforeCount: row.beforeCount, afterCount: row.afterCount,
    changedTitles: row.changedTitles.length, retroactiveEvents: row.retroactiveEventChanges, currentEvents: row.currentEventChanges })) }, null, 2));
