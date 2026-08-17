const state = {
  trades: [],
  filteredTrades: [],
  candles: [],
  candlePeriod: 5,
  indicatorPeriod: "same",
  candleRequests: new Set(),
  candleRequestErrors: new Map(),
  candleFetchDisabled: false,
  candleCacheVersion: 0,
  candleSeriesCache: new Map(),
  tradeCacheVersion: 0,
  instrumentTradeCache: new Map(),
  chartWindowStartByTrade: new Map(),
  chartWindowSizeByPeriod: new Map(),
  chartHover: null,
  activeIndicators: [],
  indicatorSettings: {},
  editingIndicator: null,
  pendingPanDelta: 0,
  pendingWheelFrame: null,
  pendingFilterFrame: null,
  dashboardMode: "orderbook",
  filterRules: [],
  filterErrors: [],
  filterPresetLoaded: false,
  orderbookHeaders: [],
  selectedSno: "All",
  orderbookView: "trade",
  overall: null,
  activeIndex: 0,
};

const els = {
  orderbookDashboardTab: document.getElementById("orderbookDashboardTab"),
  filterOrderbookTab: document.getElementById("filterOrderbookTab"),
  uploadPanel: document.getElementById("uploadPanel"),
  snoSelect: document.getElementById("snoSelect"),
  prevSno: document.getElementById("prevSno"),
  nextSno: document.getElementById("nextSno"),
  filterDashboard: document.getElementById("filterDashboard"),
  filterRules: document.getElementById("filterRules"),
  filterStatus: document.getElementById("filterStatus"),
  filterError: document.getElementById("filterError"),
  yearDistributionRows: document.getElementById("yearDistributionRows"),
  addFilterRule: document.getElementById("addFilterRule"),
  resetFilterRules: document.getElementById("resetFilterRules"),
  downloadFilteredOrderbook: document.getElementById("downloadFilteredOrderbook"),
  downloadFormulaOrderbook: document.getElementById("downloadFormulaOrderbook"),
  includeActiveTradesFormula: document.getElementById("includeActiveTradesFormula"),
  generatedAt: document.getElementById("generatedAt"),
  orderBookInput: document.getElementById("orderBookInput"),
  overallInput: document.getElementById("overallInput"),
  stats: document.getElementById("stats"),
  insights: document.getElementById("insights"),
  chartSubtitle: document.getElementById("chartSubtitle"),
  instrumentFilter: document.getElementById("instrumentFilter"),
  candlePeriodSelect: document.getElementById("candlePeriodSelect"),
  indicatorPeriodSelect: document.getElementById("indicatorPeriodSelect"),
  indicatorSelect: document.getElementById("indicatorSelect"),
  addIndicator: document.getElementById("addIndicator"),
  indicatorChips: document.getElementById("indicatorChips"),
  searchInput: document.getElementById("searchInput"),
  prevTrade: document.getElementById("prevTrade"),
  nextTrade: document.getElementById("nextTrade"),
  chartWindowLabel: document.getElementById("chartWindowLabel"),
  contractChart: document.getElementById("contractChart"),
  expandChart: document.getElementById("expandChart"),
  candleCrosshair: document.getElementById("candleCrosshair"),
  candleTooltip: document.getElementById("candleTooltip"),
  indicatorModal: document.getElementById("indicatorModal"),
  indicatorModalTitle: document.getElementById("indicatorModalTitle"),
  indicatorSettingsBody: document.getElementById("indicatorSettingsBody"),
  closeIndicatorSettings: document.getElementById("closeIndicatorSettings"),
  cancelIndicatorSettings: document.getElementById("cancelIndicatorSettings"),
  saveIndicatorSettings: document.getElementById("saveIndicatorSettings"),
  tradeCount: document.getElementById("tradeCount"),
  selected: document.getElementById("selected"),
  tradeWiseOrderbook: document.getElementById("tradeWiseOrderbook"),
  stocksWiseOrderbook: document.getElementById("stocksWiseOrderbook"),
  stockOrderbookTools: document.getElementById("stockOrderbookTools"),
  stockSearchInput: document.getElementById("stockSearchInput"),
  orderbookHead: document.getElementById("orderbookHead"),
  tradeRows: document.getElementById("tradeRows"),
  canvas: document.getElementById("chart"),
};

const ctx = els.canvas.getContext("2d");
const baseFilterFields = [
  { key: "instrument", label: "Instrument", type: "text" },
  { key: "type", label: "Type", type: "text" },
  { key: "entryTime", label: "Entry Time", type: "time" },
  { key: "entryYear", label: "Entry Year", type: "number" },
  { key: "exitTime", label: "Exit Time", type: "time" },
  { key: "exitYear", label: "Exit Year", type: "number" },
  { key: "holdingDays", label: "Holding Days", type: "number" },
  { key: "profit", label: "Profit", type: "number" },
  { key: "profitPercent", label: "Profit Cost %", type: "number" },
  { key: "maxProfitPercent", label: "Trade Max Profit %", type: "number" },
  { key: "rankSinceLow", label: "rank since low", type: "number" },
  { key: "returnSinceNiftyLow", label: "return since nifty low", type: "number" },
  { key: "relativeStrength", label: "relative strength", type: "number" },
  { key: "tradingDaysSinceNiftyLow", label: "trading days since nifty low", type: "number" },
  { key: "dayAtrPercent", label: "DayATR%", type: "number" },
  { key: "dayAtrPercentile", label: "DayATR%ile", type: "number" },
  { key: "entryPrice", label: "Entry Price", type: "number" },
  { key: "exitPrice", label: "Exit Price", type: "number" },
  { key: "exitReason", label: "Exit Reason", type: "text" },
];
let filterFields = baseFilterFields.slice();
let filterFieldMap = new Map(filterFields.map((field) => [field.key, field]));
const sheet1PresetRules = [
  { field: "rankSinceLow", operator: "between", value: "1", value2: "10" },
  { field: "returnSinceNiftyLow", operator: "between", value: "-1000", value2: "-25" },
  { field: "relativeStrength", operator: "between", value: "0", value2: "75" },
  { field: "tradingDaysSinceNiftyLow", operator: "between", value: "3", value2: "10" },
];
const MAX_TABLE_ROWS = 750;
const LARGE_FILE_WARNING_BYTES = 25 * 1024 * 1024;

els.generatedAt.textContent = "Generated " + new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
}).format(new Date());

