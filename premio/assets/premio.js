const PREMIUM_DEFAULT_MONTHLY_RATE = 0.0195;
const PREMIUM_DEFAULT_GTA_COST = 442.61;
const PREMIUM_DEFAULT_TAG_COST = 2.5;
const PREMIUM_DEFAULT_MONITORING_FEE_RATE = 0.0075;
const PREMIUM_PARTNER_FEE_RATES = [
  ["CONFINAMENTO GUARUJA", 0.0075],
  ["EDUARDO SCANNAVINO DE QUEIROZ", 0.0075],
  ["FABIO SCHIMITT", 0.0075],
  ["FABIO SCHMITT", 0.0075],
  ["FABIO SCHIMTT", 0.0075],
  ["ALIMENTOS ESTRELA", 0],
  ["BOIPREMIUM FRILEM", 0],
  ["GREEN FARMING FAZENDAS RENOVAVEIS LTDA", 0.0075],
  ["PEDRO RIBEIRO MEROLA", 0],
  ["RAMAX IMPORTACAO E EXPORTACAO DE ALIMENTOS LTDA", 0],
  ["STEFAN ZEMBROD", 0],
  ["FAZENDA RIO MADEIRA ROVEMA", 0.0025],
  ["JOSE FAVARETTO 3M", 0.0025],
  ["VICTOR RORATTO AGUA LIMPA", 0.0025],
  ["VITOR RORATTO AGUA LIMPA", 0.0025],
  ["SEBASTIAO FERNANDES LAGE FAZCARNE", 0.0025],
  ["CAPITAR GUILHERME", 0],
  ["FERNANDO SISTO ARANTES AGRO SAO JOAO", 0.0075],
  ["PAULO HENRIQUE QUEIROZ NUTRITAURUS", 0.005],
  ["ADAM PERRONE SAMMOUR 3I BANDEIRANTES", 0]
];
const PREMIUM_EXAMPLE_PRICE_BY_DATE = {
  "2026-08-19": 1511462.09 / 225,
  "2026-08-21": 574673.49 / 96,
  "2026-08-27": 6423.91,
  "2026-08-28": 6929.42
};
const PREMIUM_TERM_DEFAULTS = [
  {
    title: "JF012026",
    displayTitle: "JF012026-1",
    issueDate: "2026-05-20",
    monthlyRate: 0.0195,
    costPerHead: 4593.98,
    heads: 148,
    deaths: 0
  },
  {
    title: "JF022026",
    displayTitle: "JF022026-1",
    issueDate: "2026-05-21",
    monthlyRate: 0.0195,
    costPerHead: 4513.73,
    heads: 1006,
    deaths: 4
  },
  {
    title: "JF032026",
    displayTitle: "JF032026-1",
    issueDate: "2026-05-22",
    monthlyRate: 0.0195,
    costPerHead: 4434.55,
    heads: 138,
    deaths: 1
  },
  {
    title: "JF042026",
    displayTitle: "JF042026-1",
    issueDate: "2026-05-25",
    monthlyRate: 0.0195,
    costPerHead: 5000,
    heads: 308,
    deaths: 2
  },
  {
    title: "JF052026",
    displayTitle: "JF052026-1",
    issueDate: "2026-05-26",
    monthlyRate: 0.0195,
    costPerHead: 4078.61,
    heads: 1502,
    deaths: 9
  },
  {
    title: "JF062026",
    displayTitle: "JF062026-1",
    issueDate: "2026-05-26",
    monthlyRate: 0.0195,
    costPerHead: 4765.33,
    heads: 540,
    deaths: 3
  },
  {
    title: "JF072026",
    displayTitle: "JF072026-1",
    issueDate: "2026-05-27",
    monthlyRate: 0.0195,
    costPerHead: 4963.36,
    heads: 286,
    deaths: 0
  }
];

const formatCurrency = (value, digits = 0) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });

const formatNumber = (value, digits = 0) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });

const formatDate = (dateKey) => {
  if (!dateKey) return "-";
  const [year, month, day] = String(dateKey).split("-");
  if (!year || !month || !day) return "-";
  return `${day}/${month}/${year}`;
};

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const normalizeKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");

const PREMIUM_FIELD_ALIASES = {
  "Fazenda": ["FAZENDA"],
  "Lote": ["LOTE"],
  "Lastro": ["LASTRO"],
  "STATUS ATUAL": ["STATUS ATUAL"],
  "Parceiro": ["PARCEIRO", "NOME PARCEIRO", "NOME DO PARCEIRO", "CEDENTE", "PRODUTOR", "FORNECEDOR"],
  "Número do título": ["NUMERO DO TITULO", "N MERO DO T TULO", "NÚMERO DO TÍTULO", "N�MERO DO T�TULO", "N TITULO", "NO TITULO", "N DO TITULO", "NUM TITULO", "NUM. TITULO", "TITULO", "TÍTULO"],
  "Termo / NF": ["TERMO", "TERMO NF", "TERMO NUMERO DA NF", "NUMERO DA NF", "N MERO DA NF", "NUMERO NF", "NF", "NOTA FISCAL", "NOTA", "NUMERO NOTA FISCAL", "NUMERO DA NOTA", "NUMERO DA NOTA FISCAL", "N NOTA", "N NOTA FISCAL"],
  "Data de confirmação de abate": [
    "DATA DE CONFIRMACAO DE ABATE",
    "DATA DE CONFIRMA O DE ABATE",
    "DATA DE CONFIRMAÇÃO DE ABATE",
    "DATA DE CONFIRMA��O DE ABATE",
    "DATA DO ABATE",
    "DT ABATE"
  ],
  "Data de pagamento": ["DATA DE PAGAMENTO", "DATA PAGAMENTO", "DT PAGAMENTO", "DT PGTO", "DATA PGT ABATE", "PAGAMENTO DATA"],
  "Data de entrada": ["DATA DE ENTRADA"],
  "Dia do lote": ["DIA DO LOTE", "DATA DO LOTE", "DT LOTE", "DATA LOTE", "DATA DE AQUISICAO", "DATA AQUISICAO", "DT AQUISICAO", "DATA AQUISICAO FUNDO", "DT AQUISICAO FUNDO"],
  "Peso de carcaça": ["PESO DE CARCACA", "PESO DE CARCA A", "PESO DE CARCAÇA", "PESO DE CARCA�A"],
  "Quantidade de animais": ["QUANTIDADE DE ANIMAIS", "QTD ANIMAIS", "QTD. ANIMAIS", "QTDE ANIMAIS", "QTD CABECAS", "QTD. CABECAS", "CABECAS", "ANIMAIS", "QTD"],
  "Valor Pago": ["VALOR PAGO", "PGT ABATE", "PGT DE ABATE", "PAGAMENTO ABATE", "ABATE"],
  "Preço/cabeça": ["PRECO CABECA", "PRECO CB", "CB R", "CB R$", "PREÇO CABEÇA", "PREÇO/CABEÇA"],
  "Valor de aquisição por cabeça": ["VALOR DE AQUISICAO POR CABECA", "VALOR AQUISICAO POR CABECA", "VALOR AQUISICAO CABECA", "VALOR DE AQUISIÇÃO POR CABEÇA", "VA CABECA", "CUSTO CABECA", "CUSTO/CABECA", "PRECO AQUISICAO CABECA", "PRECO DE AQUISICAO POR CABECA"],
  "Taxa de cessão": ["TAXA DE CESSAO", "TX CESSAO", "TAXA CESSAO", "TAXA DE CESSÃO", "TAXA MES", "TAXA A M", "TAXA AM", "TAXA"],
  "VP na data do abate": ["VP NA DATA DO ABATE", "VP DATA ABATE", "VP ABATE", "VALOR PRESENTE NA DATA DO ABATE", "VALOR PRESENTE ABATE", "VP SISTEMA", "VP CALCULADO SISTEMA"],
  "Fee monitoramento": ["FEE MONITORAMENTO", "FEE DE MONITORAMENTO", "TAXA MONITORAMENTO", "FEE"]
};

