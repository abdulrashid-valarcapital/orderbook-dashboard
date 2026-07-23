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
PRICE_STORE_375_SYMBOL_BASE_URL=https://github.com/abdulrashid-valarcapital/orderbook-dashboard/releases/download/candles-375m-drive-v1/
```

For hosted demos, prefer `PRICE_STORE_SYMBOL_BASE_URL_TEMPLATE`. It points at
per-symbol candle files for the selected timeframe, so the server can download
direct timeframe assets instead of aggregating from 5m. `PRICE_STORE_375_SYMBOL_BASE_URL`
is used for `Candle = 1 Day`/`375`, so daily candles can come from the Drive CSV
export release. If a direct timeframe asset is missing, the server falls back to
the 5m symbol store and aggregates from there. The full Google Drive zip can
remain configured as a fallback, but it is too large for free hosting.

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
