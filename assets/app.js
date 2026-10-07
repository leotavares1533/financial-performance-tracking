const formatCurrency = (value, digits = 0) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });

const formatCurrencyShort = (value) => {
  const number = Number(value || 0);
  const abs = Math.abs(number);
  if (abs >= 1000000000) return `${number < 0 ? "-" : ""}R$ ${formatNumber(abs / 1000000000, 2)} bi`;
  if (abs >= 1000000) return `${number < 0 ? "-" : ""}R$ ${formatNumber(abs / 1000000, 1)} mi`;
  return formatCurrency(number);
};

const formatNumber = (value, digits = 0) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });

const formatPercent = (value, digits = 2) =>
  `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}%`;

const formatSignedPercent = (value, digits = 2) => {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}%`;
};

const formatDate = (dateKey) => {
  const [year, month, day] = String(dateKey).split("-");
  return `${day}/${month}/${year}`;
};

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const parseDateKey = (dateKey) => {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const dateKeyFromLocalDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addCalendarDays = (dateKey, days) => {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  date.setDate(date.getDate() + days);
  return dateKeyFromLocalDate(date);
};

const BRAZIL_MARKET_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-04-03",
  "2026-04-21",
  "2026-05-01",
  "2026-06-04",
  "2026-09-07",
  "2026-10-12",
  "2026-11-02",
  "2026-11-15",
  "2026-11-20",
  "2026-12-25",
  "2027-01-01",
  "2027-02-08",
  "2027-02-09",
  "2027-02-10",
  "2027-03-26",
  "2027-04-21",
  "2027-05-01",
  "2027-05-27",
  "2027-09-07",
  "2027-10-12",
  "2027-11-02",
  "2027-11-15",
  "2027-11-20",
  "2027-12-25"
]);

const isBusinessDayKey = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return false;
  const dayOfWeek = date.getDay();
  return dayOfWeek !== 0 && dayOfWeek !== 6 && !BRAZIL_MARKET_HOLIDAYS.has(dateKey);
};

const firstDayOfMonthKey = (dateKey) => {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
};

const dateDiffDays = (startKey, endKey) => {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
};

const parseBrazilianDateKey = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const businessDaysBetweenExclusive = (startKey, endKey) => {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end || end <= start) return 0;
  let days = 0;
  const current = new Date(start.getTime());
  current.setDate(current.getDate() + 1);
  while (current <= end) {
    const dateKey = dateKeyFromLocalDate(current);
    if (isBusinessDayKey(dateKey)) days += 1;
    current.setDate(current.getDate() + 1);
  }
  return days;
};

const formatDateTime = (isoDate) => {
  if (!isoDate) return "-";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

const ARROBA_KG = 15;
const BIOLOGICAL_GUARANTEE_FACTOR = 1;
const quoteSnapshot = window.ceresCattleQuotes || { rows: [], historyRows: [] };
const diRateSnapshot = window.LAMINA_DI_RATES || {};
const partnershipTitleData = window.ceresPartnershipTitles || { targetMonthlyRate: 0.017, guaranteeFactor: 0.5, titles: [] };
const partnershipTitleRows = Array.isArray(partnershipTitleData.titles) ? partnershipTitleData.titles : [];
const partnershipTitleByLastro = new Map(partnershipTitleRows
  .map((row) => [String(row.lastro || "").trim(), row])
  .filter(([lastro]) => Boolean(lastro)));
const REGION_ORDER = ["BA", "GO", "MT", "MS", "MG", "PA", "RO", "SP", "TO"];
const QUOTE_CATEGORY_LABELS = {
  boi: "Boi",
  vaca: "Vaca",
  novilha: "Novilha",
  boi_mt: "Boi MT",
  vaca_mt: "Vaca MT",
  novilha_mt: "Novilha MT",
  nelore: "Nelore",
  anelorado: "Anelorado",
  cruzamento_industrial: "Cruz. industrial"
};
const REPLACEMENT_UFS_BY_CATEGORY = {
  nelore: ["SP", "MG", "MS", "MT", "GO", "TO", "PA", "PR", "RS", "RO"],
  anelorado: ["SP", "MG", "MS", "MT", "GO", "PR", "RS"],
  cruzamento_industrial: ["SP", "MG", "MS", "MT", "GO", "PR", "RS"]
};
const REPLACEMENT_TYPE_BY_COLUMN = {
  1: "Macho / Desmama",
  2: "Macho / Bezerro",
  3: "Macho / Garrote",
  4: "Macho / Boi magro",
  5: "Femea / Desmama",
  6: "Femea / Bezerra",
  7: "Femea / Novilha",
  8: "Femea / Vaca magra"
};
const ALL_FILTER_VALUE = "all";
const CASH_DEFAULT_ANNUAL_CDI_RATE = 0.1465;
const PORTFOLIO_ANNUAL_RATE_THRESHOLD = 0.10;
const ROLLING_MONTH_BUSINESS_DAYS = 21;
const PARTNERSHIP_DEFAULT_TARGET_MONTHLY_RATE = Number(partnershipTitleData.targetMonthlyRate || 0.017);
const PARTNERSHIP_GUARANTEE_FACTOR = Number(partnershipTitleData.guaranteeFactor || 0.5);
const PARTNER_RISK_LIMITS = {
  "PEDRO RIBEIRO MEROLA": 130000000,
  "STEFAN ZEMBROD": 120000000,
  "JOSE ARNALDO FAVARETTO": 60000000,
  "FABIO SCHIMTT": 85000000,
  "FABIO SCHMITT": 85000000,
  "BOIPREMIUM AGRO LTDA": 45000000,
  "VITOR RORATTO NEVES E OUTRO": 40000000,
  "GREEN FARMING": 110000000,
  "GREEN FARMING FAZENDAS RENOVAVEIS LTDA": 110000000,
  "SEBASTIAO FERNANDES LAGE FILHO": 50000000,
  "RAMAX IMPORTACAO E EXPORTACAO DE ALIMENTOS LTDA": 20000000,
  "GUILHERME RODRIGUES DA CUNHA": 120000000,
  "JOAO LEOPOLDO SAMWAYS FILHO": 15000000,
  "FAZENDA RIO MADEIRA S/A - FARM": 15000000,
  "ALIMENTOS ESTRELA LTDA": 50000000,
  "ADAM PERRONE SAMMOUR E OUTROS": 150000000,
  "FORTALEZA DE SANTA TERESINHA": 45000000,
  "PAULO HENRIQUE QUEIROZ": 20000000,
  "FERNANDO SISTO ARANTES": 20000000
};
const PARTNERSHIP_TARGET_MONTHLY_RATE_BY_PARTNER = {
  "RAMAX IMPORTACAO E EXPORTACAO DE ALIMENTOS LTDA": PARTNERSHIP_DEFAULT_TARGET_MONTHLY_RATE,
  "STEFAN ZEMBROD": PARTNERSHIP_DEFAULT_TARGET_MONTHLY_RATE,
  "GUILHERME RODRIGUES DA CUNHA": PARTNERSHIP_DEFAULT_TARGET_MONTHLY_RATE,
  ...partnershipTitleRows.reduce((acc, row) => {
    const partner = String(row.partner || "").trim();
    if (partner) acc[partner] = Number(row.targetMonthlyRate || partnershipTitleData.targetMonthlyRate || PARTNERSHIP_DEFAULT_TARGET_MONTHLY_RATE);
    return acc;
  }, {})
};
const PARTNERSHIP_PARTNERS = Object.keys(PARTNERSHIP_TARGET_MONTHLY_RATE_BY_PARTNER);
const PREMIUM_DEFAULT_MONTHLY_RATE = 0.0195;
const PREMIUM_DEFAULT_GTA_COST = 442.61;
const PREMIUM_DEFAULT_TAG_COST = 2.5;
const PREMIUM_DEFAULT_MONITORING_FEE_RATE = 0.0075;
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
const PORTFOLIO_MANUAL_MONTHLY_RATE_BY_LASTRO = {
  "458070": 0.022,
  "458111": 0.022,
  "458072": 0.022,
  "458071": 0.022,
  "458065": 0.022,
  "458066": 0.022,
  "458069": 0.022,
  "458063": 0.022,
  "458062": 0.022,
  "458068": 0.022,
  "458067": 0.022,
  "458064": 0.022,
  "511831": 0.0175
};

const normalizePartnerKey = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleUpperCase("pt-BR");

const partnerRiskLimitByKey = Object.entries(PARTNER_RISK_LIMITS).reduce((acc, [name, limit]) => {
  acc[normalizePartnerKey(name)] = limit;
  return acc;
}, {});

const partnerRiskLimitFor = (partner) => partnerRiskLimitByKey[normalizePartnerKey(partner)] || 0;

const partnershipPartnerByKey = PARTNERSHIP_PARTNERS.reduce((acc, name) => {
  acc[normalizePartnerKey(name)] = name;
  return acc;
}, {});

const partnershipTargetMonthlyRateByKey = Object.entries(PARTNERSHIP_TARGET_MONTHLY_RATE_BY_PARTNER).reduce((acc, [name, rate]) => {
  const number = Number(rate);
  acc[normalizePartnerKey(name)] = Number.isFinite(number) && number > 0
    ? (number > 1 ? number / 100 : number)
    : 0;
  return acc;
}, {});

const partnershipTargetMonthlyRateFor = (partner) => partnershipTargetMonthlyRateByKey[normalizePartnerKey(partner)] || 0;

const premiumTermDefaultsByTitle = PREMIUM_TERM_DEFAULTS.reduce((acc, row) => {
  acc[normalizePartnerKey(row.title)] = row;
  return acc;
}, {});

const normalizeAnnualRate = (value, fallback = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return number > 1 ? number / 100 : number;
};

const annualRateFromDailyRate = (dailyRate) => {
  const number = Number(dailyRate);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.pow(1 + number, 252) - 1;
};

const rawDiRateRows = Array.isArray(diRateSnapshot)
  ? diRateSnapshot
  : Array.isArray(diRateSnapshot.rates)
    ? diRateSnapshot.rates
    : Object.entries(diRateSnapshot).map(([date, row]) => ({
      ...(row && typeof row === "object" ? row : {}),
      date: (row && typeof row === "object" && (row.data || row.date)) || date
    }));

const diRateRows = rawDiRateRows
  .map((row) => ({
    ...(row && typeof row === "object" ? row : {}),
    date: row && typeof row === "object" ? row.data || row.date : ""
  }))
  .filter((row) => row.date && Number(row.taxaDia ?? row.dailyRate ?? row.rateDaily ?? 0) > 0)
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));
const diRateRowsByDate = new Map(diRateRows.map((row) => [row.date, row]));
const latestDiRateDate = diRateRows.length ? diRateRows[diRateRows.length - 1].date : "";

const addBusinessDaysBack = (dateKey, daysBack) => {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;
  let remaining = daysBack;
  while (remaining > 0) {
    date.setDate(date.getDate() - 1);
    const dayOfWeek = date.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) remaining -= 1;
  }
  return dateKeyFromLocalDate(date);
};

const rollingMonthReferenceKey = (dateKey) => addBusinessDaysBack(dateKey, ROLLING_MONTH_BUSINESS_DAYS);

const fallbackOperations = [
  {
    id: "btg-cpra-50",
    investor: "BTG",
    name: "BTG CPR-F R$ 50MM",
    shortName: "CPRF R$ 50MM",
    account: "98750-9",
    cash: 10009407,
    portfolioVp: 54820000,
    portfolioVn: 55680000,
    fundingBalance: 50184312,
    syntheticSub: 5538051.26,
    previousSyntheticSub: 5532479.59,
    monthStartSyntheticSub: 121714.10,
    fundingRate: 1.62,
    portfolioRate: 2.05,
    duration: 214,
    overdue: 0,
    warning: "ok",
    portfolio: [
      ["Agro Horizonte Ltda", "CPR-F", 11800000, 11690000, 2.08, "12/12/2026", "Em dia"],
      ["Fazenda Santa Luzia", "CPR-F", 8200000, 8070000, 2.02, "20/11/2026", "Em dia"],
      ["Sementes Norte S.A.", "CPR-F", 6900000, 6740000, 2.12, "08/01/2027", "Em dia"],
      ["Cooperativa Vale Verde", "CPR-F", 5100000, 5010000, 1.98, "16/10/2026", "Atencao"]
    ]
  },
  {
    id: "btg-cpra-100",
    investor: "BTG",
    name: "BTG CPR-F R$ 100MM",
    shortName: "CPRF R$ 100MM",
    account: "98749-1",
    cash: 109582042,
    portfolioVp: 96340000,
    portfolioVn: 97870000,
    fundingBalance: 198793617,
    syntheticSub: 7128425.07,
    previousSyntheticSub: 7150469.68,
    monthStartSyntheticSub: 253268.05,
    fundingRate: 1.68,
    portfolioRate: 2.18,
    duration: 261,
    overdue: 810000,
    warning: "warn",
    portfolio: [
      ["Grupo Safra Campo", "CPR-F", 22400000, 21960000, 2.16, "28/02/2027", "Em dia"],
      ["Agropecuaria Serra Azul", "NP", 17300000, 16980000, 2.21, "30/03/2027", "Em dia"],
      ["Fazenda Canaa", "CPR-F", 12600000, 12390000, 2.12, "15/01/2027", "Em dia"],
      ["Cerealista Primavera", "CPR-F", 6800000, 6640000, 2.19, "10/09/2026", "Atraso leve"]
    ]
  },
  {
    id: "btg-cra-50",
    investor: "BTG",
    name: "CRA 50MM",
    shortName: "CRA 50MM",
    account: "98748-3",
    cash: 6509447,
    portfolioVp: 49230000,
    portfolioVn: 50150000,
    fundingBalance: 49635134,
    syntheticSub: 6104312.98,
    previousSyntheticSub: 6101207.70,
    monthStartSyntheticSub: 5792457.71,
    fundingRate: 1.55,
    portfolioRate: 1.95,
    duration: 188,
    overdue: 0,
    warning: "ok",
    portfolio: [
      ["Produtor Modelo I", "CPR-F", 9200000, 9060000, 1.96, "14/11/2026", "Em dia"],
      ["Produtor Modelo II", "NC", 7300000, 7210000, 1.92, "19/12/2026", "Em dia"],
      ["Produtor Modelo III", "CPR-F", 5100000, 5010000, 1.99, "08/10/2026", "Em dia"]
    ]
  },
  {
    id: "artesanal-one",
    investor: "Artesanal",
    name: "CRA ONE R$ 30MM",
    shortName: "CRA ONE R$ 30MM",
    account: "98747-5",
    cash: 25216328,
    portfolioVp: 30780000,
    portfolioVn: 31220000,
    fundingBalance: 50641547,
    syntheticSub: 5354781.12,
    previousSyntheticSub: 5358138.31,
    monthStartSyntheticSub: -224796.72,
    fundingRate: 1.71,
    portfolioRate: 2.08,
    duration: 167,
    overdue: 250000,
    warning: "warn",
    portfolio: [
      ["Boa Colheita Agricola", "CPR-F", 7900000, 7780000, 2.05, "22/12/2026", "Em dia"],
      ["Fazenda Terra Alta", "NP", 6600000, 6480000, 2.10, "05/02/2027", "Em dia"],
      ["Rural Sul Ltda", "CPR-F", 4100000, 4040000, 2.04, "25/09/2026", "Atencao"]
    ]
  },
  {
    id: "artesanal-two",
    investor: "Artesanal",
    name: "CRA TWO R$ 41MM",
    shortName: "CRA TWO R$ 41MM",
    account: "Itau Vinculada",
    cash: 19450042,
    portfolioVp: 20970000,
    portfolioVn: 21340000,
    fundingBalance: 41031548,
    syntheticSub: -611506.10,
    previousSyntheticSub: -601267.48,
    monthStartSyntheticSub: -488782.75,
    fundingRate: 1.86,
    portfolioRate: 1.79,
    duration: 132,
    overdue: 1260000,
    warning: "bad",
    portfolio: [
      ["Vale do Milho Ltda", "CPR-F", 8100000, 7900000, 1.78, "29/08/2026", "Atraso leve"],
      ["Cia Armazens Gerais", "NC", 6300000, 6170000, 1.82, "18/10/2026", "Em dia"],
      ["Agro Sul Comercio", "NP", 4200000, 4130000, 1.74, "02/09/2026", "Atencao"]
    ]
  },
  {
    id: "ceres-carteira-100",
    investor: "Ceres",
    name: "CRA's Carteira R$ 100MM",
    shortName: "CRA's Carteira R$ 100MM",
    account: "98751-7",
    cash: 28615676,
    portfolioVp: 75220000,
    portfolioVn: 76600000,
    fundingBalance: 103595536,
    syntheticSub: 240140.39,
    previousSyntheticSub: 240790.71,
    monthStartSyntheticSub: 317956.37,
    fundingRate: 1.74,
    portfolioRate: 1.77,
    duration: 229,
    overdue: 390000,
    warning: "warn",
    portfolio: [
      ["Produtor Integrado I", "CPR-F", 11400000, 11200000, 1.81, "17/12/2026", "Em dia"],
      ["Produtor Integrado II", "NC", 9800000, 9630000, 1.76, "27/11/2026", "Em dia"],
      ["Produtor Integrado III", "CPR-F", 7600000, 7480000, 1.73, "09/10/2026", "Atencao"]
    ]
  },
  {
    id: "ceres-carteira-50",
    investor: "Ceres",
    name: "CRA's Carteira R$ 50MM",
    shortName: "CRA's Carteira R$ 50MM",
    account: "Itau Vinculada",
    cash: 313728,
    portfolioVp: 49140000,
    portfolioVn: 50300000,
    fundingBalance: 49329767,
    syntheticSub: 124060.98,
    previousSyntheticSub: 122265.57,
    monthStartSyntheticSub: 67313.11,
    fundingRate: 1.74,
    portfolioRate: 1.86,
    duration: 205,
    overdue: 0,
    warning: "ok",
    portfolio: [
      ["Fazenda Modelo IV", "CPR-F", 10200000, 10040000, 1.86, "20/12/2026", "Em dia"],
      ["Sementes Oeste Ltda", "NC", 8400000, 8240000, 1.88, "13/11/2026", "Em dia"],
      ["Produtor Modelo V", "NP", 6200000, 6110000, 1.84, "02/02/2027", "Em dia"]
    ]
  }
];

const fundingData = window.ceresFundingData || { positionDate: "2026-09-03", operations: [] };
const manualFundingEvents = window.ceresFundingManualEvents || { events: [] };
const portfolioData = window.ceresPortfolioData || { operations: [] };
const frozenPortfolioData = window.ceresFrozenPortfolioData || { operations: [] };
const cashData = window.ceresCashData || {
  events: [],
  appliedShare: 1,
  applicationCdiShare: 0.92,
  annualCdiRate: CASH_DEFAULT_ANNUAL_CDI_RATE
};
const biologicalAssetData = window.ceresBiologicalAssets || { assetsByOperationId: {}, vehicles: [] };
const biologicalAssetHistoryData = window.ceresBiologicalAssetsHistory || { snapshots: [] };
const CASH_APPLIED_SHARE = Number(cashData.appliedShare ?? 1);
const CASH_APPLICATION_CDI_SHARE = Number(cashData.applicationCdiShare ?? cashData.applicationRate ?? 0.92);
const importedPortfolioOperations = Array.isArray(portfolioData.operations) ? portfolioData.operations : [];
const frozenPortfolioOperations = Array.isArray(frozenPortfolioData.operations) ? frozenPortfolioData.operations : [];
const frozenPortfolioDefaultThroughDate = String(frozenPortfolioData.freezeThroughDate || frozenPortfolioData.snapshotDate || "");
const operations = (
  Array.isArray(fundingData.operations) && fundingData.operations.length
    ? fundingData.operations
    : fallbackOperations
).map((operation) => ({
  cash: 0,
  portfolioVp: 0,
  portfolioVn: 0,
  portfolioRate: 0,
  duration: 0,
  overdue: 0,
  warning: "ok",
  portfolio: [],
  fundingHistory: [],
  fundingComponents: [],
  cashEvents: [],
  ...operation
}));

const fallbackBiologicalAssets = {
  "btg-cpra-50": {
    quotePerArroba: 318,
    quoteSource: "Cotacao boi gordo - data-base",
    lots: [
      ["Confinamento Primavera", "Boi gordo", 2400, 505, "Goias"],
      ["Fazenda Santa Luzia", "Novilho confinado", 1850, 492, "Mato Grosso"],
      ["Retiro Horizonte", "Boi gordo", 1470, 520, "Sao Paulo"]
    ]
  },
  "btg-cpra-100": {
    quotePerArroba: 316,
    quoteSource: "Cotacao boi gordo - data-base",
    lots: [
      ["Unidade Campo Alto", "Boi gordo", 8200, 498, "Mato Grosso"],
      ["Unidade Serra Azul", "Novilho confinado", 7600, 512, "Goias"],
      ["Unidade Primavera", "Boi gordo", 6100, 486, "Mato Grosso do Sul"]
    ]
  },
  "btg-cra-50": {
    quotePerArroba: 320,
    quoteSource: "Cotacao boi gordo - data-base",
    lots: [
      ["Fazenda Modelo I", "Boi gordo", 2350, 506, "Sao Paulo"],
      ["Fazenda Modelo II", "Novilho confinado", 2050, 515, "Minas Gerais"],
      ["Fazenda Modelo III", "Boi magro", 1050, 492, "Goias"]
    ]
  },
  "artesanal-one": {
    quotePerArroba: 315,
    quoteSource: "Cotacao boi gordo - data-base",
    lots: [
      ["Boa Colheita", "Boi gordo", 2550, 500, "Goias"],
      ["Terra Alta", "Novilho confinado", 2300, 488, "Mato Grosso"],
      ["Rural Sul", "Boi magro", 950, 510, "Parana"]
    ]
  },
  "artesanal-two": {
    quotePerArroba: 312,
    quoteSource: "Cotacao boi gordo - data-base",
    lots: [
      ["Vale do Milho", "Boi gordo", 1850, 480, "Mato Grosso"],
      ["Armazens Gerais", "Novilho confinado", 1700, 472, "Goias"],
      ["Agro Sul", "Boi magro", 820, 465, "Parana"]
    ]
  },
  "ceres-carteira-100": {
    quotePerArroba: 319,
    quoteSource: "Cotacao boi gordo - data-base",
    lots: [
      ["Integrado I", "Boi gordo", 4400, 505, "Mato Grosso"],
      ["Integrado II", "Novilho confinado", 3900, 522, "Goias"],
      ["Integrado III", "Boi gordo", 2650, 500, "Mato Grosso do Sul"]
    ]
  },
  "ceres-carteira-50": {
    quotePerArroba: 317,
    quoteSource: "Cotacao boi gordo - data-base",
    lots: [
      ["Modelo IV", "Boi gordo", 2150, 508, "Sao Paulo"],
      ["Oeste Ltda", "Novilho confinado", 1950, 496, "Goias"],
      ["Modelo V", "Boi magro", 980, 512, "Minas Gerais"]
    ]
  }
};

function biologicalAssetSnapshotDate(snapshot = {}) {
  return String(snapshot.referenceDate || snapshot.summary?.referenceDate || "").slice(0, 10);
}

const biologicalAssetSnapshots = (() => {
  const snapshots = [];
  const pushSnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== "object") return;
    if (!snapshot.assetsByOperationId && !Array.isArray(snapshot.vehicles)) return;
    const referenceDate = biologicalAssetSnapshotDate(snapshot);
    if (!referenceDate) return;
    snapshots.push(snapshot);
  };

  (Array.isArray(biologicalAssetHistoryData.snapshots) ? biologicalAssetHistoryData.snapshots : []).forEach(pushSnapshot);
  pushSnapshot(biologicalAssetData);

  const byDate = new Map();
  snapshots
    .sort((a, b) => {
      const dateCompare = biologicalAssetSnapshotDate(a).localeCompare(biologicalAssetSnapshotDate(b));
      if (dateCompare) return dateCompare;
      return String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
    })
    .forEach((snapshot) => byDate.set(biologicalAssetSnapshotDate(snapshot), snapshot));

  return Array.from(byDate.values()).sort((a, b) =>
    biologicalAssetSnapshotDate(a).localeCompare(biologicalAssetSnapshotDate(b))
  );
})();

function biologicalAssetDataForDate(dateKey = "") {
  if (!biologicalAssetSnapshots.length) return biologicalAssetData;
  const targetDate = String(dateKey || biologicalAssetSnapshotDate(biologicalAssetData) || "").slice(0, 10);
  if (!targetDate) return biologicalAssetSnapshots[biologicalAssetSnapshots.length - 1];

  let selected = biologicalAssetSnapshots[0];
  for (const snapshot of biologicalAssetSnapshots) {
    const snapshotDate = biologicalAssetSnapshotDate(snapshot);
    if (snapshotDate && snapshotDate <= targetDate) selected = snapshot;
    if (snapshotDate && snapshotDate > targetDate) break;
  }
  return selected;
}

function biologicalAssetsForDate(dateKey = "") {
  const snapshot = biologicalAssetDataForDate(dateKey);
  return {
    ...fallbackBiologicalAssets,
    ...(snapshot.assetsByOperationId || {})
  };
}

function biologicalAssetForOperation(operation, dateKey = "") {
  return biologicalAssetsForDate(dateKey)[operation.id];
}

function guaranteeSnapshotLabel(dateKey = "") {
  const snapshot = biologicalAssetDataForDate(dateKey);
  const snapshotDate = biologicalAssetSnapshotDate(snapshot);
  if (!snapshotDate) return "Sem historico de garantia";
  if (!dateKey || snapshotDate === dateKey) return `Garantia ${formatDate(snapshotDate)}`;
  return `Garantia ${formatDate(snapshotDate)} usada em ${formatDate(dateKey)}`;
}

const EXCLUDED_GUARANTEE_OPERATION_IDS = new Set([
  "biologico-sem-veiculo",
  "biologico-comprado-transito-sem-carteira"
]);

const EXCLUDED_GUARANTEE_NAMES = new Set([
  "SEM VEICULO",
  "COMPRADO EM TRANSITO SEM CARTEIRA"
]);

function isExcludedGuaranteeAsset(asset = {}) {
  const operationId = String(asset.operationId || asset.reportedOperationId || "").trim();
  if (EXCLUDED_GUARANTEE_OPERATION_IDS.has(operationId)) return true;

  return [asset.name, asset.shortName, asset.sourceVehicleName]
    .filter(Boolean)
    .some((value) => EXCLUDED_GUARANTEE_NAMES.has(normalizePartnerKey(value)));
}

function isExcludedGuaranteeLot(row = []) {
  const meta = row[6] || {};
  return isExcludedGuaranteeAsset({
    operationId: meta.reportedOperationId || meta.operationIdRelatorio || meta.operationIdAlocado,
    sourceVehicleName: meta.sourceVehicleName
  });
}

operations.forEach((operation) => {
  operation.biologicalAsset = biologicalAssetForOperation(operation, biologicalAssetSnapshotDate(biologicalAssetData));
  applyManualFundingEvents(operation);
  prepareFundingInputs(operation);
});

const operationIds = new Set(operations.map((operation) => operation.id));

function biologicalOnlyOperationsForDate(dateKey = "") {
  const snapshot = biologicalAssetDataForDate(dateKey);
  return (Array.isArray(snapshot.vehicles) ? snapshot.vehicles : [])
    .filter((asset) => asset && asset.operationId && !operationIds.has(asset.operationId) && !isExcludedGuaranteeAsset(asset))
    .map((asset) => ({
      id: asset.operationId,
      investor: asset.investor || "Ativo biologico",
      name: asset.name || asset.shortName || asset.operationId,
      shortName: asset.shortName || asset.name || asset.operationId,
      fundingBalance: 0,
      biologicalOnly: true,
      biologicalAsset: asset
    }));
}

function guaranteeOperations(dateKey = state.dateKey) {
  return [...operations, ...biologicalOnlyOperationsForDate(dateKey)];
}

const initialParams = new URLSearchParams(window.location.search);
const initialFundingId = initialParams.get("funding");
const initialView = initialParams.get("view");
const hasInitialFunding = operations.some((operation) => operation.id === initialFundingId);
const portfolioPositionDates = importedPortfolioOperations
  .map((item) => item.positionDate)
  .filter(Boolean);
const latestPortfolioPositionDate = portfolioPositionDates.sort().slice(-1)[0] || "";
const initialDateKey = [fundingData.positionDate, latestPortfolioPositionDate]
  .filter(Boolean)
  .sort()
  .slice(-1)[0] || "2026-09-03";

const state = {
  dateKey: initialDateKey,
  selectedId: hasInitialFunding ? initialFundingId : operations[0].id,
  evolutionId: hasInitialFunding ? initialFundingId : "gerencial",
  cashId: hasInitialFunding ? initialFundingId : "gerencial",
  portfolioId: hasInitialFunding ? initialFundingId : "gerencial",
  view: initialView === "cotacoes"
    ? "cotacoes"
    : initialView === "evolucao"
        ? "evolucao"
        : initialView === "carteira"
          ? "carteira"
          : initialView === "caixa"
            ? "caixa"
            : hasInitialFunding ? "individual" : "gerencial",
  quoteFilters: {
    mtCategory: ALL_FILTER_VALUE,
    mtRegion: ALL_FILTER_VALUE,
    replacementCategory: ALL_FILTER_VALUE,
    replacementUf: ALL_FILTER_VALUE,
    replacementType: ALL_FILTER_VALUE
  }
};

const premiumState = {
  rows: [],
  fileName: "",
  selectedFarm: "",
  selectedDate: "",
  paymentAmount: 0,
  pricePerHead: 0,
  paymentTouched: false,
  priceTouched: false,
  monthlyRate: PREMIUM_DEFAULT_MONTHLY_RATE,
  gtaCost: PREMIUM_DEFAULT_GTA_COST,
  tagCostPerHead: PREMIUM_DEFAULT_TAG_COST,
  monitoringFeeRate: PREMIUM_DEFAULT_MONITORING_FEE_RATE,
  rowOverrides: {}
};

const nodes = {
  dateSelector: document.getElementById("date-selector"),
  operationControl: document.getElementById("operation-control"),
  fundingSelector: document.getElementById("funding-selector"),
  managementButton: document.getElementById("management-button"),
  cashButton: document.getElementById("cash-button"),
  portfolioButton: document.getElementById("portfolio-button"),
  fundingEvolutionButton: document.getElementById("funding-evolution-button"),
  quotesButton: document.getElementById("quotes-button"),
  premiumButton: document.getElementById("premium-button"),
  printButton: document.getElementById("print-button"),
  summaryStrip: document.getElementById("summary-strip"),
  managementView: document.getElementById("management-view"),
  cashView: document.getElementById("cash-view"),
  portfolioView: document.getElementById("portfolio-view"),
  fundingEvolutionView: document.getElementById("funding-evolution-view"),
  quotesView: document.getElementById("quotes-view"),
  premiumView: document.getElementById("premium-view"),
  detailView: document.getElementById("detail-view"),
  managementDate: document.getElementById("management-date"),
  cashTable: document.getElementById("cash-table"),
  resultTable: document.getElementById("result-table"),
  resultCurrentHead: document.getElementById("result-current-head"),
  resultDayHead: document.getElementById("result-day-head"),
  resultMonthHead: document.getElementById("result-month-head"),
  srSubCharts: Array.from(document.querySelectorAll("[data-sr-sub-chart]")),
  partnerRiskChart: document.getElementById("partner-risk-chart"),
  partnershipInsights: document.getElementById("partnership-insights"),
  guaranteeHistoryDate: document.getElementById("guarantee-history-date"),
  guaranteeManagementTable: document.getElementById("guarantee-management-table"),
  guaranteeManagementPrintTable: document.getElementById("guarantee-management-print-table"),
  historyHead: document.getElementById("history-head"),
  historyBody: document.getElementById("history-body"),
  cashDate: document.getElementById("cash-date"),
  cashKpis: document.getElementById("cash-kpis"),
  cashRationaleTable: document.getElementById("cash-rationale-table"),
  cashFundsTable: document.getElementById("cash-funds-table"),
  cashChart: document.getElementById("cash-chart"),
  cashIncomeChart: document.getElementById("cash-income-chart"),
  cashDailyTable: document.getElementById("cash-daily-table"),
  portfolioDate: document.getElementById("portfolio-date"),
  portfolioKpis: document.getElementById("portfolio-kpis"),
  portfolioFundsTable: document.getElementById("portfolio-funds-table"),
  portfolioChart: document.getElementById("portfolio-chart"),
  portfolioDailyTable: document.getElementById("portfolio-daily-table"),
  portfolioAgingTable: document.getElementById("portfolio-aging-table"),
  portfolioTitlesTable: document.getElementById("portfolio-titles-table"),
  fundingEvolutionDate: document.getElementById("funding-evolution-date"),
  fundingEvolutionKpis: document.getElementById("funding-evolution-kpis"),
  fundingEvolutionInvestorTable: document.getElementById("funding-evolution-investor-table"),
  fundingEvolutionChart: document.getElementById("funding-evolution-chart"),
  fundingEvolutionDailyTable: document.getElementById("funding-evolution-daily-table"),
  quotesDate: document.getElementById("quotes-date"),
  quoteKpis: document.getElementById("quote-kpis"),
  quotesRegionalHead: document.getElementById("quotes-regional-head"),
  quotesRegionalMatrix: document.getElementById("quotes-regional-matrix"),
  quotesMtCategoryFilter: document.getElementById("quotes-mt-category-filter"),
  quotesMtRegionFilter: document.getElementById("quotes-mt-region-filter"),
  quotesMtTable: document.getElementById("quotes-mt-table"),
  quotesReplacementCategoryFilter: document.getElementById("quotes-replacement-category-filter"),
  quotesReplacementUfFilter: document.getElementById("quotes-replacement-uf-filter"),
  quotesReplacementTypeFilter: document.getElementById("quotes-replacement-type-filter"),
  quotesReplacementTable: document.getElementById("quotes-replacement-table"),
  quotesRegionalDetailTable: document.getElementById("quotes-regional-detail-table"),
  premiumStatus: document.getElementById("premium-status"),
  premiumFileInput: document.getElementById("premium-file-input"),
  premiumFarmFilter: document.getElementById("premium-farm-filter"),
  premiumDateFilter: document.getElementById("premium-date-filter"),
  premiumPaymentInput: document.getElementById("premium-payment-input"),
  premiumPriceHeadInput: document.getElementById("premium-price-head-input"),
  premiumMonthlyRateInput: document.getElementById("premium-monthly-rate-input"),
  premiumGtaInput: document.getElementById("premium-gta-input"),
  premiumTagInput: document.getElementById("premium-tag-input"),
  premiumMonitoringFeeInput: document.getElementById("premium-monitoring-fee-input"),
  premiumKpis: document.getElementById("premium-kpis"),
  premiumMemorySubtitle: document.getElementById("premium-memory-subtitle"),
  premiumMemoryTable: document.getElementById("premium-memory-table"),
  premiumLotTable: document.getElementById("premium-lot-table"),
  detailTitle: document.getElementById("detail-title"),
  detailStatus: document.getElementById("detail-status"),
  detailInvestor: document.getElementById("detail-investor"),
  detailFundingRate: document.getElementById("detail-funding-rate"),
  detailPortfolioRate: document.getElementById("detail-portfolio-rate"),
  detailSpread: document.getElementById("detail-spread"),
  performanceTable: document.getElementById("performance-table"),
  detailPortfolioKpis: document.getElementById("detail-portfolio-kpis"),
  fundingComponentsTable: document.getElementById("funding-components-table"),
  fundingEventsTable: document.getElementById("funding-events-table"),
  guaranteeOverview: document.getElementById("guarantee-overview"),
  guaranteeLotsTable: document.getElementById("guarantee-lots-table"),
  detailHistoryTable: document.getElementById("detail-history-table"),
  waterfall: document.getElementById("waterfall"),
  alertList: document.getElementById("alert-list"),
  portfolioConcentrationTable: document.getElementById("portfolio-concentration-table"),
  portfolioTable: document.getElementById("portfolio-table")
};

const selectedOperation = () => operations.find((item) => item.id === state.selectedId) || operations[0];

function quoteRows() {
  return Array.isArray(quoteSnapshot.rows) ? quoteSnapshot.rows : [];
}

function quoteHistoryRows() {
  return Array.isArray(quoteSnapshot.historyRows) ? quoteSnapshot.historyRows : [];
}

function quoteCategoryLabel(category) {
  return QUOTE_CATEGORY_LABELS[category] || String(category || "-");
}

function replacementUfLabel(row) {
  const labels = REPLACEMENT_UFS_BY_CATEGORY[row.category] || [];
  return labels[Number(row.row_index) - 1] || "-";
}

function replacementTypeLabel(row) {
  return REPLACEMENT_TYPE_BY_COLUMN[Number(row.column_index)] || "-";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function uniqueSelectOptions(rows, valueGetter, labelGetter = valueGetter) {
  const options = new Map();
  rows.forEach((row) => {
    const value = valueGetter(row);
    const label = labelGetter(row);
    if (!value || value === "-") return;
    if (!options.has(String(value))) options.set(String(value), String(label));
  });
  return Array.from(options, ([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function replacementTypeOptions(rows) {
  return uniqueSelectOptions(
    rows,
    (row) => row.column_index,
    (row) => replacementTypeLabel(row)
  ).sort((a, b) => Number(a.value) - Number(b.value));
}

function validFilterValue(value, options) {
  return options.some((option) => option.value === value) ? value : ALL_FILTER_VALUE;
}

function renderSelectOptions(options, selectedValue, allLabel) {
  return `
    <option value="${ALL_FILTER_VALUE}">${escapeHtml(allLabel)}</option>
    ${options.map((option) => `
      <option value="${escapeHtml(option.value)}"${option.value === selectedValue ? " selected" : ""}>${escapeHtml(option.label)}</option>
    `).join("")}
  `;
}

function latestQuoteDate(rows = quoteRows()) {
  return rows.reduce((latest, row) => {
    if (!row.quote_date) return latest;
    return !latest || row.quote_date > latest ? row.quote_date : latest;
  }, "");
}

function latestCollectedAt(rows = quoteRows()) {
  return rows.reduce((latest, row) => {
    if (!row.collected_at) return latest;
    return !latest || row.collected_at > latest ? row.collected_at : latest;
  }, quoteSnapshot.exportedAt || "");
}

function quoteRowsByMap(mapType) {
  return quoteRows().filter((row) => row.map_type === mapType);
}

function quoteRowsForDate(dateKey = state.dateKey) {
  const currentRows = quoteRows();
  const currentDate = latestQuoteDate(currentRows);
  if (!dateKey || dateKey === currentDate) return currentRows;
  const selectedRows = quoteHistoryRows().filter((row) => row.quote_date === dateKey);
  const bulletinRows = selectedRows.filter((row) => row.map_type !== "historical_series");
  return bulletinRows.length ? bulletinRows : selectedRows;
}

function selectedQuoteRows() {
  return quoteRowsForDate(state.dateKey);
}

function selectedQuoteRowsByMap(mapType) {
  return selectedQuoteRows().filter((row) => row.map_type === mapType);
}

function quoteModeLabel(selectedRows = selectedQuoteRows()) {
  const currentDate = latestQuoteDate();
  if (state.dateKey === currentDate) return "Boletim atual";
  if (selectedRows.some((row) => row.map_type !== "historical_series")) return "Historico boletim";
  if (selectedRows.some((row) => row.map_type === "historical_series")) return "Historico Boi SP";
  return "Sem dados";
}

function regionalQuote(category, region, rows = quoteRows()) {
  return rows.find((row) =>
    row.product === "boi_gordo" &&
    (row.map_type === "regional_map" || row.map_type === "historical_series") &&
    row.category === category &&
    row.region === region
  );
}

function formatQuotePrice(row, digits = 2) {
  return row && row.price !== null && row.price !== undefined ? formatCurrency(row.price, digits) : "-";
}

function quoteSourceName() {
  return quoteSnapshot.sourceName || "DATAGRO Indicador do Boi";
}

function guaranteeQuoteCategory(category) {
  const normalized = normalizePartnerKey(category);
  if (normalized.includes("NOVILHA")) return "novilha";
  if (normalized.includes("VACA") || normalized.includes("FEMEA")) return "vaca";
  return "boi";
}

function guaranteeRegionalQuoteRows(dateKey = state.dateKey) {
  const selectedRows = quoteRowsForDate(dateKey);
  const selectedRegionalRows = selectedRows.filter((row) =>
    row.product === "boi_gordo" &&
    (row.map_type === "regional_map" || row.map_type === "historical_series")
  );
  if (selectedRegionalRows.length) return selectedRegionalRows;

  const latestDate = latestQuoteDate(quoteRows().filter((row) =>
    row.product === "boi_gordo" && row.map_type === "regional_map"
  ));
  return quoteRows().filter((row) =>
    row.product === "boi_gordo" &&
    row.map_type === "regional_map" &&
    (!latestDate || row.quote_date === latestDate)
  );
}

function fallbackRegionalQuote(category, rows) {
  return rows.find((row) => row.category === category && row.region === "SP") ||
    rows.find((row) => row.category === category) ||
    rows.find((row) => row.category === "boi") ||
    null;
}

function guaranteeQuoteForLot(row, asset, dateKey = state.dateKey) {
  const meta = row[6] || {};
  const category = guaranteeQuoteCategory(row[1]);
  const region = String(meta.uf || row[4] || "").trim().toUpperCase();
  const rows = guaranteeRegionalQuoteRows(dateKey);
  const quoteRow = regionalQuote(category, region, rows) ||
    regionalQuote("boi", region, rows) ||
    fallbackRegionalQuote(category, rows);
  const currentQuote = Number(quoteRow?.price || 0);
  const fallbackQuote = Number(row[5] || asset.quotePerArroba || 0);

  return {
    quotePerArroba: currentQuote || fallbackQuote,
    quoteCategory: quoteRow?.category || category,
    quoteRegion: quoteRow?.region || region,
    quoteDate: quoteRow?.quote_date || asset.quoteDate || "",
    quoteSource: quoteRow
      ? `${quoteSourceName()} ${quoteRow.quote_date}`
      : asset.quoteSource || "Cotacao nao informada"
  };
}

function guaranteeLots(operation, lotKey = "lots", bucketLabel = "Gado vivo", dateKey = state.dateKey) {
  const asset = operation.biologicalOnly
    ? operation.biologicalAsset || { quotePerArroba: 0, lots: [] }
    : biologicalAssetForOperation(operation, dateKey) || { quotePerArroba: 0, lots: [] };
  return (asset[lotKey] || []).filter((row) => !isExcludedGuaranteeLot(row)).map((row) => {
    const meta = row[6] || {};
    const heads = Number(row[2] || 0);
    const averageWeightKg = Number(row[3] || 0);
    const totalWeightKg = heads * averageWeightKg;
    const arrobas = totalWeightKg / ARROBA_KG;
    const quote = guaranteeQuoteForLot(row, asset, dateKey);
    const quotePerArroba = quote.quotePerArroba;
    const valueOverride = Number(meta.valueOverride || 0);
    const value = valueOverride > 0 ? valueOverride : arrobas * quotePerArroba;
    const isPartnershipGuarantee = (Array.isArray(meta.lastros) ? meta.lastros : [])
      .some((lastro) => partnershipTitleByLastro.has(String(lastro || "").trim()));
    const guaranteeFactor = isPartnershipGuarantee ? PARTNERSHIP_GUARANTEE_FACTOR : BIOLOGICAL_GUARANTEE_FACTOR;
    const guaranteeValue = value * guaranteeFactor;

    return {
      location: row[0],
      category: row[1],
      meta,
      bucketLabel,
      isPartnershipGuarantee,
      guaranteeFactor,
      heads,
      averageWeightKg,
      totalWeightKg,
      arrobas,
      quotePerArroba,
      quoteCategory: quote.quoteCategory,
      quoteRegion: quote.quoteRegion,
      quoteDate: quote.quoteDate,
      quoteSource: quote.quoteSource,
      value,
      guaranteeValue
    };
  });
}

function weightedQuotePerArroba(lots) {
  const totalArrobas = lots.reduce((sum, lot) => sum + lot.arrobas, 0);
  if (!totalArrobas) return 0;
  return lots.reduce((sum, lot) => sum + lot.quotePerArroba * lot.arrobas, 0) / totalArrobas;
}

function quoteSourceLabel(lots, asset) {
  const quoteDates = lots
    .map((lot) => lot.quoteDate)
    .filter(Boolean)
    .sort();
  if (quoteDates.length) return `${quoteSourceName()} ${quoteDates[quoteDates.length - 1]}`;
  return asset?.quoteSource || "Cotacao nao informada";
}

function guaranteeSummary(operation, dateKey = state.dateKey) {
  const asset = operation.biologicalOnly
    ? operation.biologicalAsset || {}
    : biologicalAssetForOperation(operation, dateKey) || {};
  const snapshot = biologicalAssetDataForDate(dateKey);
  const snapshotDate = biologicalAssetSnapshotDate(snapshot);
  const lots = guaranteeLots(operation, "lots", "Gado vivo", dateKey);
  const transitLots = guaranteeLots(operation, "transitLots", "Gado em transito", dateKey);
  const purchasedTransitLots = guaranteeLots(operation, "purchasedTransitLots", "Comprado em transito", dateKey);
  const allLots = [...lots, ...transitLots, ...purchasedTransitLots];
  const totalHeads = lots.reduce((sum, lot) => sum + lot.heads, 0);
  const totalWeightKg = lots.reduce((sum, lot) => sum + lot.totalWeightKg, 0);
  const totalArrobas = lots.reduce((sum, lot) => sum + lot.arrobas, 0);
  const grossValue = lots.reduce((sum, lot) => sum + lot.value, 0);
  const value = lots.reduce((sum, lot) => sum + lot.guaranteeValue, 0);
  const transitHeads = transitLots.reduce((sum, lot) => sum + lot.heads, 0);
  const transitWeightKg = transitLots.reduce((sum, lot) => sum + lot.totalWeightKg, 0);
  const transitArrobas = transitLots.reduce((sum, lot) => sum + lot.arrobas, 0);
  const grossTransitValue = transitLots.reduce((sum, lot) => sum + lot.value, 0);
  const transitValue = transitLots.reduce((sum, lot) => sum + lot.guaranteeValue, 0);
  const purchasedTransitHeads = purchasedTransitLots.reduce((sum, lot) => sum + lot.heads, 0);
  const purchasedTransitWeightKg = purchasedTransitLots.reduce((sum, lot) => sum + lot.totalWeightKg, 0);
  const purchasedTransitArrobas = purchasedTransitLots.reduce((sum, lot) => sum + lot.arrobas, 0);
  const grossPurchasedTransitValue = purchasedTransitLots.reduce((sum, lot) => sum + lot.value, 0);
  const purchasedTransitValue = purchasedTransitLots.reduce((sum, lot) => sum + lot.guaranteeValue, 0);
  const cashCoverage = Math.max(Number(operation.cash || 0), 0);
  const coverageValue = value + transitValue + purchasedTransitValue + cashCoverage;
  const fundingBalance = Number(operation.fundingBalance || 0);
  const coverage = fundingBalance ? coverageValue / fundingBalance : 0;

  return {
    lots,
    transitLots,
    purchasedTransitLots,
    snapshotDate,
    totalHeads,
    totalWeightKg,
    totalArrobas,
    averageWeightKg: totalHeads ? totalWeightKg / totalHeads : 0,
    grossValue,
    guaranteeFactor: BIOLOGICAL_GUARANTEE_FACTOR,
    transitHeads,
    transitWeightKg,
    transitArrobas,
    transitAverageWeightKg: transitHeads ? transitWeightKg / transitHeads : 0,
    grossTransitValue,
    transitValue,
    purchasedTransitHeads,
    purchasedTransitWeightKg,
    purchasedTransitArrobas,
    purchasedTransitAverageWeightKg: purchasedTransitHeads ? purchasedTransitWeightKg / purchasedTransitHeads : 0,
    grossPurchasedTransitValue,
    purchasedTransitValue,
    cashCoverage,
    quotePerArroba: weightedQuotePerArroba(allLots),
    quoteSource: quoteSourceLabel(allLots, asset),
    value,
    coverageValue,
    fundingBalance,
    hasFunding: fundingBalance > 0,
    coverage,
    surplus: fundingBalance ? coverageValue - fundingBalance : 0
  };
}

function guaranteeTone(coverage, lotCount = 1) {
  if (!lotCount) return "pending";
  if (coverage >= 1.2) return "ok";
  if (coverage >= 1.05) return "warn";
  return "bad";
}

function guaranteeLabel(tone) {
  if (tone === "pending") return "Pendente";
  if (tone === "ok") return "OK";
  if (tone === "warn") return "Atencao";
  return "Critico";
}

function guaranteeValueClass(tone) {
  if (tone === "bad") return "negative";
  if (tone === "warn" || tone === "pending") return "neutral";
  return "positive";
}

function signedClass(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

function dailyRateFromMonthly(monthlyRate) {
  return Math.pow(1 + Number(monthlyRate || 0) / 100, 1 / 21) - 1;
}

function returnFromValues(current, previous) {
  const base = Math.abs(Number(previous || 0));
  if (!base) return 0;
  return ((Number(current || 0) - Number(previous || 0)) / base) * 100;
}

function manualEventTargetComponent(operation, event) {
  const components = Array.isArray(operation.fundingComponents) ? operation.fundingComponents : [];
  const target = event.component || event.componentSheet || event.sheet;
  if (target) {
    return components.find((component) =>
      String(component.sheet || "") === String(target) ||
      String(component.operationLabel || "") === String(target)
    );
  }
  return components.length === 1 ? components[0] : null;
}

function applyManualFundingEvents(operation) {
  const events = Array.isArray(manualFundingEvents.events) ? manualFundingEvents.events : [];
  events
    .filter((event) => event.operationId === operation.id || event.fundingId === operation.id)
    .forEach((event) => {
      const component = manualEventTargetComponent(operation, event);
      if (!component) return;
      component.events = Array.isArray(component.events) ? component.events : [];
      const interestPaid = Number(event.interestPaid || 0);
      const amortization = Number(event.amortization || 0);
      component.events.push({
        date: event.date,
        amount: Number(event.amount ?? (interestPaid + amortization)) || 0,
        interestPaid,
        amortization,
        note: event.note || "",
        manual: true
      });
    });
}

function prepareFundingComponent(component) {
  if (!component || component._preparedForCalculation) return;
  component.events = Array.isArray(component.events) ? component.events : [];
  component.rateSchedule = Array.isArray(component.rateSchedule) ? component.rateSchedule : [];
  component._eventAmountByDate = new Map();
  component.events.forEach((event) => {
    if (!event.date) return;
    const amount = Number(event.amount ?? (Number(event.interestPaid || 0) + Number(event.amortization || 0))) || 0;
    component._eventAmountByDate.set(
      event.date,
      (component._eventAmountByDate.get(event.date) || 0) + amount
    );
  });
  component._rateByDate = new Map();
  component._rateDetailsByDate = new Map();
  component.rateSchedule.forEach((row) => {
    if (!row.date) return;
    component._rateByDate.set(row.date, Number(row.dailyRate || 0));
    component._rateDetailsByDate.set(row.date, row);
  });
  component._lastRateDate = component.rateSchedule.reduce((latest, row) =>
    row.date && (!latest || row.date > latest) ? row.date : latest
  , "");
  component._preparedForCalculation = true;
}

function prepareFundingInputs(operation) {
  operation.fundingComponents = Array.isArray(operation.fundingComponents)
    ? operation.fundingComponents
    : [];
  operation.fundingComponents.forEach(prepareFundingComponent);
}

function diAnnualRateFromRow(row) {
  if (!row) return 0;
  const daily = Number(row.taxaDia ?? row.dailyRate ?? row.rateDaily ?? 0);
  return daily > 0 ? annualRateFromDailyRate(daily) : 0;
}

function latestDiRowAtDate(dateKey) {
  if (!dateKey) return null;
  if (diRateRowsByDate.has(dateKey)) return diRateRowsByDate.get(dateKey);
  return diRateRows.filter((row) => row.date <= dateKey).pop() || null;
}

function fundingCdiAnnualRateAtDate(component, dateKey) {
  const row = latestDiRowAtDate(dateKey);
  const annualRate = diAnnualRateFromRow(row);
  if (annualRate > 0) return annualRate;
  return normalizeAnnualRate(component.cdiRate, 0);
}

function cdiSpreadDailyRate(component, dateKey) {
  const baseDays = Number(component.baseDays || 360);
  const cdiRate = fundingCdiAnnualRateAtDate(component, dateKey);
  const spreadRate = Number(component.spreadRate || 0);
  if (!cdiRate && !spreadRate) return 0;
  return Math.pow((1 + cdiRate) * (1 + spreadRate), 1 / baseDays) - 1;
}

function formulaDailyRate(component, dateKey = "") {
  const baseDays = Number(component.baseDays || 360);
  if (component.fundingRateType === "cdi_spread") {
    return cdiSpreadDailyRate(component, dateKey);
  }
  const monthlyRate = Number(component.fundingRate || 0) / 100;
  return Math.pow(1 + monthlyRate, 12 / baseDays) - 1;
}

function componentDailyRate(component, dateKey) {
  prepareFundingComponent(component);
  if (component.fundingRateType === "cdi_spread") {
    const scheduledRow = component._rateDetailsByDate.get(dateKey);
    const scheduledRate = component._rateByDate.get(dateKey);
    const scheduledCdiRate = Number(scheduledRow?.cdiRate || 0);
    if (Number.isFinite(scheduledRate) && scheduledRate > 0 && scheduledCdiRate > 0) return scheduledRate;
    if (diRateRowsByDate.has(dateKey)) return cdiSpreadDailyRate(component, dateKey);
    if ((latestDiRateDate && dateKey <= latestDiRateDate) || (component._lastRateDate && dateKey <= component._lastRateDate)) {
      return null;
    }
    return formulaDailyRate(component, dateKey);
  }
  if (component._rateByDate.has(dateKey)) return component._rateByDate.get(dateKey);
  if (component._lastRateDate && dateKey <= component._lastRateDate) return null;
  return formulaDailyRate(component, dateKey);
}

function shouldAccrueFunding(component, dateKey, isStartDate) {
  if (isStartDate && !component.accrueOnStartDate) return false;
  const baseDays = Number(component.baseDays || 360);
  if (baseDays === 252 && !isBusinessDayKey(dateKey)) return false;
  if (baseDays === 252 && component._lastRateDate && dateKey <= component._lastRateDate) {
    if (component.fundingRateType === "cdi_spread" && diRateRowsByDate.has(dateKey)) return true;
    return component._rateByDate.has(dateKey);
  }
  return true;
}

function calculateComponentBalance(component, dateKey) {
  prepareFundingComponent(component);
  const startKey = component.startDate || component.issueDate;
  if (!startKey || !dateKey || dateKey < startKey) return 0;
  component._balanceCache = component._balanceCache || new Map();
  if (component._balanceCache.has(dateKey)) return component._balanceCache.get(dateKey);

  let balance = Number(component.principal || 0);
  let currentKey = startKey;
  let guard = 0;
  while (currentKey <= dateKey && guard < 5000) {
    const isStartDate = currentKey === startKey;
    const rate = componentDailyRate(component, currentKey);
    if (rate !== null && shouldAccrueFunding(component, currentKey, isStartDate)) {
      balance += balance * rate;
    }
    balance -= component._eventAmountByDate.get(currentKey) || 0;
    if (balance < 0) balance = 0;
    if (Math.abs(balance) < 1) balance = 0;
    currentKey = addCalendarDays(currentKey, 1);
    guard += 1;
  }
  const rounded = roundMoney(balance);
  component._balanceCache.set(dateKey, rounded);
  return rounded;
}

function fundingHistoryBalanceAtDate(operation, dateKey) {
  const history = Array.isArray(operation.fundingHistory) ? operation.fundingHistory : [];
  let selected = null;
  for (const row of history) {
    if (!row.date || row.date > dateKey) break;
    selected = row;
  }
  return selected ? Number(selected.balance || 0) : null;
}

function fundingBalanceAtDate(operation, dateKey) {
  prepareFundingInputs(operation);
  if (operation.fundingComponents.length) {
    return roundMoney(operation.fundingComponents.reduce(
      (sum, component) => sum + calculateComponentBalance(component, dateKey),
      0
    ));
  }
  return fundingHistoryBalanceAtDate(operation, dateKey);
}

function componentBalanceBeforeDate(component, dateKey) {
  const startKey = component.startDate || component.issueDate;
  if (!startKey || !dateKey || dateKey < startKey) return 0;
  if (dateKey === startKey) return Number(component.principal || 0);
  return calculateComponentBalance(component, addCalendarDays(dateKey, -1));
}

function componentAccruedInterestOnDate(component, dateKey) {
  prepareFundingComponent(component);
  const startKey = component.startDate || component.issueDate;
  if (!startKey || !dateKey || dateKey < startKey) return 0;
  const isStartDate = dateKey === startKey;
  const rate = componentDailyRate(component, dateKey);
  if (rate === null || !shouldAccrueFunding(component, dateKey, isStartDate)) return 0;
  const base = Math.max(0, componentBalanceBeforeDate(component, dateKey));
  return base > 0 ? base * rate : 0;
}

function componentAccruedInterestBetween(component, startExclusiveKey, endInclusiveKey) {
  prepareFundingComponent(component);
  const startKey = component.startDate || component.issueDate;
  if (!startKey || !endInclusiveKey || endInclusiveKey < startKey) return 0;
  let currentKey = startExclusiveKey ? addCalendarDays(startExclusiveKey, 1) : startKey;
  if (currentKey < startKey) currentKey = startKey;
  let total = 0;
  let guard = 0;
  while (currentKey <= endInclusiveKey && guard < 5000) {
    total += componentAccruedInterestOnDate(component, currentKey);
    currentKey = addCalendarDays(currentKey, 1);
    guard += 1;
  }
  return roundMoney(total);
}

function componentDrawdownBetween(component, startExclusiveKey, endInclusiveKey) {
  const startKey = component.startDate || component.issueDate;
  if (!startKey || !endInclusiveKey || startKey > endInclusiveKey) return 0;
  if (startExclusiveKey && startKey <= startExclusiveKey) return 0;
  return Number(component.principal || 0);
}

function operationFundingAccruedInterestBetween(operation, startExclusiveKey, endInclusiveKey) {
  prepareFundingInputs(operation);
  return roundMoney(operation.fundingComponents.reduce(
    (sum, component) => sum + componentAccruedInterestBetween(component, startExclusiveKey, endInclusiveKey),
    0
  ));
}

function operationFundingDrawdownBetween(operation, startExclusiveKey, endInclusiveKey) {
  prepareFundingInputs(operation);
  return roundMoney(operation.fundingComponents.reduce(
    (sum, component) => sum + componentDrawdownBetween(component, startExclusiveKey, endInclusiveKey),
    0
  ));
}

function fundingReturnFromInterest(interestAccrued, baseBalance, drawdown = 0) {
  const base = Math.abs(Number(baseBalance || 0)) + Math.max(0, Number(drawdown || 0));
  if (!base) return 0;
  return (Math.max(0, Number(interestAccrued || 0)) / base) * 100;
}

function fundingReturnBetween(operation, startExclusiveKey, endInclusiveKey) {
  const interestAccrued = operationFundingAccruedInterestBetween(operation, startExclusiveKey, endInclusiveKey);
  const baseBalance = startExclusiveKey ? fundingBalanceAtDate(operation, startExclusiveKey) : 0;
  const drawdown = operationFundingDrawdownBetween(operation, startExclusiveKey, endInclusiveKey);
  return fundingReturnFromInterest(interestAccrued, baseBalance, drawdown);
}

function weightedFundingRateAtDate(operation, dateKey) {
  prepareFundingInputs(operation);
  if (!operation.fundingComponents.length) return null;
  const weighted = operation.fundingComponents.reduce((acc, component) => {
    const balance = Math.abs(calculateComponentBalance(component, dateKey));
    return {
      balance: acc.balance + balance,
      rate: acc.rate + balance * Number(component.fundingRate || 0),
      principal: acc.principal + Number(component.principal || 0),
      principalRate: acc.principalRate + Number(component.principal || 0) * Number(component.fundingRate || 0)
    };
  }, { balance: 0, rate: 0, principal: 0, principalRate: 0 });
  if (weighted.balance) return weighted.rate / weighted.balance;
  return weighted.principal ? weighted.principalRate / weighted.principal : 0;
}

function syntheticReturnOnFunding(operation, current, previous) {
  const base = Math.abs(Number(operation.fundingBalance || 0));
  if (!base) return 0;
  return ((Number(current || 0) - Number(previous || 0)) / base) * 100;
}

function syntheticAtDay(operation, dayIndex) {
  const monthlyDelta = operation.syntheticSub - operation.monthStartSyntheticSub;
  const trend = monthlyDelta / 22;
  const dailyVol = Math.sin((dayIndex + operation.name.length) * 0.65) * Math.abs(trend) * 0.14;
  const weekendStep = dayIndex % 5 === 0 ? trend * 0.9 : 0;
  return operation.syntheticSub - trend * (30 - dayIndex) + dailyVol + weekendStep;
}

function fundingAtOffset(operation, offset) {
  const dateKey = addBusinessDaysBack(state.dateKey, offset);
  const calculatedBalance = fundingBalanceAtDate(operation, dateKey);
  if (calculatedBalance !== null) return calculatedBalance;

  const dailyRate = dailyRateFromMonthly(operation.fundingRate);
  return operation.fundingBalance / Math.pow(1 + dailyRate, offset);
}

function syntheticAtDate(operation, dateKey) {
  const funding = fundingBalanceAtDate(operation, dateKey);
  if (funding === null) return null;
  const portfolioPosition = operationPortfolioPositionAtDate(operation, dateKey);
  const cash = cashBalanceAtDate(operation, dateKey);
  return roundMoney(Number(portfolioPosition.portfolioVp || 0) + cash - funding);
}

function syntheticAtOffset(operation, offset) {
  const dateKey = addBusinessDaysBack(state.dateKey, offset);
  const calculatedSynthetic = syntheticAtDate(operation, dateKey);
  if (calculatedSynthetic !== null) return calculatedSynthetic;
  if (offset === 0) return operation.syntheticSub;
  if (offset === 1) return operation.previousSyntheticSub;
  return syntheticAtDay(operation, Math.max(1, 30 - offset));
}

function buildDetailHistory(operation) {
  return Array.from({ length: 30 }, (_, offset) => {
    const dateKey = addBusinessDaysBack(state.dateKey, offset);
    const monthStartKey = rollingMonthReferenceKey(dateKey);
    const funding = fundingAtOffset(operation, offset);
    const fundingActivity = operationFundingActivity(operation, dateKey);
    const synthetic = syntheticAtOffset(operation, offset);
    const syntheticPrevious = syntheticAtOffset(operation, offset + 1);
    const syntheticMonthStart = syntheticAtDate(operation, monthStartKey) ?? synthetic;
    const result = synthetic;
    return {
      dateKey,
      funding,
      synthetic,
      result,
      fundingDay: fundingReturnFromInterest(fundingActivity.interestAccrued, fundingActivity.previousBalance, fundingActivity.drawdown),
      syntheticDay: syntheticReturnOnFunding(operation, synthetic, syntheticPrevious),
      fundingMonth: fundingReturnBetween(operation, monthStartKey, dateKey),
      syntheticMonth: syntheticReturnOnFunding(operation, synthetic, syntheticMonthStart)
    };
  });
}

function fundingComponentRows(operation) {
  prepareFundingInputs(operation);
  return operation.fundingComponents.map((component) => ({
    name: component.sheet || component.operationLabel || operation.shortName,
    principal: Number(component.principal || 0),
    startDate: component.startDate || component.issueDate,
    maturityDate: component.maturityDate,
    rateLabel: component.fundingRateLabel || `${formatPercent(component.fundingRate)} a.m.`,
    balance: calculateComponentBalance(component, state.dateKey),
    validationDelta: Number(component.validationDelta || 0),
    events: Array.isArray(component.events) ? component.events.length : 0
  }));
}

function fundingEvents(operation) {
  prepareFundingInputs(operation);
  return operation.fundingComponents.flatMap((component) =>
    component.events.map((event) => ({
      component: component.sheet || component.operationLabel || operation.shortName,
      date: event.date,
      amount: Number(event.amount || 0),
      interestPaid: Number(event.interestPaid || 0),
      amortization: Number(event.amortization || 0)
    }))
  ).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

function selectedEvolutionOperations() {
  if (state.evolutionId === "gerencial") return operations;
  const selected = operations.find((operation) => operation.id === state.evolutionId);
  return selected ? [selected] : operations;
}

function selectedEvolutionLabel() {
  if (state.evolutionId === "gerencial") return "Todos os fundings";
  const selected = operations.find((operation) => operation.id === state.evolutionId);
  return selected ? selected.shortName : "Todos os fundings";
}

function operationStartDate(operation) {
  prepareFundingInputs(operation);
  return operation.fundingComponents
    .map((component) => component.startDate || component.issueDate)
    .filter(Boolean)
    .sort()[0] || operation.issueDate || "";
}

function operationFundingEventsCount(operation) {
  return fundingEvents(operation).length;
}

function operationFundingPrincipal(operation) {
  prepareFundingInputs(operation);
  return Number(operation.fundingPrincipal || 0) || operation.fundingComponents.reduce(
    (sum, component) => sum + Number(component.principal || 0),
    0
  );
}

function componentEventActivity(component, dateKey) {
  prepareFundingComponent(component);
  return component.events.reduce((total, event) => {
    if (event.date !== dateKey) return total;
    const interestPaid = Number(event.interestPaid || 0);
    const amortization = Number(event.amortization || 0);
    const amount = Number(event.amount ?? (interestPaid + amortization)) || 0;
    return {
      count: total.count + 1,
      payment: total.payment + amount,
      interestPaid: total.interestPaid + interestPaid,
      amortization: total.amortization + amortization
    };
  }, { count: 0, payment: 0, interestPaid: 0, amortization: 0 });
}

function operationFundingActivity(operation, dateKey) {
  prepareFundingInputs(operation);
  const previousKey = addBusinessDaysBack(dateKey, 1);
  const previousBalance = fundingBalanceAtDate(operation, previousKey) ?? 0;
  const currentBalance = fundingBalanceAtDate(operation, dateKey) ?? 0;
  const componentTotals = operation.fundingComponents.reduce((total, component) => {
    const startKey = component.startDate || component.issueDate;
    const eventActivity = componentEventActivity(component, dateKey);
    const drawdown = startKey === dateKey ? Number(component.principal || 0) : 0;
    return {
      drawdown: total.drawdown + drawdown,
      payment: total.payment + eventActivity.payment,
      interestPaid: total.interestPaid + eventActivity.interestPaid,
      amortization: total.amortization + eventActivity.amortization,
      events: total.events + eventActivity.count
    };
  }, { drawdown: 0, payment: 0, interestPaid: 0, amortization: 0, events: 0 });
  const interestAccrued = operationFundingAccruedInterestBetween(operation, previousKey, dateKey);
  return {
    dateKey,
    previousBalance: roundMoney(previousBalance),
    currentBalance: roundMoney(currentBalance),
    drawdown: roundMoney(componentTotals.drawdown),
    interestAccrued,
    payment: roundMoney(componentTotals.payment),
    interestPaid: roundMoney(componentTotals.interestPaid),
    amortization: roundMoney(componentTotals.amortization),
    monthChange: roundMoney(currentBalance - (fundingBalanceAtDate(operation, rollingMonthReferenceKey(dateKey)) ?? currentBalance)),
    events: componentTotals.events
  };
}

function aggregateFundingActivity(scopeOperations, dateKey) {
  return scopeOperations.reduce((total, operation) => {
    const row = operationFundingActivity(operation, dateKey);
    return {
      dateKey,
      previousBalance: total.previousBalance + row.previousBalance,
      currentBalance: total.currentBalance + row.currentBalance,
      drawdown: total.drawdown + row.drawdown,
      interestAccrued: total.interestAccrued + row.interestAccrued,
      payment: total.payment + row.payment,
      interestPaid: total.interestPaid + row.interestPaid,
      amortization: total.amortization + row.amortization,
      monthChange: total.monthChange + row.monthChange,
      events: total.events + row.events
    };
  }, {
    dateKey,
    previousBalance: 0,
    currentBalance: 0,
    drawdown: 0,
    interestAccrued: 0,
    payment: 0,
    interestPaid: 0,
    amortization: 0,
    monthChange: 0,
    events: 0
  });
}

function fundingEvolutionDates(count = 30) {
  return Array.from({ length: count }, (_, offset) => addBusinessDaysBack(state.dateKey, offset)).reverse();
}

function fundingEvolutionDailyRows() {
  const scopeOperations = selectedEvolutionOperations();
  return fundingEvolutionDates().map((dateKey) => aggregateFundingActivity(scopeOperations, dateKey));
}

function fundingEvolutionRate(scopeOperations) {
  const weighted = scopeOperations.reduce((total, operation) => ({
    balance: total.balance + Math.abs(Number(operation.fundingBalance || 0)),
    rate: total.rate + Math.abs(Number(operation.fundingBalance || 0)) * Number(operation.fundingRate || 0)
  }), { balance: 0, rate: 0 });
  return weighted.balance ? weighted.rate / weighted.balance : 0;
}

function fundingEvolutionChart(rows, ariaLabel = "Evolucao do saldo de funding") {
  if (!rows.length) return `<p class="formula-line">Sem dados de funding para o periodo.</p>`;
  const width = 760;
  const height = 260;
  const left = 84;
  const right = 22;
  const top = 24;
  const bottom = 42;
  const values = rows.map((row) => Number(row.currentBalance || 0));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || Math.max(maxValue * 0.05, 1);
  const yMin = minValue - spread * 0.08;
  const yMax = maxValue + spread * 0.08;
  const ySpread = yMax - yMin || 1;
  const xForIndex = (index) => left + (index / Math.max(rows.length - 1, 1)) * (width - left - right);
  const yForValue = (value) => top + ((yMax - value) / ySpread) * (height - top - bottom);
  const points = rows.map((row, index) =>
    `${xForIndex(index).toFixed(1)},${yForValue(row.currentBalance).toFixed(1)}`
  ).join(" ");
  const yTicks = [0, 0.5, 1].map((step) => yMin + (ySpread * step));
  const xTicks = [0, Math.floor((rows.length - 1) / 2), rows.length - 1]
    .filter((index, position, list) => list.indexOf(index) === position);

  return `
    <svg class="funding-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">
      ${yTicks.map((value) => {
        const y = yForValue(value);
        return `
          <line class="chart-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}"></line>
          <text class="chart-label" x="${left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(formatCurrencyShort(value))}</text>
        `;
      }).join("")}
      <polyline class="funding-chart-line" points="${points}"></polyline>
      ${rows.map((row, index) => `
        <circle class="funding-chart-dot" cx="${xForIndex(index).toFixed(1)}" cy="${yForValue(row.currentBalance).toFixed(1)}" r="3.4">
          <title>${escapeHtml(formatDate(row.dateKey))} - ${escapeHtml(formatCurrency(row.currentBalance))}</title>
        </circle>
      `).join("")}
      ${xTicks.map((index) => `
        <text class="chart-label" x="${xForIndex(index).toFixed(1)}" y="${height - 14}" text-anchor="middle">${escapeHtml(formatDate(rows[index].dateKey).slice(0, 5))}</text>
      `).join("")}
    </svg>
  `;
}

function fundingDualLineChart(rows, series, ariaLabel = "Evolucao comparativa") {
  const visibleSeries = series.filter((item) => rows.some((row) => Number.isFinite(Number(row[item.key]))));
  if (!rows.length || !visibleSeries.length) return `<p class="formula-line">Sem dados para o periodo.</p>`;
  const width = 760;
  const height = 132;
  const left = 78;
  const right = 22;
  const top = 14;
  const bottom = 26;
  const values = rows.flatMap((row) => visibleSeries.map((item) => Number(row[item.key] || 0)));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const spread = maxValue - minValue || Math.max(Math.abs(maxValue) * 0.05, 1);
  const yMin = minValue - spread * 0.08;
  const yMax = maxValue + spread * 0.08;
  const ySpread = yMax - yMin || 1;
  const xForIndex = (index) => left + (index / Math.max(rows.length - 1, 1)) * (width - left - right);
  const yForValue = (value) => top + ((yMax - value) / ySpread) * (height - top - bottom);
  const yTicks = [0, 0.5, 1].map((step) => yMin + (ySpread * step));
  const xTicks = [0, Math.floor((rows.length - 1) / 2), rows.length - 1]
    .filter((index, position, list) => list.indexOf(index) === position);

  return `
    <div class="chart-legend">
      ${visibleSeries.map((item) => `
        <span><i class="chart-legend-swatch ${item.className}"></i>${escapeHtml(item.label)}</span>
      `).join("")}
    </div>
    <svg class="funding-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}">
      ${yTicks.map((value) => {
        const y = yForValue(value);
        return `
          <line class="chart-grid" x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}"></line>
          <text class="chart-label" x="${left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(formatCurrencyShort(value))}</text>
        `;
      }).join("")}
      ${visibleSeries.map((item) => {
        const points = rows.map((row, index) =>
          `${xForIndex(index).toFixed(1)},${yForValue(Number(row[item.key] || 0)).toFixed(1)}`
        ).join(" ");
        return `<polyline class="funding-chart-line ${item.className}" points="${points}"></polyline>`;
      }).join("")}
      ${visibleSeries.map((item) => rows.map((row, index) => {
        const value = Number(row[item.key] || 0);
        return `
          <circle class="funding-chart-dot ${item.className}" cx="${xForIndex(index).toFixed(1)}" cy="${yForValue(value).toFixed(1)}" r="2.8">
            <title>${escapeHtml(formatDate(row.dateKey))} - ${escapeHtml(item.label)}: ${escapeHtml(formatCurrency(value))}</title>
          </circle>
        `;
      }).join("")).join("")}
      ${xTicks.map((index) => `
        <text class="chart-label" x="${xForIndex(index).toFixed(1)}" y="${height - 14}" text-anchor="middle">${escapeHtml(formatDate(rows[index].dateKey).slice(0, 5))}</text>
      `).join("")}
    </svg>
  `;
}

function selectedCashOperations() {
  if (state.cashId === "gerencial") return operations;
  const selected = operations.find((operation) => operation.id === state.cashId);
  return selected ? [selected] : operations;
}

function selectedCashLabel() {
  if (state.cashId === "gerencial") return "Todos os fundings";
  const selected = operations.find((operation) => operation.id === state.cashId);
  return selected ? selected.shortName : "Todos os fundings";
}

function portfolioDataForOperation(operation) {
  return importedPortfolioOperations
    .filter((item) => item.operationId === operation.id || item.fundingId === operation.id)
    .sort((a, b) => String(a.positionDate || "").localeCompare(String(b.positionDate || "")))
    .pop() || null;
}

function portfolioDataForOperationAtDate(operation, dateKey) {
  if (dateKey) {
    const frozen = frozenPortfolioOperations
      .filter((item) =>
        (item.operationId === operation.id || item.fundingId === operation.id)
        && (item.freezeThroughDate || frozenPortfolioDefaultThroughDate || item.positionDate)
        && dateKey <= (item.freezeThroughDate || frozenPortfolioDefaultThroughDate || item.positionDate)
      )
      .sort((a, b) => String(a.positionDate || "").localeCompare(String(b.positionDate || "")))[0];
    if (frozen) return frozen;
  }
  return portfolioDataForOperation(operation);
}

function selectedPortfolioOperations() {
  if (state.portfolioId === "gerencial") return operations;
  const selected = operations.find((operation) => operation.id === state.portfolioId);
  return selected ? [selected] : operations;
}

function selectedPortfolioLabel() {
  if (state.portfolioId === "gerencial") return "Todos os fundings";
  const selected = operations.find((operation) => operation.id === state.portfolioId);
  return selected ? selected.shortName : "Todos os fundings";
}

function importedPortfolioCashEvents(operation, dateKey = "") {
  const data = dateKey ? portfolioDataForOperationAtDate(operation, dateKey) : portfolioDataForOperation(operation);
  return Array.isArray(data?.cashEvents) ? data.cashEvents : [];
}

function portfolioTitlePurchaseDate(title) {
  return title.purchaseDate || title.sentDate || title.issueDate || "";
}

function portfolioTitleKey(title) {
  return String(title?.lastro || title?.id || "").trim();
}

function portfolioTitleManualMonthlyRate(title) {
  return PORTFOLIO_MANUAL_MONTHLY_RATE_BY_LASTRO[portfolioTitleKey(title)] || 0;
}

function portfolioTitleAccrualBaseDays(title) {
  const explicitBase = Number(title.accrualBaseDays || 0);
  if (explicitBase > 0) return explicitBase;
  return 360;
}

function portfolioTitleAccrualPeriods(title, dateKey) {
  const purchaseDate = portfolioTitlePurchaseDate(title);
  if (!purchaseDate) return 0;
  const dayCount = title.accrualDayCount || "calendar_inclusive";
  const days = dateDiffDays(purchaseDate, dateKey);
  if (dayCount === "calendar_inclusive") return Math.max(0, days);
  if (dayCount === "business_exclusive") return businessDaysBetweenExclusive(purchaseDate, dateKey);
  return Math.max(0, days);
}

function portfolioMonthlyRateDecimal(title) {
  const partnershipReference = portfolioTitlePartnershipReference(title);
  if (partnershipReference) {
    const targetRate = decimalRateValue(
      title?.partnershipTargetMonthlyRate
      || partnershipReference.targetMonthlyRate
      || partnershipTitleData.targetMonthlyRate
      || PARTNERSHIP_DEFAULT_TARGET_MONTHLY_RATE
    );
    if (targetRate > 0) return targetRate;
  }
  const manualMonthly = portfolioTitleManualMonthlyRate(title);
  const rawMonthly = Number(title.discountRateMonthly || 0);
  const annual = Number(title.effectiveRateAnnual || 0);
  const daily = Number(title.dailyRate || 0);
  const rateSource = normalizePartnerKey(title?.rateSource);
  if (manualMonthly) return manualMonthly;
  if (rawMonthly > PORTFOLIO_ANNUAL_RATE_THRESHOLD) return Math.pow(1 + rawMonthly, 1 / 12) - 1;
  if (rawMonthly > 0) return rawMonthly;
  if (annual > 0) return Math.pow(1 + annual, 1 / 12) - 1;
  if (daily > 0) return Math.pow(1 + daily, 30) - 1;
  if (rateSource === "SEM TAXA" || rateSource === "TAXA ALVO PARCERIA") return PARTNERSHIP_DEFAULT_TARGET_MONTHLY_RATE;
  return 0;
}

function portfolioDailyRateDecimal(title) {
  const monthly = portfolioMonthlyRateDecimal(title);
  if (monthly > 0) return Math.pow(1 + monthly, 12 / portfolioTitleAccrualBaseDays(title)) - 1;
  return Number(title.dailyRate || 0);
}

function portfolioTitleIsEligible(title) {
  return title.portfolioEligible !== false;
}

function portfolioTitleIsOpenAtDate(title, dateKey, positionDate) {
  if (!portfolioTitleIsEligible(title)) return false;
  if (title.settledWithoutDate) return false;
  const purchaseDate = portfolioTitlePurchaseDate(title);
  if (purchaseDate && purchaseDate > dateKey) return false;
  if (title.settledDate && title.settledDate <= dateKey) return false;
  if (positionDate && dateKey >= positionDate) return Boolean(title.isActive);
  return true;
}

function portfolioTitleMonthlyRate(title) {
  return portfolioMonthlyRateDecimal(title) * 100;
}

function portfolioTitleValueAtDate(title, dateKey, positionDate) {
  if (!portfolioTitleIsOpenAtDate(title, dateKey, positionDate)) return 0;
  const purchaseDate = portfolioTitlePurchaseDate(title);
  const acquisition = Number(title.acquisitionValue || 0);
  if (!purchaseDate || !acquisition) return 0;
  const dailyRate = portfolioDailyRateDecimal(title);
  const periods = portfolioTitleAccrualPeriods(title, dateKey);
  const accrued = dailyRate ? acquisition * Math.pow(1 + dailyRate, periods) : acquisition;
  const face = Number(title.faceValue || 0);
  const partialPaid = portfolioTitleLiquidationsUntil(title, dateKey);
  const value = title.allowPresentValueAboveFace ? accrued : Math.min(accrued, face || accrued);
  return Math.max(0, value - partialPaid);
}

function portfolioTitleLiquidationsUntil(title, dateKey) {
  const items = Array.isArray(title.partialLiquidations) ? title.partialLiquidations : [];
  return items.reduce((sum, item) => {
    const eventDate = String(item.date || "");
    if (!eventDate || eventDate > dateKey) return sum;
    return sum + Number(item.amount || 0);
  }, 0);
}

function portfolioTitleFaceValueAtDate(title, dateKey, positionDate) {
  if (!portfolioTitleIsOpenAtDate(title, dateKey, positionDate)) return 0;
  const face = Number(title.faceValue || 0);
  return Math.max(0, face - portfolioTitleLiquidationsUntil(title, dateKey));
}

function operationPortfolioPositionAtDate(operation, dateKey) {
  const data = portfolioDataForOperationAtDate(operation, dateKey);
  if (!data) {
    const rows = Array.isArray(operation.portfolio) ? operation.portfolio : [];
    return {
      imported: false,
      sourceFile: "",
      positionDate: "",
      titleCount: rows.length,
      uniqueTitles: rows.length,
      settledTitles: 0,
      portfolioVp: rows.reduce((sum, row) => sum + Number(row[3] || 0), 0),
      portfolioVn: rows.reduce((sum, row) => sum + Number(row[2] || 0), 0),
      weightedRate: rows.reduce((sum, row) => sum + Number(row[3] || 0) * Number(row[4] || 0), 0) / (rows.reduce((sum, row) => sum + Number(row[3] || 0), 0) || 1),
      weightedDays: Number(operation.duration || 0),
      overdueVp: Number(operation.overdue || 0),
      titles: [],
      rows
    };
  }

  const positionDate = data.positionDate || dateKey;
  const previousKey = addBusinessDaysBack(dateKey, 1);
  const titles = Array.isArray(data.titles) ? data.titles : [];
  const activeTitles = titles.filter((title) => portfolioTitleIsOpenAtDate(title, dateKey, positionDate));
  const valuedTitles = activeTitles.map((title) => {
    const calculatedPresentValue = portfolioTitleValueAtDate(title, dateKey, positionDate);
    const previousPresentValue = portfolioTitleValueAtDate(title, previousKey, positionDate);
    const calculatedFaceValue = portfolioTitleFaceValueAtDate(title, dateKey, positionDate);
    return {
      ...title,
      calculatedFaceValue,
      calculatedPresentValue,
      previousPresentValue,
      dailyVpChange: roundMoney(calculatedPresentValue - previousPresentValue),
      monthlyRatePercent: portfolioTitleMonthlyRate(title)
    };
  });
  const portfolioVp = valuedTitles.reduce((sum, title) => sum + Number(title.calculatedPresentValue || 0), 0);
  const portfolioVn = valuedTitles.reduce((sum, title) => sum + Number(title.calculatedFaceValue || 0), 0);
  const weightedRate = valuedTitles.reduce((sum, title) =>
    sum + Number(title.calculatedPresentValue || 0) * Number(title.monthlyRatePercent || 0)
  , 0) / (portfolioVp || 1);
  const weightedDays = valuedTitles.reduce((sum, title) =>
    sum + Number(title.calculatedPresentValue || 0) * Math.max(0, Number(title.daysToMaturity || 0))
  , 0) / (portfolioVp || 1);
  const overdueVp = valuedTitles
    .filter((title) => Number(title.daysToMaturity || 0) < 0)
    .reduce((sum, title) => sum + Number(title.calculatedPresentValue || 0), 0);
  const rows = valuedTitles.map((title) => [
    title.sacado || title.cedente || "-",
    title.titleType || "-",
    Number(title.calculatedFaceValue || 0),
    Number(title.calculatedPresentValue || 0),
    Number(title.monthlyRatePercent || 0),
    title.maturityDate ? formatDate(title.maturityDate) : "-",
    Number(title.daysToMaturity || 0) < 0 ? "Vencido" : "Em aberto"
  ]);

  return {
    imported: true,
    sourceFile: data.sourceFile || "",
    positionDate,
    titleCount: valuedTitles.length,
    uniqueTitles: Number(data.totals?.uniqueTitles || titles.length),
    settledTitles: Number(data.totals?.settledTitles || 0),
    portfolioVp,
    portfolioVn,
    weightedRate,
    weightedDays,
    overdueVp,
    titles: valuedTitles,
    rows
  };
}

function aggregatePortfolioPosition(scopeOperations, dateKey) {
  return scopeOperations.reduce((total, operation) => {
    const position = operationPortfolioPositionAtDate(operation, dateKey);
    return {
      dateKey,
      titleCount: total.titleCount + position.titleCount,
      uniqueTitles: total.uniqueTitles + position.uniqueTitles,
      settledTitles: total.settledTitles + position.settledTitles,
      portfolioVp: total.portfolioVp + position.portfolioVp,
      portfolioVn: total.portfolioVn + position.portfolioVn,
      rateAmount: total.rateAmount + position.portfolioVp * position.weightedRate,
      dayAmount: total.dayAmount + position.portfolioVp * position.weightedDays,
      overdueVp: total.overdueVp + position.overdueVp
    };
  }, {
    dateKey,
    titleCount: 0,
    uniqueTitles: 0,
    settledTitles: 0,
    portfolioVp: 0,
    portfolioVn: 0,
    rateAmount: 0,
    dayAmount: 0,
    overdueVp: 0
  });
}

function portfolioHistoryStartDate(scopeOperations) {
  return scopeOperations
    .map((operation) => {
      const data = portfolioDataForOperationAtDate(operation, state.dateKey);
      const rows = Array.isArray(data?.history) ? data.history : [];
      return rows[0]?.date;
    })
    .filter(Boolean)
    .sort()[0] || cashHistoryStartDate(scopeOperations);
}

function aggregatePortfolioCashActivity(scopeOperations, dateKey) {
  return scopeOperations.reduce((total, operation) =>
    importedPortfolioCashEvents(operation, dateKey)
      .filter((event) => event.date === dateKey)
      .reduce((inner, event) => {
        const amount = cashEventAmount(event);
        if (normalizeCashEventType(event) === "portfolioPurchase") inner.purchases += amount;
        if (normalizeCashEventType(event) === "portfolioLiquidation") inner.liquidations += amount;
        return inner;
      }, total)
  , { purchases: 0, liquidations: 0 });
}

function portfolioDailyRows() {
  const scopeOperations = selectedPortfolioOperations();
  const startKey = portfolioHistoryStartDate(scopeOperations);
  const rows = calendarDatesBetween(startKey, state.dateKey).map((dateKey) => {
    const position = aggregatePortfolioPosition(scopeOperations, dateKey);
    const cashActivity = aggregatePortfolioCashActivity(scopeOperations, dateKey);
    return {
      dateKey,
      purchases: roundMoney(cashActivity.purchases),
      liquidations: roundMoney(cashActivity.liquidations),
      activeTitles: position.titleCount,
      faceValue: roundMoney(position.portfolioVn),
      presentValue: roundMoney(position.portfolioVp),
      currentBalance: roundMoney(position.portfolioVp)
    };
  });
  return rows.map((row, index) => ({
    ...row,
    dailyVpChange: roundMoney(row.presentValue - (index ? rows[index - 1].presentValue : 0))
  }));
}

function portfolioMaturityBucket(daysToMaturity) {
  const days = Number(daysToMaturity || 0);
  if (days < 0) return "Vencido";
  if (days <= 7) return "0 a 7 dias";
  if (days <= 15) return "8 a 15 dias";
  if (days <= 30) return "16 a 30 dias";
  if (days <= 60) return "31 a 60 dias";
  if (days <= 90) return "61 a 90 dias";
  return "Acima de 90 dias";
}

function portfolioAgingRows(scopeOperations, dateKey) {
  return scopeOperations
    .flatMap((operation) => operationPortfolioPositionAtDate(operation, dateKey).titles.map((title) => {
      const days = title.maturityDate ? dateDiffDays(dateKey, title.maturityDate) : null;
      return {
        operation,
        title,
        days,
        bucket: days === null ? "Sem vencimento" : portfolioMaturityBucket(days)
      };
    }))
    .filter((row) => row.days !== null)
    .sort((a, b) =>
      Number(a.days || 0) - Number(b.days || 0) ||
      Number(b.title.calculatedPresentValue || 0) - Number(a.title.calculatedPresentValue || 0)
    )
    .slice(0, 40);
}

function operationCashEvents(operation, dateKey = "") {
  const sharedEvents = Array.isArray(cashData.events) ? cashData.events : [];
  const directEvents = Array.isArray(operation.cashEvents) ? operation.cashEvents : [];
  const portfolioEvents = importedPortfolioCashEvents(operation, dateKey || state.dateKey);
  const matchedSharedEvents = sharedEvents.filter((event) =>
    event.operationId === operation.id ||
    event.fundingId === operation.id
  );
  return [...matchedSharedEvents, ...directEvents, ...portfolioEvents]
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
}

function normalizeCashEventType(event) {
  const type = String(event.type || event.kind || event.eventType || "").toLowerCase();
  if (["portfolio_purchase", "carteira_compra", "compra_carteira", "compra", "purchase"].includes(type)) return "portfolioPurchase";
  if (["portfolio_liquidation", "carteira_liquidacao", "liquidacao_carteira", "liquidacao", "liquidation", "recebimento_carteira"].includes(type)) return "portfolioLiquidation";
  if (["investor_contribution", "aporte_investidor", "aporte"].includes(type)) return "investorInflow";
  if (["funding_amortization", "amortizacao_funding", "amortizacao"].includes(type)) return "fundingAmortization";
  return "adjustment";
}

function cashEventAmount(event) {
  return Number(event.amount ?? event.value ?? event.valor ?? 0) || 0;
}

function operationCashEventActivity(operation, dateKey) {
  return operationCashEvents(operation, dateKey).reduce((total, event) => {
    if (event.date !== dateKey) return total;
    const amount = cashEventAmount(event);
    const type = normalizeCashEventType(event);
    total.count += 1;
    if (type === "portfolioPurchase") {
      total.portfolioPurchase += amount;
      total.portfolioEvents += 1;
    } else if (type === "portfolioLiquidation") {
      total.portfolioLiquidation += amount;
      total.portfolioEvents += 1;
    } else if (type === "investorInflow") {
      total.investorInflow += amount;
    } else if (type === "fundingAmortization") {
      total.fundingAmortization += amount;
    } else {
      total.adjustment += amount;
    }
    return total;
  }, {
    count: 0,
    portfolioEvents: 0,
    investorInflow: 0,
    portfolioPurchase: 0,
    portfolioLiquidation: 0,
    fundingAmortization: 0,
    adjustment: 0
  });
}

function fundingCashInflowAtDate(operation, dateKey) {
  prepareFundingInputs(operation);
  return operation.fundingComponents.reduce((sum, component) => {
    const startKey = component.startDate || component.issueDate;
    return startKey === dateKey ? sum + Number(component.principal || 0) : sum;
  }, 0);
}

function fundingAmortizationAtDate(operation, dateKey) {
  prepareFundingInputs(operation);
  return operation.fundingComponents.reduce((sum, component) => {
    prepareFundingComponent(component);
    return sum + component.events.reduce((eventSum, event) => {
      if (event.date !== dateKey) return eventSum;
      const interestPaid = Number(event.interestPaid || 0);
      const amortization = Number(event.amortization || 0);
      const payment = Number(event.amount ?? (interestPaid + amortization)) || 0;
      return eventSum + payment;
    }, 0);
  }, 0);
}

function operationCashFirstContributionDate(operation, dateKey = "") {
  prepareFundingInputs(operation);
  const fundingDates = operation.fundingComponents
    .filter((component) => Number(component.principal || 0) > 0)
    .map((component) => component.startDate || component.issueDate)
    .filter(Boolean);
  const investorInflowDates = operationCashEvents(operation, dateKey)
    .filter((event) => normalizeCashEventType(event) === "investorInflow" && cashEventAmount(event) > 0)
    .map((event) => event.date)
    .filter(Boolean);
  return [...fundingDates, ...investorInflowDates].sort()[0] || "";
}

function operationCashStartDate(operation, dateKey = "") {
  prepareFundingInputs(operation);
  const firstContribution = operationCashFirstContributionDate(operation, dateKey);
  if (firstContribution) return firstContribution;
  const cashDates = operationCashEvents(operation, dateKey)
    .map((event) => event.date)
    .filter(Boolean);
  return cashDates.sort()[0] || operation.issueDate || state.dateKey;
}

function cashCdiRateDetailsAtDate(dateKey) {
  const explicitRows = Array.isArray(cashData.cdiRates) ? cashData.cdiRates : [];
  const explicit = explicitRows
    .filter((row) => row.date && row.date <= dateKey)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .pop();
  if (explicit) {
    const dailyRate = Number(explicit.taxaDia ?? explicit.dailyRate ?? 0);
    const annualRate = dailyRate
      ? annualRateFromDailyRate(dailyRate)
      : normalizeAnnualRate(explicit.annualRate ?? explicit.cdiRate, CASH_DEFAULT_ANNUAL_CDI_RATE);
    return { annualRate, dateKey: explicit.date, source: "CDI caixa manual" };
  }

  const bcbRow = diRateRows
    .filter((row) => row.date <= dateKey)
    .pop();
  if (bcbRow) {
    const annualRate = annualRateFromDailyRate(bcbRow.taxaDia ?? bcbRow.dailyRate ?? bcbRow.rateDaily);
    return { annualRate, dateKey: bcbRow.date, source: "Curva DI BCB" };
  }

  return {
    annualRate: normalizeAnnualRate(cashData.annualCdiRate, CASH_DEFAULT_ANNUAL_CDI_RATE),
    dateKey: "",
    source: "Parametro caixa"
  };
}

function cdiAnnualRateAtDate(dateKey) {
  return cashCdiRateDetailsAtDate(dateKey).annualRate;
}

function cdiRateSourceLabelAtDate(dateKey) {
  const details = cashCdiRateDetailsAtDate(dateKey);
  return details.dateKey ? `${details.source} ${formatDate(details.dateKey)}` : details.source;
}

function cashDailyApplicationRate(dateKey) {
  if (!isBusinessDayKey(dateKey)) return 0;
  const annualRate = cdiAnnualRateAtDate(dateKey);
  return (Math.pow(1 + annualRate, 1 / 252) - 1) * CASH_APPLICATION_CDI_SHARE;
}

function emptyCashRow(operation, dateKey) {
  return {
    operation,
    dateKey,
    initialBalance: 0,
    investorInflow: 0,
    portfolioPurchase: 0,
    portfolioLiquidation: 0,
    fundingAmortization: 0,
    adjustment: 0,
    investmentIncome: 0,
    currentBalance: 0,
    appliedBalance: 0,
    freeBalance: 0,
    totalInvestorInflow: 0,
    totalPortfolioPurchase: 0,
    totalPortfolioLiquidation: 0,
    totalFundingAmortization: 0,
    totalInvestmentIncome: 0,
    totalAdjustment: 0,
    totalPortfolioEvents: 0,
    cdiAnnualRate: cdiAnnualRateAtDate(dateKey),
    cdiDailyRate: cashDailyApplicationRate(dateKey)
  };
}

function operationCashDailyRows(operation, endDateKey) {
  const cacheKey = endDateKey || state.dateKey;
  operation._cashRowsCache = operation._cashRowsCache || new Map();
  if (operation._cashRowsCache.has(cacheKey)) return operation._cashRowsCache.get(cacheKey);

  const startKey = operationCashStartDate(operation, endDateKey);
  if (!startKey || !endDateKey || endDateKey < startKey) {
    const rows = [];
    operation._cashRowsCache.set(cacheKey, rows);
    return rows;
  }

  let currentKey = startKey;
  let previousCash = 0;
  let guard = 0;
  const rows = [];
  const cumulative = {
    investorInflow: 0,
    portfolioPurchase: 0,
    portfolioLiquidation: 0,
    fundingAmortization: 0,
    adjustment: 0,
    investmentIncome: 0,
    portfolioEvents: 0
  };

  while (currentKey <= endDateKey && guard < 6000) {
    const cashActivity = operationCashEventActivity(operation, currentKey);
    const fundingInflow = fundingCashInflowAtDate(operation, currentKey);
    const openingFundingInflow = currentKey === startKey ? fundingInflow : 0;
    const investorInflow = (currentKey === startKey ? 0 : fundingInflow) + cashActivity.investorInflow;
    const portfolioPurchase = cashActivity.portfolioPurchase;
    const portfolioLiquidation = cashActivity.portfolioLiquidation;
    const fundingAmortization = fundingAmortizationAtDate(operation, currentKey) + cashActivity.fundingAmortization;
    const adjustment = cashActivity.adjustment;
    const cdiAnnualRate = cdiAnnualRateAtDate(currentKey);
    const cdiDailyRate = cashDailyApplicationRate(currentKey);
    const balanceBeforeIncome =
      previousCash +
      openingFundingInflow +
      investorInflow -
      portfolioPurchase +
      portfolioLiquidation -
      fundingAmortization +
      adjustment;
    const investmentIncome = balanceBeforeIncome > 0 ? balanceBeforeIncome * CASH_APPLIED_SHARE * cdiDailyRate : 0;
    const currentBalance = roundMoney(balanceBeforeIncome + investmentIncome);
    const appliedBalance = roundMoney(currentBalance * CASH_APPLIED_SHARE);
    const freeBalance = roundMoney(currentBalance - appliedBalance);

    cumulative.investorInflow += openingFundingInflow + investorInflow;
    cumulative.portfolioPurchase += portfolioPurchase;
    cumulative.portfolioLiquidation += portfolioLiquidation;
    cumulative.fundingAmortization += fundingAmortization;
    cumulative.adjustment += adjustment;
    cumulative.investmentIncome += investmentIncome;
    cumulative.portfolioEvents += cashActivity.portfolioEvents;

    rows.push({
      operation,
      dateKey: currentKey,
      initialBalance: roundMoney(previousCash + openingFundingInflow),
      investorInflow: roundMoney(investorInflow),
      portfolioPurchase: roundMoney(portfolioPurchase),
      portfolioLiquidation: roundMoney(portfolioLiquidation),
      fundingAmortization: roundMoney(fundingAmortization),
      adjustment: roundMoney(adjustment),
      investmentIncome: roundMoney(investmentIncome),
      currentBalance,
      appliedBalance,
      freeBalance,
      totalInvestorInflow: roundMoney(cumulative.investorInflow),
      totalPortfolioPurchase: roundMoney(cumulative.portfolioPurchase),
      totalPortfolioLiquidation: roundMoney(cumulative.portfolioLiquidation),
      totalFundingAmortization: roundMoney(cumulative.fundingAmortization),
      totalInvestmentIncome: roundMoney(cumulative.investmentIncome),
      totalAdjustment: roundMoney(cumulative.adjustment),
      totalPortfolioEvents: cumulative.portfolioEvents,
      cdiAnnualRate,
      cdiDailyRate
    });

    previousCash = currentBalance;
    currentKey = addCalendarDays(currentKey, 1);
    guard += 1;
  }

  operation._cashRowsCache.set(cacheKey, rows);
  return rows;
}

function operationCashPositionAtDate(operation, dateKey) {
  const rows = operationCashDailyRows(operation, dateKey);
  return rows[rows.length - 1] || emptyCashRow(operation, dateKey);
}

function cashBalanceAtDate(operation, dateKey) {
  return operationCashPositionAtDate(operation, dateKey).currentBalance;
}

function cashHistoryStartDate(scopeOperations) {
  return scopeOperations
    .map(operationCashFirstContributionDate)
    .filter(Boolean)
    .sort()[0] || state.dateKey;
}

function calendarDatesBetween(startKey, endKey) {
  const rows = [];
  if (!startKey || !endKey || endKey < startKey) return rows;
  let currentKey = startKey;
  let guard = 0;
  while (currentKey <= endKey && guard < 6000) {
    rows.push(currentKey);
    currentKey = addCalendarDays(currentKey, 1);
    guard += 1;
  }
  return rows;
}

function cashEvolutionDates() {
  const scopeOperations = selectedCashOperations();
  return calendarDatesBetween(cashHistoryStartDate(scopeOperations), state.dateKey);
}

function aggregateCashRows(scopeOperations, dateKey) {
  const rows = scopeOperations.map((operation) => operationCashPositionAtDate(operation, dateKey));
  return rows.reduce((total, row) => ({
    dateKey,
    initialBalance: total.initialBalance + row.initialBalance,
    investorInflow: total.investorInflow + row.investorInflow,
    portfolioPurchase: total.portfolioPurchase + row.portfolioPurchase,
    portfolioLiquidation: total.portfolioLiquidation + row.portfolioLiquidation,
    fundingAmortization: total.fundingAmortization + row.fundingAmortization,
    adjustment: total.adjustment + row.adjustment,
    investmentIncome: total.investmentIncome + row.investmentIncome,
    currentBalance: total.currentBalance + row.currentBalance,
    appliedBalance: total.appliedBalance + row.appliedBalance,
    freeBalance: total.freeBalance + row.freeBalance,
    totalInvestorInflow: total.totalInvestorInflow + row.totalInvestorInflow,
    totalPortfolioPurchase: total.totalPortfolioPurchase + row.totalPortfolioPurchase,
    totalPortfolioLiquidation: total.totalPortfolioLiquidation + row.totalPortfolioLiquidation,
    totalFundingAmortization: total.totalFundingAmortization + row.totalFundingAmortization,
    totalInvestmentIncome: total.totalInvestmentIncome + row.totalInvestmentIncome,
    totalAdjustment: total.totalAdjustment + row.totalAdjustment,
    totalPortfolioEvents: total.totalPortfolioEvents + row.totalPortfolioEvents
  }), {
    dateKey,
    initialBalance: 0,
    investorInflow: 0,
    portfolioPurchase: 0,
    portfolioLiquidation: 0,
    fundingAmortization: 0,
    adjustment: 0,
    investmentIncome: 0,
    currentBalance: 0,
    appliedBalance: 0,
    freeBalance: 0,
    totalInvestorInflow: 0,
    totalPortfolioPurchase: 0,
    totalPortfolioLiquidation: 0,
    totalFundingAmortization: 0,
    totalInvestmentIncome: 0,
    totalAdjustment: 0,
    totalPortfolioEvents: 0
  });
}

function cashDailyRows() {
  const scopeOperations = selectedCashOperations();
  return cashEvolutionDates().map((dateKey) => aggregateCashRows(scopeOperations, dateKey));
}

function recalculateFundingPositions() {
  const dateKey = state.dateKey || fundingData.positionDate || "2026-09-03";
  const previousKey = addBusinessDaysBack(dateKey, 1);
  const monthStartKey = rollingMonthReferenceKey(dateKey);

  operations.forEach((operation) => {
    const fundingBalance = fundingBalanceAtDate(operation, dateKey);
    if (fundingBalance === null) return;
    const fundingPrevious = fundingBalanceAtDate(operation, previousKey) ?? fundingBalance;
    const fundingMonthStart = fundingBalanceAtDate(operation, monthStartKey) ?? fundingBalance;
    const fundingRate = weightedFundingRateAtDate(operation, dateKey);
    const portfolioPosition = operationPortfolioPositionAtDate(operation, dateKey);
    const portfolioPrevious = operationPortfolioPositionAtDate(operation, previousKey);
    const portfolioMonthStart = operationPortfolioPositionAtDate(operation, monthStartKey);
    const cashPosition = operationCashPositionAtDate(operation, dateKey);
    const cashPrevious = cashBalanceAtDate(operation, previousKey);
    const cashMonthStart = cashBalanceAtDate(operation, monthStartKey);
    operation.fundingBalance = roundMoney(fundingBalance);
    operation.fundingPrevious = roundMoney(fundingPrevious);
    operation.fundingMonthStart = roundMoney(fundingMonthStart);
    operation.portfolioVp = roundMoney(portfolioPosition.portfolioVp);
    operation.portfolioVn = roundMoney(portfolioPosition.portfolioVn);
    operation.portfolioRate = Number(portfolioPosition.weightedRate.toFixed(4));
    operation.portfolioPreviousVp = roundMoney(portfolioPrevious.portfolioVp);
    operation.portfolioMonthStartVp = roundMoney(portfolioMonthStart.portfolioVp);
    operation.overdue = roundMoney(portfolioPosition.overdueVp);
    operation.portfolio = portfolioPosition.rows;
    operation.cash = roundMoney(cashPosition.currentBalance);
    operation.cashPrevious = roundMoney(cashPrevious);
    operation.cashMonthStart = roundMoney(cashMonthStart);
    operation.cashApplied = roundMoney(cashPosition.appliedBalance);
    operation.cashFree = roundMoney(cashPosition.freeBalance);
    if (fundingRate !== null) operation.fundingRate = Number(fundingRate.toFixed(4));
    operation.syntheticSub = roundMoney(operation.portfolioVp + operation.cash - operation.fundingBalance);
    operation.previousSyntheticSub = roundMoney(operation.portfolioPreviousVp + operation.cashPrevious - operation.fundingPrevious);
    operation.monthStartSyntheticSub = roundMoney(operation.portfolioMonthStartVp + operation.cashMonthStart - operation.fundingMonthStart);
    if (portfolioPosition.imported) {
      operation.duration = Math.max(0, Number(portfolioPosition.weightedDays || 0));
    } else if (operation.maturityDate) {
      operation.duration = Math.max(0, dateDiffDays(dateKey, operation.maturityDate));
    }
  });
}

function portfolioTotals(operation) {
  const rows = operation.portfolio;
  const portfolioVp = rows.reduce((sum, row) => sum + row[3], 0);
  const portfolioVn = rows.reduce((sum, row) => sum + row[2], 0);
  const weightedRate = rows.reduce((sum, row) => sum + row[3] * row[4], 0) / (portfolioVp || 1);
  const overdueVp = rows
    .filter((row) => String(row[6]).toLowerCase().includes("atras"))
    .reduce((sum, row) => sum + row[3], 0);
  return {
    count: rows.length,
    portfolioVp,
    portfolioVn,
    weightedRate,
    overdueVp,
    largest: rows.reduce((max, row) => row[3] > max[3] ? row : max, rows[0])
  };
}

function portfolioConcentration(operation) {
  const grouped = new Map();
  operation.portfolio.forEach((row) => {
    const current = grouped.get(row[0]) || {
      producer: row[0],
      type: row[1],
      vn: 0,
      vp: 0,
      weightedRate: 0,
      status: row[6]
    };
    current.vn += row[2];
    current.vp += row[3];
    current.weightedRate += row[3] * row[4];
    current.status = current.status === "Em dia" ? row[6] : current.status;
    grouped.set(row[0], current);
  });
  return Array.from(grouped.values())
    .map((row) => ({ ...row, rate: row.weightedRate / (row.vp || 1) }))
    .sort((a, b) => b.vp - a.vp);
}

function partnerRiskRows(scopeOperations = operations, dateKey = state.dateKey) {
  const grouped = new Map();
  scopeOperations.forEach((operation) => {
    const position = operationPortfolioPositionAtDate(operation, dateKey);
    const titles = Array.isArray(position.titles) && position.titles.length
      ? position.titles
      : (position.rows || []).map((row) => ({
        sacado: row[0],
        cedente: "",
        calculatedPresentValue: Number(row[3] || 0)
      }));

    titles.forEach((title) => {
      const exposure = Number(title.calculatedPresentValue || title.presentValue || 0);
      if (!Number.isFinite(exposure) || exposure <= 0) return;
      const partner = String(title.sacado || title.cedente || "Sem parceiro informado").trim() || "Sem parceiro informado";
      const key = partner.toLocaleLowerCase("pt-BR");
      const current = grouped.get(key) || {
        partner,
        exposure: 0,
        titles: 0,
        operations: new Set()
      };
      current.exposure += exposure;
      current.titles += 1;
      current.operations.add(operation.shortName || operation.name || operation.id);
      grouped.set(key, current);
    });
  });

  return Array.from(grouped.values())
    .map((row) => {
      const exposure = roundMoney(row.exposure);
      const limit = partnerRiskLimitFor(row.partner);
      return {
        ...row,
        exposure,
        limit,
        utilization: limit > 0 ? exposure / limit : null,
        operationCount: row.operations.size
      };
    })
    .sort((a, b) => b.exposure - a.exposure);
}

function decimalRateValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return number > 1 ? number / 100 : number;
}

function numericFieldValue(record, fields) {
  for (const field of fields) {
    const value = Number(record?.[field]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function portfolioTitlePartnershipReference(title) {
  const candidates = [
    portfolioTitleKey(title),
    String(title?.lastro || "").trim(),
    String(title?.originalLastro || "").trim(),
    String(title?.controlReferenceLastro || "").trim()
  ].filter(Boolean);
  const matched = candidates.map((key) => partnershipTitleByLastro.get(key)).find(Boolean);
  if (matched) return matched;
  if (title?.partnershipTitle || normalizePartnerKey(title?.rateSource) === "TAXA ALVO PARCERIA") {
    return {
      partner: title?.partnershipPartner || title?.sacado || title?.cedente || "",
      targetMonthlyRate: title?.partnershipTargetMonthlyRate || partnershipTitleData.targetMonthlyRate || PARTNERSHIP_DEFAULT_TARGET_MONTHLY_RATE,
      sourceFile: title?.partnershipSourceFile || ""
    };
  }
  return null;
}

function portfolioTitleIsPartnership(title) {
  return Boolean(portfolioTitlePartnershipReference(title));
}

function partnershipPartnerNameForTitle(title) {
  const reference = portfolioTitlePartnershipReference(title);
  if (reference?.partner) return reference.partner;
  const keys = [
    normalizePartnerKey(title?.sacado),
    normalizePartnerKey(title?.cedente)
  ];
  const match = keys.find((key) => partnershipPartnerByKey[key]);
  return match ? partnershipPartnerByKey[match] : "";
}

function partnershipTitleHasZeroRate(title) {
  if (portfolioTitleIsPartnership(title)) return true;
  const rateSource = normalizePartnerKey(title?.rateSource);
  const monthlyRate = Number(title?.discountRateMonthly || 0);
  const dailyRate = Number(title?.dailyRate || 0);
  const annualRate = Number(title?.effectiveRateAnnual || 0);
  return rateSource === "SEM TAXA" || rateSource === "TAXA ALVO PARCERIA" || (!monthlyRate && !dailyRate && !annualRate);
}

function partnershipTitleTargetMonthlyRate(title, partner) {
  const reference = portfolioTitlePartnershipReference(title);
  const explicit = numericFieldValue(title, [
    "partnershipTargetMonthlyRate",
    "targetMonthlyRate",
    "targetRateMonthly",
    "monthlyTargetRate",
    "taxaAlvoMensal",
    "taxaAlvo"
  ]);
  return explicit
    ? decimalRateValue(explicit)
    : decimalRateValue(reference?.targetMonthlyRate)
      || partnershipTargetMonthlyRateFor(partner)
      || PARTNERSHIP_DEFAULT_TARGET_MONTHLY_RATE;
}

function partnershipTitleLiquidationValue(title) {
  return numericFieldValue(title, [
    "liquidationValue",
    "liquidatedValue",
    "settlementValue",
    "settledValue",
    "paymentValue",
    "paidValue",
    "receivedValue",
    "valorLiquidacao",
    "valorBaixa",
    "valorPago"
  ]);
}

function cashEventIsEffectivePartnershipLiquidation(event) {
  if (normalizeCashEventType(event) !== "portfolioLiquidation") return false;
  const text = normalizePartnerKey([
    event?.note,
    event?.source,
    event?.mode,
    event?.manualAdjustmentId,
    event?.titleStatus,
    event?.paymentStatus
  ].filter(Boolean).join(" "));
  const migrationMarkers = [
    "TRANSFER",
    "VENDA CRA",
    "VENDA CRA4265",
    "CESSAO",
    "COMPRESSAO",
    "MIGRACAO",
    "TRANSFERENCIA"
  ];
  return !migrationMarkers.some((marker) => text.includes(marker));
}

function titleHasPartialSettlementMarker(title) {
  const text = normalizePartnerKey([
    title?.titleStatus,
    title?.paymentStatus,
    title?.status
  ].filter(Boolean).join(" "));
  return text.includes("PARCIAL");
}

function titleLooksLikeVehicleMigration(title) {
  const text = normalizePartnerKey([
    title?.titleStatus,
    title?.paymentStatus,
    title?.status,
    title?.ignoredReason
  ].filter(Boolean).join(" "));
  const migrationMarkers = ["TRANSFER", "MIGRACAO", "TRANSFERENCIA", "CESSAO", "COMPRESSAO"];
  if (migrationMarkers.some((marker) => text.includes(marker))) return true;
  return text.includes("RECOMPRA") && title?.settledDate && title?.settledDate === portfolioTitlePurchaseDate(title);
}

function partnershipEffectiveLiquidation(operation, title, dateKey = state.dateKey) {
  const data = portfolioDataForOperation(operation);
  const titleId = String(title?.id || title?.lastro || "").trim();
  const settledDate = String(title?.settledDate || "");
  if (!data || !titleId || !settledDate || settledDate > dateKey) return { amount: 0, date: "", events: 0, reason: "sem_baixa_total" };
  if (titleHasPartialSettlementMarker(title)) return { amount: 0, date: "", events: 0, reason: "baixa_parcial" };
  if (titleLooksLikeVehicleMigration(title)) return { amount: 0, date: "", events: 0, reason: "migracao" };

  const events = (Array.isArray(data.cashEvents) ? data.cashEvents : [])
    .filter((event) => String(event.titleId || "") === titleId)
    .filter((event) => String(event.date || "") === settledDate)
    .filter(cashEventIsEffectivePartnershipLiquidation);
  if (!events.length) {
    const fallbackValue = partnershipTitleLiquidationValue(title);
    if (fallbackValue > 0) {
      return { amount: fallbackValue, date: settledDate, events: 1, reason: "fallback_titulo" };
    }
    return { amount: 0, date: "", events: 0, reason: "sem_evento_efetivo" };
  }
  return events.reduce((acc, event) => ({
    amount: acc.amount + Number(event.amount || 0),
    date: String(event.date || "") > acc.date ? String(event.date || "") : acc.date,
    events: acc.events + 1,
    reason: "evento_efetivo"
  }), { amount: 0, date: "", events: 0, reason: "evento_efetivo" });
}

function partnershipExpectedLiquidationValue(title, targetMonthlyRate, liquidationDate = "") {
  const acquisition = Number(title?.acquisitionValue || 0);
  const purchaseDate = portfolioTitlePurchaseDate(title);
  const settledDate = liquidationDate || title?.settledDate || "";
  if (!acquisition || !purchaseDate || !settledDate || settledDate < purchaseDate) return 0;
  const baseDays = portfolioTitleAccrualBaseDays(title);
  const dailyRate = targetMonthlyRate > 0 ? Math.pow(1 + targetMonthlyRate, 12 / baseDays) - 1 : 0;
  const periods = portfolioTitleAccrualPeriods(title, settledDate);
  return dailyRate ? acquisition * Math.pow(1 + dailyRate, periods) : acquisition;
}

function partnershipLight(tone, label, detail) {
  return `
    <span class="partnership-light ${tone}">
      <i aria-hidden="true"></i>
      <strong>${escapeHtml(label)}</strong>
      <small>${escapeHtml(detail)}</small>
    </span>
  `;
}

function partnershipInsightsRows(dateKey = state.dateKey) {
  const grouped = new Map(PARTNERSHIP_PARTNERS.map((partner) => [normalizePartnerKey(partner), {
    partner,
    activeTitles: 0,
    activeVp: 0,
    settledTitles: 0,
    expectedLiquidationValue: 0,
    receivedLiquidationValue: 0,
    ignoredPartialSettlements: 0,
    ignoredMigrationSettlements: 0,
    titleCount: 0,
    operations: new Set(),
    targetMonthlyRate: partnershipTargetMonthlyRateFor(partner)
  }]));

  operations.forEach((operation) => {
    const data = portfolioDataForOperation(operation);
    if (!data || !Array.isArray(data.titles)) return;
    const positionDate = data.positionDate || dateKey;
    data.titles.forEach((title) => {
      if (!portfolioTitleIsEligible(title)) return;
      const partner = partnershipPartnerNameForTitle(title);
      if (!partner) return;
      if (!partnershipTitleHasZeroRate(title)) return;
      const row = grouped.get(normalizePartnerKey(partner));
      if (!row) return;
      row.titleCount += 1;
      row.operations.add(operation.shortName || operation.name || operation.id);
      const targetMonthlyRate = partnershipTitleTargetMonthlyRate(title, partner);
      if (targetMonthlyRate > 0) row.targetMonthlyRate = targetMonthlyRate;

      if (portfolioTitleIsOpenAtDate(title, dateKey, positionDate)) {
        const value = portfolioTitleValueAtDate(title, dateKey, positionDate);
        if (value > 0) {
          row.activeTitles += 1;
          row.activeVp += value;
        }
      }

      const effectiveLiquidation = partnershipEffectiveLiquidation(operation, title, dateKey);
      if (effectiveLiquidation.amount > 0) {
        row.settledTitles += 1;
        row.receivedLiquidationValue += effectiveLiquidation.amount;
        row.expectedLiquidationValue += partnershipExpectedLiquidationValue(title, targetMonthlyRate, effectiveLiquidation.date);
      } else if (title.settledDate && title.settledDate <= dateKey) {
        if (effectiveLiquidation.reason === "baixa_parcial") row.ignoredPartialSettlements += 1;
        else row.ignoredMigrationSettlements += 1;
      }
    });
  });

  return Array.from(grouped.values()).map((row) => {
    const hasTarget = row.targetMonthlyRate > 0;
    const hasTitles = row.titleCount > 0;
    const hasSettledTitles = row.settledTitles > 0;
    const liquidationDelta = row.receivedLiquidationValue - row.expectedLiquidationValue;
    const targetTone = hasTarget ? "ok" : (hasTitles ? "warn" : "neutral");
    const liquidationTone = hasSettledTitles ? "ok" : "neutral";
    const liquidationDetail = hasSettledTitles
      ? `${formatNumber(row.settledTitles)} titulo${row.settledTitles === 1 ? "" : "s"}`
      : (row.ignoredPartialSettlements > 0 ? "So parcial" : row.ignoredMigrationSettlements > 0 ? "So migracao" : "Sem baixa");
    const overallTone = !hasTitles
      ? "neutral"
      : !hasTarget
        ? "warn"
        : hasSettledTitles && liquidationDelta + 0.01 < 0
          ? "bad"
          : "ok";
    const overallLabel = !hasTitles
      ? "Sem carteira"
      : !hasTarget
        ? "Alvo pendente"
        : hasSettledTitles && liquidationDelta + 0.01 < 0
          ? "Revisar"
          : hasSettledTitles
            ? "Performando"
            : "Monitorado";

    return {
      ...row,
      activeVp: roundMoney(row.activeVp),
      expectedLiquidationValue: roundMoney(row.expectedLiquidationValue),
      receivedLiquidationValue: roundMoney(row.receivedLiquidationValue),
      liquidationDelta: roundMoney(liquidationDelta),
      operationCount: row.operations.size,
      overallTone,
      overallLabel,
      lights: [
        {
          tone: targetTone,
          label: "Taxa alvo",
          detail: hasTarget ? formatPercent(row.targetMonthlyRate * 100, 2) : "Pendente"
        },
        {
          tone: liquidationTone,
          label: "Titulos baixados",
          detail: liquidationDetail
        }
      ]
    };
  });
}

function renderPartnershipInsights() {
  if (!nodes.partnershipInsights) return;
  const rows = partnershipInsightsRows();
  nodes.partnershipInsights.innerHTML = `
    <div class="partnership-insights-grid">
      ${rows.map((row) => `
        <article class="partnership-tile ${row.overallTone}">
          <div class="partnership-tile-head">
            <strong>${escapeHtml(row.partner)}</strong>
            <span class="partnership-overall ${row.overallTone}">
              <i aria-hidden="true"></i>${escapeHtml(row.overallLabel)}
            </span>
          </div>
          <div class="partnership-lights">
            ${row.lights.map((light) => partnershipLight(light.tone, light.label, light.detail)).join("")}
          </div>
          <div class="partnership-foot">
            <span><strong>${formatCurrencyShort(row.expectedLiquidationValue)}</strong> esperado</span>
            <span><strong>${formatCurrencyShort(row.receivedLiquidationValue)}</strong> recebido</span>
            <span><strong class="${signedClass(row.liquidationDelta)}">${formatCurrencyShort(row.liquidationDelta)}</strong> diferenca</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function parsePtNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const cleaned = text
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
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
  return row[field] ?? row[normalizePartnerKey(field)] ?? "";
}

function normalizePremiumTitle(value) {
  return normalizePartnerKey(String(value || "").replace(/-\d+$/g, ""));
}

function normalizePremiumStatus(value) {
  return normalizePartnerKey(value).replace(/\s+/g, "_");
}

function premiumTermDefault(title) {
  return premiumTermDefaultsByTitle[normalizePremiumTitle(title)] || null;
}

function normalizePremiumCsvRecord(raw) {
  const normalized = {};
  Object.entries(raw).forEach(([key, value]) => {
    normalized[key] = value;
    normalized[normalizePartnerKey(key)] = value;
  });
  const title = String(premiumRowValue(normalized, "Número do título") || "").trim();
  return {
    farm: String(premiumRowValue(normalized, "Fazenda") || "").trim(),
    lot: String(premiumRowValue(normalized, "Lote") || "").trim(),
    title,
    titleKey: normalizePremiumTitle(title),
    lastro: String(premiumRowValue(normalized, "Lastro") || "").trim(),
    status: String(premiumRowValue(normalized, "STATUS ATUAL") || "").trim(),
    statusKey: normalizePremiumStatus(premiumRowValue(normalized, "STATUS ATUAL")),
    abateDate: parseBrazilianDateKey(premiumRowValue(normalized, "Data de confirmação de abate")),
    entryDate: parseBrazilianDateKey(premiumRowValue(normalized, "Data de entrada")),
    carcassWeight: parsePtNumber(premiumRowValue(normalized, "Peso de carcaça")),
    raw: normalized
  };
}

function parsePremiumCsv(text) {
  const firstLine = String(text || "").split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiter = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const rows = parseDelimitedText(text, delimiter);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => String(header || "").trim());
  return rows.slice(1)
    .map((cells) => {
      const raw = {};
      headers.forEach((header, index) => {
        if (!header) return;
        raw[header] = String(cells[index] ?? "").trim();
      });
      return normalizePremiumCsvRecord(raw);
    })
    .filter((row) => row.farm || row.title || row.lot);
}

function premiumRowsWithKnownTerm() {
  return premiumState.rows.filter((row) => row.titleKey && premiumTermDefault(row.title));
}

function premiumFarmOptions() {
  const sourceRows = premiumRowsWithKnownTerm().length ? premiumRowsWithKnownTerm() : premiumState.rows;
  const counts = sourceRows.reduce((acc, row) => {
    if (!row.farm) return acc;
    acc[row.farm] = (acc[row.farm] || 0) + 1;
    return acc;
  }, {});
  return Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, "pt-BR"));
}

function premiumDateOptions() {
  return Array.from(new Set(premiumState.rows
    .filter((row) => row.farm === premiumState.selectedFarm)
    .filter((row) => row.statusKey === "ABATIDO")
    .map((row) => row.abateDate)
    .filter(Boolean)))
    .sort()
    .reverse();
}

function syncPremiumInput(node, value) {
  if (!node || document.activeElement === node) return;
  node.value = value || "";
}

function applyPremiumDateDefaultPrice() {
  if (premiumState.priceTouched || premiumState.paymentTouched) return;
  const defaultPrice = PREMIUM_EXAMPLE_PRICE_BY_DATE[premiumState.selectedDate] || 0;
  premiumState.pricePerHead = defaultPrice;
}

function premiumSelectedAnimalRows() {
  if (!premiumState.selectedFarm || !premiumState.selectedDate) return [];
  return premiumState.rows.filter((row) =>
    row.farm === premiumState.selectedFarm &&
    row.abateDate === premiumState.selectedDate &&
    row.statusKey === "ABATIDO"
  );
}

function premiumDeathCountByTitle() {
  const deaths = {};
  premiumState.rows
    .filter((row) => row.farm === premiumState.selectedFarm)
    .filter((row) => row.titleKey)
    .filter((row) => row.statusKey.includes("MORTE") || row.statusKey === "MORTO")
    .forEach((row) => {
      deaths[row.titleKey] = (deaths[row.titleKey] || 0) + 1;
    });
  return deaths;
}

function premiumGroupRows() {
  const grouped = new Map();
  premiumSelectedAnimalRows().forEach((row) => {
    const key = row.titleKey || `SEM TITULO ${row.lastro || row.lot}`;
    const current = grouped.get(key) || {
      key,
      title: row.title || "-",
      titleKey: row.titleKey,
      lastros: new Set(),
      lots: new Set(),
      heads: 0,
      carcassWeight: 0,
      rows: []
    };
    current.lastros.add(row.lastro || "-");
    current.lots.add(row.lot || "-");
    current.heads += 1;
    current.carcassWeight += Number(row.carcassWeight || 0);
    current.rows.push(row);
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

function premiumLotRows() {
  const grouped = new Map();
  premiumSelectedAnimalRows().forEach((row) => {
    const key = `${row.farm}__${row.titleKey}__${row.lastro}__${row.lot}`;
    const current = grouped.get(key) || {
      farm: row.farm,
      title: row.title || "-",
      titleKey: row.titleKey,
      lastro: row.lastro || "-",
      lot: row.lot || "-",
      heads: 0,
      carcassWeight: 0
    };
    current.heads += 1;
    current.carcassWeight += Number(row.carcassWeight || 0);
    grouped.set(key, current);
  });
  return Array.from(grouped.values()).sort((a, b) =>
    `${a.title}-${a.lot}`.localeCompare(`${b.title}-${b.lot}`, "pt-BR")
  );
}

function premiumNumberOverride(titleKey, field, fallback) {
  const value = Number(premiumState.rowOverrides[titleKey]?.[field]);
  return Number.isFinite(value) ? value : fallback;
}

function premiumCalculatedRows() {
  const groups = premiumGroupRows();
  const totalHeads = groups.reduce((sum, row) => sum + row.heads, 0);
  const pricePerHead = Number(premiumState.pricePerHead || 0) > 0
    ? Number(premiumState.pricePerHead || 0)
    : totalHeads > 0
      ? Number(premiumState.paymentAmount || 0) / totalHeads
      : 0;
  const deathCounts = premiumDeathCountByTitle();

  return groups.map((group) => {
    const defaults = premiumTermDefault(group.title);
    const titleKey = group.titleKey || group.key;
    const issueDate = defaults?.issueDate || group.rows.map((row) => row.entryDate).filter(Boolean).sort()[0] || premiumState.selectedDate;
    const monthlyRate = premiumNumberOverride(titleKey, "monthlyRate", defaults?.monthlyRate || premiumState.monthlyRate || PREMIUM_DEFAULT_MONTHLY_RATE);
    const dailyRate = Math.pow(1 + monthlyRate, 1 / 30) - 1;
    const days = Math.max(0, dateDiffDays(issueDate, premiumState.selectedDate));
    const periodRate = Math.pow(1 + dailyRate, days) - 1;
    const costPerHead = premiumNumberOverride(titleKey, "costPerHead", defaults?.costPerHead || 0);
    const deaths = premiumNumberOverride(titleKey, "deaths", Math.max(Number(defaults?.deaths || 0), Number(deathCounts[titleKey] || 0)));
    const gtaCost = premiumNumberOverride(titleKey, "gtaCost", premiumState.gtaCost);
    const revenue = roundMoney(group.heads * pricePerHead);
    const principal = roundMoney(-group.heads * costPerHead);
    const operationCost = roundMoney(principal * periodRate);
    const gta = roundMoney(-gtaCost);
    const tags = roundMoney(-group.heads * premiumState.tagCostPerHead);
    const monitoringFee = roundMoney((principal + operationCost) * premiumState.monitoringFeeRate);
    const deathCost = roundMoney(-deaths * costPerHead * (1 + periodRate));
    const premium = roundMoney(revenue + principal + operationCost + gta + tags + monitoringFee + deathCost);
    return {
      ...group,
      titleKey,
      displayTitle: defaults?.displayTitle || group.title,
      issueDate,
      days,
      monthlyRate,
      periodRate,
      pricePerHead,
      costPerHead,
      deaths,
      gtaCost,
      revenue,
      principal,
      operationCost,
      gta,
      tags,
      monitoringFee,
      deathCost,
      premium,
      amortization: roundMoney(revenue - premium),
      lotsLabel: Array.from(group.lots).filter(Boolean).join(", "),
      lastrosLabel: Array.from(group.lastros).filter(Boolean).join(", ")
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
    premium: 0,
    amortization: 0
  });
}

function premiumInputCell(row, field, value, step = "0.01") {
  return `<input class="inline-number premium-row-input" data-premium-title="${escapeHtml(row.titleKey)}" data-premium-field="${field}" type="number" step="${step}" value="${Number(value || 0).toFixed(step === "1" ? 0 : 2)}">`;
}

function renderPremiumFilters() {
  if (!nodes.premiumFarmFilter || !nodes.premiumDateFilter) return;
  const farms = premiumFarmOptions();
  if (!premiumState.selectedFarm || !farms.includes(premiumState.selectedFarm)) {
    premiumState.selectedFarm = farms[0] || "";
  }
  const dates = premiumDateOptions();
  if (!premiumState.selectedDate || !dates.includes(premiumState.selectedDate)) {
    premiumState.selectedDate = dates[0] || "";
    applyPremiumDateDefaultPrice();
  }
  nodes.premiumFarmFilter.innerHTML = farms.length
    ? farms.map((farm) => `<option value="${escapeHtml(farm)}">${escapeHtml(farm)}</option>`).join("")
    : `<option value="">Carregue um CSV</option>`;
  nodes.premiumFarmFilter.value = premiumState.selectedFarm;
  nodes.premiumDateFilter.innerHTML = dates.length
    ? dates.map((dateKey) => `<option value="${dateKey}">${formatDate(dateKey)}</option>`).join("")
    : `<option value="">Sem abate</option>`;
  nodes.premiumDateFilter.value = premiumState.selectedDate;
}

function renderPremium() {
  if (!nodes.premiumView) return;
  renderPremiumFilters();
  syncPremiumInput(nodes.premiumPaymentInput, premiumState.paymentAmount ? premiumState.paymentAmount.toFixed(2) : "");
  syncPremiumInput(nodes.premiumPriceHeadInput, premiumState.pricePerHead ? premiumState.pricePerHead.toFixed(2) : "");
  syncPremiumInput(nodes.premiumMonthlyRateInput, (premiumState.monthlyRate * 100).toFixed(2));
  syncPremiumInput(nodes.premiumGtaInput, premiumState.gtaCost.toFixed(2));
  syncPremiumInput(nodes.premiumTagInput, premiumState.tagCostPerHead.toFixed(2));
  syncPremiumInput(nodes.premiumMonitoringFeeInput, (premiumState.monitoringFeeRate * 100).toFixed(2));

  const rows = premiumCalculatedRows();
  const lotRows = premiumLotRows();
  const totals = premiumTotals(rows);
  const sourceLabel = premiumState.fileName ? premiumState.fileName : "sem arquivo";
  const dateLabel = premiumState.selectedDate ? formatDate(premiumState.selectedDate) : "-";
  const pricePerHead = rows[0]?.pricePerHead || 0;
  if (nodes.premiumStatus) {
    nodes.premiumStatus.textContent = premiumState.rows.length
      ? `${formatNumber(premiumState.rows.length)} animais carregados - ${sourceLabel}`
      : "Aguardando arquivo";
  }
  if (nodes.premiumMemorySubtitle) {
    nodes.premiumMemorySubtitle.textContent = premiumState.selectedFarm
      ? `${premiumState.selectedFarm} - abate ${dateLabel}`
      : "Agrupado por titulo e data de abate";
  }
  if (nodes.premiumKpis) {
    const missingCosts = rows.filter((row) => !row.costPerHead).length;
    const missingInputs = missingCosts + (rows.length && !pricePerHead ? 1 : 0);
    nodes.premiumKpis.innerHTML = [
      ["Data", dateLabel, premiumState.selectedFarm || "-"],
      ["Animais abatidos", formatNumber(totals.heads), `${formatNumber(rows.length)} titulo${rows.length === 1 ? "" : "s"}`],
      ["Preco/cabeca", pricePerHead ? formatCurrency(pricePerHead, 2) : "-", premiumState.pricePerHead ? "Informado" : "Derivado do valor pago"],
      ["Receita", formatCurrency(totals.revenue, 2), "Preco/cabeca x abatidos"],
      ["Premio", formatCurrency(totals.premium, 2), "Receita menos custos"],
      ["Amortizacao", formatCurrency(totals.amortization, 2), "Receita menos premio"],
      ["Pendencias", formatNumber(missingInputs), pricePerHead ? "Titulos sem custo/cabeca" : "Informe valor pago ou preco/cabeca"]
    ].map(([label, value, note]) => `
      <article class="premium-kpi">
        <span>${label}</span>
        <strong>${value}</strong>
        <small>${note}</small>
      </article>
    `).join("");
  }
  if (nodes.premiumMemoryTable) {
    nodes.premiumMemoryTable.innerHTML = rows.length ? rows.map((row) => `
      <tr>
        <td>
          <strong>${escapeHtml(row.displayTitle)}</strong>
          <span class="cell-note">${escapeHtml(row.lastrosLabel || "-")} - ${row.issueDate ? formatDate(row.issueDate) : "-"}</span>
        </td>
        <td>${escapeHtml(row.lotsLabel || "-")}</td>
        <td class="num">${formatNumber(row.heads)}</td>
        <td class="num">${premiumInputCell(row, "deaths", row.deaths, "1")}</td>
        <td class="num">${premiumInputCell(row, "costPerHead", row.costPerHead)}</td>
        <td class="num">${formatCurrency(row.revenue, 2)}</td>
        <td class="num negative">${formatCurrency(row.principal, 2)}</td>
        <td class="num negative">${formatCurrency(row.operationCost, 2)}</td>
        <td class="num">${premiumInputCell(row, "gtaCost", row.gtaCost)}</td>
        <td class="num negative">${formatCurrency(row.tags, 2)}</td>
        <td class="num negative">${formatCurrency(row.monitoringFee, 2)}</td>
        <td class="num negative">${formatCurrency(row.deathCost, 2)}</td>
        <td class="num ${signedClass(row.premium)}">${formatCurrency(row.premium, 2)}</td>
      </tr>
    `).join("") + `
      <tr class="total-row">
        <td colspan="2">TOTAL</td>
        <td class="num">${formatNumber(totals.heads)}</td>
        <td class="num">${formatNumber(totals.deaths)}</td>
        <td></td>
        <td class="num">${formatCurrency(totals.revenue, 2)}</td>
        <td class="num negative">${formatCurrency(totals.principal, 2)}</td>
        <td class="num negative">${formatCurrency(totals.operationCost, 2)}</td>
        <td class="num negative">${formatCurrency(totals.gta, 2)}</td>
        <td class="num negative">${formatCurrency(totals.tags, 2)}</td>
        <td class="num negative">${formatCurrency(totals.monitoringFee, 2)}</td>
        <td class="num negative">${formatCurrency(totals.deathCost, 2)}</td>
        <td class="num ${signedClass(totals.premium)}">${formatCurrency(totals.premium, 2)}</td>
      </tr>
    ` : `
      <tr>
        <td colspan="13">${premiumState.rows.length ? "Sem animais abatidos para os filtros selecionados" : "Carregue o relatorio do sistema para calcular"}</td>
      </tr>
    `;
  }
  if (nodes.premiumLotTable) {
    nodes.premiumLotTable.innerHTML = lotRows.length ? lotRows.map((row) => {
      const average = row.heads ? row.carcassWeight / row.heads : 0;
      return `
        <tr>
          <td>${escapeHtml(row.farm)}</td>
          <td>${escapeHtml(row.title || "-")}</td>
          <td>${escapeHtml(row.lastro || "-")}</td>
          <td>${escapeHtml(row.lot || "-")}</td>
          <td class="num">${formatNumber(row.heads)}</td>
          <td class="num">${formatNumber(row.carcassWeight, 2)} kg</td>
          <td class="num">${formatNumber(average, 2)} kg</td>
        </tr>
      `;
    }).join("") : `
      <tr>
        <td colspan="7">${premiumState.rows.length ? "Sem lotes para os filtros selecionados" : "Carregue o relatorio do sistema para validar os lotes"}</td>
      </tr>
    `;
  }
}

function renderPartnerRiskChart() {
  if (!nodes.partnerRiskChart) return;
  const rows = partnerRiskRows();
  if (!rows.length) {
    nodes.partnerRiskChart.innerHTML = `<p class="empty-state">Sem carteira ativa para a data selecionada.</p>`;
    return;
  }

  const maxReference = Math.max(1, ...rows.flatMap((row) => [row.exposure, row.limit || 0]));
  const chartScaleMax = Math.max(1, Math.ceil(maxReference / 10000000) * 10000000);
  const hasMissingLimit = rows.some((row) => row.limit <= 0);
  const labelClassForPosition = (position) => {
    if (position >= 92) return "is-right-edge";
    if (position <= 8) return "is-left-edge";
    return "";
  };
  nodes.partnerRiskChart.innerHTML = `
    <div class="partner-risk-legend">
      <span><i class="partner-risk-swatch composed"></i>Composto</span>
      <span><i class="partner-risk-marker-sample"></i>Limite</span>
      ${hasMissingLimit ? `<span><i class="partner-risk-swatch pending"></i>Limite pendente</span>` : ""}
    </div>
    <div class="partner-risk-scale" aria-hidden="true">
      <span></span>
      <div>
        <span>R$ 0</span>
        <span>Escala comum ${formatCurrencyShort(chartScaleMax)}</span>
      </div>
      <span></span>
    </div>
    ${rows.map((row) => {
      const width = Math.min(100, (row.exposure / chartScaleMax) * 100);
      const limitPosition = row.limit > 0 ? Math.min(100, (row.limit / chartScaleMax) * 100) : null;
      const utilization = row.utilization === null ? null : row.utilization * 100;
      const isOverLimit = row.limit > 0 && row.exposure > row.limit;
      const isMissingLimit = row.limit <= 0;
      return `
        <div class="partner-risk-row ${isOverLimit ? "is-over-limit" : ""} ${isMissingLimit ? "is-missing-limit" : ""}">
          <div class="partner-risk-name" title="${escapeHtml(row.partner)}">
            <strong>${escapeHtml(row.partner)}</strong>
            <span>${formatNumber(row.titles)} titulo${row.titles === 1 ? "" : "s"} em ${formatNumber(row.operationCount)} funding${row.operationCount === 1 ? "" : "s"} - ${row.limit > 0 ? `limite ${formatCurrencyShort(row.limit)}` : "limite pendente"}</span>
          </div>
          <div class="partner-risk-bar-shell">
            <span class="partner-risk-bar-label ${labelClassForPosition(width)}" style="left: ${width.toFixed(2)}%">${formatCurrencyShort(row.exposure)}</span>
            ${limitPosition === null ? "" : `<span class="partner-risk-limit-label ${labelClassForPosition(limitPosition)}" style="left: ${limitPosition.toFixed(2)}%">Limite ${formatCurrencyShort(row.limit)}</span>`}
            <div class="partner-risk-track" aria-label="${escapeHtml(row.partner)}: ${escapeHtml(formatCurrency(row.exposure))}">
              <span class="partner-risk-bar" style="width: ${width.toFixed(2)}%"></span>
              ${limitPosition === null ? "" : `<span class="partner-risk-limit" style="left: ${limitPosition.toFixed(2)}%"></span>`}
            </div>
          </div>
          <div class="partner-risk-value">
            <strong>${formatCurrencyShort(row.exposure)}</strong>
            <span>${utilization === null ? "limite pendente" : `${formatPercent(utilization, 1)} do limite`}</span>
          </div>
        </div>
      `;
    }).join("")}
  `;
}

function buildHistoryRows() {
  return Array.from({ length: 30 }, (_, index) => {
    const dayIndex = 30 - index;
    const dateKey = addBusinessDaysBack(state.dateKey, index);
    return {
      day: dayIndex,
      dateKey,
      values: operations.map((operation) => syntheticAtDate(operation, dateKey) ?? syntheticAtDay(operation, dayIndex))
    };
  });
}

function buildSeniorSubordinadaRows(scopeOperations = operations) {
  return fundingEvolutionDates().map((dateKey) => {
    const senior = scopeOperations.reduce((sum, operation) =>
      sum + (fundingBalanceAtDate(operation, dateKey) ?? 0)
    , 0);
    const assetValue = scopeOperations.reduce((sum, operation) => {
      const portfolioPosition = operationPortfolioPositionAtDate(operation, dateKey);
      return sum + Number(portfolioPosition.portfolioVp || 0) + cashBalanceAtDate(operation, dateKey);
    }, 0);
    const subordinada = assetValue - senior;
    return {
      dateKey,
      senior: roundMoney(senior),
      assetValue: roundMoney(assetValue),
      subordinada: roundMoney(subordinada)
    };
  });
}

function selectedSeniorSubordinadaOperations() {
  if (state.view === "individual") return [selectedOperation()];
  if (state.view === "caixa") return selectedCashOperations();
  if (state.view === "carteira") return selectedPortfolioOperations();
  if (state.view === "evolucao") return selectedEvolutionOperations();
  return operations;
}

function renderSeniorSubordinadaCharts() {
  const rows = buildSeniorSubordinadaRows(selectedSeniorSubordinadaOperations());
  const current = rows.find((row) => row.dateKey === state.dateKey) || rows[rows.length - 1] || {};
  const coverage = Number(current.senior || 0) > 0 ? Number(current.assetValue || 0) / Number(current.senior || 0) : 0;
  const html = `
    <div class="coverage-summary">
      <span><strong>${formatCurrencyShort(current.assetValue)}</strong>Carteira + caixa</span>
      <span><strong>${formatCurrencyShort(current.senior)}</strong>SR / funding</span>
      <span class="${signedClass(current.subordinada)}"><strong>${formatCurrencyShort(current.subordinada)}</strong>${Number(current.subordinada || 0) >= 0 ? "Sobra" : "Deficit"}</span>
      <span><strong>${formatPercent(coverage * 100, 1)}</strong>Cobertura</span>
    </div>
    ${fundingDualLineChart(rows, [
      { key: "assetValue", label: "Carteira + caixa", className: "chart-assets" },
      { key: "senior", label: "SR / funding", className: "chart-sr" }
    ], "Cobertura da SR por carteira e caixa")}
  `;
  nodes.srSubCharts.forEach((chart) => {
    chart.innerHTML = html;
  });
}

function renderSelectors() {
  nodes.fundingSelector.innerHTML = `
    <option value="gerencial">Todos os fundings</option>
    ${operations.map((operation) =>
      `<option value="${operation.id}">${operation.investor} - ${operation.shortName}</option>`
    ).join("")}
  `;
  nodes.fundingSelector.value = state.view === "individual"
    ? state.selectedId
    : state.view === "caixa"
      ? state.cashId
      : state.view === "evolucao"
        ? state.evolutionId
        : state.view === "carteira"
          ? state.portfolioId
          : "gerencial";
  if (!nodes.fundingSelector.value) nodes.fundingSelector.value = "gerencial";
  const hideOperationControl = state.view === "cotacoes";
  nodes.operationControl.hidden = hideOperationControl;
  nodes.operationControl.classList.toggle("is-hidden", hideOperationControl);
  nodes.dateSelector.value = state.dateKey;
  const managementActive = state.view === "gerencial" || state.view === "individual";
  nodes.managementButton.classList.toggle("is-active", managementActive);
  nodes.managementButton.setAttribute("aria-pressed", managementActive ? "true" : "false");
  nodes.cashButton.classList.toggle("is-active", state.view === "caixa");
  nodes.cashButton.setAttribute("aria-pressed", state.view === "caixa" ? "true" : "false");
  nodes.portfolioButton.classList.toggle("is-active", state.view === "carteira");
  nodes.portfolioButton.setAttribute("aria-pressed", state.view === "carteira" ? "true" : "false");
  nodes.fundingEvolutionButton.classList.toggle("is-active", state.view === "evolucao");
  nodes.fundingEvolutionButton.setAttribute("aria-pressed", state.view === "evolucao" ? "true" : "false");
  nodes.quotesButton.classList.toggle("is-active", state.view === "cotacoes");
  nodes.quotesButton.setAttribute("aria-pressed", state.view === "cotacoes" ? "true" : "false");
  if (nodes.premiumButton) {
    nodes.premiumButton.classList.toggle("is-active", state.view === "premio");
    nodes.premiumButton.setAttribute("aria-pressed", state.view === "premio" ? "true" : "false");
  }
}

function renderQuoteSummary() {
  const currentRows = quoteRows();
  const selectedRows = selectedQuoteRows();
  const regionalRows = selectedRows.filter((row) =>
    row.map_type === "regional_map" || row.map_type === "historical_series"
  );
  const replacementRows = selectedRows.filter((row) => row.map_type === "replacement_grid");
  const mtRows = selectedRows.filter((row) => row.map_type === "mt_bulletin");
  const spBoi = regionalQuote("boi", "SP", selectedRows);
  const quoteDate = state.dateKey || latestQuoteDate(currentRows);

  const cards = [
    ["Data selecionada", quoteDate ? formatDate(quoteDate) : "-", quoteModeLabel(selectedRows)],
    ["Registros", formatNumber(selectedRows.length), "Linhas exibidas na validacao"],
    ["Regional", formatNumber(regionalRows.length), "Boi, vaca e novilha por UF"],
    ["Reposicao", formatNumber(replacementRows.length), "Grades em R$/kg"],
    ["MT", formatNumber(mtRows.length), "Macro-regioes do estado"],
    ["Boi SP", formatQuotePrice(spBoi, 2), "Historico publico quando data passada"]
  ];

  nodes.summaryStrip.innerHTML = cards.map(([label, value, note]) => `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");
}

function renderFundingEvolutionSummary() {
  const scopeOperations = selectedEvolutionOperations();
  const activity = aggregateFundingActivity(scopeOperations, state.dateKey);
  const rate = fundingEvolutionRate(scopeOperations);
  const scopeLabel = selectedEvolutionLabel();

  const cards = [
    {
      label: "Visao",
      value: scopeLabel,
      note: `${formatNumber(scopeOperations.length)} funding${scopeOperations.length === 1 ? "" : "s"} no filtro`,
      className: ""
    },
    {
      label: "Saldo funding",
      value: formatCurrency(activity.currentBalance),
      note: "Divida atualizada na data-base",
      className: ""
    },
    {
      label: "Juros dia",
      value: formatCurrency(activity.interestAccrued),
      note: "Custo apropriado contra D-1",
      className: signedClass(activity.interestAccrued)
    },
    {
      label: "Pagamento dia",
      value: formatCurrency(activity.payment),
      note: "Devolucoes registradas na data",
      className: signedClass(activity.payment)
    },
    {
      label: "Amortizacao dia",
      value: formatCurrency(activity.amortization),
      note: "Reducao de principal no dia",
      className: signedClass(activity.amortization)
    },
    {
      label: "Taxa media",
      value: `${formatPercent(rate)} a.m.`,
      note: "Media ponderada pelo saldo",
      className: ""
    }
  ];

  nodes.summaryStrip.innerHTML = cards.map((card) => `
    <article class="metric-card">
      <span>${card.label}</span>
      <strong class="${card.className}">${card.value}</strong>
      <small>${card.note}</small>
    </article>
  `).join("");
}

function renderPortfolioSummary() {
  const scopeOperations = selectedPortfolioOperations();
  const position = aggregatePortfolioPosition(scopeOperations, state.dateKey);
  const weightedRate = position.rateAmount / (position.portfolioVp || 1);
  const weightedDays = position.dayAmount / (position.portfolioVp || 1);
  const scopeLabel = selectedPortfolioLabel();
  const importedCount = scopeOperations.filter((operation) => portfolioDataForOperation(operation)).length;

  const cards = [
    {
      label: "Visao",
      value: scopeLabel,
      note: `${formatNumber(importedCount)} carteira${importedCount === 1 ? "" : "s"} importada${importedCount === 1 ? "" : "s"}`,
      className: ""
    },
    {
      label: "Valor presente",
      value: formatCurrency(position.portfolioVp),
      note: "Carteira calculada na data",
      className: ""
    },
    {
      label: "Valor nominal",
      value: formatCurrency(position.portfolioVn),
      note: `${formatNumber(position.titleCount)} titulos ativos`,
      className: ""
    },
    {
      label: "Taxa media",
      value: `${formatPercent(weightedRate)} a.m.`,
      note: "Ponderada pelo VP",
      className: ""
    },
    {
      label: "Prazo medio",
      value: `${formatNumber(weightedDays)} dias`,
      note: "Ponderado pelo VP",
      className: ""
    },
    {
      label: "Vencidos",
      value: formatCurrency(position.overdueVp),
      note: "VP em atraso",
      className: signedClass(-position.overdueVp)
    }
  ];

  nodes.summaryStrip.innerHTML = cards.map((card) => `
    <article class="metric-card">
      <span>${card.label}</span>
      <strong class="${card.className}">${card.value}</strong>
      <small>${card.note}</small>
    </article>
  `).join("");
}

function renderCashSummary() {
  const scopeOperations = selectedCashOperations();
  const position = aggregateCashRows(scopeOperations, state.dateKey);
  const annualCdi = cdiAnnualRateAtDate(state.dateKey);
  const dailyRate = cashDailyApplicationRate(state.dateKey);
  const cdiSource = cdiRateSourceLabelAtDate(state.dateKey);
  const scopeLabel = selectedCashLabel();

  const cards = [
    {
      label: "Visao",
      value: scopeLabel,
      note: `${formatNumber(scopeOperations.length)} fundo${scopeOperations.length === 1 ? "" : "s"} no filtro`,
      className: ""
    },
    {
      label: "Caixa",
      value: formatCurrency(position.currentBalance),
      note: "Saldo calculado pelo fluxo",
      className: signedClass(position.currentBalance)
    },
    {
      label: "Aplicado",
      value: formatCurrency(position.appliedBalance),
      note: `${formatPercent(CASH_APPLIED_SHARE * 100, 0)} do caixa final`,
      className: ""
    },
    {
      label: "Livre",
      value: formatCurrency(position.freeBalance),
      note: "Parcela sem aplicacao",
      className: ""
    },
    {
      label: "Rendimento dia",
      value: formatCurrency(position.investmentIncome, 2),
      note: `${formatPercent(CASH_APPLICATION_CDI_SHARE * 100, 0)} do CDI`,
      className: signedClass(position.investmentIncome)
    },
    {
      label: "CDI base",
      value: `${formatPercent(annualCdi * 100, 2)} a.a.`,
      note: `${cdiSource}; caixa ${formatPercent(dailyRate * 100, 4)} ao dia`,
      className: ""
    }
  ];

  nodes.summaryStrip.innerHTML = cards.map((card) => `
    <article class="metric-card">
      <span>${card.label}</span>
      <strong class="${card.className}">${card.value}</strong>
      <small>${card.note}</small>
    </article>
  `).join("");
}

function renderSummary() {
  if (state.view === "cotacoes") {
    renderQuoteSummary();
    return;
  }
  if (state.view === "caixa") {
    renderCashSummary();
    return;
  }
  if (state.view === "carteira") {
    renderPortfolioSummary();
    return;
  }
  if (state.view === "evolucao") {
    renderFundingEvolutionSummary();
    return;
  }

  const selected = selectedOperation();
  const source = state.view === "individual" ? [selected] : operations;
  const totalCash = source.reduce((sum, item) => sum + item.cash, 0);
  const totalPortfolio = source.reduce((sum, item) => sum + item.portfolioVp, 0);
  const totalFunding = source.reduce((sum, item) => sum + item.fundingBalance, 0);
  const totalSynthetic = source.reduce((sum, item) => sum + item.syntheticSub, 0);
  const dayResult = source.reduce((sum, item) => sum + item.syntheticSub - item.previousSyntheticSub, 0);
  const monthResult = source.reduce((sum, item) => sum + item.syntheticSub - item.monthStartSyntheticSub, 0);
  const scope = state.view === "individual" ? selected.shortName : "contas";
  const previousKey = addBusinessDaysBack(state.dateKey, 1);
  const monthStartKey = rollingMonthReferenceKey(state.dateKey);

  const cards = [
    ["Caixa", totalCash, `Calculado pelo fluxo ${state.view === "individual" ? "da operacao" : "dos fundos"}`],
    ["Carteira VP", totalPortfolio, "Direitos crediticios ativos"],
    ["Funding", totalFunding, "Saldo devedor dos investidores"],
    ["Subordinada sintetica", totalSynthetic, "Carteira + caixa - funding"],
    [`Delta dia vs ${formatDate(previousKey).slice(0, 5)}`, dayResult, `Variacao D-1 - ${scope}`],
    [`Delta 21 d.u. vs ${formatDate(monthStartKey).slice(0, 5)}`, monthResult, "Variacao contra 21 dias uteis atras"]
  ];

  nodes.summaryStrip.innerHTML = cards.map(([label, value, note], index) => `
    <article class="metric-card">
      <span>${label}</span>
      <strong class="${index >= 4 ? signedClass(value) : ""}">${formatCurrency(value)}</strong>
      <small>${note}</small>
    </article>
  `).join("");
}

function renderManagement() {
  nodes.managementDate.textContent = formatDate(state.dateKey);
  if (nodes.guaranteeHistoryDate) {
    nodes.guaranteeHistoryDate.textContent = guaranteeSnapshotLabel(state.dateKey);
  }
  const previousKey = addBusinessDaysBack(state.dateKey, 1);
  const monthStartKey = rollingMonthReferenceKey(state.dateKey);
  if (nodes.resultCurrentHead) nodes.resultCurrentHead.textContent = `Resultado acumulado sub em ${formatDate(state.dateKey)}`;
  if (nodes.resultDayHead) nodes.resultDayHead.textContent = `Resultado no dia (${formatDate(state.dateKey)} - ${formatDate(previousKey)})`;
  if (nodes.resultMonthHead) nodes.resultMonthHead.textContent = `Resultado 21 d.u. (${formatDate(state.dateKey)} - ${formatDate(monthStartKey)})`;

  const cashTotal = operations.reduce((sum, item) => sum + item.cash, 0);
  nodes.cashTable.innerHTML = operations.map((operation) => `
    <tr>
      <td>${operation.name}</td>
      <td class="num">${formatCurrency(operation.cash)}</td>
    </tr>
  `).join("") + `
    <tr class="total-row">
      <td>TOTAL em caixa</td>
      <td class="num">${formatCurrency(cashTotal)}</td>
    </tr>
  `;

  const resultTotal = operations.reduce((sum, item) => sum + item.syntheticSub, 0);
  const dayTotal = operations.reduce((sum, item) => sum + item.syntheticSub - item.previousSyntheticSub, 0);
  const monthTotal = operations.reduce((sum, item) => sum + item.syntheticSub - item.monthStartSyntheticSub, 0);
  nodes.resultTable.innerHTML = operations.map((operation) => {
    const day = operation.syntheticSub - operation.previousSyntheticSub;
    const month = operation.syntheticSub - operation.monthStartSyntheticSub;
    return `
      <tr>
        <td>${operation.investor}</td>
        <td>${operation.shortName}</td>
        <td class="num ${signedClass(operation.syntheticSub)}">${formatCurrency(operation.syntheticSub)}</td>
        <td class="num ${signedClass(day)}">${formatCurrency(day)}</td>
        <td class="num ${signedClass(month)}">${formatCurrency(month)}</td>
      </tr>
    `;
  }).join("") + `
    <tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td class="num ${signedClass(resultTotal)}">${formatCurrency(resultTotal)}</td>
      <td class="num ${signedClass(dayTotal)}">${formatCurrency(dayTotal)}</td>
      <td class="num ${signedClass(monthTotal)}">${formatCurrency(monthTotal)}</td>
    </tr>
  `;

  renderSeniorSubordinadaCharts();
  renderPartnerRiskChart();
  renderPartnershipInsights();

  const guaranteeRows = guaranteeOperations(state.dateKey);
  const guaranteeSummaries = guaranteeRows.map((operation) => ({
    operation,
    guarantee: guaranteeSummary(operation, state.dateKey)
  }));
  const guaranteeTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.coverageValue, 0);
  const guaranteeLiveHeadsTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.totalHeads, 0);
  const guaranteeLiveWeightTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.totalWeightKg, 0);
  const guaranteeLiveValueTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.value, 0);
  const guaranteeCashTotal = guaranteeSummaries.reduce((sum, item) => sum + (item.operation.biologicalOnly ? 0 : item.guarantee.cashCoverage), 0);
  const guaranteeTransitHeadsTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.transitHeads, 0);
  const guaranteeTransitWeightTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.transitWeightKg, 0);
  const guaranteeTransitValueTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.transitValue, 0);
  const guaranteePurchasedTransitHeadsTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.purchasedTransitHeads, 0);
  const guaranteePurchasedTransitWeightTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.purchasedTransitWeightKg, 0);
  const guaranteePurchasedTransitValueTotal = guaranteeSummaries.reduce((sum, item) => sum + item.guarantee.purchasedTransitValue, 0);
  nodes.guaranteeManagementTable.innerHTML = guaranteeSummaries.map(({ operation, guarantee }) => {
    const hasGuarantee = guarantee.coverageValue > 0;
    const hasFunding = guarantee.hasFunding;
    const lotCount = guarantee.lots.length + guarantee.transitLots.length + guarantee.purchasedTransitLots.length + (guarantee.cashCoverage > 0 ? 1 : 0);
    const tone = hasFunding ? guaranteeTone(guarantee.coverage, lotCount) : hasGuarantee ? "pending" : guaranteeTone(guarantee.coverage, lotCount);
    const statusLabel = operation.biologicalOnly && hasGuarantee ? "Sem funding" : guaranteeLabel(tone);
    return `
      <tr>
        <td>${operation.shortName}</td>
        <td class="num guarantee-cell-live">${formatNumber(guarantee.totalHeads)}</td>
        <td class="num guarantee-cell-live">${formatNumber(guarantee.totalWeightKg / 1000, 1)} t</td>
        <td class="num guarantee-cell-live">${formatCurrency(guarantee.value)}</td>
        <td class="num guarantee-cell-transit">${formatNumber(guarantee.transitHeads)}</td>
        <td class="num guarantee-cell-transit">${formatNumber(guarantee.transitWeightKg / 1000, 1)} t</td>
        <td class="num guarantee-cell-transit">${formatCurrency(guarantee.transitValue)}</td>
        <td class="num guarantee-cell-purchased">${formatNumber(guarantee.purchasedTransitHeads)}</td>
        <td class="num guarantee-cell-purchased">${formatNumber(guarantee.purchasedTransitWeightKg / 1000, 1)} t</td>
        <td class="num guarantee-cell-purchased">${formatCurrency(guarantee.purchasedTransitValue)}</td>
        <td class="num guarantee-cell-cash">${operation.biologicalOnly ? "-" : formatCurrency(guarantee.cashCoverage)}</td>
        <td class="num guarantee-cell-total">${formatCurrency(guarantee.coverageValue)}</td>
        <td class="num ${hasFunding ? guaranteeValueClass(tone) : "neutral"}">${hasGuarantee && hasFunding ? formatPercent(guarantee.coverage * 100, 1) : "-"}</td>
        <td class="num ${hasGuarantee && hasFunding ? signedClass(guarantee.surplus) : "neutral"}">${hasGuarantee && hasFunding ? formatCurrency(guarantee.surplus) : "-"}</td>
        <td><span class="pill ${tone}">${statusLabel}</span></td>
      </tr>
    `;
  }).join("") + `
    <tr class="total-row">
      <td>TOTAL geral da garantia</td>
      <td class="num guarantee-cell-live">${formatNumber(guaranteeLiveHeadsTotal)}</td>
      <td class="num guarantee-cell-live">${formatNumber(guaranteeLiveWeightTotal / 1000, 1)} t</td>
      <td class="num guarantee-cell-live">${formatCurrency(guaranteeLiveValueTotal)}</td>
      <td class="num guarantee-cell-transit">${formatNumber(guaranteeTransitHeadsTotal)}</td>
      <td class="num guarantee-cell-transit">${formatNumber(guaranteeTransitWeightTotal / 1000, 1)} t</td>
      <td class="num guarantee-cell-transit">${formatCurrency(guaranteeTransitValueTotal)}</td>
      <td class="num guarantee-cell-purchased">${formatNumber(guaranteePurchasedTransitHeadsTotal)}</td>
      <td class="num guarantee-cell-purchased">${formatNumber(guaranteePurchasedTransitWeightTotal / 1000, 1)} t</td>
      <td class="num guarantee-cell-purchased">${formatCurrency(guaranteePurchasedTransitValueTotal)}</td>
      <td class="num guarantee-cell-cash">${formatCurrency(guaranteeCashTotal)}</td>
      <td class="num guarantee-cell-total">${formatCurrency(guaranteeTotal)}</td>
      <td class="num neutral">-</td>
      <td class="num neutral">-</td>
      <td></td>
    </tr>
  `;

  if (nodes.guaranteeManagementPrintTable) {
    nodes.guaranteeManagementPrintTable.innerHTML = guaranteeSummaries.map(({ operation, guarantee }) => {
      const hasGuarantee = guarantee.coverageValue > 0;
      const hasFunding = guarantee.hasFunding;
      const lotCount = guarantee.lots.length + guarantee.transitLots.length + guarantee.purchasedTransitLots.length + (guarantee.cashCoverage > 0 ? 1 : 0);
      const tone = hasFunding ? guaranteeTone(guarantee.coverage, lotCount) : hasGuarantee ? "pending" : guaranteeTone(guarantee.coverage, lotCount);
      return `
        <tr>
          <td>${operation.shortName}</td>
          <td class="num guarantee-cell-live">${formatNumber(guarantee.totalHeads)}</td>
          <td class="num guarantee-cell-live">${formatCurrency(guarantee.value)}</td>
          <td class="num guarantee-cell-transit">${formatNumber(guarantee.transitHeads)}</td>
          <td class="num guarantee-cell-transit">${formatCurrency(guarantee.transitValue)}</td>
          <td class="num guarantee-cell-purchased">${formatNumber(guarantee.purchasedTransitHeads)}</td>
          <td class="num guarantee-cell-purchased">${formatCurrency(guarantee.purchasedTransitValue)}</td>
          <td class="num guarantee-cell-cash">${operation.biologicalOnly ? "-" : formatCurrency(guarantee.cashCoverage)}</td>
          <td class="num guarantee-cell-total">${formatCurrency(guarantee.coverageValue)}</td>
          <td class="num ${hasFunding ? guaranteeValueClass(tone) : "neutral"}">${hasGuarantee && hasFunding ? formatPercent(guarantee.coverage * 100, 1) : "-"}</td>
          <td class="num ${hasGuarantee && hasFunding ? signedClass(guarantee.surplus) : "neutral"}">${hasGuarantee && hasFunding ? formatCurrency(guarantee.surplus) : "-"}</td>
        </tr>
      `;
    }).join("") + `
      <tr class="total-row">
        <td>TOTAL geral da garantia</td>
        <td class="num guarantee-cell-live">${formatNumber(guaranteeLiveHeadsTotal)}</td>
        <td class="num guarantee-cell-live">${formatCurrency(guaranteeLiveValueTotal)}</td>
        <td class="num guarantee-cell-transit">${formatNumber(guaranteeTransitHeadsTotal)}</td>
        <td class="num guarantee-cell-transit">${formatCurrency(guaranteeTransitValueTotal)}</td>
        <td class="num guarantee-cell-purchased">${formatNumber(guaranteePurchasedTransitHeadsTotal)}</td>
        <td class="num guarantee-cell-purchased">${formatCurrency(guaranteePurchasedTransitValueTotal)}</td>
        <td class="num guarantee-cell-cash">${formatCurrency(guaranteeCashTotal)}</td>
        <td class="num guarantee-cell-total">${formatCurrency(guaranteeTotal)}</td>
        <td class="num neutral">-</td>
        <td class="num neutral">-</td>
      </tr>
    `;
  }

  const headTop = `
    <tr>
      <th rowspan="2">Dias</th>
      <th rowspan="2">Data</th>
      ${operations.map((operation) => `<th>${operation.investor}</th>`).join("")}
    </tr>
    <tr>
      ${operations.map((operation) => `<th>${operation.shortName}</th>`).join("")}
    </tr>
  `;
  nodes.historyHead.innerHTML = headTop;
  nodes.historyBody.innerHTML = buildHistoryRows().map((row) => `
    <tr>
      <td>${row.day}</td>
      <td>${formatDate(row.dateKey)}</td>
      ${row.values.map((value) => `<td class="num ${signedClass(value)}">${formatCurrency(value)}</td>`).join("")}
    </tr>
  `).join("");
}