const buildTermDefaultsByTitle = (defaults) => defaults.reduce((acc, row) => {
  acc[normalizeKey(row.title)] = row;
  return acc;
}, {});

let premiumTermDefaultsByTitle = buildTermDefaultsByTitle(PREMIUM_TERM_DEFAULTS);

const parseDateKey = (dateKey) => {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const dateDiffDays = (startKey, endKey) => {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
};

const parseBrazilianDateKey = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) return excelSerialToDateKey(value);
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

function excelSerialToDateKey(serial) {
  const number = Number(serial);
  if (!Number.isFinite(number) || number <= 0) return "";
  const utc = Math.round((number - 25569) * 86400000);
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function parsePtNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const cleaned = text
    .replace(/[R$%\s]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function parsePercentRate(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const number = parsePtNumber(text);
  if (!Number.isFinite(number)) return 0;
  if (text.includes("%") || number > 1) return number / 100;
  return number;
}

function premiumPartnerFeeRate(partner) {
  const key = normalizeKey(partner);
  if (!key) return null;
  const match = PREMIUM_PARTNER_FEE_RATES.find(([name]) => {
    const normalizedName = normalizeKey(name);
    return key === normalizedName || key.includes(normalizedName) || normalizedName.includes(key);
  });
  return match ? match[1] : null;
}

function parseDelimitedText(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      row.push(value);
      value = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => String(cell).trim())) rows.push(row);
      row = [];
      value = "";
      continue;
    }
    value += char;
  }
  row.push(value);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  return rows;
}

function premiumRowValue(row, field) {
  const keys = [field, normalizeKey(field), ...(PREMIUM_FIELD_ALIASES[field] || [])];
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return "";
}

function normalizePremiumTitle(value) {
  return normalizeKey(String(value || "").replace(/-\d+$/g, ""));
}

function normalizePremiumStatus(value) {
  return normalizeKey(value).replace(/\s+/g, "_");
}

function premiumTermDefault(title) {
  return premiumTermDefaultsByTitle[normalizePremiumTitle(title)] || null;
}

function normalizePremiumCsvRecord(raw) {
  const normalized = {};
  Object.entries(raw).forEach(([key, value]) => {
    normalized[key] = value;
    normalized[normalizeKey(key)] = value;
  });
  const title = String(premiumRowValue(normalized, "Número do título") || "").trim();
  const term = String(premiumRowValue(normalized, "Termo / NF") || title).trim();
  const quantity = parsePtNumber(premiumRowValue(normalized, "Quantidade de animais"));
  const paymentAmount = parsePtNumber(premiumRowValue(normalized, "Valor Pago"));
  const pricePerHeadRaw = premiumRowValue(normalized, "Preço/cabeça");
  const acquisitionValuePerHeadRaw = premiumRowValue(normalized, "Valor de aquisição por cabeça");
  const assignmentRateRaw = premiumRowValue(normalized, "Taxa de cessão");
  const pricePerHead = parsePtNumber(pricePerHeadRaw);
  const partner = String(premiumRowValue(normalized, "Parceiro") || "").trim();
  const feeRaw = premiumRowValue(normalized, "Fee monitoramento");
  const reportFeeRate = feeRaw !== "" ? parsePercentRate(feeRaw) : null;
  return {
    farm: String(premiumRowValue(normalized, "Fazenda") || "").trim(),
    lot: String(premiumRowValue(normalized, "Lote") || "").trim(),
    partner,
    term,
    termKey: normalizeKey(term || title),
    title,
    titleKey: normalizePremiumTitle(title || term),
    lastro: String(premiumRowValue(normalized, "Lastro") || "").trim(),
    status: String(premiumRowValue(normalized, "STATUS ATUAL") || "").trim(),
    statusKey: normalizePremiumStatus(premiumRowValue(normalized, "STATUS ATUAL")),
    abateDate: parseBrazilianDateKey(premiumRowValue(normalized, "Data de confirmação de abate")),
    paymentDate: parseBrazilianDateKey(premiumRowValue(normalized, "Data de pagamento")),
    entryDate: parseBrazilianDateKey(premiumRowValue(normalized, "Data de entrada")),
    lotDate: parseBrazilianDateKey(premiumRowValue(normalized, "Dia do lote")),
    carcassWeight: parsePtNumber(premiumRowValue(normalized, "Peso de carcaça")),
    headCount: quantity > 0 ? quantity : 1,
    paymentAmount,
    pricePerHead,
    hasPricePerHead: pricePerHeadRaw !== "",
    acquisitionValuePerHead: parsePtNumber(acquisitionValuePerHeadRaw),
    hasAcquisitionValuePerHead: acquisitionValuePerHeadRaw !== "",
    assignmentRate: parsePercentRate(assignmentRateRaw),
    hasAssignmentRate: assignmentRateRaw !== "",
    systemVpAtAbate: parsePtNumber(premiumRowValue(normalized, "VP na data do abate")),
    reportFeeRate: reportFeeRate ?? premiumPartnerFeeRate(partner),
    raw: normalized
  };
}

function isKnownPremiumHeader(value) {
  const key = normalizeKey(value);
  return Object.entries(PREMIUM_FIELD_ALIASES).some(([field, aliases]) =>
    key === normalizeKey(field) || aliases.includes(key)
  );
}

function premiumHeaderScore(row) {
  return row.reduce((score, cell) => score + (isKnownPremiumHeader(cell) ? 1 : 0), 0);
}

function premiumRecordsFromMatrix(matrix) {
  if (!matrix.length) return [];
  const headerIndex = Math.max(0, matrix.findIndex((row) => premiumHeaderScore(row) >= 4));
  const headers = matrix[headerIndex].map((header) => String(header || "").trim());
  return matrix.slice(headerIndex + 1)
    .map((cells) => {
      const raw = {};
      headers.forEach((header, index) => {
        if (!header) return;
        raw[header] = cells[index] ?? "";
      });
      return normalizePremiumCsvRecord(raw);
    })
    .filter((row) => row.farm || row.term || row.title || row.lot);
}

function parsePremiumCsv(text) {
  const firstLine = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiter = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows = parseDelimitedText(String(text || ""), delimiter);
  return premiumRecordsFromMatrix(rows);
}