function parseCsv(text) {
  const records = [];
  let headers = null;
  let row = [];
  let cell = "";
  let quoted = false;

  function pushRow(values) {
    if (!values.some((value) => value.trim() !== "")) return;
    if (!headers) {
      headers = values.map((header, index) => {
        const clean = header.trim();
        return index === 0 ? clean.replace(/^\uFEFF/, "") : clean;
      });
      return;
    }
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] || "").trim();
    });
    records.push(record);
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      pushRow(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  pushRow(row);
  return records;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value) {
  const text = String(value == null ? "" : value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function waitForPaint() {
  return new Promise((resolve) => scheduleFrame(() => resolve()));
}

function setChartStatus(message, isError = false) {
  if (!els.chartSubtitle) return;
  els.chartSubtitle.hidden = false;
  els.chartSubtitle.textContent = message;
  els.chartSubtitle.classList.toggle("negative", Boolean(isError));
}

function setUploadError(message) {
  state.filterErrors = [message];
  if (els.filterError) {
    els.filterError.textContent = message;
    els.filterError.classList.add("visible");
  }
  setChartStatus(message, true);
}

function clearUploadError() {
  if (els.filterError && !(state.filterErrors || []).length) {
    els.filterError.textContent = "";
    els.filterError.classList.remove("visible");
  }
  if (els.chartSubtitle) els.chartSubtitle.classList.remove("negative");
}

function toNumber(value) {
  const clean = String(value || "").replace(/,/g, "").trim();
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function parseDateTime(dateValue, timeValue) {
  const date = String(dateValue || "").trim();
  const time = String(timeValue || "00:00").trim();
  let year;
  let month;
  let day;

  if (/^\d{4}-\d{2}-\d{2}/.test(date)) {
    [year, month, day] = date.slice(0, 10).split("-").map(Number);
  } else {
    const parts = date.split(/[/-]/).map(Number);
    if (parts.length < 3) return null;
    [day, month, year] = parts;
    if (year < 100) year += 2000;
  }

  const [hour = 0, minute = 0, second = 0] = time.split(":").map(Number);
  const parsed = new Date(year, month - 1, day, hour || 0, minute || 0, second || 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeOrderBook(records) {
  return records.map((row, index) => {
    const entryDate = parseDateTime(row.EntryDate, row.EntryTime);
    const exitDate = parseDateTime(row.ExitDate, row.ExitTime);
    const entryPrice = toNumber(row.EntryPrice);
    const exitPrice = toNumber(row.ExitPrice);
    const profitField = getField(row, ["Profit", "TradeProfit", "LegProfit", "LegProfitWithCost"]);
    const profit = toNumber(profitField);
    const profitPercent = toNumber(getField(row, ["ProfitCost%", "Profit%Cost", "Profit Cost %", "LegProfitWithCost%", "TradeProfit%", "LegProfit%", "Profit%"]));
    const inferredProfit = exitPrice - entryPrice;
    const type = String(getField(row, ["Type", "TradeType(l/s)", "ActionType", "Structure"]) || "LONG").toUpperCase();
    const sno = String(getField(row, ["sno", "SNO", "SNo", "S.No", "SSU", "SsuId", "SSUID", "SsuID", "Ssu Id"]) || "1").trim() || "1";
    const holdingPeriod = toNumber(row.HoldingPeriod);
    const holdingMinutes = toNumber(row.HoldingPeriodMinutes);

    return {
      sno,
      id: row.TradeId || String(index + 1),
      instrument: row.Instrument || "Unknown",
      type,
      entryDate,
      exitDate,
      entryPrice,
      exitPrice,
      exitReason: row.ExitReason || "-",
      profit: profitField === "" || profitField == null ? inferredProfit : profit,
      profitPercent,
      maxProfitPercent: toNumber(getField(row, ["TradeMaxProfit%", "TradeMaxProfit"])),
      rank: row["rank since low"] || row.rank || "-",
      returnSinceNiftyLow: toNumber(row["return since nifty low"]),
      relativeStrength: toNumber(getField(row, ["relative strength", "relative strength Entry", "RelativeStrength", "RelativeStrengthEntry", "EntryRelativeStrength", "Entry RS", "EntryRS"])),
      tradingDaysSinceNiftyLow: toNumber(row["trading days since nifty low"]),
      dayAtrPercent: toNumber(row["DayATR%"]),
      dayAtrPercentile: toNumber(row["DayATR%ile"]),
      holdingDays: holdingPeriod || (holdingMinutes ? holdingMinutes / 1440 : (entryDate && exitDate ? (exitDate - entryDate) / 86400000 : 0)),
      entryYear: toNumber(getField(row, ["EntryYear", "Entry Year"])) || (entryDate ? entryDate.getFullYear() : 0),
      exitYear: toNumber(getField(row, ["ExitYear", "Exit Year"])) || (exitDate ? exitDate.getFullYear() : 0),
      stockDayOpen: toNumber(row.stockDayOpen),
      stockDayLow: toNumber(row.stockDayLow),
      niftyEntry: toNumber(getField(row, ["niftyEntryTick", "NiftyEntryTick", "NiftyEntry", "EntryNifty", "Nifty Entry"])),
      niftyExit: toNumber(getField(row, ["currentNiftyTickClose", "niftyExitTick", "NiftyExitTick", "NiftyExit", "ExitNifty", "Nifty Exit"])),
      raw: row,
    };
  }).filter((trade) => trade.entryDate && trade.exitDate && trade.entryPrice && trade.exitPrice);
}

function normalizeCandleData(records, fallbackTimeframe = state.candlePeriod) {
  return records.map((row) => {
    const dateTimeValue = getField(row, ["datetime", "date_time", "date time", "timestamp", "candle_time", "starttime", "start_time"]);
    const dateValue = getField(row, ["date", "tradingdate", "trade_date"]);
    const timeValue = getField(row, ["time", "candletime", "candle_time"]);
    const time = parseCandleDateTime(dateTimeValue, dateValue, timeValue);
    const open = toNumber(getField(row, ["open", "o"]));
    const high = toNumber(getField(row, ["high", "h"]));
    const low = toNumber(getField(row, ["low", "l"]));
    const close = toNumber(getField(row, ["close", "c", "last"]));

    return {
      instrument: String(getField(row, ["instrument", "symbol", "ticker", "tradingsymbol", "scrip", "name"]) || "").trim(),
      time,
      open,
      high,
      low,
      close,
      volume: toNumber(getField(row, ["volume", "vol", "v"])),
      timeframe: toNumber(getField(row, ["timeframe", "period", "interval", "resolution", "candleperiod"])) || Number(fallbackTimeframe) || 5,
    };
  }).filter((candle) => (
    candle.time &&
    Number.isFinite(candle.open) &&
    Number.isFinite(candle.high) &&
    Number.isFinite(candle.low) &&
    Number.isFinite(candle.close) &&
    candle.open > 0 &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.close > 0
  )).sort((a, b) => a.time - b.time);
}

function parseCandlePayload(text, fallbackTimeframe = state.candlePeriod) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (trimmed[0] === "{" || trimmed[0] === "[") {
    try {
      return normalizeCandleData(recordsFromCandleJson(JSON.parse(trimmed)), fallbackTimeframe);
    } catch (error) {
      console.warn("Could not parse candle JSON, trying CSV instead.", error);
    }
  }

  return normalizeCandleData(parseCsv(text), fallbackTimeframe);
}

function recordsFromCandleJson(payload) {
  const root = payload && payload.data ? payload.data : payload;
  const candles = root && Array.isArray(root.candles) ? root.candles : root;

  if (Array.isArray(candles)) {
    return candles.map((item) => {
      if (Array.isArray(item)) {
        return {
          DateTime: item[0],
          Open: item[1],
          High: item[2],
          Low: item[3],
          Close: item[4],
          Volume: item[5],
        };
      }
      return item || {};
    });
  }

  if (root && Array.isArray(root.open) && Array.isArray(root.high) && Array.isArray(root.low) && Array.isArray(root.close)) {
    const times = root.timestamp || root.time || root.datetime || root.date || [];
    const volume = root.volume || [];
    return root.open.map((open, index) => ({
      DateTime: times[index],
      Open: open,
      High: root.high[index],
      Low: root.low[index],
      Close: root.close[index],
      Volume: volume[index],
    }));
  }

  return [];
}

function getField(row, aliases) {
  const fields = Object.keys(row || {});
  const normalized = new Map(fields.map((key) => [normalizeKey(key), row[key]]));
  for (const alias of aliases) {
    const value = normalized.get(normalizeKey(alias));
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function updateDynamicFilterFields(headers, records = []) {
  state.orderbookHeaders = headers.slice();
  const dynamicFields = headers
    .filter(Boolean)
    .map((header) => ({
      key: rawFilterKey(header),
      label: header,
      type: inferRawFilterType(header, records),
      rawHeader: header,
    }));

  filterFields = baseFilterFields.concat(dynamicFields);
  filterFieldMap = new Map(filterFields.map((field) => [field.key, field]));
}

function rawFilterKey(header) {
  return "raw:" + header;
}

function rawFilterHeader(field) {
  return String(field || "").startsWith("raw:") ? String(field).slice(4) : "";
}

function filterHeaderAliases(field) {
  return {
    instrument: ["Instrument"],
    type: ["Type"],
    entryTime: ["EntryTime"],
    entryYear: ["EntryYear", "Entry Year"],
    exitTime: ["ExitTime"],
    exitYear: ["ExitYear", "Exit Year"],
    holdingDays: ["HoldingPeriod", "Holding Period"],
    profit: ["Profit"],
    profitPercent: ["ProfitCost%", "Profit%Cost", "Profit Cost %", "Profit%"],
    maxProfitPercent: ["TradeMaxProfit", "TradeMaxProfit%"],
    rankSinceLow: ["rank since low"],
    returnSinceNiftyLow: ["return since nifty low"],
    relativeStrength: ["relative strength", "relative strength Entry", "RelativeStrength", "RelativeStrengthEntry", "EntryRelativeStrength", "Entry RS", "EntryRS"],
    tradingDaysSinceNiftyLow: ["trading days since nifty low"],
    dayAtrPercent: ["DayATR%"],
    dayAtrPercentile: ["DayATR%ile"],
    entryPrice: ["EntryPrice"],
    exitPrice: ["ExitPrice"],
    exitReason: ["ExitReason"],
  }[field] || [field];
}

function inferRawFilterType(header, records = []) {
  const key = normalizeKey(header);
  if (/time$|time/.test(key) && !/period/.test(key)) return "time";
  if (/date|color|instrument|symbol|reason|type/.test(key)) return "text";
  const sample = records.slice(0, 250).map((row) => row[header]).filter((value) => String(value || "").trim() !== "");
  if (!sample.length) return "text";
  const numericCount = sample.filter((value) => Number.isFinite(Number(String(value).replace(/,/g, "").trim()))).length;
  return numericCount / sample.length >= 0.8 ? "number" : "text";
}

function parseCandleDateTime(dateTimeValue, dateValue, timeValue) {
  const combined = String(dateTimeValue || "").trim();
  if (combined) {
    const numeric = Number(combined);
    if (Number.isFinite(numeric) && numeric > 0) {
      return new Date(numeric > 100000000000 ? numeric : numeric * 1000);
    }

    const parts = combined.split(/\s+/);
    if (parts.length >= 2) return parseDateTime(parts[0], parts[1]);

    const iso = new Date(combined);
    if (!Number.isNaN(iso.getTime())) return iso;
  }

  return parseDateTime(dateValue, timeValue);
}

function formatNumber(value, decimals = 2) {
  if (!Number.isFinite(value)) return "-";
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

function formatPlain(value, decimals = 2) {
  if (!Number.isFinite(value)) return "-";
  return Number(value.toFixed(decimals)).toString();
}

function formatDate(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDateOnly(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatTimeOnly(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatShortDate(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
}

function formatShortDateTime(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatCandlePeriod(value) {
  const minutes = Number(value) || 5;
  if (minutes === 375) return "1D";
  if (minutes === 1875) return "1W";
  if (minutes < 60) return minutes + "m";
  if (minutes % 60 === 0) return (minutes / 60) + "h";
  return minutes + "m";
}

function signedClass(value) {
  return value >= 0 ? "positive" : "negative";
}

function setStats() {
  const hasBasicFilters = els.instrumentFilter.value !== "All" || els.searchInput.value.trim();
  const hasAdvancedFilters = state.dashboardMode === "filter" && state.filterRules.some(isActiveFilterRule);
  const hasSnoFilter = state.selectedSno !== "All";
  const isFiltered = state.trades.length && (hasBasicFilters || hasAdvancedFilters || hasSnoFilter);
  const trades = state.trades.length ? state.filteredTrades : state.trades;
  if (state.dashboardMode === "filter") {
    setFilterStats(trades);
    return;
  }
  const overall = state.overall || {};
  const totalProfitPercent = trades.reduce((sum, trade) => sum + trade.profitPercent, 0);
  const totalTrades = getOverallOrCalculated(overall, ["TotalTrades", "Total Trades"], trades.length, isFiltered);
  const tradingDays = getOverallOrCalculated(overall, ["TradingDays", "Trading Days"], countTradingDays(trades), isFiltered);
  const tradeAverage = getOverallOrCalculated(overall, ["TradeAverage", "TradeAverageProfit", "Trade Average Profit", "Trade Average", "Avg. Pro.", "AvgProfit", "AverageProfit"], averageTradeProfitPercent(trades), isFiltered);
  const tradeAverageLoss = getOverallOrCalculated(overall, ["TradeAverageLoss", "Trade Average Loss", "Avg. Loss", "AvgLoss", "AverageLoss"], averageTradeLossPercent(trades), isFiltered);
  const tradeWinPer = getOverallOrCalculated(overall, ["TradeWinPer", "TradeWinPercent(Cost)", "Trade Win Percent Cost", "TradeWinPercentCost", "Win%"], winRatePercent(trades), isFiltered);
  const tradeExpecti = getOverallOrCalculated(overall, ["TradeExpecti", "TradeExpectancy(Cost)", "TradeExpectancyCost", "TradeExpectancy", "Trade Expectancy", "Exp"], expectancyRatio(trades), isFiltered);
  const profitCost = getOverallOrCalculated(overall, ["Profit%Cost", "ProfitCost%", "Profit Cost %", "Profit%"], totalProfitPercent, isFiltered);
  const holdingPeriod = getOverallOrCalculated(overall, ["HoldingPerio", "HoldingPeriodAvg", "HoldingPeriod", "Holding Period", "AvgHolding"], averageHoldingDays(trades), isFiltered);
  const calmar = getOverallOrCalculated(overall, ["Calmar", "CalmarRatio"], 0, isFiltered);
  const profitPerTrade = getOverallOrCalculated(overall, ["ProfitPerTrad", "ProfitPerTrade", "Profit Per Trade"], trades.length ? totalProfitPercent / trades.length : 0, isFiltered);

  const cards = [
    ["TradingDays", formatPlain(tradingDays, 0), ""],
    ["TotalTrades", formatNumber(totalTrades, 0), ""],
    ["TradeAverage", formatPlain(tradeAverage, 6), signedClass(tradeAverage)],
    ["TradeAverage", formatPlain(tradeAverageLoss, 6), signedClass(tradeAverageLoss)],
    ["TradeWinPer", formatPlain(tradeWinPer, 5), ""],
    ["TradeExpecti", formatPlain(tradeExpecti, 6), tradeExpecti >= 1 ? "positive" : "negative"],
    ["Profit%Cost", formatPlain(profitCost, 5), signedClass(profitCost)],
    ["HoldingPerio", formatPlain(holdingPeriod, 6), ""],
    ["Calmar", formatPlain(calmar, 6), signedClass(calmar)],
    ["ProfitPerTrad", formatPlain(profitPerTrade, 6), signedClass(profitPerTrade)],
  ];

  els.stats.innerHTML = cards.map(([label, value, className]) => (
    '<div class="stat"><div class="label">' + escapeHtml(label) + '</div><div class="value ' + className + '">' + escapeHtml(value) + '</div></div>'
  )).join("");
}

function getOverallOrCalculated(overall, aliases, calculated, isFiltered) {
  const raw = getField(overall, aliases);
  if (!isFiltered && raw !== "") return toNumber(raw);
  return calculated;
}

function countTradingDays(trades) {
  const days = new Set(trades.map((trade) => formatDateOnly(trade.exitDate)).filter(Boolean));
  return days.size;
}

function winRatePercent(trades) {
  return trades.length ? (trades.filter((trade) => trade.profitPercent >= 0).length / trades.length) * 100 : 0;
}

function averageTradeProfitPercent(trades) {
  const winners = trades.filter((trade) => trade.profitPercent >= 0);
  return winners.length ? winners.reduce((sum, trade) => sum + trade.profitPercent, 0) / winners.length : 0;
}

function averageTradeLossPercent(trades) {
  const losers = trades.filter((trade) => trade.profitPercent < 0);
  return losers.length ? losers.reduce((sum, trade) => sum + trade.profitPercent, 0) / losers.length : 0;
}

function expectancyRatio(trades) {
  const winProbability = winRatePercent(trades) / 100;
  const avgProfit = averageTradeProfitPercent(trades);
  const avgLoss = averageTradeLossPercent(trades);
  const lossProbability = 1 - winProbability;
  return lossProbability && avgLoss ? (winProbability * avgProfit) / (lossProbability * Math.abs(avgLoss)) : 0;
}

function averageHoldingDays(trades) {
  return trades.length ? trades.reduce((sum, trade) => sum + (Number.isFinite(trade.holdingDays) ? trade.holdingDays : 0), 0) / trades.length : 0;
}

function setFilterStats(trades) {
  const totalProfitPercent = trades.reduce((sum, trade) => sum + trade.profitPercent, 0);
  const winRate = winRatePercent(trades);
  const perTrade = trades.length ? totalProfitPercent / trades.length : 0;
  const avgProfit = averageTradeProfitPercent(trades);
  const avgLoss = averageTradeLossPercent(trades);
  const expectancy = expectancyRatio(trades);
  const avgHolding = averageHoldingDays(trades);
  const cards = [
    ["Trades", formatNumber(trades.length, 0), ""],
    ["Profit", formatPlain(totalProfitPercent, 2) + "%", signedClass(totalProfitPercent)],
    ["Per Trade", formatPlain(perTrade, 2) + "%", signedClass(perTrade)],
    ["Win %", formatPlain(winRate, 1) + "%", ""],
    ["Avg. Pro.", formatPlain(avgProfit, 2) + "%", signedClass(avgProfit)],
    ["Avg. Loss", formatPlain(avgLoss, 2) + "%", signedClass(avgLoss)],
    ["Exp", formatPlain(expectancy, 2), expectancy >= 1 ? "positive" : "negative"],
    ["AvgHolding", formatPlain(avgHolding, 2) + " days", ""],
  ];

  els.stats.innerHTML = cards.map(([label, value, className]) => (
    '<div class="stat"><div class="label">' + escapeHtml(label) + '</div><div class="value ' + className + '">' + escapeHtml(value) + '</div></div>'
  )).join("");
}

function populateInstrumentFilter() {
  const current = els.instrumentFilter.value || "All";
  const instruments = Array.from(new Set(activeSnoTrades().map((trade) => trade.instrument))).sort();
  els.instrumentFilter.innerHTML = '<option value="All">All Instruments</option>' + instruments.map((instrument) => (
    '<option value="' + escapeHtml(instrument) + '">' + escapeHtml(instrument) + '</option>'
  )).join("");
  els.instrumentFilter.value = instruments.includes(current) ? current : "All";
  els.instrumentFilter.disabled = !state.trades.length;
  els.candlePeriodSelect.disabled = !state.trades.length;
  els.indicatorPeriodSelect.disabled = !state.trades.length;
  els.indicatorSelect.disabled = !state.trades.length;
  updateIndicatorControls();
  els.searchInput.disabled = !state.trades.length;
}

function activeSnoTrades() {
  if (state.selectedSno === "All") return state.trades;
  return state.trades.filter((trade) => trade.sno === state.selectedSno);
}

function uniqueSnos() {
  return Array.from(new Set(state.trades.map((trade) => trade.sno || "1"))).sort((a, b) => {
    const left = Number(a);
    const right = Number(b);
    if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
    return String(a).localeCompare(String(b));
  });
}

function snoOptions() {
  const snos = uniqueSnos();
  return snos.length ? ["All"].concat(snos) : [];
}

function populateSnoSelect() {
  const options = snoOptions();
  if (!els.snoSelect) return;
  if (!options.length) {
    state.selectedSno = "All";
    els.snoSelect.innerHTML = '<option value="All">Upload OrderBook first</option>';
    els.snoSelect.disabled = true;
    updateSnoNavigation();
    return;
  }

  if (!options.includes(state.selectedSno)) {
    state.selectedSno = "All";
  }

  els.snoSelect.innerHTML = options.map((sno) => (
    '<option value="' + escapeHtml(sno) + '">' + escapeHtml(sno === "All" ? "All SNO" : "SNO " + sno) + '</option>'
  )).join("");
  els.snoSelect.value = state.selectedSno;
  els.snoSelect.disabled = false;
  updateSnoNavigation();
}

function updateSnoNavigation() {
  const options = snoOptions();
  const index = options.indexOf(state.selectedSno);
  const disabled = !options.length;
  if (els.prevSno) els.prevSno.disabled = disabled || index <= 0;
  if (els.nextSno) els.nextSno.disabled = disabled || index < 0 || index >= options.length - 1;
}

function setSelectedSno(sno) {
  const options = snoOptions();
  state.selectedSno = options.includes(sno) ? sno : "All";
  if (els.snoSelect) els.snoSelect.value = state.selectedSno;
  els.instrumentFilter.value = "All";
  els.searchInput.value = "";
  state.orderbookView = "trade";
  state.chartWindowStartByTrade.clear();
  updateSnoNavigation();
  populateInstrumentFilter();
  applyFilters();
}

function moveSelectedSno(direction) {
  const options = snoOptions();
  if (!options.length) return;
  const currentIndex = Math.max(0, options.indexOf(state.selectedSno));
  const nextIndex = clamp(currentIndex + direction, 0, options.length - 1);
  if (nextIndex === currentIndex) return;
  setSelectedSno(options[nextIndex]);
}

function updateIndicatorControls() {
  const maxReached = state.activeIndicators.length >= 3;
  const selected = els.indicatorSelect.value;
  els.addIndicator.disabled = !state.trades.length || maxReached || state.activeIndicators.includes(selected);
  els.indicatorChips.innerHTML = state.activeIndicators.map((id) => (
    '<span class="indicator-chip">' + escapeHtml(indicatorChipLabel(id)) +
    '<button type="button" class="indicator-settings" data-settings="' + escapeHtml(id) + '" title="Settings for ' + escapeHtml(indicatorLabel(id)) + '">set</button>' +
    '<button type="button" data-remove="' + escapeHtml(id) + '" title="Remove ' + escapeHtml(indicatorLabel(id)) + '">x</button></span>'
  )).join("");
  Array.from(els.indicatorChips.querySelectorAll("button[data-remove]")).forEach((button) => {
    button.addEventListener("click", () => {
      state.activeIndicators = state.activeIndicators.filter((id) => id !== button.dataset.remove);
      updateIndicatorControls();
      showTrade(state.activeIndex);
    });
  });
  Array.from(els.indicatorChips.querySelectorAll("button[data-settings]")).forEach((button) => {
    button.addEventListener("click", () => openIndicatorSettings(button.dataset.settings));
  });
}

function indicatorLabel(id) {
  return {
    bb: "BollingerBand",
    sma: "SMA",
    macd: "MACD",
    rsi: "RSI",
    ema: "EMA",
    adx: "ADX",
    supertrend: "Supertrend",
    rs: "RelativeStrength",
  }[id] || id;
}

function indicatorChipLabel(id) {
  const settings = getIndicatorSettings(id);
  if (id === "bb") return "BB " + settings.length + " " + settings.mult;
  if (id === "macd") return "MACD " + settings.fast + " " + settings.slow + " " + settings.signal;
  if (id === "supertrend") return "Supertrend " + settings.atrLength + " " + settings.mult;
  if (id === "rs") return "RS " + settings.benchmark + " " + settings.lookback + " " + settings.anchorMode;
  if (id === "adx" || id === "rsi" || id === "sma" || id === "ema") return indicatorLabel(id) + " " + settings.length;
  return indicatorLabel(id);
}

function defaultIndicatorSettings(id) {
  return {
    bb: { length: 20, mult: 2, upperColor: "#1e90ff", middleColor: "#ff8a00", lowerColor: "#1e90ff", fillColor: "#1e90ff" },
    sma: { length: 20, color: "#ff8a00" },
    ema: { length: 20, color: "#2f9e44" },
    rsi: { length: 14, color: "#7c3aed" },
    macd: { fast: 12, slow: 26, signal: 9, macdColor: "#246bfe", signalColor: "#ff8a00", positiveColor: "#12805c", negativeColor: "#c7362f" },
    adx: { length: 14, adxColor: "#17202a", plusColor: "#12805c", minusColor: "#c7362f" },
    supertrend: { atrLength: 10, mult: 3, upColor: "#12805c", downColor: "#c7362f" },
    rs: { benchmark: "NIFTY50", lookback: 25, anchorMode: "low", color: "#0f766e" },
  }[id] || {};
}

function getIndicatorSettings(id) {
  if (!state.indicatorSettings[id]) state.indicatorSettings[id] = { ...defaultIndicatorSettings(id) };
  return state.indicatorSettings[id];
}

function openIndicatorSettings(id) {
  state.editingIndicator = id;
  const settings = getIndicatorSettings(id);
  els.indicatorModalTitle.textContent = indicatorLabel(id) + " Settings";
  els.indicatorSettingsBody.innerHTML = indicatorSettingFields(id).map((field) => {
    const value = settings[field.key];
    if (field.type === "select") {
      const options = (field.options || []).map((option) => {
        const selected = String(option.value) === String(value) ? " selected" : "";
        return '<option value="' + escapeHtml(option.value) + '"' + selected + '>' + escapeHtml(option.label) + '</option>';
      }).join("");
      return '<label><span class="label">' + escapeHtml(field.label) + '</span>' +
        '<select data-setting="' + escapeHtml(field.key) + '">' + options + '</select></label>';
    }
    return '<label><span class="label">' + escapeHtml(field.label) + '</span>' +
      '<input type="' + escapeHtml(field.type) + '" data-setting="' + escapeHtml(field.key) + '" value="' + escapeHtml(value) + '"' +
      (field.type === "number" ? ' min="' + escapeHtml(field.min || 1) + '" step="' + escapeHtml(field.step || 1) + '"' : "") +
      '></label>';
  }).join("");
  els.indicatorModal.hidden = false;
}

function closeIndicatorSettings() {
  state.editingIndicator = null;
  els.indicatorModal.hidden = true;
}

function saveIndicatorSettings() {
  const id = state.editingIndicator;
  if (!id) return;
  const settings = getIndicatorSettings(id);
  Array.from(els.indicatorSettingsBody.querySelectorAll("[data-setting]")).forEach((input) => {
    settings[input.dataset.setting] = input.type === "number" ? Number(input.value) : input.value;
  });
  normalizeIndicatorSettings(id, settings);
  closeIndicatorSettings();
  updateIndicatorControls();
  showTrade(state.activeIndex);
}

function indicatorSettingFields(id) {
  return {
    bb: [
      { key: "length", label: "Length", type: "number", min: 1 },
      { key: "mult", label: "Multiplier", type: "number", min: 0.1, step: 0.1 },
      { key: "upperColor", label: "Upper Color", type: "color" },
      { key: "middleColor", label: "Median Color", type: "color" },
      { key: "lowerColor", label: "Lower Color", type: "color" },
      { key: "fillColor", label: "Background Color", type: "color" },
    ],
    sma: [
      { key: "length", label: "Length", type: "number", min: 1 },
      { key: "color", label: "Line Color", type: "color" },
    ],
    ema: [
      { key: "length", label: "Length", type: "number", min: 1 },
      { key: "color", label: "Line Color", type: "color" },
    ],
    rsi: [
      { key: "length", label: "Length", type: "number", min: 1 },
      { key: "color", label: "Line Color", type: "color" },
    ],
    macd: [
      { key: "fast", label: "Fast Length", type: "number", min: 1 },
      { key: "slow", label: "Slow Length", type: "number", min: 1 },
      { key: "signal", label: "Signal Length", type: "number", min: 1 },
      { key: "macdColor", label: "MACD Color", type: "color" },
      { key: "signalColor", label: "Signal Color", type: "color" },
      { key: "positiveColor", label: "Histogram +", type: "color" },
      { key: "negativeColor", label: "Histogram -", type: "color" },
    ],
    adx: [
      { key: "length", label: "Length", type: "number", min: 1 },
      { key: "adxColor", label: "ADX Color", type: "color" },
      { key: "plusColor", label: "+DI Color", type: "color" },
      { key: "minusColor", label: "-DI Color", type: "color" },
    ],
    supertrend: [
      { key: "atrLength", label: "ATR Length", type: "number", min: 1 },
      { key: "mult", label: "Multiplier", type: "number", min: 0.1, step: 0.1 },
      { key: "upColor", label: "Up Trend Color", type: "color" },
      { key: "downColor", label: "Down Trend Color", type: "color" },
    ],
    rs: [
      { key: "benchmark", label: "Benchmark Symbol", type: "text" },
      { key: "lookback", label: "Lookback Candles", type: "number", min: 1 },
      {
        key: "anchorMode",
        label: "Anchor Mode",
        type: "select",
        options: [
          { value: "low", label: "Low Close" },
          { value: "high", label: "High Close" },
          { value: "both", label: "Farthest Low/High" },
          { value: "fixed", label: "Fixed First Candle" },
        ],
      },
      { key: "color", label: "Line Color", type: "color" },
    ],
  }[id] || [];
}

function normalizeIndicatorSettings(id, settings) {
  Object.keys(settings).forEach((key) => {
    if (typeof settings[key] === "number") settings[key] = Math.max(key === "mult" ? 0.1 : 1, settings[key] || 1);
  });
  if (id === "macd" && settings.fast >= settings.slow) settings.slow = settings.fast + 1;
  if (id === "rs") {
    settings.benchmark = String(settings.benchmark || "NIFTY50").trim().toUpperCase() || "NIFTY50";
    settings.lookback = Math.max(1, Math.round(Number(settings.lookback) || 25));
    if (!["low", "high", "both", "fixed"].includes(settings.anchorMode)) settings.anchorMode = "low";
  }
}

function invalidateCandleCaches() {
  state.candleCacheVersion += 1;
  state.candleSeriesCache.clear();
}

function invalidateTradeCaches() {
  state.tradeCacheVersion += 1;
  state.instrumentTradeCache.clear();
}

function switchDashboardMode(mode) {
  state.dashboardMode = mode === "filter" ? "filter" : "orderbook";
  const isFilter = state.dashboardMode === "filter";
  els.orderbookDashboardTab.classList.toggle("active", !isFilter);
  els.filterOrderbookTab.classList.toggle("active", isFilter);
  els.uploadPanel.hidden = isFilter;
  els.filterDashboard.hidden = !isFilter;

  if (isFilter && !state.filterPresetLoaded && !state.filterRules.length) {
    state.filterRules = sheet1PresetRules.map((rule) => ({ ...rule }));
    state.filterPresetLoaded = true;
  }

  renderFilterRules();
  applyFilters();
}

function renderFilterRules() {
  if (!els.filterRules) return;
  if (!state.filterRules.length) {
    els.filterRules.innerHTML = '<div class="empty">No advanced filters added. Use Add Filter to start from any OrderBook field.</div>';
    return;
  }

  els.filterRules.innerHTML = state.filterRules.map((rule, index) => {
    const field = filterFieldMap.get(rule.field) || filterFields[0];
    const isBetween = rule.operator === "between";
    return '<div class="filter-rule" data-index="' + index + '">' +
      '<label><span class="label">Field</span><select data-filter-part="field">' + filterFieldOptions(rule.field) + '</select></label>' +
      '<label><span class="label">Condition</span><select data-filter-part="operator">' + filterOperatorOptions(field.type, rule.operator) + '</select></label>' +
      '<label><span class="label">Value</span><input data-filter-part="value" type="' + escapeHtml(filterInputType(field.type)) + '" value="' + escapeHtml(rule.value || "") + '"></label>' +
      '<label class="filter-value-secondary" ' + (isBetween ? "" : "hidden") + '><span class="label">To</span><input data-filter-part="value2" type="' + escapeHtml(filterInputType(field.type)) + '" value="' + escapeHtml(rule.value2 || "") + '"></label>' +
      '<button type="button" class="filter-rule-remove" data-remove-filter="' + index + '" title="Remove filter">x</button>' +
    '</div>';
  }).join("");
  updateFilterStatus();
}

function filterFieldOptions(selected) {
  return filterFields.map((field) => (
    '<option value="' + escapeHtml(field.key) + '"' + (field.key === selected ? " selected" : "") + '>' + escapeHtml(field.label) + '</option>'
  )).join("");
}

function filterOperatorOptions(type, selected) {
  const options = type === "text"
    ? [["contains", "Contains"], ["=", "Equals"], ["!=", "Not Equals"]]
    : [["between", "Between"], [">=", ">="], ["<=", "<="], ["=", "Equals"], ["!=", "Not Equals"]];
  const safeSelected = options.some(([value]) => value === selected) ? selected : options[0][0];
  return options.map(([value, label]) => (
    '<option value="' + escapeHtml(value) + '"' + (value === safeSelected ? " selected" : "") + '>' + escapeHtml(label) + '</option>'
  )).join("");
}

function filterInputType(type) {
  if (type === "number") return "number";
  if (type === "time") return "time";
  return "text";
}

function addFilterRule(rule = {}) {
  const field = rule.field || "profitPercent";
  const fieldDef = filterFieldMap.get(field) || filterFields[0];
  state.filterRules.push({
    field,
    operator: rule.operator || (fieldDef.type === "text" ? "contains" : "between"),
    value: rule.value || "",
    value2: rule.value2 || "",
  });
  renderFilterRules();
}

function syncFilterRulesFromDom() {
  const rows = Array.from(els.filterRules.querySelectorAll(".filter-rule"));
  state.filterRules = rows.map((row) => {
    const field = row.querySelector('[data-filter-part="field"]').value;
    const fieldDef = filterFieldMap.get(field) || filterFields[0];
    let operator = row.querySelector('[data-filter-part="operator"]').value;
    const validOperators = fieldDef.type === "text" ? ["contains", "=", "!="] : ["between", ">=", "<=", "=", "!="];
    if (!validOperators.includes(operator)) operator = validOperators[0];
    return {
      field,
      operator,
      value: row.querySelector('[data-filter-part="value"]').value,
      value2: row.querySelector('[data-filter-part="value2"]') ? row.querySelector('[data-filter-part="value2"]').value : "",
    };
  });
}

function isActiveFilterRule(rule) {
  if (!rule || !filterFieldMap.has(rule.field)) return false;
  if (rule.value === "" || rule.value == null) return false;
  return rule.operator !== "between" || !(rule.value2 === "" || rule.value2 == null);
}

function matchesFilterRules(trade) {
  const activeRules = state.filterRules.filter(isActiveFilterRule);
  if (!activeRules.length) return true;
  return activeRules.every((rule) => matchesFilterRule(trade, rule));
}

function validateFilterRules() {
  if (state.dashboardMode !== "filter") return [];
  return state.filterRules
    .filter(isActiveFilterRule)
    .map(validateFilterRule)
    .filter(Boolean);
}

function validateFilterRule(rule) {
  const field = filterFieldMap.get(rule.field);
  if (!field || field.type === "text" || rule.operator !== "between") return "";
  const first = field.type === "time" ? parseTimeFilterValue(rule.value) : toNumber(rule.value);
  const second = field.type === "time" ? parseTimeFilterValue(rule.value2) : toNumber(rule.value2);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return "Invalid filter: " + field.label + " needs valid min and max values.";
  }
  if (first > second) {
    return "Invalid filter: " + field.label + " min (" + rule.value + ") is greater than max (" + rule.value2 + ").";
  }
  return "";
}

function matchesFilterRule(trade, rule) {
  const field = filterFieldMap.get(rule.field);
  if (!field) return true;
  const actual = tradeFilterValue(trade, rule.field);

  if (field.type === "text") {
    const left = String(actual == null ? "" : actual).toLowerCase();
    const right = String(rule.value || "").toLowerCase();
    if (rule.operator === "=") return left === right;
    if (rule.operator === "!=") return left !== right;
    return left.includes(right);
  }

  const actualNumber = field.type === "time" ? Number(actual) : toNumber(actual);
  const first = field.type === "time" ? parseTimeFilterValue(rule.value) : toNumber(rule.value);
  const second = field.type === "time" ? parseTimeFilterValue(rule.value2) : toNumber(rule.value2);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(first)) return false;

  if (rule.operator === "between") {
    if (!Number.isFinite(second)) return false;
    return first <= second && actualNumber >= first && actualNumber <= second;
  }
  if (rule.operator === ">=") return actualNumber >= first;
  if (rule.operator === "<=") return actualNumber <= first;
  if (rule.operator === "!=") return actualNumber !== first;
  return actualNumber === first;
}

function tradeFilterValue(trade, field) {
  const rawHeader = rawFilterHeader(field);
  if (rawHeader) return trade.raw ? trade.raw[rawHeader] : "";
  if (field === "instrument") return trade.instrument;
  if (field === "type") return trade.type;
  if (field === "entryTime") return minutesOfDay(trade.entryDate);
  if (field === "entryYear") return trade.entryYear;
  if (field === "exitTime") return minutesOfDay(trade.exitDate);
  if (field === "exitYear") return trade.exitYear;
  if (field === "holdingDays") return trade.holdingDays;
  if (field === "profit") return trade.profit;
  if (field === "profitPercent") return trade.profitPercent;
  if (field === "maxProfitPercent") return trade.maxProfitPercent;
  if (field === "rankSinceLow") return toNumber(trade.rank);
  if (field === "returnSinceNiftyLow") return trade.returnSinceNiftyLow;
  if (field === "relativeStrength") return trade.relativeStrength;
  if (field === "tradingDaysSinceNiftyLow") return trade.tradingDaysSinceNiftyLow;
  if (field === "dayAtrPercent") return trade.dayAtrPercent;
  if (field === "dayAtrPercentile") return trade.dayAtrPercentile;
  if (field === "entryPrice") return trade.entryPrice;
  if (field === "exitPrice") return trade.exitPrice;
  if (field === "exitReason") return trade.exitReason;
  return getField(trade.raw || {}, [field]);
}

function minutesOfDay(date) {
  return date ? date.getHours() * 60 + date.getMinutes() : NaN;
}

function parseTimeFilterValue(value) {
  const text = String(value || "").trim();
  const parts = text.split(":").map(Number);
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return NaN;
  return parts[0] * 60 + parts[1];
}

function updateFilterStatus() {
  if (!els.filterStatus) return;
  const errors = state.filterErrors || [];
  const sourceCount = activeSnoTrades().length;
  if (els.filterError) {
    els.filterError.textContent = errors.join(" ");
    els.filterError.classList.toggle("visible", Boolean(errors.length));
  }
  if (!state.trades.length) {
    els.filterStatus.textContent = "Upload an OrderBook CSV first, then open Filter Orderbook.";
    if (els.downloadFilteredOrderbook) els.downloadFilteredOrderbook.disabled = true;
    if (els.downloadFormulaOrderbook) els.downloadFormulaOrderbook.disabled = true;
    return;
  }
  const activeRules = state.dashboardMode === "filter" ? state.filterRules.filter(isActiveFilterRule) : [];
  const summary = activeRules.length
    ? activeRules.map(formatFilterRule).join(" | ")
    : "No advanced filters active.";
  els.filterStatus.textContent = errors.length
    ? "0 of " + sourceCount + " trades after filters. Fix the filter error below."
    : state.filteredTrades.length + " of " + sourceCount + " trades after filters. " + summary;
  if (els.downloadFilteredOrderbook) els.downloadFilteredOrderbook.disabled = errors.length || !state.filteredTrades.length;
  if (els.downloadFormulaOrderbook) els.downloadFormulaOrderbook.disabled = errors.length || !state.trades.length;
}

function formatFilterRule(rule) {
  const field = filterFieldMap.get(rule.field);
  const name = field ? field.label : rule.field;
  if (rule.operator === "between") return name + " " + rule.value + " to " + rule.value2;
  return name + " " + rule.operator + " " + rule.value;
}

function downloadFilteredOrderbook() {
  if (!state.filteredTrades.length) return;
  const headers = filteredOrderbookHeaders();
  const rows = state.filteredTrades.map((trade) => {
    const raw = trade.raw || {};
    return headers.map((header) => {
      if (raw[header] !== undefined) return raw[header];
      return fallbackOrderbookValue(trade, header);
    });
  });
  const csv = toCsv([headers].concat(rows));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  link.href = url;
  link.download = "Filtered_OrderBook_" + stamp + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadFormulaOrderbook() {
  if (!state.trades.length) return;
  const headers = filteredOrderbookHeaders();
  const activeRules = state.filterRules.filter(isActiveFilterRule);
  const workbook = buildFormulaWorkbookXlsx(headers, activeRules, activeSnoTrades(), {
    includeActiveTrades: Boolean(els.includeActiveTradesFormula && els.includeActiveTradesFormula.checked),
  });
  const blob = new Blob([workbook], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  link.href = url;
  link.download = "OrderBook_With_Formulas_" + stamp + ".xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildFormulaWorkbookXlsx(headers, activeRules, sourceTrades = state.trades, options = {}) {
  const headersWithComputedYear = headers.concat(columnIndex(headers, ["EntryYear", "Entry Year"]) ? [] : ["EntryYear"]);
  const filterHeaders = activeRules.map((rule) => filterFieldHeader(rule.field, headersWithComputedYear));
  const orderSheet = buildOrderBookXlsxSheet(headers, activeRules, filterHeaders, sourceTrades, options);
  const sheet1 = buildSummaryXlsxSheet(headers, activeRules, filterHeaders, orderSheet.refs, options);
  return zipFiles([
    { name: "[Content_Types].xml", content: contentTypesXml() },
    { name: "_rels/.rels", content: rootRelsXml() },
    { name: "xl/workbook.xml", content: workbookXml() },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml() },
    { name: "xl/styles.xml", content: stylesXml() },
    { name: "xl/worksheets/sheet1.xml", content: orderSheet.xml },
    { name: "xl/worksheets/sheet2.xml", content: sheet1 },
  ]);
}

function buildOrderBookXlsxSheet(headers, activeRules, filterHeaders, sourceTrades = state.trades, options = {}) {
  const includeActiveTrades = Boolean(options.includeActiveTrades);
  const helperHeaders = filterHeaders.map((item) => item.header);
  const existingEntryYearCol = columnIndex(headers, ["EntryYear", "Entry Year"]);
  const addedYearHeaders = existingEntryYearCol ? [] : ["EntryYear"];
  const orderbookHeaders = includeActiveTrades
    ? headers.concat(addedYearHeaders, [""], helperHeaders, ["", "Filter Net", "", "Entry time", "Exit time", "Entries", "Exits", "Active Trade", "Include Active", "", "NET"])
    : headers.concat(addedYearHeaders, [""], helperHeaders, ["", "Filter Net", "", "NET"]);
  const separatorCol = headers.length + addedYearHeaders.length + 1;
  const helperStartCol = separatorCol + 1;
  const filterNetCol = helperStartCol + activeRules.length + 1;
  const activeStartCol = includeActiveTrades ? filterNetCol + 2 : 0;
  const activeRefs = includeActiveTrades
    ? {
        entryTimeCol: activeStartCol,
        exitTimeCol: activeStartCol + 1,
        entriesCol: activeStartCol + 2,
        exitsCol: activeStartCol + 3,
        activeTradeCol: activeStartCol + 4,
        includeActiveCol: activeStartCol + 5,
      }
    : null;
  const netCol = includeActiveTrades ? activeRefs.includeActiveCol + 2 : filterNetCol + 2;
  const profitCostCol = profitCostPercentColumnIndex(headers) || columnIndex(headers, ["Profit%"]) || columnIndex(headers, ["Profit"]) || 1;
  const entryYearCol = existingEntryYearCol || headers.length + 1;
  const holdingCol = columnIndex(headers, ["HoldingPeriod", "Holding Period"]) || 6;
  const instrumentCol = columnIndex(headers, ["Instrument", "Symbol"]) || 2;
  const snoCol = columnIndex(headers, ["SSU", "SNO", "SNo", "S.No", "SsuId", "SSUID", "SsuID", "Ssu Id"]) || 1;
  const entryDateCol = columnIndex(headers, ["EntryDate", "Entry Date"]) || 0;
  const entryTimeCol = columnIndex(headers, ["EntryTime", "Entry Time"]) || 0;
  const exitDateCol = columnIndex(headers, ["ExitDate", "Exit Date"]) || 0;
  const exitTimeCol = columnIndex(headers, ["ExitTime", "Exit Time"]) || 0;
  const activeTradeFilterRow = activeRules.length + 2;
  const lastRow = sourceTrades.length + 1;
  const rows = [];

  rows.push(xlsxRow(1, orderbookHeaders.map((header, index) => xlsxValueCell(1, index + 1, header))));

  sourceTrades.forEach((trade, index) => {
    const rowNumber = index + 2;
    const raw = trade.raw || {};
    const cells = headers.map((header, colIndex) => (
      xlsxValueCell(rowNumber, colIndex + 1, raw[header] !== undefined ? raw[header] : fallbackOrderbookValue(trade, header), header)
    ));
    if (!existingEntryYearCol) {
      cells.push(xlsxValueCell(rowNumber, headers.length + 1, trade.entryYear || (trade.entryDate ? trade.entryDate.getFullYear() : ""), "EntryYear"));
    }
    cells.push(xlsxValueCell(rowNumber, separatorCol, ""));
    activeRules.forEach((rule, ruleIndex) => {
      const source = filterHeaders[ruleIndex];
      cells.push(xlsxFormulaCell(rowNumber, helperStartCol + ruleIndex, xlsxFilterRuleFormula(rule, source.index, ruleIndex + 2, rowNumber), "0"));
    });
    cells.push(xlsxValueCell(rowNumber, helperStartCol + activeRules.length, ""));
    const netFormula = activeRules.length
      ? "PRODUCT(" + xlsxAddress(rowNumber, helperStartCol) + ":" + xlsxAddress(rowNumber, helperStartCol + activeRules.length - 1) + ")"
      : "1";
    cells.push(xlsxFormulaCell(rowNumber, filterNetCol, netFormula, "1"));
    cells.push(xlsxValueCell(rowNumber, filterNetCol + 1, ""));
    if (includeActiveTrades) {
      cells.push(xlsxFormulaCell(rowNumber, activeRefs.entryTimeCol, xlsxDateTimeFormula(rowNumber, filterNetCol, entryDateCol, entryTimeCol), ""));
      cells.push(xlsxFormulaCell(rowNumber, activeRefs.exitTimeCol, xlsxDateTimeFormula(rowNumber, filterNetCol, exitDateCol, exitTimeCol), ""));
      cells.push(xlsxFormulaCell(rowNumber, activeRefs.entriesCol, xlsxActiveCountFormula(rowNumber, instrumentCol, snoCol, activeRefs.entryTimeCol, activeRefs.entryTimeCol, lastRow), "0"));
      cells.push(xlsxFormulaCell(rowNumber, activeRefs.exitsCol, xlsxActiveCountFormula(rowNumber, instrumentCol, snoCol, activeRefs.exitTimeCol, activeRefs.entryTimeCol, lastRow), "0"));
      cells.push(xlsxFormulaCell(rowNumber, activeRefs.activeTradeCol, xlsxAddress(rowNumber, activeRefs.entriesCol) + "-" + xlsxAddress(rowNumber, activeRefs.exitsCol), "0"));
      cells.push(xlsxFormulaCell(rowNumber, activeRefs.includeActiveCol, "IF(AND(" + xlsxAddress(rowNumber, activeRefs.activeTradeCol) + ">=Sheet1!$C$" + activeTradeFilterRow + "," + xlsxAddress(rowNumber, activeRefs.activeTradeCol) + "<=Sheet1!$D$" + activeTradeFilterRow + "),1,0)", "0"));
      cells.push(xlsxValueCell(rowNumber, activeRefs.includeActiveCol + 1, ""));
      cells.push(xlsxFormulaCell(rowNumber, netCol, xlsxAddress(rowNumber, filterNetCol) + "*" + xlsxAddress(rowNumber, activeRefs.includeActiveCol), "1"));
    } else {
      cells.push(xlsxFormulaCell(rowNumber, netCol, xlsxAddress(rowNumber, filterNetCol), "1"));
    }
    rows.push(xlsxRow(rowNumber, cells));
  });

  return {
    refs: {
      lastRow,
      netCol,
      filterNetCol,
      profitCostCol,
      entryYearCol,
      holdingCol,
    },
    xml: xlsxWorksheetXml(rows.join("")),
  };
}

function xlsxDateTimeFormula(rowNumber, filterNetCol, dateCol, timeCol) {
  if (!dateCol || !timeCol) return 'IF(' + xlsxAddress(rowNumber, filterNetCol) + '=1,"","")';
  const dateCell = xlsxAddress(rowNumber, dateCol);
  const timeCell = xlsxAddress(rowNumber, timeCol);
  return "IF(" + xlsxAddress(rowNumber, filterNetCol) + "=1,DATEVALUE(" + dateCell + ")+TIMEVALUE(" + timeCell + "),\"\")";
}

function xlsxActiveCountFormula(rowNumber, instrumentCol, snoCol, dateTimeRangeCol, currentEntryTimeCol, lastRow) {
  return "COUNTIFS(" +
    xlsxRange(2, instrumentCol, lastRow, instrumentCol) + "," + xlsxAddress(rowNumber, instrumentCol) + "," +
    xlsxRange(2, snoCol, lastRow, snoCol) + "," + xlsxAddress(rowNumber, snoCol) + "," +
    xlsxRange(2, dateTimeRangeCol, lastRow, dateTimeRangeCol) + ",\"<=\"&" + xlsxAddress(rowNumber, currentEntryTimeCol) +
  ")";
}

function buildSummaryXlsxSheet(headers, activeRules, filterHeaders, refs, options = {}) {
  const includeActiveTrades = Boolean(options.includeActiveTrades);
  const rows = new Map();
  const setCell = (row, col, cell) => {
    if (!rows.has(row)) rows.set(row, new Map());
    rows.get(row).set(col, cell);
  };

  ["Header Index", "Header", "Min", "Max", "", "Year", "Trades", "Profit"].forEach((value, index) => {
    setCell(1, index + 1, xlsxValueCell(1, index + 1, value));
  });

  activeRules.forEach((rule, index) => {
    const rowNumber = index + 2;
    const field = filterFieldMap.get(rule.field);
    setCell(rowNumber, 1, xlsxValueCell(rowNumber, 1, filterHeaders[index].index));
    setCell(rowNumber, 2, xlsxValueCell(rowNumber, 2, field ? field.label : rule.field));
    setCell(rowNumber, 3, xlsxValueCell(rowNumber, 3, rule.value));
    setCell(rowNumber, 4, xlsxValueCell(rowNumber, 4, rule.operator === "between" ? rule.value2 : ""));
    setCell(rowNumber, 5, xlsxValueCell(rowNumber, 5, ""));
    setCell(rowNumber, 6, xlsxValueCell(rowNumber, 6, 2015 + index));
    setCell(rowNumber, 7, xlsxFormulaCell(rowNumber, 7, xlsxYearTradesFormula(rowNumber, refs), "0"));
    setCell(rowNumber, 8, xlsxFormulaCell(rowNumber, 8, xlsxYearProfitFormula(rowNumber, refs), "0"));
  });

  if (includeActiveTrades) {
    const activeTradeFilterRow = activeRules.length + 2;
    setCell(activeTradeFilterRow, 1, xlsxValueCell(activeTradeFilterRow, 1, ""));
    setCell(activeTradeFilterRow, 2, xlsxValueCell(activeTradeFilterRow, 2, "Active Trades"));
    setCell(activeTradeFilterRow, 3, xlsxValueCell(activeTradeFilterRow, 3, 3));
    setCell(activeTradeFilterRow, 4, xlsxValueCell(activeTradeFilterRow, 4, 1000));
  }

  for (let year = 2015 + activeRules.length; year <= 2026; year += 1) {
    const rowNumber = year - 2015 + 2;
    setCell(rowNumber, 6, xlsxValueCell(rowNumber, 6, year));
    setCell(rowNumber, 7, xlsxFormulaCell(rowNumber, 7, xlsxYearTradesFormula(rowNumber, refs), "0"));
    setCell(rowNumber, 8, xlsxFormulaCell(rowNumber, 8, xlsxYearProfitFormula(rowNumber, refs), "0"));
  }

  const metricsStartRow = Math.max(16, activeRules.length + 4);
  const metricRows = {
    trades: metricsStartRow,
    profit: metricsStartRow + 1,
    perTrade: metricsStartRow + 2,
    win: metricsStartRow + 3,
    avgProfit: metricsStartRow + 4,
    avgLoss: metricsStartRow + 5,
    expectancy: metricsStartRow + 6,
    avgHolding: metricsStartRow + 7,
  };
  const netRange = "'OrderBook'!" + xlsxRange(2, refs.netCol, refs.lastRow, refs.netCol);
  const profitCostRange = "'OrderBook'!" + xlsxRange(2, refs.profitCostCol, refs.lastRow, refs.profitCostCol);
  const holdingRange = "'OrderBook'!" + xlsxRange(2, refs.holdingCol, refs.lastRow, refs.holdingCol);
  const metrics = [
    ["Trades", "SUM(" + netRange + ")"],
    ["Profit", "SUMIF(" + netRange + ",1," + profitCostRange + ")"],
    ["Per Trade", "IFERROR(C" + metricRows.profit + "/C" + metricRows.trades + ",\"\")"],
    ["Win %", "IFERROR(COUNTIFS(" + netRange + ",1," + profitCostRange + ",\">0\")/C" + metricRows.trades + ",\"\")"],
    ["Avg. Pro.", "IFERROR(AVERAGEIFS(" + profitCostRange + "," + profitCostRange + ",\">0\"," + netRange + ",1),\"\")"],
    ["Avg. Loss", "IFERROR(AVERAGEIFS(" + profitCostRange + "," + profitCostRange + ",\"<0\"," + netRange + ",1),\"\")"],
    ["Exp", "IFERROR(C" + metricRows.win + "*C" + metricRows.avgProfit + "/((1-C" + metricRows.win + ")*C" + metricRows.avgLoss + "*-1),\"\")"],
    ["AvgHolding", "IFERROR(AVERAGEIFS(" + holdingRange + "," + netRange + ",1),\"\")"],
  ];

  metrics.forEach(([label, formula], index) => {
    const rowNumber = metricsStartRow + index;
    setCell(rowNumber, 2, xlsxValueCell(rowNumber, 2, label));
    setCell(rowNumber, 3, xlsxFormulaCell(rowNumber, 3, formula, "0"));
  });

  const rowXml = Array.from(rows.entries())
    .sort(([left], [right]) => left - right)
    .map(([rowNumber, cells]) => xlsxRow(rowNumber, Array.from(cells.entries()).sort(([left], [right]) => left - right).map(([, cell]) => cell)))
    .join("");
  return xlsxWorksheetXml(rowXml);
}

function xlsxFilterRuleFormula(rule, sourceCol, sheetRow, rowNumber) {
  const source = xlsxAddress(rowNumber, sourceCol);
  const minCell = "Sheet1!$C$" + sheetRow;
  const maxCell = "Sheet1!$D$" + sheetRow;
  const field = filterFieldMap.get(rule.field);
  if (field && field.type === "text") {
    if (rule.operator === "=") return "IF(" + source + "=" + minCell + ",1,0)";
    if (rule.operator === "!=") return "IF(" + source + "<>" + minCell + ",1,0)";
    return "IF(ISNUMBER(SEARCH(" + minCell + "," + source + ")),1,0)";
  }
  if (rule.operator === ">=") return "IF(" + source + ">=" + minCell + ",1,0)";
  if (rule.operator === "<=") return "IF(" + source + "<=" + minCell + ",1,0)";
  if (rule.operator === "=") return "IF(" + source + "=" + minCell + ",1,0)";
  if (rule.operator === "!=") return "IF(" + source + "<>" + minCell + ",1,0)";
  return "IF(AND(" + source + ">=" + minCell + "," + source + "<=" + maxCell + "),1,0)";
}

function xlsxYearTradesFormula(rowNumber, refs) {
  return "COUNTIFS(OrderBook!" + xlsxRange(2, refs.entryYearCol, refs.lastRow, refs.entryYearCol) + ",F" + rowNumber + ",OrderBook!" + xlsxRange(2, refs.netCol, refs.lastRow, refs.netCol) + ",1)";
}

function xlsxYearProfitFormula(rowNumber, refs) {
  return "SUMIFS(OrderBook!" + xlsxRange(2, refs.profitCostCol, refs.lastRow, refs.profitCostCol) + ",OrderBook!" + xlsxRange(2, refs.netCol, refs.lastRow, refs.netCol) + ",1,OrderBook!" + xlsxRange(2, refs.entryYearCol, refs.lastRow, refs.entryYearCol) + ",F" + rowNumber + ")";
}

function xlsxWorksheetXml(rowsXml) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetData>' + rowsXml + '</sheetData>' +
    '</worksheet>';
}

function xlsxRow(rowNumber, cells) {
  return '<row r="' + rowNumber + '">' + cells.join("") + '</row>';
}

function xlsxValueCell(rowNumber, colNumber, value, header = "") {
  const typed = excelTypedValue(value, header);
  const ref = xlsxAddress(rowNumber, colNumber);
  if (typed.type === "Number") return '<c r="' + ref + '"><v>' + escapeXml(typed.value) + '</v></c>';
  return '<c r="' + ref + '" t="inlineStr"><is><t>' + escapeXml(typed.value) + '</t></is></c>';
}

function xlsxFormulaCell(rowNumber, colNumber, formula, fallback = "0") {
  const ref = xlsxAddress(rowNumber, colNumber);
  const value = String(fallback) === "" ? "" : '<v>' + escapeXml(fallback) + '</v>';
  return '<c r="' + ref + '"><f>' + escapeXml(formula) + '</f>' + value + '</c>';
}

function xlsxRange(row1, col1, row2, col2) {
  return "$" + columnName(col1) + "$" + row1 + ":$" + columnName(col2) + "$" + row2;
}

function xlsxAddress(rowNumber, colNumber) {
  return columnName(colNumber) + rowNumber;
}

function columnName(index) {
  let name = "";
  let current = index;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function contentTypesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '</Types>';
}

function rootRelsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
}

function workbookXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    '<sheet name="OrderBook" sheetId="1" r:id="rId1"/>' +
    '<sheet name="Sheet1" sheetId="2" r:id="rId2"/>' +
    '</sheets><calcPr calcId="0" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>';
}

function workbookRelsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>';
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
    '</styleSheet>';
}

function zipFiles(files) {
  const encoder = new TextEncoder();
  const prepared = files.map((file) => {
    const nameBytes = encoder.encode(file.name);
    const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    return { ...file, nameBytes, data, crc: crc32(data) };
  });
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  prepared.forEach((file) => {
    const local = zipLocalHeader(file);
    localParts.push(local, file.nameBytes, file.data);
    centralParts.push(zipCentralHeader(file, offset), file.nameBytes);
    offset += local.length + file.nameBytes.length + file.data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = zipEndRecord(prepared.length, centralSize, offset);
  const totalSize = offset + centralSize + end.length;
  const output = new Uint8Array(totalSize);
  let position = 0;
  localParts.concat(centralParts, [end]).forEach((part) => {
    output.set(part, position);
    position += part.length;
  });
  return output;
}

function zipLocalHeader(file) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, file.crc, true);
  view.setUint32(18, file.data.length, true);
  view.setUint32(22, file.data.length, true);
  view.setUint16(26, file.nameBytes.length, true);
  view.setUint16(28, 0, true);
  return header;
}

function zipCentralHeader(file, localOffset) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, file.crc, true);
  view.setUint32(20, file.data.length, true);
  view.setUint32(24, file.data.length, true);
  view.setUint16(28, file.nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localOffset, true);
  return header;
}

function zipEndRecord(fileCount, centralSize, centralOffset) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return header;
}

function crc32(data) {
  if (!crc32.table) {
    crc32.table = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  data.forEach((byte) => {
    crc = crc32.table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });
  return (crc ^ 0xffffffff) >>> 0;
}

function buildFormulaWorkbookXml(headers, activeRules) {
  const headersWithComputedYear = headers.concat(columnIndex(headers, ["EntryYear", "Entry Year"]) ? [] : ["EntryYear"]);
  const filterHeaders = activeRules.map((rule) => filterFieldHeader(rule.field, headersWithComputedYear));
  const helperHeaders = filterHeaders.map((item) => item.header);
  const existingEntryYearCol = columnIndex(headers, ["EntryYear", "Entry Year"]);
  const addedYearHeaders = existingEntryYearCol ? [] : ["EntryYear"];
  const orderbookHeaders = headers.concat(addedYearHeaders, [""], helperHeaders, ["", "NET"]);
  const separatorCol = headers.length + addedYearHeaders.length + 1;
  const helperStartCol = separatorCol + 1;
  const netCol = orderbookHeaders.length;
  const lastRow = state.trades.length + 1;
  const profitCostCol = profitCostPercentColumnIndex(headers) || columnIndex(headers, ["Profit%"]) || columnIndex(headers, ["Profit"]) || 1;
  const entryYearCol = existingEntryYearCol || headers.length + 1;
  const holdingCol = columnIndex(headers, ["HoldingPeriod", "Holding Period"]) || 6;
  const orderRows = [
    orderbookHeaders.map((header) => excelValueCell(header)),
  ];

  state.trades.forEach((trade, index) => {
    const excelRow = index + 2;
    const raw = trade.raw || {};
    const cells = headers.map((header) => excelValueCell(raw[header] !== undefined ? raw[header] : fallbackOrderbookValue(trade, header), header));
    if (!existingEntryYearCol) {
      cells.push(excelValueCell(trade.entryYear || (trade.entryDate ? trade.entryDate.getFullYear() : ""), "EntryYear"));
    }
    cells.push(excelValueCell(""));
    activeRules.forEach((rule, ruleIndex) => {
      const source = filterHeaders[ruleIndex];
      cells.push(excelFormulaCell(filterRuleFormula(rule, source.index, ruleIndex + 2), "0"));
    });
    cells.push(excelValueCell(""));
    const productStart = helperStartCol;
    const productEnd = helperStartCol + Math.max(0, activeRules.length - 1);
    const netFormula = activeRules.length
      ? "=PRODUCT(RC" + productStart + ":RC" + productEnd + ")"
      : "=1";
    cells.push(excelFormulaCell(netFormula, "1"));
    orderRows.push(cells);
  });

  const sheetRows = buildFormulaSheetRows(activeRules, filterHeaders, {
    lastRow,
    netCol,
    profitCostCol,
    entryYearCol,
    holdingCol,
  });

  return [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Worksheet ss:Name="OrderBook"><Table>' + orderRows.map(excelRowXml).join("") + '</Table></Worksheet>',
    '<Worksheet ss:Name="Sheet1"><Table>' + sheetRows.map(excelRowXml).join("") + '</Table></Worksheet>',
    '</Workbook>',
  ].join("");
}

function buildFormulaSheetRows(activeRules, filterHeaders, refs) {
  const rows = [];
  rows.push(["Header Index", "Header", "Min", "Max", "", "Year", "Trades", "Profit"].map((value) => excelValueCell(value)));
  activeRules.forEach((rule, index) => {
    const field = filterFieldMap.get(rule.field);
    rows.push([
      excelValueCell(filterHeaders[index].index),
      excelValueCell(field ? field.label : rule.field),
      excelValueCell(rule.value),
      excelValueCell(rule.operator === "between" ? rule.value2 : ""),
      excelValueCell(""),
      excelValueCell(2015 + index),
      excelFormulaCell(yearTradesFormula(index + 2, refs), "0"),
      excelFormulaCell(yearProfitFormula(index + 2, refs), "0"),
    ]);
  });

  for (let year = 2015 + activeRules.length; year <= 2026; year += 1) {
    const sheetRow = rows.length + 1;
    rows.push([
      excelValueCell(""),
      excelValueCell(""),
      excelValueCell(""),
      excelValueCell(""),
      excelValueCell(""),
      excelValueCell(year),
      excelFormulaCell(yearTradesFormula(sheetRow, refs), "0"),
      excelFormulaCell(yearProfitFormula(sheetRow, refs), "0"),
    ]);
  }

  while (rows.length < 8) rows.push([excelValueCell("")]);
  rows[7][1] = excelValueCell("Trades");
  rows[7][2] = excelFormulaCell("=SUM(OrderBook!R2C" + refs.netCol + ":R" + refs.lastRow + "C" + refs.netCol + ")", "0");

  const metricRows = [
    ["Profit", "=SUMIF(OrderBook!R2C" + refs.netCol + ":R" + refs.lastRow + "C" + refs.netCol + ",1,OrderBook!R2C" + refs.profitCostCol + ":R" + refs.lastRow + "C" + refs.profitCostCol + ")"],
    ["Per Trade", "=IFERROR(R[-1]C/R[-2]C,\"\")"],
    ["Win %", "=IFERROR(COUNTIFS(OrderBook!R2C" + refs.netCol + ":R" + refs.lastRow + "C" + refs.netCol + ",1,OrderBook!R2C" + refs.profitCostCol + ":R" + refs.lastRow + "C" + refs.profitCostCol + ",\">0\")/R[-3]C,\"\")"],
    ["Avg. Pro.", "=IFERROR(AVERAGEIFS(OrderBook!R2C" + refs.profitCostCol + ":R" + refs.lastRow + "C" + refs.profitCostCol + ",OrderBook!R2C" + refs.profitCostCol + ":R" + refs.lastRow + "C" + refs.profitCostCol + ",\">0\",OrderBook!R2C" + refs.netCol + ":R" + refs.lastRow + "C" + refs.netCol + ",1),\"\")"],
    ["Avg. Loss", "=IFERROR(AVERAGEIFS(OrderBook!R2C" + refs.profitCostCol + ":R" + refs.lastRow + "C" + refs.profitCostCol + ",OrderBook!R2C" + refs.profitCostCol + ":R" + refs.lastRow + "C" + refs.profitCostCol + ",\"<0\",OrderBook!R2C" + refs.netCol + ":R" + refs.lastRow + "C" + refs.netCol + ",1),\"\")"],
    ["Exp", "=IFERROR(R[-3]C*R[-2]C/((1-R[-3]C)*R[-1]C*-1),\"\")"],
    ["AvgHolding", "=IFERROR(AVERAGEIFS(OrderBook!R2C" + refs.holdingCol + ":R" + refs.lastRow + "C" + refs.holdingCol + ",OrderBook!R2C" + refs.netCol + ":R" + refs.lastRow + "C" + refs.netCol + ",1),\"\")"],
  ];

  metricRows.forEach(([label, formula], index) => {
    const rowIndex = 8 + index;
    if (!rows[rowIndex]) rows[rowIndex] = [excelValueCell("")];
    while (rows[rowIndex].length < 3) rows[rowIndex].push(excelValueCell(""));
    rows[rowIndex][1] = excelValueCell(label);
    rows[rowIndex][2] = excelFormulaCell(formula, "0");
  });

  return rows;
}

function filterRuleFormula(rule, sourceCol, sheetRow) {
  const field = filterFieldMap.get(rule.field);
  if (field && field.type === "text") {
    if (rule.operator === "=") return "=IF(RC" + sourceCol + "=Sheet1!R" + sheetRow + "C3,1,0)";
    if (rule.operator === "!=") return "=IF(RC" + sourceCol + "<>Sheet1!R" + sheetRow + "C3,1,0)";
    return "=IF(ISNUMBER(SEARCH(Sheet1!R" + sheetRow + "C3,RC" + sourceCol + ")),1,0)";
  }
  if (rule.operator === ">=") return "=IF(RC" + sourceCol + ">=Sheet1!R" + sheetRow + "C3,1,0)";
  if (rule.operator === "<=") return "=IF(RC" + sourceCol + "<=Sheet1!R" + sheetRow + "C3,1,0)";
  if (rule.operator === "=") return "=IF(RC" + sourceCol + "=Sheet1!R" + sheetRow + "C3,1,0)";
  if (rule.operator === "!=") return "=IF(RC" + sourceCol + "<>Sheet1!R" + sheetRow + "C3,1,0)";
  return "=IF(AND(RC" + sourceCol + ">=Sheet1!R" + sheetRow + "C3,RC" + sourceCol + "<=Sheet1!R" + sheetRow + "C4),1,0)";
}

function yearTradesFormula(sheetRow, refs) {
  return "=COUNTIFS(OrderBook!R2C" + refs.entryYearCol + ":R" + refs.lastRow + "C" + refs.entryYearCol + ",RC[-1],OrderBook!R2C" + refs.netCol + ":R" + refs.lastRow + "C" + refs.netCol + ",1)";
}

function yearProfitFormula(sheetRow, refs) {
  return "=SUMIFS(OrderBook!R2C" + refs.profitCostCol + ":R" + refs.lastRow + "C" + refs.profitCostCol + ",OrderBook!R2C" + refs.netCol + ":R" + refs.lastRow + "C" + refs.netCol + ",1,OrderBook!R2C" + refs.entryYearCol + ":R" + refs.lastRow + "C" + refs.entryYearCol + ",RC[-2])";
}

function filterFieldHeader(field, headers) {
  const rawHeader = rawFilterHeader(field);
  if (field === "profitPercent") {
    const index = profitCostPercentColumnIndex(headers) || columnIndex(headers, ["Profit%"]) || columnIndex(headers, ["Profit"]) || 1;
    return { header: headers[index - 1] || "ProfitCost%", index };
  }
  const names = rawHeader ? [rawHeader] : filterHeaderAliases(field);
  const index = columnIndex(headers, names) || 1;
  return { header: names[0], index };
}

function profitCostPercentColumnIndex(headers) {
  return exactColumnIndex(headers, ["ProfitCost%", "Profit%Cost", "Profit Cost %", "LegProfitWithCost%", "TradeProfit%", "LegProfit%"]);
}

function exactColumnIndex(headers, names) {
  const normalizedNames = names.map((name) => String(name || "").trim().toLowerCase());
  const index = headers.findIndex((header) => normalizedNames.includes(String(header || "").trim().toLowerCase()));
  return index >= 0 ? index + 1 : 0;
}

function columnIndex(headers, names) {
  for (const name of names) {
    const normalized = normalizeKey(name);
    const index = headers.findIndex((header) => normalizeKey(header) === normalized);
    if (index >= 0) return index + 1;
  }
  return 0;
}

function excelRowXml(cells) {
  return "<Row>" + cells.map((cell) => cell || excelValueCell("")).join("") + "</Row>";
}

function excelValueCell(value, header = "") {
  const typed = excelTypedValue(value, header);
  return '<Cell><Data ss:Type="' + typed.type + '">' + escapeXml(typed.value) + "</Data></Cell>";
}

function excelFormulaCell(formula, fallback = "0") {
  const type = String(fallback) === "" ? "String" : "Number";
  return '<Cell ss:Formula="' + escapeXml(formula) + '"><Data ss:Type="' + type + '">' + escapeXml(fallback) + "</Data></Cell>";
}

function excelTypedValue(value, header = "") {
  const text = String(value == null ? "" : value);
  const key = normalizeKey(header);
  const shouldStayText = /date|time|instrument|reason|type/.test(key);
  const number = Number(text.replace(/,/g, ""));
  if (!shouldStayText && text.trim() !== "" && Number.isFinite(number)) {
    return { type: "Number", value: String(number) };
  }
  return { type: "String", value: text };
}

function escapeXml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function filteredOrderbookHeaders() {
  if (state.orderbookHeaders.length) return state.orderbookHeaders;
  const firstRaw = state.trades.find((trade) => trade.raw && Object.keys(trade.raw).length);
  if (firstRaw) return Object.keys(firstRaw.raw);
  return ["TradeId", "Instrument", "Type", "EntryDate", "EntryTime", "EntryPrice", "ExitDate", "ExitTime", "ExitPrice", "ExitReason", "Profit", "ProfitCost%", "TradeMaxProfit", "rank since low", "return since nifty low", "relative strength", "trading days since nifty low"];
}

function fallbackOrderbookValue(trade, header) {
  const key = normalizeKey(header);
  if (key === "tradeid") return trade.id;
  if (key === "instrument") return trade.instrument;
  if (key === "type" || key === "tradetypels") return trade.type;
  if (key === "entrydate") return formatDateOnly(trade.entryDate);
  if (key === "entrytime") return formatTimeOnly(trade.entryDate);
  if (key === "entryprice") return trade.entryPrice;
  if (key === "exitdate") return formatDateOnly(trade.exitDate);
  if (key === "exittime") return formatTimeOnly(trade.exitDate);
  if (key === "exitprice") return trade.exitPrice;
  if (key === "exitreason") return trade.exitReason;
  if (key === "profit") return trade.profit;
  if (key === "profitcost" || key === "profitpercentcost") return trade.profitPercent;
  if (key === "trademaxprofit") return trade.maxProfitPercent;
  if (key === "ranksincelow") return trade.rank;
  if (key === "returnsinceniftylow") return trade.returnSinceNiftyLow;
  if (key === "relativestrength") return trade.relativeStrength;
  if (key === "tradingdayssinceniftylow") return trade.tradingDaysSinceNiftyLow;
  return "";
}

function applyFilters() {
  state.filterErrors = validateFilterRules();
  const sourceTrades = activeSnoTrades();
  if (state.filterErrors.length) {
    state.filteredTrades = [];
    invalidateTradeCaches();
    state.chartWindowStartByTrade.clear();
    state.activeIndex = 0;
    updateFilterStatus();
    render();
    return;
  }
  const instrument = els.instrumentFilter.value;
  const search = els.searchInput.value.trim().toLowerCase();
  state.filteredTrades = sourceTrades.filter((trade) => {
    const matchesInstrument = instrument === "All" || trade.instrument === instrument;
    const haystack = [trade.id, trade.instrument, trade.type, trade.exitReason].join(" ").toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    const matchesAdvanced = state.dashboardMode !== "filter" || matchesFilterRules(trade);
    return matchesInstrument && matchesSearch && matchesAdvanced;
  });
  invalidateTradeCaches();
  state.chartWindowStartByTrade.clear();
  state.activeIndex = 0;
  updateFilterStatus();
  render();
}

function scheduleFilterApply() {
  if (state.pendingFilterFrame) {
    window.clearTimeout(state.pendingFilterFrame);
  }
  state.pendingFilterFrame = window.setTimeout(() => {
    state.pendingFilterFrame = null;
    syncFilterRulesFromDom();
    applyFilters();
  }, 180);
}

function render() {
  setStats();
  renderInsights();
  renderYearDistribution();
  renderTable();
  showTrade(state.activeIndex);
}

function renderInsights() {
  if (!els.insights) return;
  const trades = state.trades.length ? state.filteredTrades : [];
  if (!trades.length) {
    els.insights.innerHTML = [
      ["Data Scope", state.trades.length ? "No matching trades" : "Waiting for upload", state.trades.length ? "Adjust filters or SNO selection." : "Upload OrderBook.csv to activate the dashboard."],
      ["Date Range", "-", "Entry and exit span will appear here."],
      ["Top Instrument", "-", "Highest trade count in current scope."],
      ["Best Year", "-", "Best Profit%Cost contribution."],
    ].map(insightCardHtml).join("");
    return;
  }

  const range = tradeDateRange(trades);
  const topInstrument = topInstrumentSummary(trades);
  const bestYear = bestYearSummary(trades);
  const selectedScope = state.selectedSno === "All" ? "All SNO" : "SNO " + state.selectedSno;
  const modeLabel = state.dashboardMode === "filter" ? "Filter Orderbook" : "Orderbook Dashboard";

  els.insights.innerHTML = [
    ["Data Scope", selectedScope + " | " + modeLabel, formatNumber(trades.length, 0) + " trades in current view."],
    ["Date Range", range.label, range.note],
    ["Top Instrument", topInstrument.label, topInstrument.note],
    ["Best Year", bestYear.label, bestYear.note],
  ].map(insightCardHtml).join("");
}

function insightCardHtml([title, value, note]) {
  return '<article class="insight-card">' +
    '<div class="insight-title">' + escapeHtml(title) + '</div>' +
    '<div class="insight-value">' + escapeHtml(value) + '</div>' +
    '<div class="insight-note">' + escapeHtml(note) + '</div>' +
  '</article>';
}

function tradeDateRange(trades) {
  const starts = trades.map((trade) => trade.entryDate).filter(Boolean).sort((a, b) => a - b);
  const ends = trades.map((trade) => trade.exitDate).filter(Boolean).sort((a, b) => a - b);
  if (!starts.length || !ends.length) return { label: "-", note: "No dated trades." };
  const first = starts[0];
  const last = ends[ends.length - 1];
  return {
    label: formatShortDate(first) + " to " + formatShortDate(last),
    note: countTradingDays(trades) + " trading days in scope.",
  };
}

function topInstrumentSummary(trades) {
  const groups = new Map();
  trades.forEach((trade) => {
    if (!groups.has(trade.instrument)) groups.set(trade.instrument, { count: 0, profit: 0 });
    const item = groups.get(trade.instrument);
    item.count += 1;
    item.profit += trade.profitPercent;
  });
  const [instrument, item] = Array.from(groups.entries()).sort((a, b) => b[1].count - a[1].count || b[1].profit - a[1].profit)[0] || ["-", { count: 0, profit: 0 }];
  return {
    label: instrument,
    note: formatNumber(item.count, 0) + " trades | " + formatPlain(item.profit, 2) + "% cost",
  };
}

function bestYearSummary(trades) {
  const groups = new Map();
  trades.forEach((trade) => {
    const year = tradeEntryYear(trade);
    groups.set(year, (groups.get(year) || 0) + trade.profitPercent);
  });
  const [year, profit] = Array.from(groups.entries()).sort((a, b) => b[1] - a[1])[0] || ["-", 0];
  return {
    label: String(year),
    note: formatPlain(profit, 2) + "% cost contribution.",
  };
}

function tradeEntryYear(trade) {
  return trade.entryYear || (trade.entryDate ? trade.entryDate.getFullYear() : "-");
}

function renderYearDistribution() {
  if (!els.yearDistributionRows) return;
  if (!state.trades.length) {
    els.yearDistributionRows.innerHTML = '<tr><td colspan="3" class="empty">No uploaded orderbook yet.</td></tr>';
    return;
  }

  const groups = new Map();
  state.filteredTrades.forEach((trade) => {
    const year = tradeEntryYear(trade);
    if (!groups.has(year)) groups.set(year, { year, trades: 0, profit: 0 });
    const item = groups.get(year);
    item.trades += 1;
    item.profit += trade.profitPercent;
  });

  if (!groups.size) {
    els.yearDistributionRows.innerHTML = '<tr><td colspan="3" class="empty">No filtered trades.</td></tr>';
    return;
  }

  els.yearDistributionRows.innerHTML = Array.from(groups.values())
    .sort((a, b) => Number(a.year) - Number(b.year))
    .map((item) => (
      '<tr>' +
        '<td>' + escapeHtml(item.year) + '</td>' +
        '<td>' + escapeHtml(formatNumber(item.trades, 0)) + '</td>' +
        '<td class="' + signedClass(item.profit) + '">' + escapeHtml(formatPlain(item.profit, 4)) + '</td>' +
      '</tr>'
    )).join("");
}

function renderTable() {
  updateOrderbookTabs();
  if (state.orderbookView === "stock") {
    renderStockWiseTable();
    return;
  }
  renderTradeWiseTable();
}

function updateOrderbookTabs() {
  const isStockView = state.orderbookView === "stock";
  els.tradeWiseOrderbook.classList.toggle("active", !isStockView);
  els.stocksWiseOrderbook.classList.toggle("active", isStockView);
  els.stockOrderbookTools.hidden = !isStockView;
  els.stockSearchInput.disabled = !state.trades.length;
}

function renderTradeWiseTable() {
  els.orderbookHead.innerHTML = [
    "<tr>",
    "<th>Trade</th>",
    "<th>Instrument</th>",
    "<th>Type</th>",
    "<th>Entry</th>",
    "<th>Exit</th>",
    "<th>Entry Price</th>",
    "<th>Exit Price</th>",
    "<th>Profit</th>",
    "<th>Profit Cost %</th>",
    "<th>Max Profit %</th>",
    "<th>Rank</th>",
    "<th>Exit Reason</th>",
    "</tr>",
  ].join("");

  if (!state.trades.length) {
    els.tradeRows.innerHTML = '<tr><td colspan="12" class="empty">No uploaded orderbook yet.</td></tr>';
    return;
  }

  if (!state.filteredTrades.length) {
    els.tradeRows.innerHTML = '<tr><td colspan="12" class="empty">No trades match the current filter.</td></tr>';
    return;
  }

  const visibleRows = state.filteredTrades.slice(0, MAX_TABLE_ROWS);
  const overflowRow = state.filteredTrades.length > MAX_TABLE_ROWS
    ? '<tr><td colspan="12" class="empty">Showing first ' + escapeHtml(formatNumber(MAX_TABLE_ROWS, 0)) + ' of ' + escapeHtml(formatNumber(state.filteredTrades.length, 0)) + ' trades. Use search, instrument, SNO, or Filter Orderbook to narrow the table.</td></tr>'
    : "";

  els.tradeRows.innerHTML = visibleRows.map((trade, index) => (
    '<tr data-index="' + index + '">' +
      '<td>' + escapeHtml(trade.id) + '</td>' +
      '<td>' + escapeHtml(trade.instrument) + '</td>' +
      '<td>' + escapeHtml(trade.type) + '</td>' +
      '<td>' + escapeHtml(formatDate(trade.entryDate)) + '</td>' +
      '<td>' + escapeHtml(formatDate(trade.exitDate)) + '</td>' +
      '<td>' + escapeHtml(formatPlain(trade.entryPrice, 2)) + '</td>' +
      '<td>' + escapeHtml(formatPlain(trade.exitPrice, 2)) + '</td>' +
      '<td class="' + signedClass(trade.profit) + '">' + escapeHtml(formatPlain(trade.profit, 2)) + '</td>' +
      '<td class="' + signedClass(trade.profitPercent) + '">' + escapeHtml(formatPlain(trade.profitPercent, 2)) + '</td>' +
      '<td class="' + signedClass(trade.maxProfitPercent) + '">' + escapeHtml(formatPlain(trade.maxProfitPercent, 2)) + '</td>' +
      '<td>' + escapeHtml(trade.rank) + '</td>' +
      '<td>' + escapeHtml(trade.exitReason) + '</td>' +
    '</tr>'
  )).join("") + overflowRow;

  Array.from(els.tradeRows.querySelectorAll("tr[data-index]")).forEach((row) => {
    row.addEventListener("click", () => selectTrade(Number(row.dataset.index)));
  });
}

function renderStockWiseTable() {
  els.orderbookHead.innerHTML = [
    "<tr>",
    "<th>Instrument</th>",
    "<th>Trades</th>",
    "<th>P&L %</th>",
    "<th>Win%</th>",
    "<th>Avg</th>",
    "<th>Best</th>",
    "<th>Worst</th>",
    "</tr>",
  ].join("");

  if (!state.trades.length) {
    els.tradeRows.innerHTML = '<tr><td colspan="7" class="empty">No uploaded orderbook yet.</td></tr>';
    return;
  }

  const search = els.stockSearchInput.value.trim().toLowerCase();
  const summaries = stockSummaries()
    .filter((item) => !search || item.instrument.toLowerCase().includes(search))
    .sort((a, b) => b.totalPercent - a.totalPercent);

  if (!summaries.length) {
    els.tradeRows.innerHTML = '<tr><td colspan="7" class="empty">No instruments match the current search.</td></tr>';
    return;
  }

  els.tradeRows.innerHTML = summaries.map((item) => (
    '<tr data-instrument="' + escapeHtml(item.instrument) + '">' +
      '<td>' + escapeHtml(item.instrument) + '</td>' +
      '<td>' + escapeHtml(formatNumber(item.count, 0)) + '</td>' +
      '<td class="' + signedClass(item.totalPercent) + '">' + escapeHtml(formatPlain(item.totalPercent, 2)) + '%</td>' +
      '<td>' + escapeHtml(formatPlain(item.winRate, 1)) + '%</td>' +
      '<td class="' + signedClass(item.averagePercent) + '">' + escapeHtml(formatPlain(item.averagePercent, 2)) + '%</td>' +
      '<td class="' + signedClass(item.bestPercent) + '">' + escapeHtml(formatPlain(item.bestPercent, 2)) + '%</td>' +
      '<td class="' + signedClass(item.worstPercent) + '">' + escapeHtml(formatPlain(item.worstPercent, 2)) + '%</td>' +
    '</tr>'
  )).join("");

  Array.from(els.tradeRows.querySelectorAll("tr[data-instrument]")).forEach((row) => {
    row.addEventListener("click", () => {
      els.instrumentFilter.value = row.dataset.instrument;
      state.orderbookView = "trade";
      applyFilters();
    });
  });
}

function stockSummaries() {
  const groups = new Map();
  const sourceTrades = state.dashboardMode === "filter" ? state.filteredTrades : activeSnoTrades();
  sourceTrades.forEach((trade) => {
    if (!groups.has(trade.instrument)) groups.set(trade.instrument, []);
    groups.get(trade.instrument).push(trade);
  });

  return Array.from(groups, ([instrument, trades]) => {
    const totalPercent = trades.reduce((sum, trade) => sum + trade.profitPercent, 0);
    const wins = trades.filter((trade) => trade.profitPercent >= 0).length;
    return {
      instrument,
      count: trades.length,
      totalPercent,
      winRate: trades.length ? (wins / trades.length) * 100 : 0,
      averagePercent: trades.length ? totalPercent / trades.length : 0,
      bestPercent: Math.max(...trades.map((trade) => trade.profitPercent)),
      worstPercent: Math.min(...trades.map((trade) => trade.profitPercent)),
    };
  });
}

function selectTrade(index) {
  const trades = state.filteredTrades;
  const nextIndex = Math.max(0, Math.min(trades.length - 1, index));
  const trade = trades[nextIndex];
  if (trade) {
    const key = chartWindowKey(trade);
    state.chartWindowStartByTrade.delete(key);
  }
  showTrade(nextIndex);
}

function showTrade(index) {
  const trades = state.filteredTrades;
  state.activeIndex = Math.max(0, Math.min(trades.length - 1, index));
  const trade = trades[state.activeIndex];
  const rows = Array.from(els.tradeRows.querySelectorAll("tr[data-index]"));
  rows.forEach((row) => row.classList.toggle("active", Number(row.dataset.index) === state.activeIndex));

  els.prevTrade.disabled = !trade || state.activeIndex === 0;
  els.nextTrade.disabled = !trade || state.activeIndex === trades.length - 1;
  els.tradeCount.textContent = trade ? (state.activeIndex + 1) + " / " + trades.length : "0 / 0";

  if (!trade) {
    setChartStatus(state.trades.length ? "No trade matches the current filters." : "Upload an orderbook to begin.");
    els.selected.innerHTML = "";
    drawEmpty();
    return;
  }

  const realSeries = realCandlesForTrade(trade);
  const intervalLabel = formatCandlePeriod(state.candlePeriod);
  const indicatorIntervalLabel = formatCandlePeriod(effectiveIndicatorPeriod());
  const candleStatus = realSeries ? { status: "loaded" } : requestServerCandles(trade);
  const chartMode = realSeries ? intervalLabel + " OHLC full history" : candleStatus.label;
  setChartStatus(trade.instrument + " trade #" + trade.id + " from " + formatDate(trade.entryDate) + " to " + formatDate(trade.exitDate) + " | " + chartMode);
  els.selected.innerHTML = '<h2>Selected Trade</h2>' + [
    ["SNO", trade.sno || "-"],
    ["Trade", "#" + trade.id + " " + trade.type],
    ["Instrument", trade.instrument],
    ["Entry", formatDate(trade.entryDate)],
    ["Exit", formatDate(trade.exitDate)],
    ["Holding", formatHolding(trade.entryDate, trade.exitDate)],
    ["Exit Reason", trade.exitReason],
    ["Candle", intervalLabel],
    ["Indicator Candle", indicatorIntervalLabel],
    ["Window", realSeries ? formatShortDateTime(realSeries.candles[0].time) + " to " + formatShortDateTime(realSeries.candles[realSeries.candles.length - 1].time) : "-"],
    ["Profit", formatPlain(trade.profit, 2)],
    ["Profit Cost %", formatPlain(trade.profitPercent, 2) + "%"],
    ["Relative Strength", Number.isFinite(trade.relativeStrength) ? formatPlain(trade.relativeStrength, 2) : "-"],
  ].map(([label, value]) => (
    '<div class="detail-row"><div class="label">' + escapeHtml(label) + '</div><strong>' + escapeHtml(value) + '</strong></div>'
  )).join("");

  drawTrade(trade, realSeries, candleStatus);
}

function drawEmpty() {
  fitCanvas(false);
  hideCandleHover();
  state.chartHover = null;
  const rect = els.canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#647184";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("Upload OrderBook.csv to draw entry and exit charts.", rect.width / 2, rect.height / 2);
  disableChartWindowControls("No candle window loaded.");
}

function drawTrade(trade, realSeries = realCandlesForTrade(trade), candleStatus = { label: "Loading candles" }) {
  if (realSeries) {
    drawRealCandleTrade(trade, realSeries);
    return;
  }
  drawMissingCandles(trade, candleStatus);
}

function drawRealCandleTrade(trade, series) {
  fitCanvas(false);
  hideCandleHover();
  const rect = els.canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const left = 68;
  const right = 24;
  const top = 24;
  const bottom = 64;
  const gap = 16;
  const niftySeries = benchmarkSeriesForVisibleWindow(series, "NIFTY50");
  const niftyBlockH = Math.min(275, Math.max(235, h * 0.28 + 25));
  const niftyGap = niftySeries ? 38 : 0;
  const reservedNiftyH = niftySeries ? niftyBlockH + niftyGap : 0;
  const indicatorData = buildIndicatorData(series);
  const panelIndicators = indicatorData.filter((item) => item.panel);
  const panelHeights = panelIndicators.map((indicator) => (
    indicator.id === "rs"
      ? Math.max(112, Math.min(150, h * 0.2))
      : Math.max(64, Math.min(86, h * 0.12))
  ));
  const panelTotalH = panelHeights.reduce((total, height) => total + height, 0) + (panelHeights.length ? panelHeights.length * 8 : 0);
  const volumeH = series.candles.some((candle) => candle.volume > 0) ? Math.max(48, Math.min(72, h * 0.1)) : 0;
  const plotW = w - left - right;
  const plotH = Math.max(150, h - top - bottom - reservedNiftyH - volumeH - panelTotalH - (volumeH ? gap : 0));
  const firstPanelTop = top + plotH + 8;
  const volumeTop = top + plotH + panelTotalH + (volumeH ? gap : 0);
  const overlays = visibleTradeOverlays(trade, series);
  const activeOverlay = overlays.find((overlay) => overlay.active);
  const entryVisible = Boolean(activeOverlay && activeOverlay.entryVisible);
  const exitVisible = Boolean(activeOverlay && activeOverlay.exitVisible);
  const prices = series.candles.flatMap((candle) => [candle.high, candle.low, candle.open, candle.close]);
  overlays.forEach((overlay) => {
    if (overlay.entryVisible) prices.push(overlay.trade.entryPrice);
    if (overlay.exitVisible) prices.push(overlay.trade.exitPrice);
  });
  indicatorData.filter((item) => !item.panel).forEach((item) => {
    item.series.forEach((line) => {
      line.values.forEach((value) => {
        if (Number.isFinite(value)) prices.push(value);
      });
    });
  });
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const pad = Math.max((rawMax - rawMin) * 0.12, Math.max(0.5, trade.entryPrice * 0.002));
  const minPrice = rawMin - pad;
  const maxPrice = rawMax + pad;
  const slotWidth = plotW / Math.max(1, series.candles.length);
  const candleWidth = Math.max(4, Math.min(14, slotWidth * 0.62));
  const mainHoverBottom = volumeH ? volumeTop + volumeH : top + plotH + panelTotalH;
  state.chartHover = {
    panes: [{
      name: series.instrument,
      candles: series.candles,
      indicators: indicatorData,
      overlays,
      left,
      right: left + plotW,
      top,
      bottom: mainHoverBottom,
      slotWidth,
    }],
  };
  const entryX = entryVisible ? candleX(activeOverlay.entryIndex, left, slotWidth) : null;
  const exitX = exitVisible ? candleX(activeOverlay.exitIndex, left, slotWidth) : null;
  const yEntry = yScale(trade.entryPrice, top, plotH, minPrice, maxPrice);
  const yExit = yScale(trade.exitPrice, top, plotH, minPrice, maxPrice);
  const tradeColor = trade.profit >= 0 ? "#12805c" : "#c7362f";

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  drawPriceGrid(left, top, plotW, plotH, minPrice, maxPrice);

  if (volumeH) {
    const maxVolume = Math.max(1, ...series.candles.map((candle) => candle.volume || 0));
    ctx.strokeStyle = "#d9e0e8";
    ctx.beginPath();
    ctx.moveTo(left, volumeTop);
    ctx.lineTo(left + plotW, volumeTop);
    ctx.moveTo(left, volumeTop + volumeH);
    ctx.lineTo(left + plotW, volumeTop + volumeH);
    ctx.stroke();

    ctx.fillStyle = "#647184";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("Vol", left - 8, volumeTop + volumeH / 2);

    series.candles.forEach((candle, index) => {
      const x = candleX(index, left, slotWidth);
      const volumeBarH = Math.max(1, ((candle.volume || 0) / maxVolume) * volumeH);
      ctx.fillStyle = candle.close >= candle.open ? "#12805c" : "#c7362f";
      ctx.globalAlpha = 0.32;
      ctx.fillRect(x - candleWidth / 2, volumeTop + volumeH - volumeBarH, candleWidth, volumeBarH);
      ctx.globalAlpha = 1;
    });
  }

  drawTradeBands(overlays, left, slotWidth, top, plotH + panelTotalH + (volumeH ? gap + volumeH : 0), series.candles.length);

  series.candles.forEach((candle, index) => {
    const x = candleX(index, left, slotWidth);
    drawCandle(candle, x, candleWidth, top, plotH, minPrice, maxPrice, Boolean(activeOverlay && (index === activeOverlay.entryIndex || index === activeOverlay.exitIndex)));
  });

  drawPriceIndicators(indicatorData.filter((item) => !item.panel), left, slotWidth, top, plotH, minPrice, maxPrice);
  drawTradeOverlays(overlays, left, slotWidth, top, plotH, minPrice, maxPrice);
  drawIndicatorPanels(panelIndicators, left, slotWidth, firstPanelTop, panelHeights, plotW);
  drawTimeLabels(series.candles, left, slotWidth, top + plotH + panelTotalH + (volumeH ? gap + volumeH : 0) + 18);
  drawProfitLabel(trade, tradeColor, entryVisible && exitVisible ? (entryX + exitX) / 2 : left + plotW / 2, top + 8);

  if (niftySeries) {
    drawBenchmarkPanel(trade, niftySeries, left, plotW, slotWidth, h - bottom - niftyBlockH + 12, niftyBlockH, candleWidth);
  }

  updateChartWindowControls(trade, series);
}

function drawMissingCandles(trade, candleStatus) {
  fitCanvas(false);
  hideCandleHover();
  state.chartHover = null;
  const rect = els.canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#d9e0e8";
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  ctx.fillStyle = "#17202a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillText("Real " + formatCandlePeriod(state.candlePeriod) + " candles are not loaded", w / 2, h / 2 - 34);

  ctx.fillStyle = "#647184";
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(candleStatus.message || candleStatus.label || "Waiting for local candle data.", w / 2, h / 2 - 8);
  ctx.fillText(trade.instrument + " trade #" + trade.id + " needs candle data from " + candleDataSourceLabel(), w / 2, h / 2 + 18);

  ctx.fillStyle = "#c7362f";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText("No fallback candles are drawn here because they are not valid " + formatCandlePeriod(state.candlePeriod) + " market candles.", w / 2, h / 2 + 48);
  disableChartWindowControls("Waiting for full candle data.");
}

function benchmarkSeriesForVisibleWindow(series, instrument) {
  const symbol = normalizeSymbol(instrument);
  const benchmarkCandles = candlesForInstrument(symbol);
  if (!benchmarkCandles.length) {
    const status = requestServerCandles({ instrument: symbol }, state.candlePeriod);
    return {
      instrument: symbol,
      candles: [],
      sourceCandles: series.candles,
      status: status.status === "pending" || status.status === "started" ? "loading" : "missing",
      message: status.message || status.label || "Waiting for " + symbol + " candles.",
      entryIndex: series.entryIndex,
      exitIndex: series.exitIndex,
    };
  }

  const periodMs = Math.max(60000, (Number(state.candlePeriod) || 5) * 60000);
  const alignedCandles = series.candles.map((candle) => {
    const index = nearestCandleIndex(benchmarkCandles, candle.time.getTime());
    if (index < 0) return null;
    const matched = benchmarkCandles[index];
    return Math.abs(matched.time.getTime() - candle.time.getTime()) <= periodMs * 1.5 ? matched : null;
  });

  return {
    instrument: symbol,
    candles: alignedCandles,
    sourceCandles: series.candles,
    allCandles: benchmarkCandles,
    status: alignedCandles.some(Boolean) ? "loaded" : "missing",
    message: "No " + symbol + " candles matched this visible stock window.",
    entryIndex: series.entryIndex,
    exitIndex: series.exitIndex,
  };
}

function drawBenchmarkPanel(trade, benchmarkSeries, left, plotW, slotWidth, top, blockHeight, candleWidth) {
  const titleH = 18;
  const bottomLabelH = 24;
  const availableCandles = benchmarkSeries.candles.filter(Boolean);
  const benchmarkIndicatorData = availableCandles.length
    ? buildIndicatorData(benchmarkSeries, {
      instrument: benchmarkSeries.instrument,
      chartCandles: benchmarkSeries.sourceCandles,
      allCandles: benchmarkSeries.allCandles || availableCandles,
      indicatorIds: state.activeIndicators.filter((id) => id !== "rs"),
    })
    : [];
  const priceIndicators = benchmarkIndicatorData.filter((item) => !item.panel);
  const panelIndicators = benchmarkIndicatorData.filter((item) => item.panel);
  const volumeH = availableCandles.some((candle) => candle.volume > 0) ? Math.max(34, Math.min(48, blockHeight * 0.18)) : 0;
  const availableH = blockHeight - titleH - bottomLabelH - volumeH - (volumeH ? 10 : 0);
  const panelGapTotal = panelIndicators.length ? panelIndicators.length * 8 : 0;
  const maxPanelTotal = Math.max(0, availableH - 88);
  const panelHeight = panelIndicators.length
    ? Math.max(24, Math.min(58, Math.floor((maxPanelTotal - panelGapTotal) / panelIndicators.length)))
    : 0;
  const panelHeights = panelIndicators.map(() => panelHeight);
  const panelTotalH = panelHeights.reduce((total, height) => total + height, 0) + panelGapTotal;
  const plotTop = top + titleH;
  const plotH = Math.max(72, availableH - panelTotalH);
  const firstPanelTop = plotTop + plotH + 8;
  const volumeTop = plotTop + plotH + panelTotalH + (volumeH ? 8 : 0);
  const panelBottom = volumeH ? volumeTop + volumeH : plotTop + plotH + panelTotalH;

  ctx.strokeStyle = "#d9e0e8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top - 10);
  ctx.lineTo(left + plotW, top - 10);
  ctx.stroke();

  ctx.fillStyle = "#17202a";
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(benchmarkSeries.instrument + " Chart", left, top);

  if (!availableCandles.length) {
    ctx.strokeStyle = "#e3e8ef";
    ctx.strokeRect(left, plotTop, plotW, plotH);
    ctx.fillStyle = "#647184";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(benchmarkSeries.status === "loading" ? "Loading " + benchmarkSeries.instrument + " candles..." : benchmarkSeries.message, left + plotW / 2, plotTop + plotH / 2);
    return;
  }

  const prices = availableCandles.flatMap((candle) => [candle.high, candle.low, candle.open, candle.close]);
  if (Number.isFinite(trade.niftyEntry) && trade.niftyEntry > 0) prices.push(trade.niftyEntry);
  if (Number.isFinite(trade.niftyExit) && trade.niftyExit > 0) prices.push(trade.niftyExit);
  priceIndicators.forEach((indicator) => {
    indicator.series.forEach((line) => {
      line.values.forEach((value) => {
        if (Number.isFinite(value)) prices.push(value);
      });
    });
  });
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const pad = Math.max((rawMax - rawMin) * 0.12, 0.5);
  const minPrice = rawMin - pad;
  const maxPrice = rawMax + pad;

  drawPriceGrid(left, plotTop, plotW, plotH, minPrice, maxPrice);
  drawBenchmarkBand(trade, benchmarkSeries, left, slotWidth, plotTop, plotH + (volumeH ? 8 + volumeH : 0));

  benchmarkSeries.candles.forEach((candle, index) => {
    if (!candle) return;
    const x = candleX(index, left, slotWidth);
    const highlighted = index === benchmarkSeries.entryIndex || index === benchmarkSeries.exitIndex;
    drawCandle(candle, x, candleWidth, plotTop, plotH, minPrice, maxPrice, highlighted);
  });

  drawPriceIndicators(priceIndicators, left, slotWidth, plotTop, plotH, minPrice, maxPrice);
  drawBenchmarkTradeOverlay(trade, benchmarkSeries, left, slotWidth, plotTop, plotH, minPrice, maxPrice);
  drawIndicatorPanels(panelIndicators, left, slotWidth, firstPanelTop, panelHeights, plotW);

  if (volumeH) {
    drawBenchmarkVolume(benchmarkSeries.candles, left, slotWidth, candleWidth, volumeTop, volumeH);
  }

  drawTimeLabels(benchmarkSeries.sourceCandles, left, slotWidth, panelBottom + 16);
  state.chartHover.panes.push({
    name: benchmarkSeries.instrument,
    candles: benchmarkSeries.candles,
    left,
    right: left + plotW,
    top: plotTop,
    bottom: panelBottom,
    slotWidth,
    tooltipRows: (index) => benchmarkTooltipRows(trade, benchmarkSeries, index).concat(indicatorTooltipRows(benchmarkIndicatorData, index)),
  });
}

function drawBenchmarkBand(trade, benchmarkSeries, left, slotWidth, top, height) {
  if (benchmarkSeries.entryIndex == null || benchmarkSeries.exitIndex == null) return;
  const startIndex = clamp(Math.min(benchmarkSeries.entryIndex, benchmarkSeries.exitIndex), 0, benchmarkSeries.candles.length - 1);
  const endIndex = clamp(Math.max(benchmarkSeries.entryIndex, benchmarkSeries.exitIndex), 0, benchmarkSeries.candles.length - 1);
  if (endIndex < 0) return;
  const color = trade.profit >= 0 ? "18, 128, 92" : "199, 54, 47";
  const xStart = candleX(startIndex, left, slotWidth) - slotWidth / 2;
  const xEnd = candleX(endIndex, left, slotWidth) + slotWidth / 2;
  ctx.fillStyle = "rgba(" + color + ", 0.06)";
  ctx.fillRect(xStart, top, Math.max(slotWidth, xEnd - xStart), height);
}

function drawBenchmarkTradeOverlay(trade, benchmarkSeries, left, slotWidth, top, height, minPrice, maxPrice) {
  const entryVisible = benchmarkSeries.entryIndex >= 0 && benchmarkSeries.entryIndex < benchmarkSeries.candles.length;
  const exitVisible = benchmarkSeries.exitIndex >= 0 && benchmarkSeries.exitIndex < benchmarkSeries.candles.length;
  const entryX = entryVisible ? candleX(benchmarkSeries.entryIndex, left, slotWidth) : null;
  const exitX = exitVisible ? candleX(benchmarkSeries.exitIndex, left, slotWidth) : null;
  const entryPrice = Number.isFinite(trade.niftyEntry) && trade.niftyEntry > 0 ? trade.niftyEntry : NaN;
  const exitPrice = Number.isFinite(trade.niftyExit) && trade.niftyExit > 0 ? trade.niftyExit : NaN;

  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = "#647184";
  ctx.lineWidth = 1;
  [entryX, exitX].forEach((x) => {
    if (x == null) return;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + height);
    ctx.stroke();
  });
  ctx.restore();

  if (entryVisible && exitVisible && Number.isFinite(entryPrice) && Number.isFinite(exitPrice)) {
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(entryX, yScale(entryPrice, top, height, minPrice, maxPrice));
    ctx.lineTo(exitX, yScale(exitPrice, top, height, minPrice, maxPrice));
    ctx.stroke();
  }

  if (entryVisible && Number.isFinite(entryPrice)) {
    drawMarker(entryX, yScale(entryPrice, top, height, minPrice, maxPrice), "#246bfe", "E", entryPrice, 6, true);
  }
  if (exitVisible && Number.isFinite(exitPrice)) {
    drawMarker(exitX, yScale(exitPrice, top, height, minPrice, maxPrice), "#a65f00", "X", exitPrice, 6, true);
  }
}

function drawBenchmarkVolume(candles, left, slotWidth, candleWidth, top, height) {
  const maxVolume = Math.max(1, ...candles.filter(Boolean).map((candle) => candle.volume || 0));
  ctx.strokeStyle = "#d9e0e8";
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left + slotWidth * candles.length, top);
  ctx.moveTo(left, top + height);
  ctx.lineTo(left + slotWidth * candles.length, top + height);
  ctx.stroke();
  ctx.fillStyle = "#647184";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Vol", left - 8, top + height / 2);
  candles.forEach((candle, index) => {
    if (!candle) return;
    const x = candleX(index, left, slotWidth);
    const volumeBarH = Math.max(1, ((candle.volume || 0) / maxVolume) * height);
    ctx.fillStyle = candle.close >= candle.open ? "#12805c" : "#c7362f";
    ctx.globalAlpha = 0.26;
    ctx.fillRect(x - candleWidth / 2, top + height - volumeBarH, candleWidth, volumeBarH);
    ctx.globalAlpha = 1;
  });
}

function benchmarkTooltipRows(trade, benchmarkSeries, index) {
  const rows = [];
  if (index === benchmarkSeries.entryIndex && Number.isFinite(trade.niftyEntry) && trade.niftyEntry > 0) {
    rows.push('<span class="tooltip-entry">NIFTY Entry #' + escapeHtml(trade.id) + ': ' + escapeHtml(formatPlain(trade.niftyEntry, 2)) + '</span>');
  }
  if (index === benchmarkSeries.exitIndex && Number.isFinite(trade.niftyExit) && trade.niftyExit > 0) {
    rows.push('<span class="tooltip-exit">NIFTY Exit #' + escapeHtml(trade.id) + ': ' + escapeHtml(formatPlain(trade.niftyExit, 2)) + '</span>');
  }
  return rows;
}

function candleDataSourceLabel() {
  return window.location.protocol === "file:" ? "http://localhost:8765" : window.location.origin;
}

function visibleTradeOverlays(activeTrade, series) {
  const instrument = normalizeSymbol(activeTrade.instrument);
  return tradesForInstrument(instrument)
    .map((trade) => {
      const entryFullIndex = nearestCandleIndex(series.allCandles, trade.entryDate.getTime());
      const exitFullIndex = nearestCandleIndex(series.allCandles, trade.exitDate.getTime());
      if (entryFullIndex < 0 || exitFullIndex < 0) return null;

      const entryIndex = entryFullIndex - series.visibleStart;
      const exitIndex = exitFullIndex - series.visibleStart;
      const entryVisible = entryIndex >= 0 && entryIndex < series.candles.length;
      const exitVisible = exitIndex >= 0 && exitIndex < series.candles.length;
      const spansWindow = entryFullIndex <= series.visibleEnd && exitFullIndex >= series.visibleStart;

      if (!entryVisible && !exitVisible && !spansWindow) return null;

      return {
        trade,
        entryIndex,
        exitIndex,
        entryVisible,
        exitVisible,
        spansWindow,
        active: sameTrade(trade, activeTrade),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.active) - Number(b.active));
}

function tradesForInstrument(instrument) {
  const key = [instrument, state.tradeCacheVersion, state.dashboardMode, state.selectedSno].join("|");
  if (state.instrumentTradeCache.has(key)) return state.instrumentTradeCache.get(key);
  const sourceTrades = state.dashboardMode === "filter" ? state.filteredTrades : activeSnoTrades();
  const trades = sourceTrades.filter((trade) => normalizeSymbol(trade.instrument) === instrument);
  state.instrumentTradeCache.set(key, trades);
  return trades;
}

function sameTrade(left, right) {
  return Boolean(left && right) &&
    left.id === right.id &&
    normalizeSymbol(left.instrument) === normalizeSymbol(right.instrument) &&
    left.entryDate.getTime() === right.entryDate.getTime() &&
    left.exitDate.getTime() === right.exitDate.getTime();
}

function drawTradeBands(overlays, left, slotWidth, top, height, candleCount) {
  overlays.forEach((overlay) => {
    if (!overlay.spansWindow) return;
    const color = overlay.trade.profit >= 0 ? "18, 128, 92" : "199, 54, 47";
    const startIndex = clamp(Math.min(overlay.entryIndex, overlay.exitIndex), 0, candleCount - 1);
    const endIndex = clamp(Math.max(overlay.entryIndex, overlay.exitIndex), 0, candleCount - 1);
    const xStart = candleX(startIndex, left, slotWidth) - slotWidth / 2;
    const xEnd = candleX(endIndex, left, slotWidth) + slotWidth / 2;
    ctx.fillStyle = "rgba(" + color + ", " + (overlay.active ? "0.09" : "0.045") + ")";
    ctx.fillRect(xStart, top, Math.max(slotWidth, xEnd - xStart), height);
  });
}

function drawTradeOverlays(overlays, left, slotWidth, top, height, minPrice, maxPrice) {
  const showSecondaryPrices = overlays.length <= 4;
  overlays.forEach((overlay) => {
    const trade = overlay.trade;
    const color = trade.profit >= 0 ? "#12805c" : "#c7362f";
    const connectorColor = overlay.active ? "#111827" : color;
    const lineWidth = overlay.active ? 2.5 : 1.4;
    const markerSize = overlay.active ? 7 : 6;
    const showPrice = overlay.active || showSecondaryPrices;

    if (overlay.entryVisible && overlay.exitVisible) {
      const entryX = candleX(overlay.entryIndex, left, slotWidth);
      const exitX = candleX(overlay.exitIndex, left, slotWidth);
      const entryY = yScale(trade.entryPrice, top, height, minPrice, maxPrice);
      const exitY = yScale(trade.exitPrice, top, height, minPrice, maxPrice);
      ctx.globalAlpha = overlay.active ? 1 : 0.6;
      ctx.strokeStyle = connectorColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(entryX, entryY);
      ctx.lineTo(exitX, exitY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (overlay.entryVisible) {
      drawMarker(
        candleX(overlay.entryIndex, left, slotWidth),
        yScale(trade.entryPrice, top, height, minPrice, maxPrice),
        "#246bfe",
        "E",
        trade.entryPrice,
        markerSize,
        showPrice
      );
    }

    if (overlay.exitVisible) {
      drawMarker(
        candleX(overlay.exitIndex, left, slotWidth),
        yScale(trade.exitPrice, top, height, minPrice, maxPrice),
        "#a65f00",
        "X",
        trade.exitPrice,
        markerSize,
        showPrice
      );
    }
  });
}

function buildIndicatorData(series, options = {}) {
  const activeIndicators = options.indicatorIds || state.activeIndicators;
  if (!activeIndicators.length) return [];
  const instrument = normalizeSymbol(options.instrument || series.instrument);
  const chartCandles = options.chartCandles || series.candles;
  const allCandles = options.allCandles || series.allCandles;
  if (!chartCandles.length) return [];
  const indicatorPeriod = effectiveIndicatorPeriod();
  const chartPeriod = Number(state.candlePeriod) || 5;
  const indicatorCandles = indicatorPeriod === chartPeriod
    ? allCandles
    : candlesForInstrument(instrument, indicatorPeriod);
  if (!indicatorCandles.length) {
    requestServerCandles({ instrument }, indicatorPeriod);
    return [];
  }
  const chartStartTime = chartCandles[0].time.getTime();
  const chartEndTime = chartCandles[chartCandles.length - 1].time.getTime();
  const indicatorEnd = latestCandleIndexAtOrBefore(indicatorCandles, chartEndTime);
  if (indicatorEnd < 0) {
    requestServerCandles({ instrument }, indicatorPeriod);
    return [];
  }
  const indicatorStartAtWindow = latestCandleIndexAtOrBefore(indicatorCandles, chartStartTime);
  const configuredWarmup = Math.max(220, ...activeIndicators.map((id) => {
    const settings = getIndicatorSettings(id);
    if (id === "rs") return (Number(settings.lookback) || 25) + 5;
    if (id === "bb" || id === "sma" || id === "ema" || id === "rsi" || id === "adx") return (Number(settings.length) || 14) * 3;
    if (id === "macd") return (Number(settings.slow) || 26) + (Number(settings.signal) || 9) + 20;
    if (id === "supertrend") return (Number(settings.atrLength) || 10) * 4;
    return 0;
  }));
  const warmup = Math.min(Math.max(0, indicatorStartAtWindow), configuredWarmup);
  const start = Math.max(0, Math.max(0, indicatorStartAtWindow) - warmup);
  const source = indicatorCandles.slice(start, indicatorEnd + 1);
  const alignedIndexes = alignIndicatorSourceIndexes(chartCandles, source);
  const closes = source.map((candle) => candle.close);
  const highs = source.map((candle) => candle.high);
  const lows = source.map((candle) => candle.low);
  const visibleLength = chartCandles.length;

  return activeIndicators.map((id) => {
    const settings = getIndicatorSettings(id);
    if (id === "sma") {
      return { id, period: indicatorPeriod, panel: false, series: [{ label: indicatorLineLabel("SMA " + settings.length, indicatorPeriod), color: settings.color, values: alignIndicatorValues(sma(closes, settings.length), alignedIndexes, visibleLength) }] };
    }
    if (id === "ema") {
      return { id, period: indicatorPeriod, panel: false, series: [{ label: indicatorLineLabel("EMA " + settings.length, indicatorPeriod), color: settings.color, values: alignIndicatorValues(ema(closes, settings.length), alignedIndexes, visibleLength) }] };
    }
    if (id === "bb") {
      const bb = bollingerBands(closes, settings.length, settings.mult);
      return {
        id,
        period: indicatorPeriod,
        panel: false,
        fill: true,
        fillColor: settings.fillColor,
        series: [
          { label: indicatorLineLabel("BB Upper", indicatorPeriod), color: settings.upperColor, values: alignIndicatorValues(bb.upper, alignedIndexes, visibleLength) },
          { label: indicatorLineLabel("BB Mid", indicatorPeriod), color: settings.middleColor, values: alignIndicatorValues(bb.middle, alignedIndexes, visibleLength) },
          { label: indicatorLineLabel("BB Lower", indicatorPeriod), color: settings.lowerColor, values: alignIndicatorValues(bb.lower, alignedIndexes, visibleLength) },
        ],
      };
    }
    if (id === "rsi") {
      return { id, period: indicatorPeriod, panel: true, min: 0, max: 100, guides: [30, 70], series: [{ label: indicatorLineLabel("RSI " + settings.length, indicatorPeriod), color: settings.color, values: alignIndicatorValues(rsi(closes, settings.length), alignedIndexes, visibleLength) }] };
    }
    if (id === "macd") {
      const macd = macdSeries(closes, settings.fast, settings.slow, settings.signal);
      return {
        id,
        period: indicatorPeriod,
        panel: true,
        zero: true,
        positiveColor: settings.positiveColor,
        negativeColor: settings.negativeColor,
        histogram: alignIndicatorValues(macd.histogram, alignedIndexes, visibleLength),
        series: [
          { label: indicatorLineLabel("MACD", indicatorPeriod), color: settings.macdColor, values: alignIndicatorValues(macd.macd, alignedIndexes, visibleLength) },
          { label: indicatorLineLabel("Signal", indicatorPeriod), color: settings.signalColor, values: alignIndicatorValues(macd.signal, alignedIndexes, visibleLength) },
        ],
      };
    }
    if (id === "adx") {
      const adx = adxSeries(highs, lows, closes, settings.length);
      return {
        id,
        period: indicatorPeriod,
        panel: true,
        min: 0,
        max: 100,
        guides: [25],
        series: [
          { label: indicatorLineLabel("ADX " + settings.length, indicatorPeriod), color: settings.adxColor, values: alignIndicatorValues(adx.adx, alignedIndexes, visibleLength) },
          { label: indicatorLineLabel("+DI", indicatorPeriod), color: settings.plusColor, values: alignIndicatorValues(adx.plusDi, alignedIndexes, visibleLength) },
          { label: indicatorLineLabel("-DI", indicatorPeriod), color: settings.minusColor, values: alignIndicatorValues(adx.minusDi, alignedIndexes, visibleLength) },
        ],
      };
    }
    if (id === "supertrend") {
      const trend = supertrendSeries(highs, lows, closes, settings.atrLength, settings.mult);
      return {
        id,
        period: indicatorPeriod,
        panel: false,
        series: [
          { label: indicatorLineLabel("Supertrend Up", indicatorPeriod), color: settings.upColor, trendColor: "Green", values: alignIndicatorValues(trend.up, alignedIndexes, visibleLength) },
          { label: indicatorLineLabel("Supertrend Down", indicatorPeriod), color: settings.downColor, trendColor: "Red", values: alignIndicatorValues(trend.down, alignedIndexes, visibleLength) },
        ],
      };
    }
    if (id === "rs") {
      const benchmark = String(settings.benchmark || "NIFTY50").trim().toUpperCase() || "NIFTY50";
      const benchmarkCandles = candlesForInstrument(benchmark, indicatorPeriod);
      if (!benchmarkCandles.length) {
        requestServerCandles({ instrument: benchmark }, indicatorPeriod);
        return null;
      }
      const values = relativeStrengthValues(source, benchmarkCandles, settings.lookback, settings.anchorMode);
      return {
        id,
        period: indicatorPeriod,
        panel: true,
        guides: [50, 100],
        series: [
          { label: indicatorLineLabel("RS " + benchmark + " " + settings.lookback, indicatorPeriod), color: settings.color, values: alignIndicatorValues(values, alignedIndexes, visibleLength) },
        ],
      };
    }
    return null;
  }).filter(Boolean);
}

function relativeStrengthValues(stockCandles, benchmarkCandles, lookback, anchorMode) {
  const period = Math.max(1, Math.round(Number(lookback) || 25));
  const mode = ["low", "high", "both", "fixed"].includes(anchorMode) ? anchorMode : "low";
  const stockByTime = new Map(stockCandles.map((candle) => [candle.time.getTime(), candle]));
  const benchmarkByTime = new Map(benchmarkCandles.map((candle) => [candle.time.getTime(), candle]));

  return stockCandles.map((stockCandle) => {
    const currentTime = stockCandle.time.getTime();
    const currentBenchmark = benchmarkByTime.get(currentTime);
    if (!currentBenchmark) return null;

    const anchor = relativeStrengthAnchor(benchmarkCandles, currentTime, period, mode);
    if (!anchor) return null;

    const anchorStock = stockByTime.get(anchor.time.getTime());
    if (!anchorStock) return null;

    const anchorStockClose = Number(anchorStock.close);
    const anchorBenchmarkClose = Number(anchor.close);
    const currentStockClose = Number(stockCandle.close);
    const currentBenchmarkClose = Number(currentBenchmark.close);
    if (anchorStockClose <= 0 || anchorBenchmarkClose <= 0 || currentStockClose <= 0 || currentBenchmarkClose <= 0) return null;

    const anchorRatio = anchorStockClose / anchorBenchmarkClose;
    const currentRatio = currentStockClose / currentBenchmarkClose;
    return (currentRatio / anchorRatio) * 100;
  });
}

function relativeStrengthAnchor(benchmarkCandles, currentTime, lookback, mode) {
  const currentIndex = latestCandleIndexAtOrBefore(benchmarkCandles, currentTime);
  if (currentIndex <= 0) return null;
  const exactCurrent = benchmarkCandles[currentIndex].time.getTime() === currentTime;
  const endIndex = exactCurrent ? currentIndex - 1 : currentIndex;
  const startIndex = Math.max(0, endIndex - lookback + 1);
  const eligible = benchmarkCandles.slice(startIndex, endIndex + 1).filter((candle) => Number(candle.close) > 0);
  if (!eligible.length) return null;

  if (mode === "fixed") return eligible[0];
  let low = eligible[0];
  let high = eligible[0];
  eligible.forEach((candle) => {
    if (Number(candle.close) < Number(low.close)) low = candle;
    if (Number(candle.close) > Number(high.close)) high = candle;
  });
  if (mode === "high") return high;
  if (mode === "both") {
    return low.time.getTime() <= high.time.getTime() ? low : high;
  }
  return low;
}

function alignIndicatorSourceIndexes(chartCandles, sourceCandles) {
  const indexes = [];
  let sourceIndex = -1;
  chartCandles.forEach((candle) => {
    const time = candle.time.getTime();
    while (sourceIndex + 1 < sourceCandles.length && sourceCandles[sourceIndex + 1].time.getTime() <= time) {
      sourceIndex += 1;
    }
    indexes.push(sourceIndex);
  });
  return indexes;
}

function alignIndicatorValues(values, sourceIndexes, length) {
  return Array.from({ length }, (_, index) => {
    const sourceIndex = sourceIndexes[index];
    const value = sourceIndex >= 0 ? values[sourceIndex] : null;
    return Number.isFinite(value) ? value : null;
  });
}

function indicatorLineLabel(label, period) {
  return label + " " + formatCandlePeriod(period);
}

function drawPriceIndicators(indicators, left, slotWidth, top, height, minPrice, maxPrice) {
  indicators.forEach((indicator) => {
    if (indicator.fill && indicator.series.length >= 3) {
      fillBetweenLines(indicator.series[0].values, indicator.series[2].values, left, slotWidth, top, height, minPrice, maxPrice, hexToRgba(indicator.fillColor || "#1e90ff", 0.08));
    }
    indicator.series.forEach((line) => drawIndicatorLine(line.values, left, slotWidth, top, height, minPrice, maxPrice, line.color, 1.6));
  });
}

function drawIndicatorPanels(indicators, left, slotWidth, top, panelHeights, width) {
  let panelTop = top;
  indicators.forEach((indicator, panelIndex) => {
    const panelHeight = panelHeights[panelIndex] || 72;
    const allValues = indicator.series.flatMap((line) => line.values).concat(indicator.histogram || []).filter(Number.isFinite);
    const scaleValues = allValues.concat(indicator.guides || [], indicator.zero ? [0] : []).filter(Number.isFinite);
    const rawMin = indicator.min != null ? indicator.min : (scaleValues.length ? Math.min(...scaleValues) : 0);
    const rawMax = indicator.max != null ? indicator.max : (scaleValues.length ? Math.max(...scaleValues) : 0);
    const pad = rawMax === rawMin ? 1 : (rawMax - rawMin) * 0.08;
    const min = indicator.min != null ? indicator.min : rawMin - pad;
    const max = indicator.max != null ? indicator.max : rawMax + pad;

    ctx.strokeStyle = "#e3e8ef";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, panelTop, width, panelHeight);
    ctx.fillStyle = "#647184";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(indicatorLabel(indicator.id), left - 8, panelTop + 4);

    (indicator.guides || []).forEach((guide) => {
      const y = yScale(guide, panelTop, panelHeight, min, max);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = indicator.id === "rs" && guide === 100 ? "#111827" : "#cbd5e1";
      ctx.lineWidth = indicator.id === "rs" && guide === 100 ? 1.2 : 1;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    });

    if (indicator.zero) {
      const y = yScale(0, panelTop, panelHeight, min, max);
      ctx.strokeStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
    }

    if (indicator.histogram) {
      indicator.histogram.forEach((value, index) => {
        if (!Number.isFinite(value)) return;
        const x = candleX(index, left, slotWidth);
        const yZero = yScale(0, panelTop, panelHeight, min, max);
        const yValue = yScale(value, panelTop, panelHeight, min, max);
        ctx.fillStyle = value >= 0 ? hexToRgba(indicator.positiveColor || "#12805c", 0.45) : hexToRgba(indicator.negativeColor || "#c7362f", 0.45);
        ctx.fillRect(x - Math.max(1, slotWidth * 0.3), Math.min(yZero, yValue), Math.max(1, slotWidth * 0.6), Math.max(1, Math.abs(yValue - yZero)));
      });
    }

    indicator.series.forEach((line) => drawIndicatorLine(line.values, left, slotWidth, panelTop, panelHeight, min, max, line.color, 1.4));
    panelTop += panelHeight + 8;
  });
}

function drawIndicatorLine(values, left, slotWidth, top, height, min, max, color, lineWidth) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  let started = false;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      if (started) {
        ctx.stroke();
        ctx.beginPath();
        started = false;
      }
      return;
    }
    const x = candleX(index, left, slotWidth);
    const y = yScale(value, top, height, min, max);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  if (started) ctx.stroke();
}

function fillBetweenLines(upper, lower, left, slotWidth, top, height, min, max, color) {
  ctx.beginPath();
  let started = false;
  upper.forEach((value, index) => {
    if (!Number.isFinite(value) || !Number.isFinite(lower[index])) return;
    const x = candleX(index, left, slotWidth);
    const y = yScale(value, top, height, min, max);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  for (let index = lower.length - 1; index >= 0; index -= 1) {
    if (!Number.isFinite(lower[index]) || !Number.isFinite(upper[index])) continue;
    ctx.lineTo(candleX(index, left, slotWidth), yScale(lower[index], top, height, min, max));
  }
  if (started) {
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function hexToRgba(hex, alpha) {
  const clean = String(hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean;
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value)) return "rgba(30, 144, 255, " + alpha + ")";
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")";
}

function sma(values, period) {
  const result = Array(values.length).fill(null);
  let sum = 0;
  values.forEach((value, index) => {
    sum += value;
    if (index >= period) sum -= values[index - period];
    if (index >= period - 1) result[index] = sum / period;
  });
  return result;
}

function ema(values, period) {
  return emaNullable(values, period);
}

function emaNullable(values, period) {
  const result = Array(values.length).fill(null);
  const alpha = 2 / (period + 1);
  let previous = null;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    previous = previous == null ? value : value * alpha + previous * (1 - alpha);
    result[index] = previous;
  });
  return result;
}

function bollingerBands(values, period, multiplier) {
  const middle = sma(values, period);
  const upper = Array(values.length).fill(null);
  const lower = Array(values.length).fill(null);
  values.forEach((value, index) => {
    if (index < period - 1 || !Number.isFinite(middle[index])) return;
    const window = values.slice(index - period + 1, index + 1);
    const variance = window.reduce((sum, item) => sum + Math.pow(item - middle[index], 2), 0) / period;
    const deviation = Math.sqrt(variance);
    upper[index] = middle[index] + multiplier * deviation;
    lower[index] = middle[index] - multiplier * deviation;
  });
  return { upper, middle, lower };
}

function rsi(values, period) {
  const result = Array(values.length).fill(null);
  let avgGain = 0;
  let avgLoss = 0;
  for (let index = 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if (index <= period) {
      avgGain += gain;
      avgLoss += loss;
      if (index === period) {
        avgGain /= period;
        avgLoss /= period;
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (index >= period) result[index] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function macdSeries(values, fastPeriod, slowPeriod, signalPeriod) {
  const fast = ema(values, fastPeriod);
  const slow = ema(values, slowPeriod);
  const macd = values.map((_, index) => (
    Number.isFinite(fast[index]) && Number.isFinite(slow[index]) ? fast[index] - slow[index] : null
  ));
  const signal = emaNullable(macd, signalPeriod);
  const histogram = macd.map((value, index) => (
    Number.isFinite(value) && Number.isFinite(signal[index]) ? value - signal[index] : null
  ));
  return { macd, signal, histogram };
}

function wilder(values, period) {
  const result = Array(values.length).fill(null);
  let sum = 0;
  values.forEach((value, index) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    if (index < period) {
      sum += safeValue;
      if (index === period - 1) result[index] = sum;
    } else {
      result[index] = result[index - 1] - result[index - 1] / period + safeValue;
    }
  });
  return result;
}

function adxSeries(highs, lows, closes, period) {
  const tr = Array(highs.length).fill(0);
  const plusDm = Array(highs.length).fill(0);
  const minusDm = Array(highs.length).fill(0);
  for (let index = 1; index < highs.length; index += 1) {
    const upMove = highs[index] - highs[index - 1];
    const downMove = lows[index - 1] - lows[index];
    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[index] = Math.max(
      highs[index] - lows[index],
      Math.abs(highs[index] - closes[index - 1]),
      Math.abs(lows[index] - closes[index - 1])
    );
  }
  const smoothTr = wilder(tr, period);
  const smoothPlus = wilder(plusDm, period);
  const smoothMinus = wilder(minusDm, period);
  const plusDi = highs.map((_, index) => smoothTr[index] ? 100 * smoothPlus[index] / smoothTr[index] : null);
  const minusDi = highs.map((_, index) => smoothTr[index] ? 100 * smoothMinus[index] / smoothTr[index] : null);
  const dx = highs.map((_, index) => {
    const sum = (plusDi[index] || 0) + (minusDi[index] || 0);
    return sum ? 100 * Math.abs((plusDi[index] || 0) - (minusDi[index] || 0)) / sum : null;
  });
  const adxRaw = wilder(dx.map((value) => Number.isFinite(value) ? value : 0), period);
  const adx = adxRaw.map((value, index) => index >= period * 2 - 2 && Number.isFinite(value) ? value / period : null);
  return { adx, plusDi, minusDi };
}

function supertrendSeries(highs, lows, closes, period, multiplier) {
  const length = highs.length;
  const tr = Array(length).fill(0);
  for (let index = 0; index < length; index += 1) {
    tr[index] = index === 0
      ? highs[index] - lows[index]
      : Math.max(
        highs[index] - lows[index],
        Math.abs(highs[index] - closes[index - 1]),
        Math.abs(lows[index] - closes[index - 1])
      );
  }

  const atrRaw = wilder(tr, period);
  const finalUpper = Array(length).fill(null);
  const finalLower = Array(length).fill(null);
  const up = Array(length).fill(null);
  const down = Array(length).fill(null);
  let previousTrend = null;

  for (let index = 0; index < length; index += 1) {
    if (!Number.isFinite(atrRaw[index])) continue;
    const atr = atrRaw[index] / period;
    const hl2 = (highs[index] + lows[index]) / 2;
    const basicUpper = hl2 + multiplier * atr;
    const basicLower = hl2 - multiplier * atr;
    const prevUpper = finalUpper[index - 1];
    const prevLower = finalLower[index - 1];
    const prevClose = closes[index - 1];

    finalUpper[index] = !Number.isFinite(prevUpper) || basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper;
    finalLower[index] = !Number.isFinite(prevLower) || basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower;

    if (previousTrend === null) {
      previousTrend = closes[index] >= hl2 ? "up" : "down";
    } else if (previousTrend === "down" && closes[index] > finalUpper[index]) {
      previousTrend = "up";
    } else if (previousTrend === "up" && closes[index] < finalLower[index]) {
      previousTrend = "down";
    }

    if (previousTrend === "up") up[index] = finalLower[index];
    else down[index] = finalUpper[index];
  }

  return { up, down };
}


function candleX(index, left, slotWidth) {
  return left + slotWidth * index + slotWidth / 2;
}

function realCandlesForTrade(trade) {
  if (!state.candles.length) return null;
  const instrument = normalizeSymbol(trade.instrument);
  const instrumentCandles = candlesForInstrument(instrument);

  if (!instrumentCandles.length) return null;

  const entryMs = trade.entryDate.getTime();
  const exitMs = trade.exitDate.getTime();
  const tradeKey = chartWindowKey(trade);
  const windowSize = chartWindowSize(instrumentCandles);
  const fullEntryIndex = nearestCandleIndex(instrumentCandles, entryMs);
  const fullExitIndex = nearestCandleIndex(instrumentCandles, exitMs);
  const maxStart = Math.max(0, instrumentCandles.length - windowSize);
  if (!state.chartWindowStartByTrade.has(tradeKey)) {
    state.chartWindowStartByTrade.set(tradeKey, defaultChartWindowStart(trade, instrumentCandles, windowSize));
  }
  const visibleStart = clamp(state.chartWindowStartByTrade.get(tradeKey), 0, maxStart);
  state.chartWindowStartByTrade.set(tradeKey, visibleStart);
  const candles = instrumentCandles.slice(visibleStart, visibleStart + windowSize);

  if (!candles.length) return null;

  return {
    instrument,
    candles,
    allCandles: instrumentCandles,
    visibleStart,
    visibleEnd: visibleStart + candles.length - 1,
    windowSize,
    maxStart,
    entryIndex: fullEntryIndex - visibleStart,
    exitIndex: fullExitIndex - visibleStart,
    fullEntryIndex,
    fullExitIndex,
  };
}

function candlesForInstrument(instrument, period = state.candlePeriod) {
  const normalizedPeriod = Number(period) || 5;
  const normalizedInstrument = normalizeSymbol(instrument);
  const key = [normalizedInstrument, normalizedPeriod, state.candleCacheVersion].join("|");
  if (state.candleSeriesCache.has(key)) return state.candleSeriesCache.get(key);

  const candles = state.candles
    .filter((candle) => (
      (!candle.instrument || normalizeSymbol(candle.instrument) === normalizedInstrument) &&
      Number(candle.timeframe || normalizedPeriod) === normalizedPeriod
    ))
    .sort((a, b) => a.time - b.time);

  state.candleSeriesCache.set(key, candles);
  return candles;
}

function chartWindowSize(candles) {
  const periodKey = chartWindowSizeKey();
  const defaultSize = defaultChartWindowSize(candles);
  if (!state.chartWindowSizeByPeriod.has(periodKey)) {
    state.chartWindowSizeByPeriod.set(periodKey, defaultSize);
  }
  const size = clamp(
    state.chartWindowSizeByPeriod.get(periodKey),
    minChartWindowSize(candles),
    maxChartWindowSize(candles)
  );
  state.chartWindowSizeByPeriod.set(periodKey, size);
  return size;
}

function chartWindowSizeKey() {
  return String(state.candlePeriod);
}

function defaultChartWindowSize(candles) {
  const candlesPerDay = Math.max(1, Math.round(375 / Math.max(1, Number(state.candlePeriod) || 5)));
  return Math.min(candles.length, Math.max(40, candlesPerDay * 2));
}

function minChartWindowSize(candles) {
  return Math.min(candles.length, 12);
}

function maxChartWindowSize(candles) {
  return Math.min(candles.length, 3000);
}

function defaultChartWindowStart(trade, candles, windowSize) {
  const { fromMs } = tradeSessionWindowMs(trade);
  const sessionStartIndex = nearestCandleIndex(candles, fromMs);
  return clamp(sessionStartIndex, 0, Math.max(0, candles.length - windowSize));
}

function chartWindowKey(trade) {
  return [normalizeSymbol(trade.instrument), state.candlePeriod, trade.id, trade.entryDate.getTime(), trade.exitDate.getTime()].join("|");
}

function setCandlePeriod(value) {
  const nextPeriod = Number(value) || 5;
  const option = Array.from(els.candlePeriodSelect.options).find((item) => Number(item.value) === nextPeriod);
  state.candlePeriod = option ? nextPeriod : 5;
  els.candlePeriodSelect.value = String(state.candlePeriod);
  state.chartWindowStartByTrade.clear();
  state.candleSeriesCache.clear();
}

function effectiveIndicatorPeriod() {
  return state.indicatorPeriod === "same" ? state.candlePeriod : Number(state.indicatorPeriod) || state.candlePeriod;
}

function setIndicatorPeriod(value) {
  if (value === "same") {
    state.indicatorPeriod = "same";
  } else {
    const nextPeriod = Number(value) || state.candlePeriod;
    const option = Array.from(els.indicatorPeriodSelect.options).find((item) => Number(item.value) === nextPeriod);
    state.indicatorPeriod = option ? nextPeriod : "same";
  }
  els.indicatorPeriodSelect.value = String(state.indicatorPeriod);
}

function requestServerCandles(trade, period = state.candlePeriod) {
  const candlePeriod = Number(period) || 5;
  if (state.candleFetchDisabled) {
    return {
      status: "disabled",
      label: "Candle API unavailable",
      message: "The browser could not reach the candle API for this dashboard.",
    };
  }

  const { fromMs, toMs } = fullDataWindowMs();
  const key = candleRequestKey(trade, candlePeriod);
  if (state.candleRequestErrors.has(key)) {
    return {
      status: "error",
      label: "No real candles loaded",
      message: state.candleRequestErrors.get(key),
    };
  }

  if (state.candleRequests.has(key)) {
    return {
      status: "pending",
      label: "Loading " + formatCandlePeriod(candlePeriod) + " candles",
      message: "Reading full " + trade.instrument + " candle history from the candle data store.",
    };
  }

  state.candleRequests.add(key);
  const params = new URLSearchParams({
    symbol: trade.instrument,
    timeframe: String(candlePeriod),
    fromMs: String(fromMs),
    toMs: String(toMs),
  });

  fetch(candleApiUrl(params))
    .then((response) => {
      if (!response.ok) {
        return response.json().catch(() => ({})).then((payload) => {
          throw new Error(payload.error || "Candle request failed");
        });
      }
      return response.json();
    })
    .then((payload) => {
      const records = (payload.candles || []).map((item) => ({
        Instrument: payload.symbol || trade.instrument,
        DateTime: item[0],
        Open: item[1],
        High: item[2],
        Low: item[3],
        Close: item[4],
        Volume: item[5],
        Timeframe: payload.timeframe || candlePeriod,
      }));
      state.candleRequests.delete(key);
      if (!records.length) {
        state.candleRequestErrors.set(key, "The local price store returned zero candles for this instrument/time window.");
      }
      state.candles = state.candles.concat(normalizeCandleData(records, payload.timeframe || candlePeriod));
      invalidateCandleCaches();
      showTrade(state.activeIndex);
    })
    .catch((error) => {
      state.candleRequests.delete(key);
      if (/Failed to fetch|NetworkError|Load failed/i.test(error.message)) {
        state.candleFetchDisabled = true;
      }
      state.candleRequestErrors.set(key, error.message || "Candle request failed.");
      console.warn(error.message);
      showTrade(state.activeIndex);
    });

  return {
    status: "started",
    label: "Loading " + formatCandlePeriod(candlePeriod) + " candles",
    message: "Reading full " + trade.instrument + " candle history from the candle data store.",
  };
}

function candleApiUrl(params) {
  const endpoint = window.location.protocol === "file:"
    ? "http://127.0.0.1:8765/api/candles"
    : "/api/candles";
  return endpoint + "?" + params.toString();
}

function tradeSessionWindowMs(trade) {
  const start = new Date(trade.entryDate);
  const end = new Date(trade.exitDate);
  start.setHours(9, 15, 0, 0);
  end.setHours(15, 30, 0, 0);
  return {
    fromMs: start.getTime(),
    toMs: end.getTime(),
  };
}

function fullDataWindowMs() {
  return {
    fromMs: 0,
    toMs: 4102444800000,
  };
}

function candleRequestKey(trade, period = state.candlePeriod) {
  return [normalizeSymbol(trade.instrument), Number(period) || 5, "full"].join("|");
}

function updateChartWindowControls(trade, series) {
  if (!trade || !series || !series.allCandles.length) {
    disableChartWindowControls("No candle window loaded.");
    return;
  }

  const first = series.candles[0];
  const last = series.candles[series.candles.length - 1];
  const visibleTrades = visibleTradeOverlays(trade, series).length;
  els.contractChart.disabled = series.windowSize <= minChartWindowSize(series.allCandles);
  els.expandChart.disabled = series.windowSize >= maxChartWindowSize(series.allCandles);
  els.chartWindowLabel.textContent = [
    formatShortDateTime(first.time),
    "to",
    formatShortDateTime(last.time),
    "(" + (series.visibleStart + 1) + "-" + (series.visibleEnd + 1) + " / " + series.allCandles.length + ")",
    series.candles.length + " candles",
    visibleTrades + " trade" + (visibleTrades === 1 ? "" : "s") + " visible",
  ].join(" ");
}

function disableChartWindowControls(message) {
  els.chartWindowLabel.textContent = message;
  els.contractChart.disabled = true;
  els.expandChart.disabled = true;
}

function shiftChartWindow(candleDelta) {
  const trade = state.filteredTrades[state.activeIndex];
  if (!trade) return;
  const series = realCandlesForTrade(trade);
  if (!series) return;
  const key = chartWindowKey(trade);
  const nextStart = clamp(series.visibleStart + candleDelta, 0, series.maxStart);
  state.chartWindowStartByTrade.set(key, nextStart);
  showTrade(state.activeIndex);
}

function scheduleChartPan(candleDelta) {
  state.pendingPanDelta += candleDelta;
  if (state.pendingWheelFrame) return;
  state.pendingWheelFrame = scheduleFrame(() => {
    const delta = state.pendingPanDelta;
    state.pendingPanDelta = 0;
    state.pendingWheelFrame = null;
    if (delta) shiftChartWindow(delta);
  });
}

function resizeChartWindow(direction, anchorRatio = 0.5) {
  const trade = state.filteredTrades[state.activeIndex];
  if (!trade) return;
  const series = realCandlesForTrade(trade);
  if (!series) return;

  const oldSize = series.windowSize;
  const factor = direction > 0 ? 1.25 : 0.8;
  const nextSize = clamp(Math.round(oldSize * factor), minChartWindowSize(series.allCandles), maxChartWindowSize(series.allCandles));
  if (nextSize === oldSize) return;

  const boundedAnchorRatio = Math.max(0, Math.min(1, anchorRatio));
  const anchorIndex = series.visibleStart + Math.round((oldSize - 1) * boundedAnchorRatio);
  const nextStart = clamp(
    Math.round(anchorIndex - (nextSize - 1) * boundedAnchorRatio),
    0,
    Math.max(0, series.allCandles.length - nextSize)
  );

  state.chartWindowSizeByPeriod.set(chartWindowSizeKey(), nextSize);
  state.chartWindowStartByTrade.set(chartWindowKey(trade), nextStart);
  showTrade(state.activeIndex);
}

function scheduleFrame(callback) {
  if (window.requestAnimationFrame) return window.requestAnimationFrame(callback);
  return window.setTimeout(callback, 16);
}

function handleCandleHover(event) {
  const hover = state.chartHover;
  const panes = hover && hover.panes ? hover.panes : hover ? [hover] : [];
  if (!panes.length) {
    hideCandleHover();
    return;
  }

  const rect = els.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const pane = panes.find((item) => (
    item.candles &&
    item.candles.length &&
    x >= item.left &&
    x <= item.right &&
    y >= item.top &&
    y <= item.bottom
  ));
  if (!pane) {
    hideCandleHover();
    return;
  }

  const index = clamp(Math.floor((x - pane.left) / pane.slotWidth), 0, pane.candles.length - 1);
  const candle = pane.candles[index];
  if (!candle) {
    hideCandleHover();
    return;
  }
  const rows = pane.tooltipRows
    ? pane.tooltipRows(index)
    : tradeTooltipRows(pane.overlays || [], index).concat(indicatorTooltipRows(pane.indicators || [], index));
  showCandleCrosshair(candleX(index, pane.left, pane.slotWidth), pane);
  showCandleTooltip(event, candle, rows, pane.name);
}

function showCandleCrosshair(x, hover) {
  const canvasRect = els.canvas.getBoundingClientRect();
  const wrapRect = els.canvas.parentElement.getBoundingClientRect();
  els.candleCrosshair.style.display = "block";
  els.candleCrosshair.style.left = (canvasRect.left - wrapRect.left + x) + "px";
  els.candleCrosshair.style.top = (canvasRect.top - wrapRect.top + hover.top) + "px";
  els.candleCrosshair.style.height = Math.max(1, hover.bottom - hover.top) + "px";
}

function showCandleTooltip(event, candle, indicatorRows = [], paneName = "") {
  const rows = [
    "<strong>" + escapeHtml((paneName ? paneName + " | " : "") + formatDate(candle.time)) + "</strong>",
    "O: " + escapeHtml(formatPlain(candle.open, 2)) + " &nbsp; H: " + escapeHtml(formatPlain(candle.high, 2)),
    "L: " + escapeHtml(formatPlain(candle.low, 2)) + " &nbsp; C: " + escapeHtml(formatPlain(candle.close, 2)),
    "Vol: " + escapeHtml(formatNumber(candle.volume || 0, 0)),
  ];
  if (indicatorRows.length) rows.push("<hr>", ...indicatorRows);
  els.candleTooltip.innerHTML = rows.join("<br>");
  els.candleTooltip.style.display = "block";

  const wrapRect = els.canvas.parentElement.getBoundingClientRect();
  const tooltipRect = els.candleTooltip.getBoundingClientRect();
  let left = event.clientX - wrapRect.left + 14;
  let top = event.clientY - wrapRect.top + 14;
  if (left + tooltipRect.width > wrapRect.width - 8) left = event.clientX - wrapRect.left - tooltipRect.width - 14;
  if (top + tooltipRect.height > wrapRect.height - 8) top = event.clientY - wrapRect.top - tooltipRect.height - 14;
  els.candleTooltip.style.left = Math.max(8, left) + "px";
  els.candleTooltip.style.top = Math.max(8, top) + "px";
}

function tradeTooltipRows(overlays, index) {
  return overlays.flatMap((overlay) => {
    const rows = [];
    if (overlay.entryVisible && overlay.entryIndex === index) {
      rows.push('<span class="tooltip-entry">Entry #' + escapeHtml(overlay.trade.id) + ': ' + escapeHtml(formatPlain(overlay.trade.entryPrice, 2)) + '</span>');
    }
    if (overlay.exitVisible && overlay.exitIndex === index) {
      rows.push('<span class="tooltip-exit">Exit #' + escapeHtml(overlay.trade.id) + ': ' + escapeHtml(formatPlain(overlay.trade.exitPrice, 2)) + '</span>');
    }
    return rows;
  });
}

function indicatorTooltipRows(indicators, index) {
  return indicators.flatMap((indicator) => {
    const rows = indicator.series
      .map((line) => {
        const value = line.values[index];
        const label = line.trendColor ? line.label.replace(/^Supertrend (Up|Down)/, "Supertrend $1 " + line.trendColor) : line.label;
        return Number.isFinite(value) ? escapeHtml(label) + ": " + escapeHtml(formatPlain(value, 2)) : "";
      })
      .filter(Boolean);
    if (indicator.histogram && Number.isFinite(indicator.histogram[index])) {
      rows.push(escapeHtml(indicatorLabel(indicator.id) + " Hist") + ": " + escapeHtml(formatPlain(indicator.histogram[index], 2)));
    }
    return rows;
  });
}

function hideCandleHover() {
  els.candleTooltip.style.display = "none";
  els.candleCrosshair.style.display = "none";
}

function nearestCandleIndex(candles, targetMs) {
  if (!candles.length) return -1;
  if (targetMs <= candles[0].time.getTime()) return 0;
  if (targetMs >= candles[candles.length - 1].time.getTime()) return candles.length - 1;

  let left = 0;
  let right = candles.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (candles[mid].time.getTime() < targetMs) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  const previous = Math.max(0, left - 1);
  const previousDistance = Math.abs(candles[previous].time.getTime() - targetMs);
  const currentDistance = Math.abs(candles[left].time.getTime() - targetMs);
  return previousDistance <= currentDistance ? previous : left;
}

function latestCandleIndexAtOrBefore(candles, targetMs) {
  if (!candles.length || targetMs < candles[0].time.getTime()) return -1;
  if (targetMs >= candles[candles.length - 1].time.getTime()) return candles.length - 1;

  let left = 0;
  let right = candles.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (candles[mid].time.getTime() <= targetMs) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  return right;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeSymbol(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function drawPriceGrid(left, top, width, height, minPrice, maxPrice) {
  ctx.strokeStyle = "#e3e8ef";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#647184";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i += 1) {
    const price = minPrice + ((maxPrice - minPrice) / 5) * i;
    const y = yScale(price, top, height, minPrice, maxPrice);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();
    ctx.fillText(formatPlain(price, 2), left - 8, y);
  }
}

function drawCandle(candle, x, width, top, height, minPrice, maxPrice, highlighted = false) {
  const yHigh = yScale(candle.high, top, height, minPrice, maxPrice);
  const yLow = yScale(candle.low, top, height, minPrice, maxPrice);
  const yOpen = yScale(candle.open, top, height, minPrice, maxPrice);
  const yClose = yScale(candle.close, top, height, minPrice, maxPrice);
  const color = candle.close >= candle.open ? "#12805c" : "#c7362f";
  const bodyTop = Math.min(yOpen, yClose);
  const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));

  ctx.strokeStyle = color;
  ctx.lineWidth = highlighted ? 2 : 1.1;
  ctx.beginPath();
  ctx.moveTo(x, yHigh);
  ctx.lineTo(x, yLow);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.globalAlpha = highlighted ? 1 : 0.82;
  ctx.fillRect(x - width / 2, bodyTop, width, bodyHeight);
  ctx.globalAlpha = 1;
}

function drawTimeLabels(candles, left, slotWidth, y) {
  const important = new Set([0, candles.length - 1]);
  ctx.fillStyle = "#647184";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const step = Math.max(1, Math.ceil(candles.length / 10));
  let lastLabelRight = -Infinity;

  candles.forEach((candle, index) => {
    const shouldLabel = important.has(index) || index % step === 0;
    if (shouldLabel) {
      const label = formatShortDateTime(candle.time);
      const x = candleX(index, left, slotWidth);
      const halfWidth = ctx.measureText(label).width / 2;
      if (important.has(index) || x - halfWidth > lastLabelRight + 14) {
        ctx.fillText(label, x, y);
        lastLabelRight = x + halfWidth;
      }
    }
  });
}

function drawProfitLabel(trade, color, x, y) {
  ctx.fillStyle = color;
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("P&L " + formatPlain(trade.profit, 2) + " (" + formatPlain(trade.profitPercent, 2) + "% cost)", x, y);
}

function drawMarker(x, y, color, label, price, size = 7, showPrice = true) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 " + Math.max(8, size + 3) + "px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y);
  if (showPrice) {
    ctx.fillStyle = color;
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.textBaseline = "bottom";
    ctx.fillText(formatPlain(price, 2), x, y - 12);
  }
}

function yScale(price, top, height, minPrice, maxPrice) {
  return top + ((maxPrice - price) / Math.max(0.0001, maxPrice - minPrice)) * height;
}

function fitCanvas(shouldRedraw = true) {
  const ratio = window.devicePixelRatio || 1;
  const rect = els.canvas.getBoundingClientRect();
  els.canvas.width = Math.round(rect.width * ratio);
  els.canvas.height = Math.round(rect.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (shouldRedraw) showTrade(state.activeIndex);
}

function formatHolding(start, end) {
  const minutes = Math.max(0, Math.round((end - start) / 60000));
  const days = minutes / 1440;
  if (Number.isInteger(days)) return days + (days === 1 ? " day" : " days");
  return formatPlain(days, 2) + " days";
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

els.orderBookInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    state.filterErrors = [];
    clearUploadError();
    setChartStatus("Reading OrderBook (" + formatNumber(file.size / 1048576, 1) + " MB). Please wait...");
    await waitForPaint();

    const text = await readFile(file);
    setChartStatus("Parsing OrderBook and preparing dashboard...");
    await waitForPaint();

    const records = parseCsv(text);
    if (!records.length) {
      throw new Error("No CSV rows found. Please check that the first row has headers and the file is comma-separated.");
    }

    updateDynamicFilterFields(Object.keys(records[0]), records);
    const trades = normalizeOrderBook(records).sort((a, b) => a.entryDate - b.entryDate);
    if (!trades.length) {
      throw new Error("Parsed " + formatNumber(records.length, 0) + " rows, but none had valid EntryDate, EntryTime, EntryPrice, ExitDate, ExitTime and ExitPrice values.");
    }

    state.trades = trades;
    invalidateTradeCaches();
    state.orderbookView = "trade";
    state.selectedSno = "All";
    state.activeIndex = 0;
    els.stockSearchInput.value = "";
    state.chartWindowStartByTrade.clear();
    state.chartWindowSizeByPeriod.clear();
    populateSnoSelect();
    populateInstrumentFilter();
    renderFilterRules();
    applyFilters();
  } catch (error) {
    console.error("OrderBook upload failed", error);
    state.trades = [];
    state.filteredTrades = [];
    invalidateTradeCaches();
    populateSnoSelect();
    populateInstrumentFilter();
    renderFilterRules();
    render();
    const reason = error && error.message ? error.message : String(error);
    setUploadError("OrderBook load failed: " + reason);
  }
});

els.overallInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const records = parseCsv(await readFile(file));
  state.overall = records[0] || null;
  const overallPeriod = toNumber(getField(state.overall, ["CandlePeriod", "Candle Period", "interval", "resolution"]));
  if (overallPeriod) setCandlePeriod(overallPeriod);
  setStats();
  showTrade(state.activeIndex);
});

