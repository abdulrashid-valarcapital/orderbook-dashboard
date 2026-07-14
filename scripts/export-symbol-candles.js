const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BAR_ROW_SIZE = 48;
const SERIES_META_ROW_SIZE = 24;

const timeframe = Number(process.argv[2] || 15);
const priceStoreRoot = process.argv[3];
const outputRoot = process.argv[4];

if (!Number.isFinite(timeframe) || !priceStoreRoot || !outputRoot) {
  console.error("Usage: node scripts/export-symbol-candles.js <timeframe> <priceStoreRoot> <outputRoot>");
  process.exit(1);
}

function compactSymbol(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function readInstrumentDict(filePath) {
  const data = fs.readFileSync(filePath);
  let offset = 0;
  const count = data.readUInt32LE(offset);
  offset += 4;
  const instruments = new Map();

  for (let index = 0; index < count; index += 1) {
    const instrumentId = data.readInt32LE(offset);
    offset += 4;
    const keyLength = data.readUInt16LE(offset);
    offset += 2;
    const key = data.subarray(offset, offset + keyLength).toString("utf8");
    offset += keyLength;
    if (!instruments.has(instrumentId)) instruments.set(instrumentId, key);
  }

  return instruments;
}

function readSeriesMeta(filePath) {
  const data = fs.readFileSync(filePath);
  const result = new Map();
  for (let offset = 0; offset + SERIES_META_ROW_SIZE <= data.length; offset += SERIES_META_ROW_SIZE) {
    const instrumentId = data.readInt32LE(offset);
    const rowStart = Number(data.readBigInt64LE(offset + 8));
    const rowCount = Number(data.readBigInt64LE(offset + 16));
    if (rowCount > 0) result.set(instrumentId, { rowStart, rowCount });
  }
  return result;
}

function readBars(fd, rowStart, rowCount) {
  const candles = [];
  const buffer = Buffer.allocUnsafe(BAR_ROW_SIZE);
  for (let index = 0; index < rowCount; index += 1) {
    fs.readSync(fd, buffer, 0, BAR_ROW_SIZE, (rowStart + index) * BAR_ROW_SIZE);
    candles.push([
      Number(buffer.readBigInt64LE(0)),
      buffer.readDoubleLE(8),
      buffer.readDoubleLE(16),
      buffer.readDoubleLE(24),
      buffer.readDoubleLE(32),
      Number(buffer.readBigInt64LE(40)),
    ]);
  }
  return candles;
}

fs.mkdirSync(outputRoot, { recursive: true });

const instruments = readInstrumentDict(path.join(priceStoreRoot, "instrument_dict.dat"));
const series = readSeriesMeta(path.join(priceStoreRoot, `series_meta_${timeframe}m.dat`));
const barsPath = path.join(priceStoreRoot, `bars_${timeframe}m.dat`);
const fd = fs.openSync(barsPath, "r");

let exported = 0;
try {
  for (const [instrumentId, meta] of series.entries()) {
    const symbol = instruments.get(instrumentId);
    if (!symbol) continue;
    const compact = compactSymbol(symbol);
    if (!compact) continue;
    const candles = readBars(fd, meta.rowStart, meta.rowCount);
    if (!candles.length) continue;
    const outputPath = path.join(outputRoot, `${compact}_${timeframe}m.json.gz`);
    fs.writeFileSync(outputPath, zlib.gzipSync(JSON.stringify(candles), { level: 9 }));
    exported += 1;
  }
} finally {
  fs.closeSync(fd);
}

console.log(`Exported ${exported} ${timeframe}m symbol candle files to ${outputRoot}`);