function xlsxColumnIndex(cellRef) {
  const letters = String(cellRef || "").match(/[A-Z]+/i)?.[0] || "A";
  return letters.toUpperCase().split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

async function xlsxXml(zip, path) {
  const file = zip.file(path);
  if (!file) return null;
  const text = await file.async("text");
  return new DOMParser().parseFromString(text, "application/xml");
}

function xlsxTextContent(node) {
  return Array.from(node.querySelectorAll("t")).map((item) => item.textContent || "").join("");
}

async function xlsxSharedStrings(zip) {
  const xml = await xlsxXml(zip, "xl/sharedStrings.xml");
  if (!xml) return [];
  return Array.from(xml.querySelectorAll("si")).map(xlsxTextContent);
}

async function xlsxWorkbookSheets(zip) {
  const workbook = await xlsxXml(zip, "xl/workbook.xml");
  const rels = await xlsxXml(zip, "xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) return [];
  const relTargetById = {};
  Array.from(rels.querySelectorAll("Relationship")).forEach((rel) => {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target") || "";
    if (!id || !target) return;
    relTargetById[id] = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^xl\//, "")}`;
  });
  return Array.from(workbook.querySelectorAll("sheet")).map((sheet) => {
    const relId = sheet.getAttribute("r:id") || sheet.getAttribute("id");
    return {
      name: sheet.getAttribute("name") || "",
      path: relTargetById[relId] || ""
    };
  }).filter((sheet) => sheet.path);
}

function xlsxCellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return xlsxTextContent(cell);
  const value = cell.querySelector("v")?.textContent || "";
  if (type === "s") return sharedStrings[Number(value)] || "";
  if (type === "str") return value;
  const number = Number(value);
  return value !== "" && Number.isFinite(number) ? number : value;
}

async function xlsxSheetMatrix(zip, sheet, sharedStrings) {
  const xml = await xlsxXml(zip, sheet.path);
  if (!xml) return [];
  return Array.from(xml.querySelectorAll("sheetData row")).map((row) => {
    const values = [];
    Array.from(row.querySelectorAll("c")).forEach((cell) => {
      values[xlsxColumnIndex(cell.getAttribute("r"))] = xlsxCellValue(cell, sharedStrings);
    });
    return values;
  });
}

function xlsxAbateDateForColumn(rows, rowIndex, colIndex) {
  for (let row = rowIndex; row >= 0; row -= 1) {
    for (let col = Math.max(0, colIndex - 2); col <= colIndex + 2; col += 1) {
      const value = rows[row]?.[col];
      const text = String(value || "");
      const match = text.match(/ABATE\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (match) return parseBrazilianDateKey(match[1]);
    }
  }
  return "";
}

function xlsxBlockValue(rows, startRow, labelCol, label) {
  const target = normalizeKey(label);
  for (let row = startRow; row < Math.min(rows.length, startRow + 8); row += 1) {
    for (let col = Math.max(0, labelCol - 1); col <= labelCol + 1; col += 1) {
      if (normalizeKey(rows[row]?.[col]) === target) return rows[row]?.[col + 1];
    }
  }
  return "";
}

function xlsxPriceByDateFromSheets(sheets) {
  const grouped = {};
  sheets.forEach((sheet) => {
    sheet.rows.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (normalizeKey(cell) !== "VALOR PAGO") return;
        const dateKey = xlsxAbateDateForColumn(sheet.rows, rowIndex, colIndex);
        const payment = parsePtNumber(row[colIndex + 1]);
        const heads = parsePtNumber(xlsxBlockValue(sheet.rows, rowIndex, colIndex, "Qtd. Animais"));
        const unitPrice = parsePtNumber(xlsxBlockValue(sheet.rows, rowIndex, colIndex, "CB/R$"));
        if (!dateKey || (!payment && !unitPrice)) return;
        grouped[dateKey] = grouped[dateKey] || { payment: 0, heads: 0, price: 0 };
        grouped[dateKey].payment += payment;
        grouped[dateKey].heads += heads;
        if (unitPrice) grouped[dateKey].price = unitPrice;
      });
    });
  });
  return Object.fromEntries(Object.entries(grouped).map(([dateKey, row]) => [
    dateKey,
    row.payment > 0 && row.heads > 0 ? row.payment / row.heads : row.price
  ]).filter(([, price]) => Number.isFinite(price) && price > 0));
}

async function parsePremiumXlsx(buffer) {
  if (!window.JSZip) throw new Error("Leitor de Excel indisponivel");
  const zip = await JSZip.loadAsync(buffer);
  const sharedStrings = await xlsxSharedStrings(zip);
  const workbookSheets = await xlsxWorkbookSheets(zip);
  const sheets = [];
  for (const sheet of workbookSheets) {
    sheets.push({
      name: sheet.name,
      rows: await xlsxSheetMatrix(zip, sheet, sharedStrings)
    });
  }
  return {
    rows: sheets.flatMap((sheet) => premiumRecordsFromMatrix(sheet.rows)),
    priceByDate: xlsxPriceByDateFromSheets(sheets)
  };
}

function readFileBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

function decodedCsvText(buffer) {
  const bytes = new Uint8Array(buffer);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const latin = new TextDecoder("iso-8859-1").decode(bytes);
  const score = (text) => (text.match(/\uFFFD|Ã|Â/g) || []).length;
  return score(utf8) <= score(latin) ? utf8 : latin;
}

async function parsePremiumFile(file) {
  const buffer = await readFileBuffer(file);
  const name = String(file.name || "").toLowerCase();
  if (name.endsWith(".xlsx")) return parsePremiumXlsx(buffer);
  if (name.endsWith(".xls")) {
    throw new Error("Arquivo .xls antigo nao abre aqui. Salve como .xlsx ou CSV e suba novamente.");
  }
  return {
    rows: parsePremiumCsv(decodedCsvText(buffer)),
    priceByDate: {}
  };
}

const premiumState = {
  rows: [],
  fileName: "",
  selectedFarm: "",
  selectedDate: "",
  paymentDate: "",
  paymentAmount: 0,
  allocationPaymentAmount: 0,
  allocationGtaCost: 0,
  pricePerHead: 0,
  paymentDateTouched: false,
  paymentTouched: false,
  priceTouched: false,
  monthlyRate: PREMIUM_DEFAULT_MONTHLY_RATE,
  gtaCost: PREMIUM_DEFAULT_GTA_COST,
  tagCostPerHead: PREMIUM_DEFAULT_TAG_COST,
  monitoringFeeRate: PREMIUM_DEFAULT_MONITORING_FEE_RATE,
  priceByDate: { ...PREMIUM_EXAMPLE_PRICE_BY_DATE },
  rowOverrides: {}
};

const nodes = {
  status: document.getElementById("premium-status"),
  fileInput: document.getElementById("premium-file-input"),
  farmFilter: document.getElementById("premium-farm-filter"),
  dateFilter: document.getElementById("premium-date-filter"),
  paymentDateInput: document.getElementById("premium-payment-date-input"),
  paymentInput: document.getElementById("premium-payment-input"),
  priceHeadInput: document.getElementById("premium-price-head-input"),
  monthlyRateInput: document.getElementById("premium-monthly-rate-input"),
  gtaInput: document.getElementById("premium-gta-input"),
  tagInput: document.getElementById("premium-tag-input"),
  monitoringFeeInput: document.getElementById("premium-monitoring-fee-input"),
  kpis: document.getElementById("premium-kpis"),
  allocationPanel: document.getElementById("premium-allocation-panel"),
  allocationSubtitle: document.getElementById("premium-allocation-subtitle"),
  allocationPaymentInput: document.getElementById("premium-allocation-payment-input"),
  allocationGtaInput: document.getElementById("premium-allocation-gta-input"),
  allocationTable: document.getElementById("premium-allocation-table"),
  memorySubtitle: document.getElementById("premium-memory-subtitle"),
  memoryTable: document.getElementById("premium-memory-table"),
  lotTable: document.getElementById("premium-lot-table"),
  printButton: document.getElementById("print-button")
};

