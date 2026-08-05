const fs = require("fs");
const http = require("http");
const path = require("path");
const childProcess = require("child_process");
const zlib = require("zlib");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 8765);
const DASHBOARD_ROOT = __dirname;
const DEFAULT_PRICE_STORE_ZIP = "/Users/abdulrashid/Library/CloudStorage/GoogleDrive-abdulrashid987655@gmail.com/My Drive/pricestore_snapshot_full.zip";
const PRICE_STORE_CACHE_ROOT = process.env.PRICE_STORE_CACHE_ROOT || path.join(DASHBOARD_ROOT, ".priceStoreCache");
const PRICE_STORE_ZIP_URL = process.env.PRICE_STORE_ZIP_URL || "";
const PRICE_STORE_ZIP_ID = process.env.PRICE_STORE_ZIP_ID || "";
const PRICE_STORE_SYMBOL_BASE_URL = process.env.PRICE_STORE_SYMBOL_BASE_URL || "";
const PRICE_STORE_SYMBOL_BASE_URL_TEMPLATE = process.env.PRICE_STORE_SYMBOL_BASE_URL_TEMPLATE || "";
const PRICE_STORE_375_DRIVE_FOLDER_ID = process.env.PRICE_STORE_375_DRIVE_FOLDER_ID
  || googleDriveFolderId(process.env.PRICE_STORE_375_DRIVE_FOLDER_URL)
  || "149bAVH0lOopQL8CHyiDcoTogzvFdPPub";
const PRICE_STORE_375_SYMBOL_BASE_URL = process.env.PRICE_STORE_375_SYMBOL_BASE_URL
  || "https://github.com/abdulrashid-valarcapital/orderbook-dashboard/releases/download/candles-375m-atr2-v1/";
const SYMBOL_CANDLE_CACHE_ROOT = process.env.SYMBOL_CANDLE_CACHE_ROOT || path.join(PRICE_STORE_CACHE_ROOT, "symbols");
const PRICE_STORE_ZIP_CACHE = process.env.PRICE_STORE_ZIP_CACHE || path.join(PRICE_STORE_CACHE_ROOT, "pricestore_snapshot_full.zip");
const PRICE_STORE_ZIP = process.env.PRICE_STORE_ZIP
  || (fs.existsSync(DEFAULT_PRICE_STORE_ZIP) ? DEFAULT_PRICE_STORE_ZIP : "")
  || ((PRICE_STORE_ZIP_URL || PRICE_STORE_ZIP_ID) ? PRICE_STORE_ZIP_CACHE : "");
const PRICE_STORE_ROOT = process.env.PRICE_STORE_ROOT || (PRICE_STORE_ZIP ? PRICE_STORE_CACHE_ROOT : "/Users/abdulrashid/Desktop/strategyConfig/common/newPriceStore");
const BAR_ROW_SIZE = 48;
const SERIES_META_ROW_SIZE = 24;
const MARKET_OPEN_MINUTES = 9 * 60 + 15;
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const cache = {
  instrumentIds: null,
  seriesByTimeframe: new Map(),
  symbolCandles: new Map(),
  driveFolderFiles: new Map(),
  driveCsvCandles: new Map(),
};

function normalizeSymbol(value) {
  return String(value || "").trim().toUpperCase();
}

function compactSymbol(value) {
  return normalizeSymbol(value).replace(/[^A-Z0-9]/g, "");
}

function symbolAssetName(symbol, timeframe) {
  return compactSymbol(symbol) + "_" + Number(timeframe || 5) + "m.json.gz";
}

function googleDriveFolderId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/folders\/([^/?#]+)/) || raw.match(/[?&]id=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : raw;
}

function googleDriveDownloadUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) {
    const match = raw.match(/\/file\/d\/([^/]+)/) || raw.match(/[?&]id=([^&]+)/);
    if (match) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(match[1])}`;
    return raw;
  }
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(raw)}`;
}

function ensurePriceStoreZip() {
  if (!PRICE_STORE_ZIP || fs.existsSync(PRICE_STORE_ZIP)) return;

  const sourceUrl = googleDriveDownloadUrl(PRICE_STORE_ZIP_URL || PRICE_STORE_ZIP_ID);
  if (!sourceUrl) return;

  fs.mkdirSync(path.dirname(PRICE_STORE_ZIP), { recursive: true });
  downloadFile(sourceUrl, PRICE_STORE_ZIP);
}

