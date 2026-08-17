# OrderBook Dashboard

Node dashboard for uploading an OrderBook CSV and viewing entry/exit candles from a local or remote price-store snapshot.

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:8765
```

By default, the server uses the local Google Drive zip path if it exists:

```text
/Users/abdulrashid/Library/CloudStorage/GoogleDrive-abdulrashid987655@gmail.com/My Drive/pricestore_snapshot_full.zip
```

It extracts required files on demand into:

```text
.priceStoreCache/
```

## Render Deploy

This repo includes `render.yaml`, so Render can deploy it as a free Node web service.

Render environment variables:

```text
PRICE_STORE_ZIP_ID=<google_drive_file_id>
PRICE_STORE_CACHE_ROOT=/tmp/priceStoreCache
PRICE_STORE_SYMBOL_BASE_URL=https://github.com/abdulrashid-valarcapital/orderbook-dashboard/releases/download/candles-5m-v1/
PRICE_STORE_SYMBOL_BASE_URL_TEMPLATE=https://github.com/abdulrashid-valarcapital/orderbook-dashboard/releases/download/candles-{timeframe}m-v1/
PRICE_STORE_ALL_TIMEFRAMES_ZIP_ID=1v56gV-Lf6cR09Q0hgC3u-yt0JTMSRktC
PRICE_STORE_ALL_TIMEFRAMES=5,15,30,60,375,1875
PRICE_STORE_375_DRIVE_FOLDER_ID=149bAVH0lOopQL8CHyiDcoTogzvFdPPub
PRICE_STORE_375_SYMBOL_BASE_URL=https://github.com/abdulrashid-valarcapital/orderbook-dashboard/releases/download/candles-375m-atr2-v1/
```

`PRICE_STORE_ALL_TIMEFRAMES_ZIP_ID` points at the range-readable Google Drive
price-store zip. The server fetches the zip central directory and extracts only
the required files for selected timeframes (`5,15,30,60,375,1875`) into the
cache, instead of downloading the whole archive. The first request for a large
timeframe such as `5m` can still be slow because the compressed `bars_5m.dat`
member is about 857 MB and expands to about 2.8 GB. The older per-symbol release
URLs and `PRICE_STORE_375_DRIVE_FOLDER_ID` remain as fallbacks for timeframes not
handled by the all-timeframes zip.

Health check:

```text
/health
```

## Important Free Hosting Limitation

The full price-store zip is about 4 GB compressed and about 14.5 GB extracted. Render free services have an ephemeral filesystem and can spin down, so the hosted dashboard uses the lightweight per-symbol 5m release assets instead.

For stable production, use one of these:

- paid Render service with persistent disk
- object storage with smaller per-timeframe/per-symbol files
- Cloudflare Tunnel from a machine that keeps the full price store locally
