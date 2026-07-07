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
```

The Google Drive zip must be shared so Render can download it.

Health check:

```text
/health
```

## Important Free Hosting Limitation

The full price-store zip is about 4 GB compressed and about 14.5 GB extracted. Render free services have an ephemeral filesystem and can spin down, so this setup is acceptable for demos/testing but not ideal for reliable production.

For stable production, use one of these:

- paid Render service with persistent disk
- object storage with smaller per-timeframe/per-symbol files
- Cloudflare Tunnel from a machine that keeps the full price store locally