function premiumFarmOptions() {
  const counts = premiumState.rows.reduce((acc, row) => {
    if (!row.farm) return acc;
    acc[row.farm] = (acc[row.farm] || 0) + 1;
    return acc;
  }, {});
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, "pt-BR"));
}

function premiumRowReferenceDate(row) {
  return row.abateDate || "";
}

function premiumRowIsAbated(row) {
  if (!premiumRowReferenceDate(row)) return false;
  if (!row.statusKey) return true;
  return row.statusKey === "ABATIDO" || row.statusKey.includes("ABAT");
}

function premiumDateOptions() {
  return Array.from(new Set(premiumState.rows
    .filter(premiumRowIsAbated)
    .map(premiumRowReferenceDate)
    .filter(Boolean)))
    .sort()
    .reverse();
}

function syncInput(node, value) {
  if (!node || document.activeElement === node) return;
  node.value = value || "";
}

function applyPremiumDateDefaultPrice() {
  if (premiumState.priceTouched || premiumState.paymentTouched) return;
  premiumState.pricePerHead = premiumState.priceByDate[premiumState.selectedDate] || 0;
}

function premiumSelectedAnimalRows() {
  if (!premiumState.selectedDate) return [];
  return premiumState.rows.filter((row) =>
    premiumRowReferenceDate(row) === premiumState.selectedDate &&
    premiumRowIsAbated(row)
  );
}

function premiumPaymentDateFromSelectedRows() {
  const dates = Array.from(new Set(premiumSelectedAnimalRows()
    .map((row) => row.paymentDate)
    .filter(Boolean)))
    .sort();
  return dates.length === 1 ? dates[0] : "";
}

function premiumDeathCountByTitle() {
  const deaths = {};
  premiumState.rows
    .filter((row) => row.termKey || row.titleKey)
    .filter((row) => row.statusKey.includes("MORTE") || row.statusKey === "MORTO")
    .forEach((row) => {
      const key = row.titleKey || row.termKey;
      deaths[key] = (deaths[key] || 0) + 1;
    });
  return deaths;
}

function premiumGroupRows() {
  const grouped = new Map();
  premiumSelectedAnimalRows().forEach((row) => {
    const titleKey = row.titleKey || row.termKey || "SEM TITULO";
    const key = [
      normalizeKey(row.farm || "SEM FAZENDA"),
      titleKey
    ].join("__");
    const current = grouped.get(key) || {
      key,
      farm: row.farm || "-",
      term: row.term || row.title || "-",
      termKey: row.termKey,
      terms: new Set(),
      lot: row.lot || "-",
      title: row.title || "-",
      titleKey,
      lastros: new Set(),
      lots: new Set(),
      titles: new Set(),
      partners: new Set(),
      paymentDates: new Set(),
      heads: 0,
      carcassWeight: 0,
      paymentAmount: 0,
      weightedPricePerHead: 0,
      priceWeight: 0,
      weightedAcquisitionCost: 0,
      acquisitionCostWeight: 0,
      weightedAssignmentRate: 0,
      assignmentRateWeight: 0,
      systemVpAtAbate: 0,
      reportFeeRate: null,
      rows: []
    };
    current.terms.add(row.term || "-");
    current.lastros.add(row.lastro || "-");
    current.lots.add(row.lot || "-");
    current.titles.add(row.title || "-");
    if (row.partner) current.partners.add(row.partner);
    if (row.paymentDate) current.paymentDates.add(row.paymentDate);
    const heads = Number(row.headCount || 1);
    current.heads += heads;
    current.carcassWeight += Number(row.carcassWeight || 0);
    current.paymentAmount += Number(row.paymentAmount || 0);
    current.systemVpAtAbate += Number(row.systemVpAtAbate || 0);
    if (row.hasPricePerHead) {
      current.weightedPricePerHead += Number(row.pricePerHead || 0) * heads;
      current.priceWeight += heads;
    }
    if (row.hasAcquisitionValuePerHead) {
      current.weightedAcquisitionCost += Number(row.acquisitionValuePerHead || 0) * heads;
      current.acquisitionCostWeight += heads;
    }
    if (row.hasAssignmentRate) {
      current.weightedAssignmentRate += Number(row.assignmentRate || 0) * heads;
      current.assignmentRateWeight += heads;
    }
    if (row.reportFeeRate !== null && row.reportFeeRate !== undefined) current.reportFeeRate = Number(row.reportFeeRate || 0);
    current.rows.push(row);
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) =>
    `${a.farm}-${a.title}-${a.term}`.localeCompare(`${b.farm}-${b.title}-${b.term}`, "pt-BR")
  );
}

function premiumLotRows() {
  const grouped = new Map();
  premiumSelectedAnimalRows().forEach((row) => {
    const key = `${row.farm}__${row.titleKey || row.termKey}__${row.lastro}__${row.lot}`;
    const current = grouped.get(key) || {
      farm: row.farm,
      term: row.term || row.title || "-",
      termKey: row.termKey,
      title: row.title || "-",
      titleKey: row.titleKey || row.termKey,
      lastro: row.lastro || "-",
      lot: row.lot || "-",
      partner: row.partner || "-",
      paymentDates: new Set(),
      heads: 0,
      carcassWeight: 0,
      paymentAmount: 0,
      systemVpAtAbate: 0
    };
    if (row.paymentDate) current.paymentDates.add(row.paymentDate);
    current.heads += Number(row.headCount || 1);
    current.carcassWeight += Number(row.carcassWeight || 0);
    current.paymentAmount += Number(row.paymentAmount || 0);
    current.systemVpAtAbate += Number(row.systemVpAtAbate || 0);
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) =>
    `${a.farm}-${a.title}-${a.lot}`.localeCompare(`${b.farm}-${b.title}-${b.lot}`, "pt-BR")
  );
}

function premiumPriceFromRows(groups) {
  const explicitPrice = groups
    .flatMap((group) => group.rows)
    .map((row) => Number(row.pricePerHead || 0))
    .find((value) => Number.isFinite(value) && value > 0);
  if (explicitPrice) return explicitPrice;
  const payment = groups
    .flatMap((group) => group.rows)
    .reduce((sum, row) => sum + Number(row.paymentAmount || 0), 0);
  const heads = groups.reduce((sum, group) => sum + Number(group.heads || 0), 0);
  return payment > 0 && heads > 0 ? payment / heads : 0;
}

function premiumWeightedAverage(total, weight) {
  return Number(weight || 0) > 0 ? Number(total || 0) / Number(weight || 0) : 0;
}

function premiumInputMoneyValue(value) {
  const number = Number(value || 0);
  return number
    ? number.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "";
}

