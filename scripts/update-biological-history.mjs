import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const maxDateIndex = args.indexOf("--max-date");
const maxDate = maxDateIndex >= 0 ? String(args[maxDateIndex + 1] || "") : "";
const archiveCurrent = args.includes("--archive-current");
const preserveLots = args.includes("--preserve-lots");
const snapshotFileIndex = args.indexOf("--snapshot-file");
if (snapshotFileIndex >= 0 && (!args[snapshotFileIndex + 1] || args[snapshotFileIndex + 1].startsWith("--"))) {
  throw new Error("Informe o arquivo apos --snapshot-file.");
}
const biologicalDir = path.join(projectRoot, "data", "biological");
const historyDir = path.join(biologicalDir, "history");
const publishedCurrentFile = path.join(biologicalDir, "biological-assets-confina.js");
const currentFile = snapshotFileIndex >= 0
  ? path.resolve(projectRoot, args[snapshotFileIndex + 1])
  : publishedCurrentFile;
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

function snapshotDate(snapshot) {
  return String(snapshot?.referenceDate || snapshot?.summary?.referenceDate || "").slice(0, 10);
}

const byDate = new Map();
if (fs.existsSync(outputFile)) {
  const history = readJsObject(outputFile, "window.ceresBiologicalAssetsHistory");
  for (const snapshot of history.snapshots || []) {
    byDate.set(snapshotDate(snapshot), snapshot);
  }
}

const partnershipFile = path.join(projectRoot, "data", "portfolio", "partnership-titles-confina.js");
const partnerships = readJsObject(partnershipFile, "window.ceresPartnershipTitles");
const partnershipLastros = new Set((partnerships.titles || []).map((title) => String(title.lastro)));

function compactLots(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const meta = row[6] || {};
    const partnership = Boolean(meta.isPartnershipGuarantee) ||
      (meta.lastros || []).some((lastro) => partnershipLastros.has(String(lastro)));
    const factor = Number(meta.guaranteeFactor || (partnership ? partnerships.guaranteeFactor : 1));
    const farm = String(meta.farm || row[0]);
    const key = JSON.stringify([farm, row[1], row[4], row[5], meta.sourceVehicleName, meta.reportedOperationId, factor, Number(meta.valueOverride || 0) > 0]);
    let group = groups.get(key);
    if (!group) {
      group = { row, farm, factor, partnership, heads: 0, weight: 0, value: 0, lastros: new Set(), titles: new Set() };
      groups.set(key, group);
    }
    group.heads += Number(row[2] || 0);
    group.weight += Number(row[2] || 0) * Number(row[3] || 0);
    group.value += Number(meta.valueOverride || 0);
    (meta.lastros || []).forEach((value) => group.lastros.add(value));
    (meta.numeroTitulos || []).forEach((value) => group.titles.add(value));
  }
  return Array.from(groups.values(), (group) => {
    const [location, category, , , uf, price, meta = {}] = group.row;
    return [group.farm || location, category, group.heads, group.heads ? group.weight / group.heads : 0, uf, price, {
      farm: group.farm,
      uf: meta.uf || uf,
      sourceVehicleName: meta.sourceVehicleName,
      reportedOperationId: meta.reportedOperationId,
      bucket: meta.bucket,
      grouped: true,
      lastros: Array.from(group.lastros).sort(),
      numeroTitulos: Array.from(group.titles).sort(),
      valueOverride: group.value,
      isPartnershipGuarantee: group.partnership,
      guaranteeFactor: group.factor
    }];
  });
}

function compactSnapshot(snapshot) {
  const vehicles = (snapshot.vehicles || Object.values(snapshot.assetsByOperationId || {})).map((asset) => ({
    ...asset,
    lots: compactLots(asset.lots),
    transitLots: compactLots(asset.transitLots),
    purchasedTransitLots: compactLots(asset.purchasedTransitLots)
  }));
  return {
    ...snapshot,
    vehicles,
    assetsByOperationId: Object.fromEntries(vehicles.map((asset) => [asset.operationId, asset])),
    compacted: true,
    compactedAt: new Date().toISOString()
  };
}

// Closed snapshots come from the history file, never from temporary reprocessing.
if (fs.existsSync(historyDir)) {
  for (const name of fs.readdirSync(historyDir).sort()) {
    if (!/^biological-assets-confina.*\.js$/i.test(name)) continue;
    const snapshot = readJsObject(path.join(historyDir, name));
    const date = snapshotDate(snapshot);
    if (date && !byDate.has(date) && (!maxDate || date <= maxDate)) {
      byDate.set(date, compactSnapshot(snapshot));
    }
  }
}

const current = readJsObject(currentFile);
const currentDate = snapshotDate(current);
if (!currentDate) throw new Error("Garantia atual sem data de referencia.");
// The app prefers the full current snapshot over a compacted copy of that date.
// Preserve that effective snapshot before switching to a later composition.
if (preserveLots && currentFile !== publishedCurrentFile && fs.existsSync(publishedCurrentFile)) {
  const published = readJsObject(publishedCurrentFile);
  const publishedDate = snapshotDate(published);
  if (publishedDate && publishedDate < currentDate && (!maxDate || publishedDate <= maxDate)) {
    byDate.set(publishedDate, published);
  }
}
if (!maxDate || currentDate <= maxDate) {
  const existing = byDate.get(currentDate);
  const latestDate = Array.from(byDate.keys()).sort().at(-1);
  if (existing && archiveCurrent && currentDate !== latestDate) {
    throw new Error(`Nao e permitido substituir uma data fechada: ${currentDate}`);
  }
  if (!existing || archiveCurrent) byDate.set(currentDate, preserveLots ? current : compactSnapshot(current));
  else if (String(existing.updatedAt) !== String(current.updatedAt)) {
    throw new Error(`Garantia ${currentDate} ja arquivada. Requer revisao antes de substituir.`);
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