function downloadFile(sourceUrl, targetPath, redirectCount = 0) {
  if (redirectCount > 5) throw new Error(`Too many redirects while downloading ${sourceUrl}`);
  const tempPath = `${targetPath}.download`;
  const cookiePath = `${targetPath}.cookies`;
  try {
    childProcess.execFileSync("curl", ["-L", "--fail", "--cookie-jar", cookiePath, "--output", tempPath, sourceUrl], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    if (!isZipFile(tempPath) && /drive\.google\.com/i.test(sourceUrl)) {
      const page = fs.readFileSync(tempPath, "utf8");
      const formUrl = googleDriveConfirmUrl(page);
      if (formUrl) {
        childProcess.execFileSync("curl", ["-L", "--fail", "--cookie", cookiePath, "--output", tempPath, formUrl], {
          stdio: ["ignore", "ignore", "pipe"],
        });
      } else {
        const confirm = page.match(/confirm=([0-9A-Za-z_-]+)/);
        const uuid = page.match(/uuid=([0-9A-Za-z_-]+)/);
        const fileId = sourceUrl.match(/[?&]id=([^&]+)/);
        if (confirm && fileId) {
          const confirmedUrl = "https://drive.google.com/uc?export=download"
            + "&confirm=" + encodeURIComponent(confirm[1])
            + "&id=" + encodeURIComponent(decodeURIComponent(fileId[1]))
            + (uuid ? "&uuid=" + encodeURIComponent(uuid[1]) : "");
          childProcess.execFileSync("curl", ["-L", "--fail", "--cookie", cookiePath, "--output", tempPath, confirmedUrl], {
            stdio: ["ignore", "ignore", "pipe"],
          });
        }
      }
    }

    if (!isZipFile(tempPath) && /drive\.google\.com|drive\.usercontent\.google\.com/i.test(sourceUrl)) {
      const page = fs.readFileSync(tempPath, "utf8");
      const size = googleDriveWarningSize(page);
      if (size) {
        throw new Error("Google Drive returned a warning page for a " + size + " file instead of the zip. The file is too large for this free Render setup; use a smaller candle bundle or range-capable storage.");
      }
    }

    if (!isZipFile(tempPath)) {
      throw new Error("downloaded file is not a zip. Check Google Drive sharing permissions or use a direct download URL.");
    }

    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
    throw new Error(`Download failed for ${sourceUrl}: ${error.message}`);
  }
  if (fs.existsSync(cookiePath)) fs.unlinkSync(cookiePath);
}

function downloadRawFile(sourceUrl, targetPath) {
  const tempPath = `${targetPath}.download`;
  try {
    childProcess.execFileSync("curl", ["-L", "--fail", "--output", tempPath, sourceUrl], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    fs.renameSync(tempPath, targetPath);
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw new Error(`Download failed for ${sourceUrl}: ${error.message}`);
  }
}

function googleDriveConfirmUrl(page) {
  const action = page.match(/<form[^>]+id=["']download-form["'][^>]+action=["']([^"']+)["']/i);
  if (!action) return "";

  const params = new URLSearchParams();
  const inputs = page.matchAll(/<input[^>]+type=["']hidden["'][^>]*>/gi);
  for (const match of inputs) {
    const tag = match[0];
    const name = tag.match(/\sname=["']([^"']+)["']/i);
    const value = tag.match(/\svalue=["']([^"']*)["']/i);
    if (name) params.set(decodeHtml(name[1]), decodeHtml(value ? value[1] : ""));
  }

  if (!params.has("id")) return "";
  return decodeHtml(action[1]) + "?" + params.toString();
}

function googleDriveWarningSize(page) {
  const match = page.match(/\(([^()]+)\)\s+is too large for Google to scan/i);
  return match ? match[1] : "";
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseDriveFolderFiles(html) {
  const files = new Map();

  const embeddedEntryPattern = /<div class="flip-entry" id="entry-([A-Za-z0-9_-]{20,})"[\s\S]{0,2200}?<div class="flip-entry-title">([^<]+\.csv)<\/div>/g;
  let match;
  while ((match = embeddedEntryPattern.exec(html))) {
    files.set(compactSymbol(match[2].replace(/\.csv$/i, "")), {
      id: match[1],
      name: decodeHtml(match[2]),
    });
  }

  const driveAppPattern = /\[\[null,"([A-Za-z0-9_-]{20,})"\],null,null,null,"text\/csv"[\s\S]{0,2000}?\[\[\["([^"]+\.csv)",null,1\]\]\]/g;
  while ((match = driveAppPattern.exec(html))) {
    files.set(compactSymbol(match[2].replace(/\.csv$/i, "")), {
      id: match[1],
      name: decodeHtml(match[2]),
    });
  }

  return files;
}

function readDriveFolderFiles(folderId) {
  const id = googleDriveFolderId(folderId);
  if (!id) return new Map();
  if (cache.driveFolderFiles.has(id)) return cache.driveFolderFiles.get(id);

  const cacheDir = path.join(SYMBOL_CANDLE_CACHE_ROOT, "drive-folder-" + crypto.createHash("sha1").update(id).digest("hex").slice(0, 10));
  const htmlPath = path.join(cacheDir, "embedded-folder.html");
  if (!fs.existsSync(htmlPath)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    downloadRawFile(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}#list`, htmlPath);
  }

  const files = parseDriveFolderFiles(fs.readFileSync(htmlPath, "utf8"));
  cache.driveFolderFiles.set(id, files);
  return files;
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell.trim());
  return cells;
}

function parseNumber(value) {
  const normalized = String(value || "").replace(/,/g, "").trim();
  if (!normalized) return NaN;
  return Number(normalized);
}

function parseDriveCandleDateMs(value, timeframe = 375) {
  const raw = String(value || "").trim();
  if (!raw) return NaN;

  if (/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      if (Math.abs(numeric) > 1e12) return numeric;
      if (Math.abs(numeric) > 1e9) return numeric * 1000;
    }
  }

  const parts = raw.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!parts) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  let day;
  let month;
  let year;
  const first = Number(parts[1]);
  const second = Number(parts[2]);
  const third = Number(parts[3]);
  if (parts[1].length === 4) {
    year = first;
    month = second;
    day = third;
  } else {
    day = first;
    month = second;
    year = third;
  }
  if (year < 100) year += year >= 70 ? 1900 : 2000;

  const hasTime = parts[4] != null;
  const hour = hasTime ? Number(parts[4]) : (Number(timeframe) === 375 ? 15 : 9);
  const minute = hasTime ? Number(parts[5]) : (Number(timeframe) === 375 ? 30 : 15);
  const secondValue = hasTime ? Number(parts[6] || 0) : 0;
  return Date.UTC(year, month - 1, day, hour, minute, secondValue) - IST_OFFSET_MS;
}

function parseDriveCandleCsv(text, timeframe = 375) {
  const candles = [];
  const lines = String(text || "").split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (cells.length < 6) continue;

    const timestamp = parseDriveCandleDateMs(cells[0], timeframe);
    const open = parseNumber(cells[1]);
    const high = parseNumber(cells[2]);
    const low = parseNumber(cells[3]);
    const close = parseNumber(cells[4]);
    const volume = parseNumber(cells[5]);

    if (![timestamp, open, high, low, close].every(Number.isFinite)) continue;
    candles.push([timestamp, open, high, low, close, Number.isFinite(volume) ? volume : 0]);
  }

  return candles.sort((a, b) => a[0] - b[0]);
}

function isZipFile(filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 4) return false;
  const buffer = Buffer.allocUnsafe(4);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, 4, 0);
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  } finally {
    fs.closeSync(fd);
  }
}

function ensurePriceStoreFile(fileName) {
  const filePath = path.join(PRICE_STORE_ROOT, fileName);
  if (fs.existsSync(filePath)) return filePath;

  if (!PRICE_STORE_ZIP) {
    throw new Error(`Missing price store file ${fileName}. Set PRICE_STORE_ROOT or PRICE_STORE_ZIP.`);
  }

  ensurePriceStoreZip();
  fs.mkdirSync(PRICE_STORE_ROOT, { recursive: true });
  childProcess.execFileSync("unzip", ["-jo", PRICE_STORE_ZIP, `pricestore/${fileName}`, "-d", PRICE_STORE_ROOT], {
    stdio: ["ignore", "ignore", "pipe"],
  });

  if (!fs.existsSync(filePath)) {
    throw new Error(`Could not extract ${fileName} from ${PRICE_STORE_ZIP}`);
  }
  return filePath;
}

function readInstrumentDict() {
  if (cache.instrumentIds) return cache.instrumentIds;

  const file = ensurePriceStoreFile("instrument_dict.dat");
  const data = fs.readFileSync(file);
  let offset = 0;
  const count = data.readUInt32LE(offset);
  offset += 4;
  const result = new Map();

  for (let index = 0; index < count; index += 1) {
    const instrumentId = data.readInt32LE(offset);
    offset += 4;
    const keyLength = data.readUInt16LE(offset);
    offset += 2;
    const key = data.subarray(offset, offset + keyLength).toString("utf8");
    offset += keyLength;
    result.set(normalizeSymbol(key), instrumentId);
    result.set(compactSymbol(key), instrumentId);
  }

  cache.instrumentIds = result;
  return result;
}

function readSeriesMeta(timeframe) {
  const key = String(timeframe);
  if (cache.seriesByTimeframe.has(key)) return cache.seriesByTimeframe.get(key);

  const file = ensurePriceStoreFile(`series_meta_${timeframe}m.dat`);
  const data = fs.readFileSync(file);
  const result = new Map();

  for (let offset = 0; offset + SERIES_META_ROW_SIZE <= data.length; offset += SERIES_META_ROW_SIZE) {
    const instrumentId = data.readInt32LE(offset);
    const rowStart = Number(data.readBigInt64LE(offset + 8));
    const rowCount = Number(data.readBigInt64LE(offset + 16));
    if (rowCount > 0) {
      result.set(instrumentId, { rowStart, rowCount });
    }
  }

  cache.seriesByTimeframe.set(key, result);
  return result;
}

function resolveInstrumentId(symbol) {
  const instruments = readInstrumentDict();
  return instruments.get(normalizeSymbol(symbol)) || instruments.get(compactSymbol(symbol));
}

function readTimestamp(fd, row) {
  const buffer = Buffer.allocUnsafe(8);
  fs.readSync(fd, buffer, 0, 8, row * BAR_ROW_SIZE);
  return Number(buffer.readBigInt64LE(0));
}

function readBar(fd, row) {
  const buffer = Buffer.allocUnsafe(BAR_ROW_SIZE);
  fs.readSync(fd, buffer, 0, BAR_ROW_SIZE, row * BAR_ROW_SIZE);
  return [
    Number(buffer.readBigInt64LE(0)),
    buffer.readDoubleLE(8),
    buffer.readDoubleLE(16),
    buffer.readDoubleLE(24),
    buffer.readDoubleLE(32),
    Number(buffer.readBigInt64LE(40)),
  ];
}

function lowerBound(fd, left, right, targetMs) {
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (readTimestamp(fd, mid) < targetMs) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return left;
}

function upperBound(fd, left, right, targetMs) {
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (readTimestamp(fd, mid) <= targetMs) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return left;
}

function candlesBetween(symbol, timeframe, fromMs, toMs) {
  if (Number(timeframe) === 375) {
    return driveCsvCandlesBetween(symbol, timeframe, fromMs, toMs);
  }

  if (PRICE_STORE_SYMBOL_BASE_URL) {
    return symbolCandlesBetween(symbol, timeframe, fromMs, toMs);
  }

  if (timeframe === 60) {
    const source = candlesBetween(symbol, 5, fromMs, toMs);
    if (source.status !== 200) return source;
    return {
      status: 200,
      payload: {
        symbol,
        timeframe,
        candles: aggregateCandles(source.payload.candles, timeframe),
      },
    };
  }

  const instrumentId = resolveInstrumentId(symbol);
  if (instrumentId == null) {
    return { status: 404, payload: { error: `Instrument not found: ${symbol}` } };
  }

  const series = readSeriesMeta(timeframe);
  const meta = series.get(instrumentId);
  if (!meta) {
    return { status: 404, payload: { error: `No ${timeframe}m candles found for ${symbol}` } };
  }

  const barsPath = ensurePriceStoreFile(`bars_${timeframe}m.dat`);
  const fd = fs.openSync(barsPath, "r");
  try {
    const first = meta.rowStart;
    const lastExclusive = meta.rowStart + meta.rowCount;
    const startRow = lowerBound(fd, first, lastExclusive, fromMs);
    const endRow = upperBound(fd, startRow, lastExclusive, toMs);
    const candles = [];
    for (let row = startRow; row < endRow; row += 1) {
      candles.push(readBar(fd, row));
    }
    return { status: 200, payload: { symbol, timeframe, candles } };
  } finally {
    fs.closeSync(fd);
  }
}

function driveCsvCandlesBetween(symbol, timeframe, fromMs, toMs) {
  const source = readDriveCsvCandles(symbol, timeframe);
  if (!source || !source.length) {
    return {
      status: 404,
      payload: {
        error: `No Drive day candle CSV found for ${symbol}. 375/day candles do not fall back to price-store data.`,
      },
    };
  }

  return {
    status: 200,
    payload: {
      symbol,
      timeframe,
      source: "drive-375-csv",
      candles: source.filter((candle) => candle[0] >= fromMs && candle[0] <= toMs),
    },
  };
}

function readDriveCsvCandles(symbol, timeframe = 375) {
  const normalizedSymbol = compactSymbol(symbol);
  const folderId = googleDriveFolderId(PRICE_STORE_375_DRIVE_FOLDER_ID);
  if (!normalizedSymbol || !folderId || Number(timeframe) !== 375) return null;

  const key = folderId + "|" + normalizedSymbol;
  if (cache.driveCsvCandles.has(key)) return cache.driveCsvCandles.get(key);

  const files = readDriveFolderFiles(folderId);
  const file = files.get(normalizedSymbol);
  if (!file || !file.id) {
    cache.driveCsvCandles.set(key, null);
    return null;
  }

  const cacheDir = path.join(SYMBOL_CANDLE_CACHE_ROOT, "drive-375-csv-" + crypto.createHash("sha1").update(folderId).digest("hex").slice(0, 10));
  const filePath = path.join(cacheDir, normalizedSymbol + ".csv");
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    downloadRawFile(googleDriveDownloadUrl(file.id), filePath);
  }

  const candles = parseDriveCandleCsv(fs.readFileSync(filePath, "utf8"), timeframe);
  cache.driveCsvCandles.set(key, candles);
  return candles;
}

function symbolCandlesBetween(symbol, timeframe, fromMs, toMs) {
  if (timeframe === 1) {
    return { status: 404, payload: { error: "1m candles are not hosted in the lightweight candle store. Select 5m or higher." } };
  }

  const directSource = readRemoteSymbolCandles(symbol, timeframe, false);
  if (directSource && directSource.length) {
    return {
      status: 200,
      payload: {
        symbol,
        timeframe,
        source: "direct-symbol-store",
        candles: directSource.filter((candle) => candle[0] >= fromMs && candle[0] <= toMs),
      },
    };
  }

  if (timeframe === 375) {
    return {
      status: 404,
      payload: {
        error: `No Drive day candle CSV found for ${symbol}. 375/day candles do not fall back to price-store data.`,
      },
    };
  }

  const source = readRemoteSymbolCandles(symbol, 5, true);
  if (!source || !source.length) {
    return { status: 404, payload: { error: `No hosted 5m candles found for ${symbol}` } };
  }

  const filtered = source.filter((candle) => candle[0] >= fromMs && candle[0] <= toMs);
  const candles = timeframe === 5 ? filtered : aggregateCandles(filtered, timeframe);
  return {
    status: 200,
    payload: {
      symbol,
      timeframe,
      candles,
    },
  };
}

function readRemoteSymbolCandles(symbol, timeframe = 5, required = true) {
  const key = compactSymbol(symbol) + "|" + Number(timeframe || 5);
  if (cache.symbolCandles.has(key)) return cache.symbolCandles.get(key);

  const filePath = ensureRemoteSymbolFile(symbol, timeframe, required);
  if (!filePath) {
    cache.symbolCandles.set(key, null);
    return null;
  }
  const candles = JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString("utf8"));
  cache.symbolCandles.set(key, candles);
  return candles;
}

function ensureRemoteSymbolFile(symbol, timeframe = 5, required = true) {
  const fileName = symbolAssetName(symbol, timeframe);
  const base = symbolBaseUrl(timeframe);
  if (!base) {
    if (required) throw new Error(`No hosted candle base URL configured for ${timeframe}m`);
    return "";
  }
  const filePath = path.join(SYMBOL_CANDLE_CACHE_ROOT, symbolCacheDirName(timeframe, base), fileName);
  if (fs.existsSync(filePath)) return filePath;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sourceUrl = base + encodeURIComponent(fileName);
  try {
    downloadRawFile(sourceUrl, filePath);
  } catch (error) {
    if (required) throw error;
    return "";
  }
  return filePath;
}

function symbolCacheDirName(timeframe, baseUrl) {
  const versionHash = crypto.createHash("sha1").update(String(baseUrl || "")).digest("hex").slice(0, 10);
  return String(Number(timeframe || 5)) + "-" + versionHash;
}

function symbolBaseUrl(timeframe) {
  const normalizedTimeframe = Number(timeframe || 5);
  if (normalizedTimeframe === 375 && PRICE_STORE_375_SYMBOL_BASE_URL) {
    return PRICE_STORE_375_SYMBOL_BASE_URL.endsWith("/")
      ? PRICE_STORE_375_SYMBOL_BASE_URL
      : PRICE_STORE_375_SYMBOL_BASE_URL + "/";
  }
  const template = PRICE_STORE_SYMBOL_BASE_URL_TEMPLATE || inferSymbolBaseUrlTemplate();
  if (template) {
    const value = template
      .replace(/\{timeframe\}/g, String(normalizedTimeframe))
      .replace(/\{tf\}/g, String(normalizedTimeframe));
    return value.endsWith("/") ? value : value + "/";
  }
  if (normalizedTimeframe !== 5) return "";
  return PRICE_STORE_SYMBOL_BASE_URL.endsWith("/") ? PRICE_STORE_SYMBOL_BASE_URL : PRICE_STORE_SYMBOL_BASE_URL + "/";
}

function inferSymbolBaseUrlTemplate() {
  if (!PRICE_STORE_SYMBOL_BASE_URL) return "";
  if (/candles-5m-v1\/?$/i.test(PRICE_STORE_SYMBOL_BASE_URL)) {
    return PRICE_STORE_SYMBOL_BASE_URL.replace(/candles-5m-v1\/?$/i, "candles-{timeframe}m-v1/");
  }
  return "";
}

function candleBucketStart(timestampMs, timeframe) {
  if (timeframe === 375) {
    return Math.floor((timestampMs + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS + MARKET_OPEN_MINUTES * 60 * 1000;
  }

  const localMs = timestampMs + IST_OFFSET_MS;
  const dayStartLocal = Math.floor(localMs / DAY_MS) * DAY_MS;
  const minutesSinceDayStart = Math.floor((localMs - dayStartLocal) / 60000);
  const minutesSinceOpen = Math.max(0, minutesSinceDayStart - MARKET_OPEN_MINUTES);
  const bucketMinutes = MARKET_OPEN_MINUTES + Math.floor(minutesSinceOpen / timeframe) * timeframe;
  return dayStartLocal + bucketMinutes * 60 * 1000 - IST_OFFSET_MS;
}

function aggregateCandles(candles, timeframe) {
  const buckets = new Map();

  candles.forEach((candle) => {
    const [timestamp, open, high, low, close, volume] = candle;
    const bucketStart = candleBucketStart(timestamp, timeframe);
    const bucket = buckets.get(bucketStart);

    if (!bucket) {
      buckets.set(bucketStart, [bucketStart, open, high, low, close, volume || 0]);
      return;
    }

    bucket[2] = Math.max(bucket[2], high);
    bucket[3] = Math.min(bucket[3], low);
    bucket[4] = close;
    bucket[5] += volume || 0;
  });

  return Array.from(buckets.values()).sort((a, b) => a[0] - b[0]);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
    };
    const contentType = contentTypes[ext] || "text/plain; charset=utf-8";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        priceStoreRoot: PRICE_STORE_ROOT,
        priceStoreZipConfigured: Boolean(PRICE_STORE_ZIP),
        priceStoreZipUrlConfigured: Boolean(PRICE_STORE_ZIP_URL || PRICE_STORE_ZIP_ID),
        symbolCandleStoreConfigured: Boolean(PRICE_STORE_SYMBOL_BASE_URL),
        drive375FolderConfigured: Boolean(PRICE_STORE_375_DRIVE_FOLDER_ID),
      });
      return;
    }

    if (url.pathname === "/api/candles") {
      const symbol = url.searchParams.get("symbol");
      const timeframe = Number(url.searchParams.get("timeframe") || 5);
      const fromMs = Number(url.searchParams.get("fromMs"));
      const toMs = Number(url.searchParams.get("toMs"));

      if (!symbol || !Number.isFinite(timeframe) || !Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
        sendJson(res, 400, { error: "Required query params: symbol, timeframe, fromMs, toMs" });
        return;
      }

      const result = candlesBetween(symbol, timeframe, fromMs, toMs);
      sendJson(res, result.status, result.payload);
      return;
    }

    const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.resolve(DASHBOARD_ROOT, "." + safePath);
    if (!filePath.startsWith(DASHBOARD_ROOT)) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }
    sendFile(res, filePath);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`OrderBook dashboard: http://localhost:${PORT}`);
  console.log(`Price store: ${PRICE_STORE_ROOT}`);
  if (PRICE_STORE_ZIP) {
    console.log(`Price store zip source: ${PRICE_STORE_ZIP}`);
  }
});