els.instrumentFilter.addEventListener("change", applyFilters);
els.snoSelect.addEventListener("change", () => {
  setSelectedSno(els.snoSelect.value);
});
els.prevSno.addEventListener("click", () => moveSelectedSno(-1));
els.nextSno.addEventListener("click", () => moveSelectedSno(1));
els.orderbookDashboardTab.addEventListener("click", () => switchDashboardMode("orderbook"));
els.filterOrderbookTab.addEventListener("click", () => switchDashboardMode("filter"));
els.addFilterRule.addEventListener("click", () => {
  addFilterRule();
  applyFilters();
});
els.resetFilterRules.addEventListener("click", () => {
  state.filterRules = [];
  state.filterPresetLoaded = true;
  renderFilterRules();
  applyFilters();
});
els.downloadFilteredOrderbook.addEventListener("click", downloadFilteredOrderbook);
els.downloadFormulaOrderbook.addEventListener("click", downloadFormulaOrderbook);
els.filterRules.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-filter]");
  if (!removeButton) return;
  syncFilterRulesFromDom();
  state.filterRules.splice(Number(removeButton.dataset.removeFilter), 1);
  renderFilterRules();
  applyFilters();
});
els.filterRules.addEventListener("change", (event) => {
  const part = event.target.dataset.filterPart;
  if (!part) return;
  syncFilterRulesFromDom();
  if (part === "field" || part === "operator") renderFilterRules();
  applyFilters();
});
els.filterRules.addEventListener("input", (event) => {
  if (!event.target.dataset.filterPart) return;
  scheduleFilterApply();
});
els.candlePeriodSelect.addEventListener("change", () => {
  setCandlePeriod(els.candlePeriodSelect.value);
  showTrade(state.activeIndex);
});
els.indicatorPeriodSelect.addEventListener("change", () => {
  setIndicatorPeriod(els.indicatorPeriodSelect.value);
  showTrade(state.activeIndex);
});
els.searchInput.addEventListener("input", applyFilters);
els.indicatorSelect.addEventListener("change", updateIndicatorControls);
els.addIndicator.addEventListener("click", () => {
  const indicator = els.indicatorSelect.value;
  if (!indicator || state.activeIndicators.includes(indicator) || state.activeIndicators.length >= 3) return;
  getIndicatorSettings(indicator);
  state.activeIndicators = state.activeIndicators.concat(indicator);
  updateIndicatorControls();
  showTrade(state.activeIndex);
});
els.closeIndicatorSettings.addEventListener("click", closeIndicatorSettings);
els.cancelIndicatorSettings.addEventListener("click", closeIndicatorSettings);
els.saveIndicatorSettings.addEventListener("click", saveIndicatorSettings);
els.indicatorModal.addEventListener("click", (event) => {
  if (event.target === els.indicatorModal) closeIndicatorSettings();
});
els.tradeWiseOrderbook.addEventListener("click", () => {
  state.orderbookView = "trade";
  renderTable();
});
els.stocksWiseOrderbook.addEventListener("click", () => {
  state.orderbookView = "stock";
  renderTable();
});
els.stockSearchInput.addEventListener("input", renderTable);
els.prevTrade.addEventListener("click", () => selectTrade(state.activeIndex - 1));
els.nextTrade.addEventListener("click", () => selectTrade(state.activeIndex + 1));
els.contractChart.addEventListener("click", () => resizeChartWindow(-1, 0.5));
els.expandChart.addEventListener("click", () => resizeChartWindow(1, 0.5));
els.canvas.addEventListener("wheel", (event) => {
  const delta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
  if (!delta) return;
  event.preventDefault();
  scheduleChartPan(Math.sign(delta) * Math.max(1, Math.round(Math.abs(delta) / 24)));
}, { passive: false });
els.canvas.addEventListener("mousemove", handleCandleHover);
els.canvas.addEventListener("mouseleave", hideCandleHover);

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") selectTrade(state.activeIndex - 1);
  if (event.key === "ArrowRight") selectTrade(state.activeIndex + 1);
});

window.addEventListener("resize", () => fitCanvas(true));

setStats();
renderInsights();
drawEmpty();