function renderCashValidation() {
  const scopeOperations = selectedCashOperations();
  const position = aggregateCashRows(scopeOperations, state.dateKey);
  const dailyRows = cashDailyRows();
  const annualCdi = cdiAnnualRateAtDate(state.dateKey);
  const dailyRate = cashDailyApplicationRate(state.dateKey);
  const cdiSource = cdiRateSourceLabelAtDate(state.dateKey);
  const portfolioEvents = scopeOperations.reduce((sum, operation) =>
    sum + operationCashPositionAtDate(operation, state.dateKey).totalPortfolioEvents
  , 0);
  const firstHistoryDate = dailyRows[0]?.dateKey;

  nodes.cashDate.textContent = `Data-base ${formatDate(state.dateKey)}`;

  const kpis = [
    ["Filtro", selectedCashLabel(), `${formatNumber(scopeOperations.length)} fundo${scopeOperations.length === 1 ? "" : "s"}`],
    ["Caixa atual", formatCurrency(position.currentBalance), "Saldo calculado"],
    ["Aplicado", formatCurrency(position.appliedBalance), `${formatPercent(CASH_APPLIED_SHARE * 100, 0)} do saldo final`],
    ["Livre", formatCurrency(position.freeBalance), "Saldo nao aplicado"],
    ["Rendimento acumulado", formatCurrency(position.totalInvestmentIncome, 2), `${formatPercent(CASH_APPLICATION_CDI_SHARE * 100, 0)} do CDI`],
    ["Historico", `${formatNumber(dailyRows.length)} dias`, firstHistoryDate ? `Desde ${formatDate(firstHistoryDate)} - ${formatNumber(portfolioEvents)} eventos carteira` : "Sem aporte"]
  ];

  nodes.cashKpis.innerHTML = kpis.map(([label, value, note], index) => `
    <article class="cash-kpi ${index === 1 ? "primary" : ""}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");

  const rationaleRows = [
    ["1", "Aporte do investidor", "Entra no caixa na data em que o funding foi enviado."],
    ["2", "Compras de carteira", "Reduzem o caixa pelo valor pago na compra dos titulos."],
    ["3", "Valor pago da carteira", "Aumenta o caixa pela coluna Valor pago na data do pagamento; nao usa valor de face."],
    ["4", "Pagamentos funding", "Reduzem o caixa pelo valor pago ao investidor, incluindo juros e principal."],
    ["5", "Aplicacao", `${formatPercent(CASH_APPLIED_SHARE * 100, 0)} do caixa apos movimentos do dia rende ${formatPercent(CASH_APPLICATION_CDI_SHARE * 100, 0)} do CDI.`],
    ["6", "Caixa final", `Saldo anterior + aportes - compras + valor pago - pagamentos funding; rendimento entra por ultimo. CDI base atual: ${formatPercent(annualCdi * 100, 2)} a.a. (${cdiSource}); taxa diaria do caixa: ${formatPercent(dailyRate * 100, 4)}.`]
  ];

  nodes.cashRationaleTable.innerHTML = rationaleRows.map(([step, movement, treatment]) => `
    <tr>
      <td>${step}</td>
      <td>${movement}</td>
      <td>${treatment}</td>
    </tr>
  `).join("");

  const fundRows = scopeOperations.map((operation) => {
    const row = operationCashPositionAtDate(operation, state.dateKey);
    return `
      <tr>
        <td>${escapeHtml(operation.investor)}</td>
        <td>${escapeHtml(operation.shortName)}</td>
        <td class="num">${formatCurrency(row.totalInvestorInflow, 2)}</td>
        <td class="num ${signedClass(-row.totalPortfolioPurchase)}">${formatCurrency(row.totalPortfolioPurchase, 2)}</td>
        <td class="num ${signedClass(row.totalPortfolioLiquidation)}">${formatCurrency(row.totalPortfolioLiquidation, 2)}</td>
        <td class="num ${signedClass(-row.totalFundingAmortization)}">${formatCurrency(row.totalFundingAmortization, 2)}</td>
        <td class="num ${signedClass(row.totalInvestmentIncome)}">${formatCurrency(row.totalInvestmentIncome, 2)}</td>
        <td class="num ${signedClass(row.currentBalance)}">${formatCurrency(row.currentBalance, 2)}</td>
        <td class="num">${formatCurrency(row.appliedBalance, 2)}</td>
        <td class="num">${formatCurrency(row.freeBalance, 2)}</td>
        <td class="num">${formatNumber(row.totalPortfolioEvents)}</td>
        <td class="action-cell">
          <button class="table-action" type="button" data-cash-funding="${operation.id}">Ver</button>
        </td>
      </tr>
    `;
  });

  const totalRow = scopeOperations.length > 1 ? `
    <tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td class="num">${formatCurrency(position.totalInvestorInflow, 2)}</td>
      <td class="num ${signedClass(-position.totalPortfolioPurchase)}">${formatCurrency(position.totalPortfolioPurchase, 2)}</td>
      <td class="num ${signedClass(position.totalPortfolioLiquidation)}">${formatCurrency(position.totalPortfolioLiquidation, 2)}</td>
      <td class="num ${signedClass(-position.totalFundingAmortization)}">${formatCurrency(position.totalFundingAmortization, 2)}</td>
      <td class="num ${signedClass(position.totalInvestmentIncome)}">${formatCurrency(position.totalInvestmentIncome, 2)}</td>
      <td class="num ${signedClass(position.currentBalance)}">${formatCurrency(position.currentBalance, 2)}</td>
      <td class="num">${formatCurrency(position.appliedBalance, 2)}</td>
      <td class="num">${formatCurrency(position.freeBalance, 2)}</td>
      <td class="num">${formatNumber(portfolioEvents)}</td>
      <td></td>
    </tr>
  ` : "";

  nodes.cashFundsTable.innerHTML = fundRows.join("") + totalRow;
  nodes.cashChart.innerHTML = fundingEvolutionChart(dailyRows, "Evolucao do caixa");
  if (nodes.cashIncomeChart) {
    const incomeRows = dailyRows.map((row) => ({
      dateKey: row.dateKey,
      currentBalance: row.totalInvestmentIncome
    }));
    nodes.cashIncomeChart.innerHTML = fundingEvolutionChart(incomeRows, "Evolucao do rendimento do caixa");
  }
  nodes.cashDailyTable.innerHTML = dailyRows.slice().reverse().map((row) => `
    <tr>
      <td>${formatDate(row.dateKey)}</td>
      <td class="num ${signedClass(row.initialBalance)}">${formatCurrency(row.initialBalance, 2)}</td>
      <td class="num ${signedClass(row.investorInflow)}">${formatCurrency(row.investorInflow, 2)}</td>
      <td class="num ${signedClass(-row.portfolioPurchase)}">${formatCurrency(row.portfolioPurchase, 2)}</td>
      <td class="num ${signedClass(row.portfolioLiquidation)}">${formatCurrency(row.portfolioLiquidation, 2)}</td>
      <td class="num ${signedClass(-row.fundingAmortization)}">${formatCurrency(row.fundingAmortization, 2)}</td>
      <td class="num ${signedClass(row.investmentIncome)}">${formatCurrency(row.investmentIncome, 2)}</td>
      <td class="num ${signedClass(row.currentBalance)}">${formatCurrency(row.currentBalance, 2)}</td>
    </tr>
  `).join("");
}

function renderPortfolioValidation() {
  const scopeOperations = selectedPortfolioOperations();
  const position = aggregatePortfolioPosition(scopeOperations, state.dateKey);
  const previousKey = addBusinessDaysBack(state.dateKey, 1);
  const previousPosition = aggregatePortfolioPosition(scopeOperations, previousKey);
  const weightedRate = position.rateAmount / (position.portfolioVp || 1);
  const weightedDays = position.dayAmount / (position.portfolioVp || 1);
  const dailyRows = portfolioDailyRows();
  const cashTotals = dailyRows.reduce((total, row) => ({
    purchases: total.purchases + row.purchases,
    liquidations: total.liquidations + row.liquidations
  }), { purchases: 0, liquidations: 0 });
  const importedCount = scopeOperations.filter((operation) => portfolioDataForOperation(operation)).length;
  const firstHistoryDate = dailyRows[0]?.dateKey;

  nodes.portfolioDate.textContent = `Data-base ${formatDate(state.dateKey)}`;

  const kpis = [
    ["Filtro", selectedPortfolioLabel(), `${formatNumber(scopeOperations.length)} fundo${scopeOperations.length === 1 ? "" : "s"}`],
    ["Carteiras importadas", formatNumber(importedCount), "Relatorios processados"],
    ["VP carteira", formatCurrency(position.portfolioVp), "Valor presente calculado"],
    ["Taxa media", `${formatPercent(weightedRate)} a.m.`, "Ponderada pelo VP"],
    ["Compras acumuladas", formatCurrency(cashTotals.purchases, 2), "Impacto negativo no caixa"],
    ["Valor pago acumulado", formatCurrency(cashTotals.liquidations, 2), "Impacto positivo no caixa"],
    ["Historico", `${formatNumber(dailyRows.length)} dias`, firstHistoryDate ? `Desde ${formatDate(firstHistoryDate)}` : "Sem eventos"]
  ];

  nodes.portfolioKpis.innerHTML = kpis.map(([label, value, note], index) => `
    <article class="cash-kpi ${index === 2 ? "primary" : ""}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");

  const fundRows = scopeOperations.map((operation) => {
    const data = portfolioDataForOperation(operation);
    const row = operationPortfolioPositionAtDate(operation, state.dateKey);
    const previousRow = operationPortfolioPositionAtDate(operation, previousKey);
    const dailyVpChange = roundMoney(row.portfolioVp - previousRow.portfolioVp);
    const events = importedPortfolioCashEvents(operation).filter((event) => event.date <= state.dateKey);
    const purchases = events
      .filter((event) => normalizeCashEventType(event) === "portfolioPurchase")
      .reduce((sum, event) => sum + cashEventAmount(event), 0);
    const liquidations = events
      .filter((event) => normalizeCashEventType(event) === "portfolioLiquidation")
      .reduce((sum, event) => sum + cashEventAmount(event), 0);
    return `
      <tr>
        <td>${escapeHtml(operation.investor)}</td>
        <td>${escapeHtml(operation.shortName)}</td>
        <td class="num">${formatNumber(row.titleCount)}</td>
        <td class="num">${formatCurrency(row.portfolioVn, 2)}</td>
        <td class="num">${formatCurrency(row.portfolioVp, 2)}</td>
        <td class="num ${signedClass(dailyVpChange)}">${formatCurrency(dailyVpChange, 2)}</td>
        <td class="num">${formatPercent(row.weightedRate)} a.m.</td>
        <td class="num">${formatNumber(row.weightedDays)} dias</td>
        <td class="num ${signedClass(-purchases)}">${formatCurrency(purchases, 2)}</td>
        <td class="num ${signedClass(liquidations)}">${formatCurrency(liquidations, 2)}</td>
        <td>${data ? `${escapeHtml(data.sourceFile || "CSV")} - ${formatDate(data.positionDate)}` : "Sem CSV"}</td>
        <td class="action-cell">
          <button class="table-action" type="button" data-portfolio-funding="${operation.id}">Ver</button>
        </td>
      </tr>
    `;
  });

  const totalRow = scopeOperations.length > 1 ? `
    <tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td class="num">${formatNumber(position.titleCount)}</td>
      <td class="num">${formatCurrency(position.portfolioVn, 2)}</td>
      <td class="num">${formatCurrency(position.portfolioVp, 2)}</td>
      <td class="num ${signedClass(position.portfolioVp - previousPosition.portfolioVp)}">${formatCurrency(position.portfolioVp - previousPosition.portfolioVp, 2)}</td>
      <td class="num">${formatPercent(weightedRate)} a.m.</td>
      <td class="num">${formatNumber(weightedDays)} dias</td>
      <td class="num ${signedClass(-cashTotals.purchases)}">${formatCurrency(cashTotals.purchases, 2)}</td>
      <td class="num ${signedClass(cashTotals.liquidations)}">${formatCurrency(cashTotals.liquidations, 2)}</td>
      <td>${formatNumber(importedCount)} importada${importedCount === 1 ? "" : "s"}</td>
      <td></td>
    </tr>
  ` : "";

  nodes.portfolioFundsTable.innerHTML = fundRows.join("") + totalRow;
  nodes.portfolioChart.innerHTML = fundingEvolutionChart(dailyRows, "Evolucao do VP da carteira");
  nodes.portfolioDailyTable.innerHTML = dailyRows.slice().reverse().map((row) => `
    <tr>
      <td>${formatDate(row.dateKey)}</td>
      <td class="num ${signedClass(-row.purchases)}">${formatCurrency(row.purchases, 2)}</td>
      <td class="num ${signedClass(row.liquidations)}">${formatCurrency(row.liquidations, 2)}</td>
      <td class="num">${formatNumber(row.activeTitles)}</td>
      <td class="num">${formatCurrency(row.faceValue, 2)}</td>
      <td class="num">${formatCurrency(row.presentValue, 2)}</td>
      <td class="num ${signedClass(row.dailyVpChange)}">${formatCurrency(row.dailyVpChange, 2)}</td>
    </tr>
  `).join("");

  const agingRows = portfolioAgingRows(scopeOperations, state.dateKey);
  nodes.portfolioAgingTable.innerHTML = agingRows.length ? agingRows.map(({ operation, title, days, bucket }) => `
    <tr>
      <td>${escapeHtml(operation.shortName)}</td>
      <td>${escapeHtml(title.sacado || title.cedente || "-")}</td>
      <td>${escapeHtml(title.lastro || title.id || "-")}</td>
      <td>${title.maturityDate ? formatDate(title.maturityDate) : "-"}</td>
      <td class="num ${days < 0 ? "negative" : ""}">${formatNumber(days)}</td>
      <td class="num">${formatCurrency(title.calculatedFaceValue, 2)}</td>
      <td class="num">${formatCurrency(title.calculatedPresentValue, 2)}</td>
      <td><span class="pill ${days < 0 ? "bad" : days <= 30 ? "warn" : "ok"}">${bucket}</span></td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="8">Sem titulos ativos com vencimento para a data selecionada</td>
    </tr>
  `;

  const titleRows = scopeOperations
    .flatMap((operation) => operationPortfolioPositionAtDate(operation, state.dateKey).titles)
    .sort((a, b) => Number(b.calculatedPresentValue || 0) - Number(a.calculatedPresentValue || 0));
  nodes.portfolioTitlesTable.innerHTML = titleRows.length ? titleRows.map((title) => `
    <tr>
      <td>${escapeHtml(title.sacado || title.cedente || "-")}</td>
      <td>${escapeHtml(title.titleType || "-")}</td>
      <td>${escapeHtml(title.lastro || title.id || "-")}</td>
      <td>${title.maturityDate ? formatDate(title.maturityDate) : "-"}</td>
      <td class="num">${formatCurrency(title.calculatedFaceValue, 2)}</td>
      <td class="num">${formatCurrency(title.calculatedPresentValue, 2)}</td>
      <td class="num ${signedClass(title.dailyVpChange)}">${formatCurrency(title.dailyVpChange, 2)}</td>
      <td class="num">${formatPercent(title.monthlyRatePercent)} a.m.</td>
      <td>${Number(title.daysToMaturity || 0) < 0 ? "Vencido" : "Em aberto"}</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="9">Sem titulos ativos importados para a data selecionada</td>
    </tr>
  `;
}

function renderFundingEvolution() {
  const scopeOperations = selectedEvolutionOperations();
  const activity = aggregateFundingActivity(scopeOperations, state.dateKey);
  const dailyRows = fundingEvolutionDailyRows();
  const componentCount = scopeOperations.reduce((sum, operation) => {
    prepareFundingInputs(operation);
    return sum + operation.fundingComponents.length;
  }, 0);
  const eventCount = scopeOperations.reduce((sum, operation) => sum + operationFundingEventsCount(operation), 0);
  const totalPrincipal = scopeOperations.reduce((sum, operation) => sum + operationFundingPrincipal(operation), 0);
  const startDates = scopeOperations.map(operationStartDate).filter(Boolean).sort();
  const firstStart = startDates[0];

  nodes.fundingEvolutionDate.textContent = `Data-base ${formatDate(state.dateKey)}`;

  const kpis = [
    ["Filtro", selectedEvolutionLabel(), `${formatNumber(scopeOperations.length)} funding${scopeOperations.length === 1 ? "" : "s"}`],
    ["Principal original", formatCurrency(totalPrincipal), "Montante carregado"],
    ["Componentes", formatNumber(componentCount), "Series e cessoes"],
    ["Eventos", formatNumber(eventCount), "Pagamentos/amortizacoes"],
    ["Inicio", firstStart ? formatDate(firstStart) : "-", "Primeira data do filtro"],
    ["Saldo atual", formatCurrency(activity.currentBalance), "Saldo calculado"]
  ];

  nodes.fundingEvolutionKpis.innerHTML = kpis.map(([label, value, note], index) => `
    <article class="evolution-kpi ${index === kpis.length - 1 ? "primary" : ""}">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");

  const tableRows = scopeOperations.map((operation) => {
    const row = operationFundingActivity(operation, state.dateKey);
    const rateLabel = operation.fundingRateLabel || `${formatPercent(operation.fundingRate)} a.m.`;
    return `
      <tr>
        <td>${escapeHtml(operation.investor)}</td>
        <td>${escapeHtml(operation.shortName)}</td>
        <td title="${escapeHtml(rateLabel)}">${escapeHtml(rateLabel)}</td>
        <td>${operationStartDate(operation) ? formatDate(operationStartDate(operation)) : "-"}</td>
        <td class="num">${formatCurrency(operationFundingPrincipal(operation), 2)}</td>
        <td class="num">${formatCurrency(row.previousBalance, 2)}</td>
        <td class="num ${signedClass(row.interestAccrued)}">${formatCurrency(row.interestAccrued, 2)}</td>
        <td class="num ${signedClass(row.payment)}">${formatCurrency(row.payment, 2)}</td>
        <td class="num ${signedClass(row.amortization)}">${formatCurrency(row.amortization, 2)}</td>
        <td class="num">${formatCurrency(row.currentBalance, 2)}</td>
        <td class="num ${signedClass(-row.monthChange)}">${formatCurrency(row.monthChange, 2)}</td>
        <td class="num">${formatNumber(operationFundingEventsCount(operation))}</td>
        <td class="action-cell">
          <button class="table-action" type="button" data-open-funding="${operation.id}">Abrir</button>
        </td>
      </tr>
    `;
  });

  const totalRow = scopeOperations.length > 1 ? `
    <tr class="total-row">
      <td colspan="4">TOTAL</td>
      <td class="num">${formatCurrency(totalPrincipal, 2)}</td>
      <td class="num">${formatCurrency(activity.previousBalance, 2)}</td>
      <td class="num ${signedClass(activity.interestAccrued)}">${formatCurrency(activity.interestAccrued, 2)}</td>
      <td class="num ${signedClass(activity.payment)}">${formatCurrency(activity.payment, 2)}</td>
      <td class="num ${signedClass(activity.amortization)}">${formatCurrency(activity.amortization, 2)}</td>
      <td class="num">${formatCurrency(activity.currentBalance, 2)}</td>
      <td class="num ${signedClass(-activity.monthChange)}">${formatCurrency(activity.monthChange, 2)}</td>
      <td class="num">${formatNumber(eventCount)}</td>
      <td></td>
    </tr>
  ` : "";

  nodes.fundingEvolutionInvestorTable.innerHTML = tableRows.join("") + totalRow;
  nodes.fundingEvolutionChart.innerHTML = fundingEvolutionChart(dailyRows);
  nodes.fundingEvolutionDailyTable.innerHTML = dailyRows.slice().reverse().map((row) => `
    <tr>
      <td>${formatDate(row.dateKey)}</td>
      <td class="num">${formatCurrency(row.previousBalance, 2)}</td>
      <td class="num ${signedClass(row.drawdown)}">${formatCurrency(row.drawdown, 2)}</td>
      <td class="num ${signedClass(row.interestAccrued)}">${formatCurrency(row.interestAccrued, 2)}</td>
      <td class="num ${signedClass(row.payment)}">${formatCurrency(row.payment, 2)}</td>
      <td class="num ${signedClass(row.amortization)}">${formatCurrency(row.amortization, 2)}</td>
      <td class="num">${formatCurrency(row.currentBalance, 2)}</td>
    </tr>
  `).join("");
}

function renderQuotesValidation() {
  const currentRows = quoteRows();
  const selectedRows = selectedQuoteRows();
  const quoteDate = state.dateKey || latestQuoteDate(currentRows);
  const collectedAt = latestCollectedAt(currentRows);
  const regionalRows = selectedRows.filter((row) =>
    row.map_type === "regional_map" || row.map_type === "historical_series"
  );
  const mtRows = selectedQuoteRowsByMap("mt_bulletin");
  const replacementRows = selectedQuoteRowsByMap("replacement_grid");
  const modeLabel = quoteModeLabel(selectedRows);

  nodes.quotesDate.textContent = quoteDate
    ? `Data selecionada ${formatDate(quoteDate)} - ${modeLabel}`
    : "Sem cotacao carregada";

  const kpis = [
    ["Ultima coleta", formatDateTime(collectedAt), "Horario local"],
    ["Regional", formatNumber(regionalRows.length), "Registros em R$/@"],
    ["Modo", modeLabel, "Conforme data selecionada"],
    ["Reposicao", formatNumber(replacementRows.length), `MT: ${formatNumber(mtRows.length)} linhas`]
  ];
  nodes.quoteKpis.innerHTML = kpis.map(([label, value, note]) => `
    <article class="quote-kpi">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");

  nodes.quotesRegionalHead.innerHTML = `
    <tr>
      <th>Categoria</th>
      ${REGION_ORDER.map((region) => `<th class="num">${region}</th>`).join("")}
    </tr>
  `;
  nodes.quotesRegionalMatrix.innerHTML = ["boi", "vaca", "novilha"].map((category) => `
    <tr>
      <td>${quoteCategoryLabel(category)}</td>
      ${REGION_ORDER.map((region) => {
        const row = regionalQuote(category, region, selectedRows);
        return `<td class="num">${formatQuotePrice(row, 2)}</td>`;
      }).join("")}
    </tr>
  `).join("");

  const sortedRegionalRows = [...regionalRows].sort((a, b) =>
    `${a.category}-${a.region}`.localeCompare(`${b.category}-${b.region}`)
  );
  nodes.quotesRegionalDetailTable.innerHTML = sortedRegionalRows.length ? sortedRegionalRows.map((row) => `
    <tr>
      <td>${formatDate(row.quote_date)}</td>
      <td>${quoteCategoryLabel(row.category)}</td>
      <td>${row.region || "-"}</td>
      <td class="num">${formatQuotePrice(row, 2)}</td>
      <td class="num ${signedClass(row.variation_percent)}">${row.variation_percent === null || row.variation_percent === undefined ? "-" : formatSignedPercent(row.variation_percent)}</td>
      <td class="num">${row.reference_value === null || row.reference_value === undefined ? "-" : formatNumber(row.reference_value, 2)}</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="6">Sem registros regionais para a data selecionada</td>
    </tr>
  `;

  const sortedMtRows = [...mtRows].sort((a, b) =>
    `${a.category}-${String(a.row_index).padStart(2, "0")}`.localeCompare(`${b.category}-${String(b.row_index).padStart(2, "0")}`)
  );
  const mtCategoryOptions = uniqueSelectOptions(mtRows, (row) => row.category, (row) => quoteCategoryLabel(row.category));
  const mtRegionOptions = uniqueSelectOptions(mtRows, (row) => row.subregion);
  state.quoteFilters.mtCategory = validFilterValue(state.quoteFilters.mtCategory, mtCategoryOptions);
  state.quoteFilters.mtRegion = validFilterValue(state.quoteFilters.mtRegion, mtRegionOptions);
  nodes.quotesMtCategoryFilter.innerHTML = renderSelectOptions(mtCategoryOptions, state.quoteFilters.mtCategory, "Todas");
  nodes.quotesMtRegionFilter.innerHTML = renderSelectOptions(mtRegionOptions, state.quoteFilters.mtRegion, "Todas");

  const filteredMtRows = sortedMtRows.filter((row) =>
    (state.quoteFilters.mtCategory === ALL_FILTER_VALUE || row.category === state.quoteFilters.mtCategory) &&
    (state.quoteFilters.mtRegion === ALL_FILTER_VALUE || row.subregion === state.quoteFilters.mtRegion)
  );
  nodes.quotesMtTable.innerHTML = filteredMtRows.length ? filteredMtRows.map((row) => `
    <tr>
      <td>${quoteCategoryLabel(row.category)}</td>
      <td>${row.subregion || "-"}</td>
      <td class="num">${formatQuotePrice(row, 2)}</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="3">${mtRows.length ? "Sem boletim MT para os filtros selecionados" : "Sem boletim MT para a data selecionada"}</td>
    </tr>
  `;

  const sortedReplacementRows = [...replacementRows].sort((a, b) =>
    `${a.category}-${String(a.row_index).padStart(2, "0")}-${String(a.column_index).padStart(2, "0")}`
      .localeCompare(`${b.category}-${String(b.row_index).padStart(2, "0")}-${String(b.column_index).padStart(2, "0")}`)
  );
  const replacementCategoryOptions = uniqueSelectOptions(
    replacementRows,
    (row) => row.category,
    (row) => quoteCategoryLabel(row.category)
  );
  const replacementUfOptions = uniqueSelectOptions(replacementRows, (row) => replacementUfLabel(row));
  const replacementTypeFilterOptions = replacementTypeOptions(replacementRows);
  state.quoteFilters.replacementCategory = validFilterValue(state.quoteFilters.replacementCategory, replacementCategoryOptions);
  state.quoteFilters.replacementUf = validFilterValue(state.quoteFilters.replacementUf, replacementUfOptions);
  state.quoteFilters.replacementType = validFilterValue(state.quoteFilters.replacementType, replacementTypeFilterOptions);
  nodes.quotesReplacementCategoryFilter.innerHTML = renderSelectOptions(replacementCategoryOptions, state.quoteFilters.replacementCategory, "Todas");
  nodes.quotesReplacementUfFilter.innerHTML = renderSelectOptions(replacementUfOptions, state.quoteFilters.replacementUf, "Todas");
  nodes.quotesReplacementTypeFilter.innerHTML = renderSelectOptions(replacementTypeFilterOptions, state.quoteFilters.replacementType, "Todos");

  const filteredReplacementRows = sortedReplacementRows.filter((row) =>
    (state.quoteFilters.replacementCategory === ALL_FILTER_VALUE || row.category === state.quoteFilters.replacementCategory) &&
    (state.quoteFilters.replacementUf === ALL_FILTER_VALUE || replacementUfLabel(row) === state.quoteFilters.replacementUf) &&
    (state.quoteFilters.replacementType === ALL_FILTER_VALUE || String(row.column_index) === state.quoteFilters.replacementType)
  );
  nodes.quotesReplacementTable.innerHTML = filteredReplacementRows.length ? filteredReplacementRows.map((row) => `
    <tr>
      <td>${quoteCategoryLabel(row.category)}</td>
      <td>${replacementUfLabel(row)}</td>
      <td>${replacementTypeLabel(row)}</td>
      <td class="num">${row.price === null || row.price === undefined ? "-" : formatNumber(row.price, 2)}</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="4">${replacementRows.length ? "Sem grade de reposicao para os filtros selecionados" : "Sem grade de reposicao para a data selecionada"}</td>
    </tr>
  `;
}

function renderDetail() {
  const operation = selectedOperation();
  const spread = operation.portfolioRate - operation.fundingRate;
  const result = operation.portfolioVp + operation.cash - operation.fundingBalance;

  nodes.detailTitle.textContent = `${operation.investor} - ${operation.name}`;
  nodes.detailStatus.innerHTML = `<span class="pill ${operation.warning}">${operation.warning === "ok" ? "OK" : operation.warning === "warn" ? "Atencao" : "Critico"}</span>`;
  nodes.detailInvestor.textContent = operation.investor;
  nodes.detailFundingRate.textContent = `${formatPercent(operation.fundingRate)} a.m.`;
  nodes.detailFundingRate.title = operation.fundingRateLabel || "";
  nodes.detailPortfolioRate.textContent = `${formatPercent(operation.portfolioRate)} a.m.`;
  nodes.detailSpread.textContent = formatDate(state.dateKey);

  const fundingCurrent = fundingAtOffset(operation, 0);
  const monthStartKey = rollingMonthReferenceKey(state.dateKey);
  const fundingCurrentActivity = operationFundingActivity(operation, state.dateKey);
  const fundingThirtyStartKey = addBusinessDaysBack(state.dateKey, 29);
  const syntheticThirtyStart = syntheticAtOffset(operation, 29);
  const portfolio = portfolioTotals(operation);
  const averageTicket = operation.portfolioVp / Math.max(portfolio.count, 1);
  const guarantee = guaranteeSummary(operation, state.dateKey);
  const guaranteeStatus = guaranteeTone(guarantee.coverage, guarantee.lots.length);
  const hasGuarantee = guarantee.coverageValue > 0;

  const performanceRows = [
    {
      label: "Funding",
      balance: fundingCurrent,
      day: fundingReturnFromInterest(
        fundingCurrentActivity.interestAccrued,
        fundingCurrentActivity.previousBalance,
        fundingCurrentActivity.drawdown
      ),
      month: fundingReturnBetween(operation, monthStartKey, state.dateKey),
      thirty: fundingReturnBetween(operation, fundingThirtyStartKey, state.dateKey)
    },
    {
      label: "Subordinada sintetica",
      balance: operation.syntheticSub,
      day: syntheticReturnOnFunding(operation, operation.syntheticSub, operation.previousSyntheticSub),
      month: syntheticReturnOnFunding(operation, operation.syntheticSub, operation.monthStartSyntheticSub),
      thirty: syntheticReturnOnFunding(operation, operation.syntheticSub, syntheticThirtyStart)
    }
  ];

  nodes.performanceTable.innerHTML = performanceRows.map((row) => `
    <tr>
      <td>${row.label}</td>
      <td class="num">${formatCurrency(row.balance)}</td>
      <td class="num ${signedClass(row.day)}">${formatSignedPercent(row.day)}</td>
      <td class="num ${signedClass(row.month)}">${formatSignedPercent(row.month)}</td>
      <td class="num ${signedClass(row.thirty)}">${formatSignedPercent(row.thirty)}</td>
    </tr>
  `).join("");

  const portfolioCards = [
    ["Valor nominal", formatCurrency(operation.portfolioVn), "Base total da carteira"],
    ["Valor presente", formatCurrency(operation.portfolioVp), "Carteira calculada na data"],
    ["Taxa media", `${formatPercent(operation.portfolioRate)} a.m.`, "Media ponderada gerencial"],
    ["Prazo medio", `${formatNumber(operation.duration)} dias`, "Prazo ponderado estimado"],
    ["Ticket medio", formatCurrency(averageTicket), "VP por titulo da amostra"],
    ["Vencidos", formatCurrency(operation.overdue), "Exposicao em atraso"],
    ["Amostra", `${portfolio.count} titulos`, "Abertura sintetica da V1"]
  ];
  nodes.detailPortfolioKpis.innerHTML = portfolioCards.map(([label, value, note]) => `
    <article class="portfolio-kpi">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");

  const componentRows = fundingComponentRows(operation);
  if (nodes.fundingComponentsTable) {
    nodes.fundingComponentsTable.innerHTML = componentRows.length ? componentRows.map((row) => {
      const deltaTone = Math.abs(row.validationDelta) <= 1 ? "ok" : "warn";
      const deltaLabel = Math.abs(row.validationDelta) <= 1 ? "OK" : formatCurrency(row.validationDelta, 2);
      return `
        <tr>
          <td>${escapeHtml(row.name)}</td>
          <td>${row.startDate ? formatDate(row.startDate) : "-"}</td>
          <td>${row.maturityDate ? formatDate(row.maturityDate) : "-"}</td>
          <td>${escapeHtml(row.rateLabel)}</td>
          <td class="num">${formatCurrency(row.principal)}</td>
          <td class="num">${formatCurrency(row.balance)}</td>
          <td class="num">${formatNumber(row.events)}</td>
          <td><span class="pill ${deltaTone}">${deltaLabel}</span></td>
        </tr>
      `;
    }).join("") : `
      <tr>
        <td colspan="8">Sem componentes de funding cadastrados</td>
      </tr>
    `;
  }

  const eventRows = fundingEvents(operation).slice(0, 12);
  if (nodes.fundingEventsTable) {
    nodes.fundingEventsTable.innerHTML = eventRows.length ? eventRows.map((row) => `
      <tr>
        <td>${row.date ? formatDate(row.date) : "-"}</td>
        <td>${escapeHtml(row.component)}</td>
        <td class="num">${formatCurrency(row.amount, 2)}</td>
        <td class="num">${formatCurrency(row.interestPaid, 2)}</td>
        <td class="num">${formatCurrency(row.amortization, 2)}</td>
      </tr>
    `).join("") : `
      <tr>
        <td colspan="5">Sem amortizacao informada para este funding</td>
      </tr>
    `;
  }

  const guaranteeReferenceNote = guarantee.snapshotDate
    ? `Composicao ${formatDate(guarantee.snapshotDate)}; caixa ${formatDate(state.dateKey)}`
    : "Sem composicao historica";
  const guaranteeCards = [
    ["Garantia total", formatCurrency(guarantee.coverageValue), guaranteeReferenceNote, true],
    ["Gado vivo", formatCurrency(guarantee.value), `${formatNumber(guarantee.totalHeads)} cabecas - valor garantia`, false],
    ["Caixa", formatCurrency(guarantee.cashCoverage), "Saldo positivo como cobertura", false],
    ["Gado em transito", formatCurrency(guarantee.transitValue), `${formatNumber(guarantee.transitHeads)} cabecas - valor garantia`, false],
    ["Comprado em transito", formatCurrency(guarantee.purchasedTransitValue), `${formatNumber(guarantee.purchasedTransitHeads)} cabecas - valor garantia`, false],
    ["Cobertura", hasGuarantee ? formatPercent(guarantee.coverage * 100, 1) : "-", "Garantia total / funding", false],
    ["Sobra / deficit", hasGuarantee ? formatCurrency(guarantee.surplus) : "-", "Garantia total - funding", false]
  ];
  nodes.guaranteeOverview.innerHTML = guaranteeCards.map(([label, value, note, primary]) => `
    <article class="guarantee-kpi ${primary ? "primary" : ""}">
      <span>${label}</span>
      <strong class="${label === "Sobra / deficit" ? signedClass(guarantee.surplus) : ""}">${value}</strong>
      <small>${note}</small>
    </article>
  `).join("");

  const guaranteeLotGroups = [
    ["SUBTOTAL gado vivo", guarantee.lots, guarantee.totalHeads, guarantee.averageWeightKg, guarantee.totalArrobas, guarantee.value],
    ["SUBTOTAL gado em transito", guarantee.transitLots, guarantee.transitHeads, guarantee.transitAverageWeightKg, guarantee.transitArrobas, guarantee.transitValue],
    ["SUBTOTAL comprado em transito", guarantee.purchasedTransitLots, guarantee.purchasedTransitHeads, guarantee.purchasedTransitAverageWeightKg, guarantee.purchasedTransitArrobas, guarantee.purchasedTransitValue]
  ];
  const guaranteeLotRows = guaranteeLotGroups.map(([subtotalLabel, rows, subtotalHeads, subtotalAverageWeight, subtotalArrobas, subtotalValue]) => {
    if (!rows.length && !subtotalValue) return "";
    const detailRows = rows.map((lot) => {
    const origin = lot.meta?.reportedOperationId && lot.meta.reportedOperationId !== operation.id
      ? lot.meta.sourceVehicleName
      : "";
    return `
    <tr>
      <td class="print-hide-guarantee-local">${escapeHtml(lot.location)}</td>
      <td>${escapeHtml(lot.bucketLabel)} - ${escapeHtml(lot.category)}${lot.isPartnershipGuarantee ? `<br><small>Parceria: ${formatPercent(lot.guaranteeFactor * 100, 0)}</small>` : ""}${origin ? `<br><small>Origem: ${escapeHtml(origin)}</small>` : ""}</td>
      <td class="num">${formatNumber(lot.heads)}</td>
      <td class="num">${formatNumber(lot.averageWeightKg, 0)} kg</td>
      <td class="num">${formatNumber(lot.arrobas, 0)}</td>
      <td class="num">${formatCurrency(lot.quotePerArroba, 2)}</td>
      <td class="num">${formatCurrency(lot.guaranteeValue)}</td>
    </tr>
  `;
    }).join("");
    return detailRows + `
      <tr class="total-row">
        <td class="print-hide-guarantee-local"></td>
        <td>${subtotalLabel}</td>
        <td class="num">${formatNumber(subtotalHeads)}</td>
        <td class="num">${formatNumber(subtotalAverageWeight, 0)} kg</td>
        <td class="num">${formatNumber(subtotalArrobas, 0)}</td>
        <td class="num">${formatCurrency(guarantee.quotePerArroba, 2)}</td>
        <td class="num">${formatCurrency(subtotalValue)}</td>
      </tr>
    `;
  }).join("");
  nodes.guaranteeLotsTable.innerHTML = guaranteeLotRows + `
    <tr class="total-row">
      <td class="print-hide-guarantee-local"></td>
      <td>TOTAL gado garantia</td>
      <td class="num">${formatNumber(guarantee.totalHeads + guarantee.transitHeads + guarantee.purchasedTransitHeads)}</td>
      <td class="num">-</td>
      <td class="num">${formatNumber(guarantee.totalArrobas + guarantee.transitArrobas + guarantee.purchasedTransitArrobas, 0)}</td>
      <td class="num">${formatCurrency(guarantee.quotePerArroba, 2)}</td>
      <td class="num">${formatCurrency(guarantee.value + guarantee.transitValue + guarantee.purchasedTransitValue)}</td>
    </tr>
  `;

  const detailHistoryRows = buildDetailHistory(operation);
  nodes.detailHistoryTable.innerHTML = detailHistoryRows.map((row) => `
    <tr>
      <td>${formatDate(row.dateKey)}</td>
      <td class="num ${signedClass(row.fundingDay)}">${formatSignedPercent(row.fundingDay)}</td>
      <td class="num ${signedClass(row.syntheticDay)}">${formatSignedPercent(row.syntheticDay)}</td>
      <td class="num ${signedClass(row.fundingMonth)}">${formatSignedPercent(row.fundingMonth)}</td>
      <td class="num ${signedClass(row.syntheticMonth)}">${formatSignedPercent(row.syntheticMonth)}</td>
      <td class="num">${formatCurrency(row.funding)}</td>
      <td class="num ${signedClass(row.synthetic)}">${formatCurrency(row.synthetic)}</td>
    </tr>
  `).join("");

  const equationItems = [
    { label: "Carteira VP", value: operation.portfolioVp, sign: "+" },
    { label: "Caixa", value: operation.cash, sign: "+" },
    { label: "Funding", value: operation.fundingBalance, sign: "-" },
    { label: "Subordinada sintetica", value: result, sign: "=" }
  ];
  nodes.waterfall.innerHTML = `
    <div class="position-equation">
      ${equationItems.map((item, index) => `
        <article class="equation-row ${index === equationItems.length - 1 ? "result" : ""}">
          <span class="equation-sign">${item.sign}</span>
          <span class="equation-label">${item.label}</span>
          <strong class="${item.sign === "-" ? "negative" : signedClass(item.value)}">${formatCurrency(item.value)}</strong>
        </article>
      `).join("")}
    </div>
    <div class="formula-line">
      Subordinada sintetica = Carteira VP + Caixa - Funding
    </div>
  `;

  const alerts = [
    {
      title: "Margem",
      text: `Spread ${formatSignedPercent(spread)} a.m.`,
      tone: spread < 0.18 ? "warn" : "ok"
    },
    {
      title: "Atraso",
      text: operation.overdue > 0 ? formatCurrency(operation.overdue) : "Sem atraso",
      tone: operation.overdue > 0 ? "warn" : "ok"
    },
    {
      title: "Garantia",
      text: `Cobertura ${formatPercent(guarantee.coverage * 100, 1)}`,
      tone: guaranteeStatus
    }
  ];
  nodes.alertList.innerHTML = alerts.map((alert) => `
    <article class="alert-item">
      <div>
        <strong>${alert.title}</strong>
        <span>${alert.text}</span>
      </div>
      <span class="pill ${alert.tone}">${alert.tone === "ok" ? "OK" : alert.tone === "warn" ? "Atencao" : "Critico"}</span>
    </article>
  `).join("");

  nodes.portfolioConcentrationTable.innerHTML = portfolioConcentration(operation).map((row) => `
    <tr>
      <td>${row.producer}</td>
      <td>${row.type}</td>
      <td class="num">${formatCurrency(row.vn)}</td>
      <td class="num">${formatCurrency(row.vp)}</td>
      <td class="num">${formatPercent(row.vp / operation.portfolioVp * 100)}</td>
      <td class="num">${formatPercent(row.rate)} a.m.</td>
      <td>${row.status}</td>
    </tr>
  `).join("");

  nodes.portfolioTable.innerHTML = operation.portfolio.length ? operation.portfolio.map((row) => `
    <tr>
      <td>${row[0]}</td>
      <td>${row[1]}</td>
      <td class="num">${formatCurrency(row[2])}</td>
      <td class="num">${formatCurrency(row[3])}</td>
      <td class="num">${formatPercent(row[4])}</td>
      <td class="num ${signedClass(row[4] - operation.fundingRate)}">${formatSignedPercent(row[4] - operation.fundingRate)}</td>
      <td class="num">${formatPercent(row[3] / operation.portfolioVp * 100)}</td>
      <td>${row[5]}</td>
      <td>${row[6]}</td>
    </tr>
  `).join("") : `
    <tr>
      <td colspan="9">Carteira por titulo ainda nao carregada</td>
    </tr>
  `;
}

function render() {
  recalculateFundingPositions();
  renderSelectors();
  renderSummary();
  renderManagement();
  if (state.view === "caixa") renderCashValidation();
  if (state.view === "carteira") renderPortfolioValidation();
  renderFundingEvolution();
  renderQuotesValidation();
  renderPremium();
  renderDetail();
  nodes.managementView.hidden = state.view !== "gerencial";
  nodes.cashView.hidden = state.view !== "caixa";
  nodes.portfolioView.hidden = state.view !== "carteira";
  nodes.fundingEvolutionView.hidden = state.view !== "evolucao";
  nodes.quotesView.hidden = state.view !== "cotacoes";
  if (nodes.premiumView) nodes.premiumView.hidden = state.view !== "premio";
  nodes.detailView.hidden = state.view !== "individual";
}

nodes.dateSelector.addEventListener("change", (event) => {
  state.dateKey = event.target.value || state.dateKey;
  render();
});

nodes.fundingSelector.addEventListener("change", (event) => {
  if (state.view === "caixa") {
    state.cashId = event.target.value || "gerencial";
    render();
    return;
  }
  if (state.view === "carteira") {
    state.portfolioId = event.target.value || "gerencial";
    render();
    return;
  }
  if (state.view === "evolucao") {
    state.evolutionId = event.target.value || "gerencial";
    render();
    return;
  }
  if (event.target.value === "gerencial") {
    state.view = "gerencial";
  } else {
    state.selectedId = event.target.value;
    state.view = "individual";
  }
  render();
});

nodes.resultTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-funding]");
  if (!button) return;
  state.selectedId = button.dataset.openFunding;
  state.view = "individual";
  render();
});

nodes.cashFundsTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cash-funding]");
  if (!button) return;
  state.cashId = button.dataset.cashFunding;
  state.view = "caixa";
  render();
});

nodes.portfolioFundsTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-portfolio-funding]");
  if (!button) return;
  state.portfolioId = button.dataset.portfolioFunding;
  state.view = "carteira";
  render();
});

nodes.fundingEvolutionInvestorTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-funding]");
  if (!button) return;
  state.selectedId = button.dataset.openFunding;
  state.view = "individual";
  render();
});

nodes.managementButton.addEventListener("click", () => {
  state.view = "gerencial";
  render();
});

nodes.cashButton.addEventListener("click", () => {
  if (state.view === "individual") state.cashId = state.selectedId;
  state.view = "caixa";
  render();
});

nodes.portfolioButton.addEventListener("click", () => {
  if (state.view === "individual") state.portfolioId = state.selectedId;
  state.view = "carteira";
  render();
});

nodes.fundingEvolutionButton.addEventListener("click", () => {
  if (state.view === "individual") state.evolutionId = state.selectedId;
  state.view = "evolucao";
  render();
});

nodes.quotesButton.addEventListener("click", () => {
  state.view = "cotacoes";
  state.dateKey = latestQuoteDate() || state.dateKey;
  render();
});

if (nodes.premiumButton) {
  nodes.premiumButton.addEventListener("click", () => {
    state.view = "premio";
    render();
  });
}

[
  [nodes.quotesMtCategoryFilter, "mtCategory"],
  [nodes.quotesMtRegionFilter, "mtRegion"],
  [nodes.quotesReplacementCategoryFilter, "replacementCategory"],
  [nodes.quotesReplacementUfFilter, "replacementUf"],
  [nodes.quotesReplacementTypeFilter, "replacementType"]
].forEach(([node, filterKey]) => {
  node.addEventListener("change", (event) => {
    state.quoteFilters[filterKey] = event.target.value;
    render();
  });
});

if (nodes.premiumFileInput) {
  nodes.premiumFileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      premiumState.rows = parsePremiumCsv(String(reader.result || ""));
      premiumState.fileName = file.name;
      premiumState.rowOverrides = {};
      premiumState.paymentAmount = 0;
      premiumState.pricePerHead = 0;
      premiumState.paymentTouched = false;
      premiumState.priceTouched = false;
      const farms = premiumFarmOptions();
      premiumState.selectedFarm = farms[0] || "";
      const dates = premiumDateOptions();
      premiumState.selectedDate = dates[0] || "";
      applyPremiumDateDefaultPrice();
      state.view = "premio";
      render();
    };
    reader.readAsText(file, "ISO-8859-1");
  });
}

if (nodes.premiumFarmFilter) {
  nodes.premiumFarmFilter.addEventListener("change", (event) => {
    premiumState.selectedFarm = event.target.value;
    premiumState.selectedDate = "";
    render();
  });
}

if (nodes.premiumDateFilter) {
  nodes.premiumDateFilter.addEventListener("change", (event) => {
    premiumState.selectedDate = event.target.value;
    applyPremiumDateDefaultPrice();
    render();
  });
}

if (nodes.premiumPaymentInput) {
  nodes.premiumPaymentInput.addEventListener("input", (event) => {
    premiumState.paymentAmount = parsePtNumber(event.target.value);
    premiumState.paymentTouched = true;
    if (premiumState.paymentAmount > 0) {
      premiumState.pricePerHead = 0;
      premiumState.priceTouched = false;
    }
    renderPremium();
  });
}

if (nodes.premiumPriceHeadInput) {
  nodes.premiumPriceHeadInput.addEventListener("input", (event) => {
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
  [nodes.premiumMonthlyRateInput, "monthlyRate", 100],
  [nodes.premiumGtaInput, "gtaCost", 1],
  [nodes.premiumTagInput, "tagCostPerHead", 1],
  [nodes.premiumMonitoringFeeInput, "monitoringFeeRate", 100]
].forEach(([node, field, divisor]) => {
  if (!node) return;
  node.addEventListener("input", (event) => {
    premiumState[field] = parsePtNumber(event.target.value) / divisor;
    renderPremium();
  });
});

if (nodes.premiumMemoryTable) {
  nodes.premiumMemoryTable.addEventListener("change", (event) => {
    const input = event.target.closest("[data-premium-title][data-premium-field]");
    if (!input) return;
    const title = input.dataset.premiumTitle;
    const field = input.dataset.premiumField;
    premiumState.rowOverrides[title] = {
      ...(premiumState.rowOverrides[title] || {}),
      [field]: parsePtNumber(input.value)
    };
    renderPremium();
  });
}

nodes.printButton.addEventListener("click", () => {
  window.print();
});

render();