function premiumAllocationRows(groups) {
  const totalHeads = groups.reduce((sum, group) => sum + Number(group.heads || 0), 0);
  if (groups.length <= 1 || totalHeads <= 0) return [];

  const totalPayment = Number(premiumState.allocationPaymentAmount || 0);
  const totalGta = Number(premiumState.allocationGtaCost || 0);
  let paymentRunning = 0;
  let gtaRunning = 0;

  return groups.map((group, index) => {
    const defaults = premiumTermDefault(group.title || group.term);
    const share = Number(group.heads || 0) / totalHeads;
    const isLast = index === groups.length - 1;
    const paymentAmount = totalPayment > 0
      ? (isLast ? roundMoney(totalPayment - paymentRunning) : roundMoney(totalPayment * share))
      : 0;
    const gtaCost = totalGta > 0
      ? (isLast ? roundMoney(totalGta - gtaRunning) : roundMoney(totalGta * share))
      : 0;

    paymentRunning = roundMoney(paymentRunning + paymentAmount);
    gtaRunning = roundMoney(gtaRunning + gtaCost);

    return {
      key: group.key,
      title: group.title && group.title !== "-" ? group.title : defaults?.displayTitle || group.term || "-",
      heads: Number(group.heads || 0),
      share,
      paymentAmount,
      gtaCost
    };
  });
}

function premiumNumberOverride(titleKey, field, fallback) {
  const value = Number(premiumState.rowOverrides[titleKey]?.[field]);
  return Number.isFinite(value) ? value : fallback;
}

function premiumHasOverride(rowKey, field) {
  return Object.prototype.hasOwnProperty.call(premiumState.rowOverrides[rowKey] || {}, field);
}

function premiumTextOverride(rowKey, field, fallback = "") {
  return premiumHasOverride(rowKey, field) ? String(premiumState.rowOverrides[rowKey][field] || "") : fallback;
}

function premiumCalculatedRows() {
  const groups = premiumGroupRows();
  const fallbackPricePerHead = premiumPriceFromRows(groups);
  const deathCounts = premiumDeathCountByTitle();
  const allocationRows = premiumAllocationRows(groups);
  const allocationByKey = new Map(allocationRows.map((row) => [row.key, row]));

  return groups.map((group) => {
    const defaults = premiumTermDefault(group.title || group.term);
    const overrideKey = group.key;
    const allocation = allocationByKey.get(overrideKey);
    const issueDate = group.rows
      .map((row) => row.lotDate || row.entryDate)
      .filter(Boolean)
      .sort()[0] || defaults?.issueDate || premiumState.selectedDate;
    const reportCostPerHead = premiumWeightedAverage(group.weightedAcquisitionCost, group.acquisitionCostWeight);
    const reportAssignmentRate = premiumWeightedAverage(group.weightedAssignmentRate, group.assignmentRateWeight);
    const monthlyRate = premiumNumberOverride(overrideKey, "monthlyRate", group.assignmentRateWeight ? reportAssignmentRate : defaults?.monthlyRate || premiumState.monthlyRate || PREMIUM_DEFAULT_MONTHLY_RATE);
    const dailyRate = Math.pow(1 + monthlyRate, 1 / 30) - 1;
    const reportPaymentDatesLabel = Array.from(group.paymentDates).filter(Boolean).sort().map(formatDate).join(", ");
    const paymentDate = premiumTextOverride(overrideKey, "paymentDate", Array.from(group.paymentDates).filter(Boolean).sort()[0] || "");
    const paymentDatesLabel = paymentDate ? formatDate(paymentDate) : reportPaymentDatesLabel;
    const periodEndDate = paymentDate || premiumState.selectedDate;
    const periodEndLabel = paymentDate ? "pagamento" : "abate sem data de pagamento";
    const days = Math.max(0, dateDiffDays(issueDate, periodEndDate));
    const periodRate = Math.pow(1 + dailyRate, days) - 1;
    const costPerHead = premiumNumberOverride(overrideKey, "costPerHead", group.acquisitionCostWeight ? reportCostPerHead : defaults?.costPerHead || 0);
    const deaths = premiumNumberOverride(overrideKey, "deaths", Math.max(Number(defaults?.deaths || 0), Number(deathCounts[group.titleKey] || deathCounts[group.termKey] || 0)));
    const hasManualGta = premiumHasOverride(overrideKey, "gtaCost");
    const hasManualPayment = premiumHasOverride(overrideKey, "paymentAmount");
    const allocatedPaymentAmount = Number(allocation?.paymentAmount || 0);
    const allocatedGtaCost = Number(allocation?.gtaCost || 0);
    const hasAllocatedPayment = !hasManualPayment && allocatedPaymentAmount > 0;
    const hasAllocatedGta = !hasManualGta && allocatedGtaCost > 0;
    const gtaCost = premiumNumberOverride(overrideKey, "gtaCost", allocatedGtaCost || 0);
    const monitoringFeeRate = premiumNumberOverride(overrideKey, "monitoringFeeRate", group.reportFeeRate ?? 0);
    const reportPricePerHead = premiumWeightedAverage(group.weightedPricePerHead, group.priceWeight);
    const paymentAmount = premiumNumberOverride(overrideKey, "paymentAmount", allocatedPaymentAmount || group.paymentAmount || 0);
    const pricePerHead = reportPricePerHead || (paymentAmount && group.heads ? paymentAmount / group.heads : 0) || fallbackPricePerHead;
    const grossPrincipal = roundMoney(group.heads * costPerHead);
    const calculatedVpAtAbate = roundMoney(grossPrincipal * (1 + periodRate));
    const systemVpAtAbate = roundMoney(group.systemVpAtAbate);
    const vpDifference = systemVpAtAbate ? roundMoney(systemVpAtAbate - calculatedVpAtAbate) : 0;
    const revenue = roundMoney(paymentAmount > 0 ? paymentAmount : group.heads * pricePerHead);
    const principal = roundMoney(-grossPrincipal);
    const operationCost = roundMoney(-(calculatedVpAtAbate - grossPrincipal));
    const gta = roundMoney(-gtaCost);
    const tags = roundMoney(-group.heads * premiumState.tagCostPerHead);
    const monitoringFee = roundMoney(-calculatedVpAtAbate * monitoringFeeRate);
    const deathCost = roundMoney(-deaths * costPerHead * (1 + periodRate));
    const premium = roundMoney(revenue + principal + operationCost + gta + tags + monitoringFee + deathCost);
    const partnersLabel = Array.from(group.partners).filter(Boolean).join(", ");
    return {
      ...group,
      overrideKey,
      displayTitle: group.title && group.title !== "-" ? group.title : defaults?.displayTitle || group.term,
      issueDate,
      paymentDate,
      paymentDatesLabel,
      periodEndDate,
      periodEndLabel,
      days,
      monthlyRate,
      periodRate,
      pricePerHead,
      costPerHead,
      deaths,
      gtaCost,
      hasManualGta,
      hasManualPayment,
      hasAllocatedGta,
      hasAllocatedPayment,
      allocatedGtaCost,
      allocatedPaymentAmount,
      allocationShare: Number(allocation?.share || 0),
      paymentAmount,
      revenue,
      principal,
      operationCost,
      gta,
      tags,
      monitoringFeeRate,
      monitoringFee,
      deathCost,
      calculatedVpAtAbate,
      systemVpAtAbate,
      vpDifference,
      premium,
      amortization: roundMoney(revenue - premium),
      partnersLabel,
      termsLabel: Array.from(group.terms).filter(Boolean).join(", "),
      lotsLabel: Array.from(group.lots).filter(Boolean).join(", "),
      lastrosLabel: Array.from(group.lastros).filter(Boolean).join(", "),
      titlesLabel: Array.from(group.titles).filter(Boolean).join(", ")
    };
  });
}

