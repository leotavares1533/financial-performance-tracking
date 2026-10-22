import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

assert.ok(process.argv.includes("--authorized-title-revision-19"), "Requer confirmacao humana para revisar o titulo de 19/10");
const reportFile = "tmp/verified-positions-20261021.json";
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
assert.equal(report.mode, "candidate_only_not_published");
assert.equal(report.preservedHistoricalDays, 202);
assert.equal(report.authorizedHistoricalRevision.fromLastro, "555852");
assert.equal(report.authorizedHistoricalRevision.toLastro, "556254");
assert.equal(report.authorizedHistoricalRevision.effectiveDate, "2026-10-19");
assert.ok(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().startsWith(report.baseline));
const files = {
  "data/portfolio/portfolio-confina.js": "tmp/portfolio-confina-2026-10-21-candidate.js",
  "data/portfolio/portfolio-confina-frozen-2026-10-02.js": "tmp/portfolio-confina-frozen-20261021-candidate.js",
  "data/biological/biological-assets-confina.js": "tmp/biological-assets-confina-20261021-candidate.js",
  "data/biological/biological-assets-history-confina.js": "tmp/biological-assets-history-confina-20261021-candidate.js"
};
const backup = path.resolve("../outputs/processamento-confina-20261021/antes-da-atualizacao");
const hashes = {};
for (const [target, candidate] of Object.entries(files)) {
  assert.ok(fs.statSync(candidate).mtimeMs <= fs.statSync(reportFile).mtimeMs, `Candidato mudou apos a validacao: ${candidate}`);
  const archived = path.join(backup, target);
  assert.ok(!fs.existsSync(archived), `Backup ja existe: ${archived}`);
  fs.mkdirSync(path.dirname(archived), { recursive: true });
  fs.copyFileSync(target, archived);
  hashes[target] = crypto.createHash("sha256").update(fs.readFileSync(candidate)).digest("hex");
}
for (const [target, candidate] of Object.entries(files)) fs.copyFileSync(candidate, target);
const audit = JSON.parse(fs.readFileSync("tmp/audit-confina-20261021.json", "utf8"));
const extraSources = ["relatorio_GERANIMAL02 (21).csv", "Relatório de 42_2026-10-22T18_57_56.758Z.csv"].map((name) => {
  const file = path.join(os.homedir(), "Downloads", name);
  return { file, sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") };
});
const validation = { ...report, mode: "processed", appliedAt: new Date().toISOString(), sourceExtractionDate: "2026-10-22",
  sources: [...audit.sources, ...extraSources], appliedFileHashes: hashes,
  guaranteePolicy20: "Composition of 19/10 with quotation of 20/10; no backfill from report of 22/10",
  guaranteePolicy21: "GERANIMAL (21) and GTA report of 22/10 for D-1 position, quotation of 21/10",
  observedPurchase: { operationId: "confina-cprf-100", titleId: "556955", date: "2026-10-20", amount: 148830 },
  parallelControlPublished: false };
fs.writeFileSync("data/validations/processing-confina-2026-10-21.json", `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify({ applied: Object.keys(files), backup, authorizedRevision: validation.titleReplacement,
  positions: validation.positions.map(({ date, totals }) => ({ date, totals })) }, null, 2));
