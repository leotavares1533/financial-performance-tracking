import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const report = JSON.parse(fs.readFileSync("tmp/verified-positions-20261023.json", "utf8"));
assert.equal(report.mode, "candidate");
assert.equal(report.pendingPm149, false, "Falta confirmar o funding da amortizacao PM149 de R$ 890.795,01");
assert.equal(report.authorizedRevision.authorizationDate, "2026-10-26");
assert.equal(report.historicalDaysChecked, 204);
assert.ok(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim().startsWith(report.baseline));
const manualTarget = "data/portfolio/manual-portfolio-adjustments-confina.json";
const manualSource = "tmp/manual-portfolio-adjustments-20261023-candidate.json";
const pairs = Object.entries(report.candidateHashes).map(([target, row]) => {
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(row.file)).digest("hex"), row.sha256, `Candidato mudou apos validacao: ${target}`);
  return [target, row.file];
});
pairs.push([manualTarget, manualSource]);
const backup = path.resolve("../outputs/processamento-confina-20261023/antes-da-atualizacao");
for (const [target] of pairs) {
  const archived = path.join(backup, target);
  assert.ok(!fs.existsSync(archived), `Backup ja existe: ${archived}`);
  fs.mkdirSync(path.dirname(archived), { recursive: true });
  fs.copyFileSync(target, archived);
}
for (const [target, source] of pairs) fs.copyFileSync(source, target);
const rawAudit = JSON.parse(fs.readFileSync("tmp/audit-confina-20261023-raw.json", "utf8"));
const validation = { ...report, mode: "processed", appliedAt: new Date().toISOString(), sourceExtractionDate: "2026-10-26",
  sources: rawAudit.sources, quoteCollection: "Rendered DATAGRO regional bulletins for 23/10, read on 26/10",
  guarantee22: "Animals and GTA last known on 21/10, reallocated using titles owned on 22/10, with quotation of 22/10",
  guarantee23: "GERANIMAL (22) and GTA report of 26/10, D-1 business position, quotation of 23/10",
  authorizedHistoricalChangesOnly: true, sourceImagesRoundingDifference: { ramax: -0.01 },
  appliedFileHashes: Object.fromEntries(pairs.map(([target]) => [target, crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex")])) };
fs.writeFileSync("data/validations/processing-confina-2026-10-23.json", `${JSON.stringify(validation, null, 2)}\n`);
console.log(JSON.stringify({ applied: pairs.map(([target]) => target), backup,
  pendingPm149: false, pm149Target: report.ledger.pm149Target, positions: report.positions.map(({ date, totals }) => ({ date, totals })) }, null, 2));