function premiumTotals(rows) {
  return rows.reduce((total, row) => ({
    heads: total.heads + row.heads,
    deaths: total.deaths + Number(row.deaths || 0),
    revenue: total.revenue + row.revenue,
    principal: total.principal + row.principal,
    operationCost: total.operationCost + row.operationCost,
    gta: total.gta + row.gta,
    tags: total.tags + row.tags,
    monitoringFee: total.monitoringFee + row.monitoringFee,
    deathCost: total.deathCost + row.deathCost,
    calculatedVpAtAbate: total.calculatedVpAtAbate + row.calculatedVpAtAbate,
    systemVpAtAbate: total.systemVpAtAbate + row.systemVpAtAbate,
    vpDifference: total.vpDifference + row.vpDifference,
    premium: total.premium + row.premium,
    amortization: total.amortization + row.amortization
  }), {
    heads: 0,
    deaths: 0,
    revenue: 0,
    principal: 0,
    operationCost: 0,
    gta: 0,
    tags: 0,
    monitoringFee: 0,
    deathCost: 0,
    calculatedVpAtAbate: 0,
    systemVpAtAbate: 0,
    vpDifference: 0,
    premium: 0,
    amortization: 0
  });
}

function signedClass(value) {
  const number = Number(value || 0);
  if (number > 0) return "positive";
  if (number < 0) return "negative";
  return "";
}

function premiumInputCell(row, field, value, step = "0.01", blankWhenZero = false) {
  const digits = step === "1" ? 0 : 2;
  const numericValue = Number(value || 0);
  const inputValue = blankWhenZero && !numericValue ? "" : numericValue.toFixed(digits);
  return `<input class="inline-number premium-row-input" data-premium-key="${escapeHtml(row.overrideKey)}" data-premium-field="${field}" type="number" step="${step}" value="${inputValue}">`;
}

function premiumDateInputCell(row, field, value) {
  return `<input class="inline-date premium-row-input" data-premium-key="${escapeHtml(row.overrideKey)}" data-premium-field="${field}" type="date" value="${escapeHtml(value || "")}">`;
}

function premiumStatementLine(label, value, options = {}) {
  const { note = "", className = "", valueClass = "" } = options;
  return `
    <div class="statement-line ${className}">
      <span>
        ${escapeHtml(label)}
        ${note ? `<small>${escapeHtml(note)}</small>` : ""}
      </span>
      <strong class="${valueClass}">${value}</strong>
    </div>
  `;
}

function premiumStatementInputLine(row, label, field, value, step = "0.01", note = "") {
  return `
    <div class="statement-line is-editable">
      <span>
        ${escapeHtml(label)}
        ${note ? `<small>${escapeHtml(note)}</small>` : ""}
      </span>
      ${premiumInputCell(row, field, value, step)}
    </div>
  `;
}

function premiumStatementOptionalInputLine(row, label, field, value, step = "0.01", note = "", blankWhenZero = true) {
  return `
    <div class="statement-line is-editable">
      <span>
        ${escapeHtml(label)}
        ${note ? `<small>${escapeHtml(note)}</small>` : ""}
      </span>
      ${premiumInputCell(row, field, value, step, blankWhenZero)}
    </div>
  `;
}

function premiumStatementDateInputLine(row, label, field, value, note = "") {
  return `
    <div class="statement-line is-editable">
      <span>
        ${escapeHtml(label)}
        ${note ? `<small>${escapeHtml(note)}</small>` : ""}
      </span>
      ${premiumDateInputCell(row, field, value)}
    </div>
  `;
}

function premiumStatement(row) {
  const vpMatchClass = Math.abs(row.vpDifference || 0) <= 1 ? "positive" : signedClass(row.vpDifference);
  const paymentNote = row.hasAllocatedPayment ? "rateado por cabecas" : "";
  const gtaNote = row.hasAllocatedGta ? "rateado por cabecas" : "";
  return `
    <article class="premium-statement">
      <div class="premium-statement-head">
        <div>
          <strong>${escapeHtml(row.displayTitle)}</strong>
          <span>Lotes ${escapeHtml(row.lotsLabel || "-")} · Lastros ${escapeHtml(row.lastrosLabel || "-")}</span>
        </div>
        <b>${formatNumber(row.heads)} cab.</b>
      </div>
      <div class="statement-meta">
        <span>Parceiro ${escapeHtml(row.partnersLabel || "-")}</span>
        <span>Termo/NF ${escapeHtml(row.termsLabel || row.term || "-")}</span>
        <span>Data lote ${row.issueDate ? formatDate(row.issueDate) : "-"}</span>
        <span>${formatNumber(row.days)} dias</span>
        <span>${formatCurrency(row.pricePerHead, 2)}/cab.</span>
      </div>
      <div class="statement-lines">
        ${premiumStatementDateInputLine(row, "Data pagamento", "paymentDate", row.paymentDate)}
        ${premiumStatementOptionalInputLine(row, "Valor pago", "paymentAmount", row.paymentAmount, "0.01", paymentNote, !row.hasManualPayment && !row.paymentAmount)}
        ${premiumStatementOptionalInputLine(row, "Custo GTA", "gtaCost", row.gtaCost, "0.01", gtaNote, !row.hasManualGta && !row.gtaCost)}
        ${premiumStatementLine("Receita total", formatCurrency(row.revenue, 2), { className: "is-result", valueClass: "positive" })}
        ${premiumStatementLine("Valor aquis./cabeca", row.costPerHead ? formatCurrency(row.costPerHead, 2) : "-", { valueClass: row.costPerHead ? "" : "negative" })}
        ${premiumStatementLine("Taxa de cessao", `${formatNumber(row.monthlyRate * 100, 4)}% a.m.`, { note: `ate ${row.periodEndLabel} em ${formatDate(row.periodEndDate)} · periodo ${formatNumber(row.periodRate * 100, 2)}%` })}
        ${premiumStatementLine("Principal", formatCurrency(row.principal, 2), { valueClass: "negative", note: "quantidade x aquisicao/cabeca" })}
        ${premiumStatementLine("Custo da operacao", formatCurrency(row.operationCost, 2), { valueClass: "negative" })}
        ${premiumStatementLine("VP calculado no pagamento", formatCurrency(row.calculatedVpAtAbate, 2), { note: "principal atualizado pela taxa de cessao" })}
        ${premiumStatementLine("VP sistema no abate", row.systemVpAtAbate ? formatCurrency(row.systemVpAtAbate, 2) : "-", { valueClass: row.systemVpAtAbate ? "" : "negative" })}
        ${premiumStatementLine("Diferenca VP", row.systemVpAtAbate ? formatCurrency(row.vpDifference, 2) : "-", { className: "is-check", valueClass: row.systemVpAtAbate ? vpMatchClass : "negative" })}
        ${premiumStatementInputLine(row, "Mortes", "deaths", row.deaths, "1")}
        ${premiumStatementLine("Custo mortes", formatCurrency(row.deathCost, 2), { valueClass: "negative" })}
        ${premiumStatementLine("Brincos", formatCurrency(row.tags, 2), { valueClass: "negative", note: "R$ 2,50 fixo por cabeca" })}
        ${premiumStatementLine("Fee monitoramento", formatCurrency(row.monitoringFee, 2), { valueClass: "negative", note: `${formatNumber(row.monitoringFeeRate * 100, 2)}% parceiro` })}
        ${premiumStatementLine("Premio", formatCurrency(row.premium, 2), { className: "is-result", valueClass: signedClass(row.premium) })}
        ${premiumStatementLine("Amortizacao", formatCurrency(row.amortization, 2), { className: "is-result" })}
      </div>
      <div class="statement-foot">Composicao: lotes ${escapeHtml(row.lotsLabel || "-")}</div>
    </article>
  `;
}

