import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const maxDateIndex = args.indexOf("--max-date");
const maxDate = maxDateIndex >= 0 ? String(args[maxDateIndex + 1] || "") : "";
const biologicalDir = path.join(projectRoot, "data", "biological");
const historyDir = path.join(biologicalDir, "history");
const tmpDir = path.join(projectRoot, "tmp");
const currentFile = path.join(biologicalDir, "biological-assets-confina.js");
const outputFile = path.join(biologicalDir, "biological-assets-history-confina.js");

function readJsObject(filePath, variableName = "window.ceresBiologicalAssets") {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const escaped = variableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*=\\s*(\\{[\\s\\S]*\\})\\s*;?\\s*$`));
  if (!match) {
    throw new Error(`Nao foi possivel ler ${variableName} em ${filePath}`);
  }
  return JSON.parse(match[1]);
}

function candidateFiles() {
  const files = [];
  for (const dir of [historyDir, tmpDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (/^biological-assets-confina.*\.js$/i.test(name)) {
        files.push(path.join(dir, name));
      }
    }
  }
  if (fs.existsSync(currentFile)) files.push(currentFile);
  return Array.from(new Set(files));
}

function snapshotDate(snapshot) {
  return String(snapshot?.referenceDate || snapshot?.summary?.referenceDate || "").slice(0, 10);
}

const byDate = new Map();
for (const file of candidateFiles()) {
  try {
    const snapshot = readJsObject(file);
    const date = snapshotDate(snapshot);
    if (!date) continue;
    if (maxDate && date > maxDate) continue;
    const current = byDate.get(date);
    const currentUpdatedAt = String(current?.updatedAt || "");
    const nextUpdatedAt = String(snapshot.updatedAt || "");
    if (!current || nextUpdatedAt >= currentUpdatedAt) {
      byDate.set(date, {
        ...snapshot,
        historySourceFile: file
      });
    }
  } catch (error) {
    console.warn(error.message);
  }
}

const snapshots = Array.from(byDate.entries())
  .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
  .map(([, snapshot]) => snapshot);

const payload = {
  updatedAt: new Date().toISOString(),
  referenceDates: snapshots.map((snapshot) => snapshotDate(snapshot)),
  snapshots
};

fs.mkdirSync(biologicalDir, { recursive: true });
fs.writeFileSync(
  outputFile,
  `window.ceresBiologicalAssetsHistory = ${JSON.stringify(payload, null, 2)};\n`,
  "utf8"
);

console.log(JSON.stringify({
  outputFile,
  referenceDates: payload.referenceDates,
  snapshots: snapshots.length
}, null, 2));
