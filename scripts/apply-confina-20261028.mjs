import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const report = JSON.parse(fs.readFileSync("tmp/verified-positions-20261028.json", "utf8"));
assert.equal(report.mode, "candidate");
assert.equal(report.status, "verified", "Ha amortizacoes aguardando confirmacao de destino. Nao alterar os dados oficiais.");
assert.equal(report.ledger.pending.length, 0);
assert.equal(report.positions.length, 3);
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), report.baseline, "A versao oficial mudou durante a conferencia.");
for (const source of report.sources) assert.equal(sha(source.file), source.sha256, `Relatorio alterado durante a conferencia: ${source.file}`);
for (const [target, candidate] of Object.entries(report.candidateHashes)) {
  assert.equal(sha(candidate.file), candidate.sha256, `Candidato mudou depois da validacao: ${candidate.file}`);
  assert.equal(sha(target), candidate.originalSha256, `Arquivo oficial mudou durante a conferencia: ${target}`);
}
const backup = path.resolve("../outputs/processamento-confina-20261028/antes-da-atualizacao");
for (const [target, candidate] of Object.entries(report.candidateHashes)) {
  const preserved = path.join(backup, target);
  fs.mkdirSync(path.dirname(preserved), { recursive: true });
  if (fs.existsSync(preserved)) assert.equal(sha(preserved), candidate.originalSha256);
  else fs.copyFileSync(target, preserved);
}
for (const [target, candidate] of Object.entries(report.candidateHashes)) fs.copyFileSync(candidate.file, target);
const audit = "data/validations/processing-confina-2026-10-28.json";
const { parallel, ...publicReport } = report;
fs.writeFileSync(path.resolve("../outputs/processamento-confina-20261028/validacao-interna.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(audit, `${JSON.stringify({ ...publicReport, mode: "official", appliedAt: new Date().toISOString(),
  parallelValidation: { status: "verified_local_only", closedThrough: "2026-10-28", privateLedgerPublished: false } }, null, 2)}\n`);
console.log(JSON.stringify({ applied: Object.keys(report.candidateHashes), backup, audit, dates: report.positions.map((row) => row.date) }));