function premiumTotalStatement(totals) {
  return `
    <article class="premium-statement is-total">
      <div class="premium-statement-head">
        <div>
          <strong>Total</strong>
          <span>Consolidado da evidencia</span>
        </div>
        <b>${formatNumber(totals.heads)} cab.</b>
      </div>
      <div class="statement-lines">
        ${premiumStatementLine("Receita total", formatCurrency(totals.revenue, 2), { className: "is-result", valueClass: "positive" })}
        ${premiumStatementLine("Principal", formatCurrency(totals.principal, 2), { valueClass: "negative" })}
        ${premiumStatementLine("Custo da operacao", formatCurrency(totals.operationCost, 2), { valueClass: "negative" })}
        ${premiumStatementLine("VP calculado no pagamento", formatCurrency(totals.calculatedVpAtAbate, 2), {})}
        ${premiumStatementLine("VP sistema no abate", totals.systemVpAtAbate ? formatCurrency(totals.systemVpAtAbate, 2) : "-", {})}
        ${premiumStatementLine("Diferenca VP", totals.systemVpAtAbate ? formatCurrency(totals.vpDifference, 2) : "-", { className: "is-check", valueClass: totals.systemVpAtAbate ? signedClass(totals.vpDifference) : "negative" })}
        ${premiumStatementLine("Mortes", formatNumber(totals.deaths), {})}
        ${premiumStatementLine("Custo mortes", formatCurrency(totals.deathCost, 2), { valueClass: "negative" })}
        ${premiumStatementLine("GTA", formatCurrency(totals.gta, 2), { valueClass: "negative" })}
        ${premiumStatementLine("Brincos", formatCurrency(totals.tags, 2), { valueClass: "negative" })}
        ${premiumStatementLine("Fee monitoramento", formatCurrency(totals.monitoringFee, 2), { valueClass: "negative" })}
        ${premiumStatementLine("Premio", formatCurrency(totals.premium, 2), { className: "is-result", valueClass: signedClass(totals.premium) })}
        ${premiumStatementLine("Amortizacao", formatCurrency(totals.amortization, 2), { className: "is-result" })}
      </div>
    </article>
  `;
}

function premiumFarmSections(rows) {
  const grouped = rows.reduce((acc, row) => {
    const farm = row.farm || "Sem fazenda";
    acc[farm] = acc[farm] || [];
    acc[farm].push(row);
    return acc;
  }, {});
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([farm, farmRows]) => {
      const totals = premiumTotals(farmRows);
      return `
        <section class="premium-farm-group">
          <div class="premium-farm-head">
            <strong>${escapeHtml(farm)}</strong>
            <span>${formatNumber(totals.heads)} cabecas · ${formatCurrency(totals.revenue, 2)} pagos · ${formatCurrency(totals.premium, 2)} premio</span>
          </div>
          <div class="premium-memory-grid">
            ${farmRows.map(premiumStatement).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderPremiumFilters() {
  const dates = premiumDateOptions();
  if (!premiumState.selectedDate || !dates.includes(premiumState.selectedDate)) {
    premiumState.selectedDate = dates[0] || "";
    applyPremiumDateDefaultPrice();
  }
  nodes.dateFilter.innerHTML = dates.length
    ? dates.map((dateKey) => `<option value="${dateKey}">${formatDate(dateKey)}</option>`).join("")
    : `<option value="">Sem abate</option>`;
  nodes.dateFilter.value = premiumState.selectedDate;
}

function renderPremiumAllocation(rows) {
  if (!nodes.allocationPanel) return;

  const showAllocation = rows.length > 1;
  nodes.allocationPanel.hidden = !showAllocation;
  if (!showAllocation) {
    if (nodes.allocationTable) nodes.allocationTable.innerHTML = "";
    return;
  }

  const totalHeads = rows.reduce((sum, row) => sum + Number(row.heads || 0), 0);
  syncInput(nodes.allocationPaymentInput, premiumInputMoneyValue(premiumState.allocationPaymentAmount));
  syncInput(nodes.allocationGtaInput, premiumInputMoneyValue(premiumState.allocationGtaCost));

  if (nodes.allocationSubtitle) {
    nodes.allocationSubtitle.textContent = `${formatNumber(rows.length)} titulos - ${formatNumber(totalHeads)} cabecas`;
  }

  if (nodes.allocationTable) {
    nodes.allocationTable.innerHTML = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.displayTitle || row.title || "-")}</td>
        <td class="num">${formatNumber(row.heads)}</td>
        <td class="num">${formatNumber((row.allocationShare || 0) * 100, 2)}%</td>
        <td class="num">${row.allocatedPaymentAmount ? formatCurrency(row.allocatedPaymentAmount, 2) : "-"}</td>
        <td class="num">${row.allocatedGtaCost ? formatCurrency(row.allocatedGtaCost, 2) : "-"}</td>
      </tr>
    `).join("");
  }
}

