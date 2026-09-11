# ⚙️ Perpetua Backend & Matching Engine

The core backend infrastructure for **Perpetua**, containing the Express REST API, in-memory matching engine, asynchronous database pooler, and real-time candlestick aggregator.

## 📦 Directory Overview

- **`engine/`**: High-performance in-memory perpetual futures matching engine driven by Redis Streams (`engine`).
- **`cronjobs/`**:
  - `databasepooler.ts`: Asynchronous consumer worker reading the `to-backend` Redis Stream and persisting orders, fills, and balance updates to PostgreSQL in batches.
  - `candleAggregator.ts`: Ingests real-time fills and builds 1-minute OHLCV candlesticks, persisting to PostgreSQL and broadcasting live tick updates over Redis Pub/Sub.
  - `binancedata.ts`: Oracle price feed streaming index/mark prices to the matching engine.
- **`index.ts`**: Express HTTP REST API server with JWT authentication, order validation, and historical market data query endpoints.

## 🚀 Running Locally

```bash
# In-Memory Matching Engine
cd engine && bun run index.ts

# Database Pooler & Candlestick Aggregator
bun run cronjobs/databasepooler.ts

# Standalone Backend (or use apps/ws which binds both API and WebSockets)
bun run index.ts
```