function renderPremium() {
  renderPremiumFilters();
  syncInput(nodes.priceHeadInput, premiumState.pricePerHead ? premiumState.pricePerHead.toFixed(2) : "");
  syncInput(nodes.monthlyRateInput, (premiumState.monthlyRate * 100).toFixed(2));
  syncInput(nodes.gtaInput, premiumState.gtaCost.toFixed(2));
  syncInput(nodes.monitoringFeeInput, (premiumState.monitoringFeeRate * 100).toFixed(2));

  const rows = premiumCalculatedRows();
  const lotRows = premiumLotRows();
  const totals = premiumTotals(rows);
  renderPremiumAllocation(rows);
  const sourceLabel = premiumState.fileName ? premiumState.fileName : "sem arquivo";
  const dateLabel = premiumState.selectedDate ? formatDate(premiumState.selectedDate) : "-";
  const pricePerHead = totals.heads ? totals.revenue / totals.heads : rows[0]?.pricePerHead || 0;
  const farmCount = new Set(rows.map((row) => row.farm).filter(Boolean)).size;

  nodes.status.textContent = premiumState.rows.length
    ? `${formatNumber(premiumState.rows.length)} registros carregados - ${sourceLabel}`
    : premiumState.fileName
      ? `Arquivo lido - nao encontrei a tabela de animais em ${sourceLabel}`
      : "Aguardando arquivo";

  nodes.memorySubtitle.textContent = rows.length
    ? `Abate ${dateLabel} - ${formatNumber(farmCount)} fazenda${farmCount === 1 ? "" : "s"}`
    : "Agrupado por fazenda e titulo";

  const missingCosts = rows.filter((row) => !row.costPerHead).length;
  const missingRevenue = rows.filter((row) => !row.paymentAmount).length;
  const missingFee = rows.filter((row) => row.reportFeeRate === null || row.reportFeeRate === undefined).length;
  const missingVp = rows.filter((row) => !row.systemVpAtAbate).length;
  const missingPaymentDate = rows.filter((row) => !row.paymentDate).length;
  const missingGta = rows.filter((row) => !row.hasManualGta && !row.hasAllocatedGta).length;
  const missingInputs = missingCosts + missingRevenue + missingFee + missingVp + missingPaymentDate + missingGta;
  nodes.kpis.innerHTML = [
    ["Abate", dateLabel, `${formatNumber(farmCount)} fazenda${farmCount === 1 ? "" : "s"}`],
    ["Animais abatidos", formatNumber(totals.heads), `${formatNumber(rows.length)} titulo${rows.length === 1 ? "" : "s"}`],
    ["Valor pago", formatCurrency(totals.revenue, 2), pricePerHead ? `${formatCurrency(pricePerHead, 2)}/cabeca` : "Por titulo"],
    ["VP sistema", totals.systemVpAtAbate ? formatCurrency(totals.systemVpAtAbate, 2) : "-", "Campo de bate do relatorio"],
    ["Dif. VP", totals.systemVpAtAbate ? formatCurrency(totals.vpDifference, 2) : "-", "Sistema menos motor"],
    ["Premio", formatCurrency(totals.premium, 2), "Receita menos custos"],
    ["Amortizacao", formatCurrency(totals.amortization, 2), "Receita menos premio"],
    ["Pendencias", formatNumber(missingInputs), "Campos ausentes no relatorio"]
  ].map(([label, value, note]) => `
    <article class="premium-kpi">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");

  nodes.memoryTable.innerHTML = rows.length
    ? premiumFarmSections(rows) + premiumTotalStatement(totals)
    : `<div class="premium-empty">${premiumState.rows.length ? "Sem animais abatidos para os filtros selecionados" : "Carregue o relatorio do sistema para calcular"}</div>`;

  nodes.lotTable.innerHTML = lotRows.length ? lotRows.map((row) => {
    const average = row.heads ? row.carcassWeight / row.heads : 0;
    const paymentDates = Array.from(row.paymentDates || []).filter(Boolean).sort().map(formatDate).join(", ");
    return `
      <tr>
        <td>${escapeHtml(row.farm)}</td>
        <td>${escapeHtml(row.partner || "-")}</td>
        <td>${escapeHtml(row.title || row.term || "-")}</td>
        <td>${escapeHtml(row.lastro || "-")}</td>
        <td>${escapeHtml(row.lot || "-")}</td>
        <td>${escapeHtml(paymentDates || "-")}</td>
        <td class="num">${formatNumber(row.heads)}</td>
        <td class="num">${formatCurrency(row.paymentAmount, 2)}</td>
        <td class="num">${row.systemVpAtAbate ? formatCurrency(row.systemVpAtAbate, 2) : "-"}</td>
        <td class="num">${formatNumber(row.carcassWeight, 2)} kg</td>
        <td class="num">${formatNumber(average, 2)} kg</td>
      </tr>
    `;
  }).join("") : `
    <tr>
      <td colspan="11">${premiumState.rows.length ? "Sem lotes para os filtros selecionados" : "Carregue o relatorio do sistema para validar os lotes"}</td>
    </tr>
  `;
}

nodes.fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  nodes.status.textContent = "Lendo arquivo...";
  try {
    const parsed = await parsePremiumFile(file);
    premiumState.rows = parsed.rows;
    premiumState.fileName = file.name;
    premiumState.rowOverrides = {};
    premiumState.paymentDate = "";
    premiumState.paymentAmount = 0;
    premiumState.allocationPaymentAmount = 0;
    premiumState.allocationGtaCost = 0;
    premiumState.pricePerHead = 0;
    premiumState.paymentDateTouched = false;
    premiumState.paymentTouched = false;
    premiumState.priceTouched = false;
    premiumState.priceByDate = { ...PREMIUM_EXAMPLE_PRICE_BY_DATE, ...(parsed.priceByDate || {}) };
    const dates = premiumDateOptions();
    premiumState.selectedDate = dates[0] || "";
    applyPremiumDateDefaultPrice();
    renderPremium();
  } catch (error) {
    nodes.status.textContent = error.message || "Nao foi possivel ler o arquivo";
  }
});

nodes.dateFilter.addEventListener("change", (event) => {
  premiumState.selectedDate = event.target.value;
  premiumState.allocationPaymentAmount = 0;
  premiumState.allocationGtaCost = 0;
  applyPremiumDateDefaultPrice();
  renderPremium();
});

if (nodes.priceHeadInput) {
  nodes.priceHeadInput.addEventListener("input", (event) => {
    premiumState.pricePerHead = parsePtNumber(event.target.value);
    premiumState.priceTouched = true;
    if (premiumState.pricePerHead > 0) {
      premiumState.paymentAmount = 0;
      premiumState.paymentTouched = false;
    }
    renderPremium();
  });
}

[
  [nodes.monthlyRateInput, "monthlyRate", 100],
  [nodes.gtaInput, "gtaCost", 1],
  [nodes.tagInput, "tagCostPerHead", 1],
  [nodes.monitoringFeeInput, "monitoringFeeRate", 100]
].filter(([node]) => node).forEach(([node, field, divisor]) => {
  node.addEventListener("input", (event) => {
    premiumState[field] = parsePtNumber(event.target.value) / divisor;
    renderPremium();
  });
});

[
  [nodes.allocationPaymentInput, "allocationPaymentAmount"],
  [nodes.allocationGtaInput, "allocationGtaCost"]
].filter(([node]) => node).forEach(([node, field]) => {
  node.addEventListener("input", (event) => {
    premiumState[field] = parsePtNumber(event.target.value);
    renderPremium();
  });
});

nodes.memoryTable.addEventListener("change", (event) => {
  const input = event.target.closest("[data-premium-key][data-premium-field]");
  if (!input) return;
  const rowKey = input.dataset.premiumKey;
  const field = input.dataset.premiumField;
  const nextValue = input.type === "date"
    ? input.value
    : input.value === ""
      ? ""
      : parsePtNumber(input.value);
  premiumState.rowOverrides[rowKey] = {
    ...(premiumState.rowOverrides[rowKey] || {})
  };
  if (nextValue === "") {
    delete premiumState.rowOverrides[rowKey][field];
  } else {
    premiumState.rowOverrides[rowKey][field] = nextValue;
  }
  if (!Object.keys(premiumState.rowOverrides[rowKey]).length) delete premiumState.rowOverrides[rowKey];
  renderPremium();
});

nodes.printButton.addEventListener("click", () => {
  window.print();
});

renderPremium();
