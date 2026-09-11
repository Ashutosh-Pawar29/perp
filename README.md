# ⚡ Perpetua (Perps V2) — Institutional-Grade Perpetual Futures Exchange (CLOB)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3-black.svg?style=flat-square&logo=bun)](https://bun.com/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF.svg?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.9-ef4444.svg?style=flat-square&logo=turborepo)](https://turbo.build/repo)
[![Redis](https://img.shields.io/badge/Redis-Streams%20%26%20PubSub-dc382d.svg?style=flat-square&logo=redis)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma%20ORM-336791.svg?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![TradingView](https://img.shields.io/badge/TradingView-Lightweight%20Charts%20v5-2962FF.svg?style=flat-square)](https://tradingview.github.io/lightweight-charts/)

> **Perpetua** is a high-performance, low-latency Central Limit Order Book (CLOB) Perpetual Futures Exchange built with an in-memory matching engine, decoupled Redis Streams message broker, asynchronous PostgreSQL batch persistence, real-time candlestick aggregation, and an institutional trading interface.

---

## 📑 Table of Contents

- [Architectural Overview](#-architectural-overview)
- [System Architecture](#-system-architecture)
- [Core Engine Mechanics](#-core-engine-mechanics)
  - [1. Numeric Order Matching](#1-numeric-order-matching)
  - [2. Margin, Leverage & Collateral](#2-margin-leverage--collateral)
  - [3. Position Accounting & Liquidation Engine](#3-position-accounting--liquidation-engine)
  - [4. Periodic Funding Rate Settlement](#4-periodic-funding-rate-settlement)
  - [5. Snapshotting & Crash Recovery Replay](#5-snapshotting--crash-recovery-replay)
- [Data Pipeline & Candlestick Aggregation](#-data-pipeline--candlestick-aggregation)
- [Monorepo Structure](#-monorepo-structure)
- [WebSocket & Pub/Sub Gateway](#-websocket--pubsub-gateway)
- [REST API Specification](#-rest-api-specification)
- [Database Schema (Prisma)](#-database-schema-prisma)
- [Getting Started & Local Setup](#-getting-started--local-setup)
- [Production & Performance Highlights](#-production--performance-highlights)

---

## 🏛 Architectural Overview

Modern financial exchanges cannot afford synchronous disk database queries on the order execution critical path. Perpetua adopts an **event-driven, decoupled memory architecture** modeled after institutional centralized exchanges (e.g. Binance Futures, Bybit, LMAX Disruptor pattern):

1. **In-Memory Matching Engine (`apps/backend/engine`)**:
   - Executes 100% in memory with zero database blocking.
   - Orders are queued through **Redis Streams** (`engine`), ensuring sequential deterministic ordering and replayability.
   - Supports **Market Orders**, **Limit Orders**, and instant cancellations.
   - Uses strict **Price-Time Priority** with true floating-point numeric sorting for bids (descending) and asks (ascending).

2. **Asynchronous Database Pooler (`apps/backend/cronjobs/databasepooler.ts`)**:
   - Runs as an independent worker process using Redis Consumer Groups (`db-pooler-group`).
   - Reads matched execution streams and batches updates to PostgreSQL via Prisma ORM.
   - Completely decouples the matching engine's sub-millisecond throughput from PostgreSQL disk write latency.

3. **Real-Time Candlestick Aggregator (`apps/backend/cronjobs/candleAggregator.ts`)**:
   - Ingests trade executions off the stream in real time.
   - Dynamically updates the active 1-minute OHLCV bar and periodically flushes closed candles to PostgreSQL.
   - Emits instantaneous tick updates across Redis Pub/Sub to live chart subscribers.
   - Employs optimized SQL time-bucket aggregation (`to_timestamp(floor(extract('epoch' ...)))`) for 3m, 5m, 15m, 1h, 4h, and 1d candles.

4. **Bi-Directional WebSocket Gateway (`apps/ws`)**:
   - Multi-tenant pub/sub multiplexer for market depth, trade prints, and candlestick bars.
   - Authenticated private channels (`user:<userId>`) providing zero-latency execution reports, position changes, and collateral updates.

5. **Professional Trading Terminal (`apps/web`)**:
   - Built on **React 19**, **Vite**, and **TypeScript**.
   - Integrated with **TradingView Lightweight Charts v5** featuring live price lines, responsive crosshairs, volume histograms, and adaptive zoom controls.
   - Live L2 orderbook visualizer with cumulative depth bars.
   - Interactive order entry with real-time margin calculation, leverage slider (up to 50x/100x), and one-click order liquidation/cancellation.

---

## 📐 System Architecture

<div align="center">
  <img src="assets/architecture_diagram.svg" alt="Perpetua Institutional Architecture" width="100%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); margin: 20px 0;" />
</div>

<details>
<summary><b>🔍 View Interactive Mermaid Dataflow Diagram</b></summary>

```mermaid

flowchart TB
    subgraph ClientLayer["🖥️ Frontend & Client Layer"]
        UI["React 19 Trading Terminal\n(TradingView Charts + Orderbook + Positions)"]
    end

    subgraph GatewayLayer["🌐 Gateway & API Layer"]
        HTTP["Express REST API (Port 3003)\n• JWT Authentication\n• Order Validation (Zod)\n• Historical Klines & Depth"]
        WS["WebSocket Server (ws://localhost:3003)\n• Multiplexed Public Feeds\n• Private user:<userId> Channels"]
    end

    subgraph BrokerLayer["⚡ Redis Infrastructure"]
        StreamIn["Stream: 'engine'\n(Incoming Ingress Orders & Actions)"]
        StreamOut["Stream: 'to-backend'\n(Fills, State Updates & Fulfillments)"]
        PubSub["Redis Pub/Sub\n• Market Depth ('SOL', 'ETH', 'BTC')\n• Klines ('kline:SOL:1m')\n• Private User Feeds ('user:...')"]
        KV["Redis Key-Value Cache\n• orderbook:SOL\n• orderbook:ETH"]
    end

    subgraph EngineLayer["⚙️ In-Memory Matching Engine"]
        Engine["Deterministic Matching Engine\n• Numeric Bids/Asks Orderbook\n• Isolated & Cross Margin Accounting\n• Unrealized PnL & Liquidation Watcher\n• Funding Rate Calculator\n• State Snapshot & Replay Unit"]
    end

    subgraph WorkersLayer["🔄 Asynchronous Background Workers"]
        Pooler["Database Pooler Service\n(Consumer Group: db-pooler-group)\n• Batch Orders & Fills Upsert"]
        Candles["Candle Aggregator\n• Real-Time 1m OHLCV Aggregation\n• Live Kline WebSocket Broadcasts"]
        Oracle["Price Oracle Feed (binancedata.ts)\n• Mark / Index Price Updates"]
    end

    subgraph PersistenceLayer["💾 Persistent Storage"]
        PG[("PostgreSQL Database\n(Prisma ORM)\n• Users & Fills\n• Orders & EngineSnapshots\n• 1m Candlestick Tables")]
    end

    %% Interactions
    UI <-->|HTTP REST Requests| HTTP
    UI <-->|Bi-Directional WS| WS
    HTTP -->|XADD 'engine'| StreamIn
    StreamIn -->|XREADGROUP| Engine
    Engine -->|XADD 'to-backend'| StreamOut
    Engine -->|PUBLISH Depth & User Events| PubSub
    Engine -->|SET Snapshot| KV
    PubSub --> WS
    StreamOut -->|XREADGROUP| Pooler
    Pooler -->|Process Executions| Candles
    Candles -->|PUBLISH Live Kline| PubSub
    Candles -->|Upsert OHLCV| PG
    Pooler -->|Batch Upsert Fills/Orders| PG
    Oracle -->|Index Price Feeds| StreamIn
    Engine -.->|Periodic State Snapshots| PG
```
</details>

---

## 🔬 Core Engine Mechanics

### 1. Numeric Order Matching
The orderbook maintains bids and asks structured by price levels:
```typescript
type Bid = {
  availableQty: number;
  openOrders: {
    userId: string;
    qty: number;
    filledQty: number;
    orderId: string;
    createdAt: Date;
    leverage: string;
  }[];
};
```
- **Numeric Price Sorting**: Price keys in JavaScript objects are strings. Perpetua converts keys to standard IEEE 754 floating-point numbers:
  - **Bids**: Sorted descending (`b - a`).
  - **Asks**: Sorted ascending (`a - b`).
- **Crossing Rule**:
  - A Limit **LONG** matches if `limitPrice >= bestAskPrice`.
  - A Limit **SHORT** matches if `limitPrice <= bestBidPrice`.
  - **Market Orders** match aggressively across resting levels until filled or cancelled upon liquidity exhaustion.

### 2. Margin, Leverage & Collateral
- **Initial Margin (IM)**: Collateral required to open a position:
  $$\text{Initial Margin} = \frac{\text{Quantity} \times \text{Price}}{\text{Leverage}}$$
- When an order is placed, initial margin is deducted from the user's `available` balance and transferred into `locked` margin.
- If an order is cancelled, unexecuted margin is immediately unlocked and returned to `available`.

### 3. Position Accounting & Liquidation Engine
Positions track entry price, margin, quantity, and unrealized profit & loss:
$$\text{Unrealized PnL (LONG)} = (\text{Mark Price} - \text{Entry Price}) \times \text{Quantity}$$
$$\text{Unrealized PnL (SHORT)} = (\text{Entry Price} - \text{Mark Price}) \times \text{Quantity}$$

**Liquidation Price Formulation**:
- **LONG Positions**:
  $$P_{liq} = P_{entry} - \left( \frac{\text{Margin}}{\text{Quantity}} \times 0.9 \right)$$
- **SHORT Positions**:
  $$P_{liq} = P_{entry} + \left( \frac{\text{Margin}}{\text{Quantity}} \times 0.9 \right)$$

When mark price breaches $P_{liq}$, the liquidation engine triggers:
1. Liquidates the user's position at current market price.
2. Deducts bankruptcy loss or sends remnant margin to the exchange `insuranceFund`.
3. Broadcasts liquidation alert through the private WebSocket channel.

### 4. Periodic Funding Rate Settlement
To anchor perpetual contracts to spot index prices, the engine calculates funding rates periodically:
$$\text{Premium Index} = \frac{\text{Last Traded Price} - \text{Index Price}}{\text{Index Price}}$$
$$\text{Funding Payment} = \text{Position Size} \times \text{Mark Price} \times \text{Funding Rate}$$
- If **Funding Rate > 0**: Longs pay Shorts.
- If **Funding Rate < 0**: Shorts pay Longs.

### 5. Snapshotting & Crash Recovery Replay
Perpetua provides deterministic recovery:
1. **Periodic Snapshots**: The engine writes serialized memory state (`balances`, `positions`, `orderbooks`, `lastProcessedStreamId`) to PostgreSQL table `EngineSnapshot`.
2. **Cold Start Replay**: On restart, the engine loads the latest snapshot from PostgreSQL, initializes memory, and replays all events from `lastProcessedStreamId` forward from the Redis stream `engine` in replay mode (`isReplay = true`), skipping duplicate database writes.

---

## 📊 Data Pipeline & Candlestick Aggregation

```
Trade Execution (Engine) 
      │
      ▼
Redis Stream: to-backend 
      │
      ▼
Database Pooler (db-pooler-worker)
      │
      ├───────────────────────────────┐
      ▼                               ▼
Batch Postgres Writes         CandleAggregator.processTrade()
(Orders & Fill History)               │
                                      ├── Ingest into 1m OHLCV Map
                                      ├── Publish Real-Time Kline to Redis Pub/Sub
                                      │   ("kline:SOL:1m")
                                      ▼
                              Periodic DB Flush (Candle1m)
```

### Dynamic Multi-Timeframe Rollups
Higher timeframes (`3m`, `5m`, `15m`, `1h`, `4h`, `1d`) are dynamically aggregated on-the-fly via PostgreSQL time bucketing:
```sql
SELECT 
    to_timestamp(floor(extract('epoch' from "timestamp") / :bucketSeconds) * :bucketSeconds) AS "bucket",
    (ARRAY_AGG("open" ORDER BY "timestamp" ASC))[1] AS "open",
    MAX("high") AS "high",
    MIN("low") AS "low",
    (ARRAY_AGG("close" ORDER BY "timestamp" DESC))[1] AS "close",
    SUM("volume") AS "volume"
FROM "Candle1m"
WHERE "market" = :market
GROUP BY "bucket"
ORDER BY "bucket" DESC
LIMIT :limit;
```

---

## 📁 Monorepo Structure

```
perps_v2/
├── apps/
│   ├── backend/                     # Express REST API & Engine Orchestrator
│   │   ├── cronjobs/
│   │   │   ├── binancedata.ts       # External Oracle index price ingestion
│   │   │   ├── candleAggregator.ts  # 1m OHLCV streaming candlestick builder
│   │   │   └── databasepooler.ts    # Async Redis-to-Postgres batch persistence
│   │   ├── engine/                  # Core in-memory matching engine
│   │   │   ├── fillorder.ts         # Maker/taker order execution logic
│   │   │   ├── funding.ts           # Periodic funding rate computation
│   │   │   ├── handleusersfilledqty.ts # Margin & liquidation accounting
│   │   │   ├── snapshot.ts          # State snapshotting & recovery
│   │   │   └── index.ts             # Engine Redis Stream consumer loop
│   │   ├── loopingfunction.ts       # Backend-to-Engine RPC correlation helper
│   │   └── index.ts                 # Express REST endpoints & middleware
│   ├── web/                         # Modern React 19 Frontend Terminal
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── AuthModal.tsx    # Sign in / Register modal
│   │   │   │   ├── DepositModal.tsx # Collateral on-ramp/off-ramp modal
│   │   │   │   ├── MarketHeader.tsx # 24h ticker, mark price, funding countdown
│   │   │   │   ├── Navbar.tsx       # Brand header, wallet status & equity
│   │   │   │   ├── OrderEntry.tsx   # Leverage slider, Long/Short limit & market
│   │   │   │   ├── Orderbook.tsx    # Depth ladder with real-time updates
│   │   │   │   ├── PositionsDock.tsx# Live positions, open orders & fills
│   │   │   │   └── TradingChart.tsx # Lightweight Charts integration
│   │   │   ├── hooks/
│   │   │   │   └── usePerpetua.ts   # Core state hook & WebSocket multiplexer
│   │   │   ├── App.tsx              # Main layout & docking structure
│   │   │   └── globals.css          # Dark-mode glassmorphic theme
│   │   └── vite.config.ts           # Vite build & dev server config
│   ├── ws/                          # Standalone WebSocket Gateway
│   │   ├── index.ts                 # WebSocket server & connection router
│   │   └── sub.ts                   # PubSub subscription manager
│   └── docs/                        # Architecture & documentation app
├── packages/
│   ├── commons/                     # Shared TypeScript interfaces & types
│   ├── db/                          # Prisma ORM schema & client
│   │   └── prisma/schema.prisma     # PostgreSQL relational schema
│   ├── eslint-config/               # Shared ESLint configuration
│   ├── typescript-config/           # Base tsconfig presets
│   └── zodValidation/               # Request validation schemas
├── package.json                     # Monorepo root scripts & dependencies
├── turbo.json                       # Turborepo task pipeline
└── README.md                        # Project documentation
```

---

## 📡 WebSocket & Pub/Sub Gateway

Clients connect to `ws://localhost:3003` to stream market and private account updates.

### 1. Client Authentication (Private Stream)
Send an `auth` message with your JWT token:
```json
{
  "type": "auth",
  "token": "<JWT_TOKEN>"
}
```
**Subscribes to**: `user:<userId>`
- **Live balance changes**: `{ "type": "user_balance", "available": "1540.20", "locked": "200.00" }`
- **Execution fills**: Real-time maker/taker notifications and margin updates.

### 2. Market Data Subscriptions (Public Streams)
```json
{
  "type": "subscribe",
  "market": "SOL"
}
```
- **Orderbook Depth**: `{ "type": "orderbook", "market": "SOL", "bids": {...}, "asks": {...}, "lastTradedPrice": 150.25 }`

```json
{
  "type": "subscribe",
  "market": "kline:SOL:1m"
}
```
- **Live Candlestick Bar**:
  ```json
  {
    "type": "kline",
    "market": "SOL",
    "interval": "1m",
    "candle": {
      "time": 1726084800,
      "open": 150.10,
      "high": 150.45,
      "low": 150.05,
      "close": 150.35,
      "volume": 124.5
    }
  }
  ```

---

## 🔌 REST API Specification

### Authentication & Account
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/signup` | Register new user account | ❌ No |
| `POST` | `/signin` | Login and obtain JWT token | ❌ No |
| `POST` | `/onramp` | Deposit mock collateral into account | ✅ Bearer |
| `POST` | `/offramp` | Withdraw available collateral | ✅ Bearer |
| `GET` | `/equity/available` | Get user available & locked equity | ✅ Bearer |

### Trading & Orders
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/order` | Place a Market or Limit order (Long/Short) | ✅ Bearer |
| `DELETE` | `/order` | Cancel a specific resting limit order | ✅ Bearer |
| `DELETE` | `/orders/all/:marketId` | Cancel all open orders for a market | ✅ Bearer |
| `GET` | `/orders/open` | Retrieve all active orders for current user | ✅ Bearer |
| `GET` | `/orders/:marketId` | Retrieve all historical orders for market | ✅ Bearer |

### Positions & Market Data
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/markets` | List supported perpetual markets (`SOL`, `ETH`, `BTC`) | ❌ No |
| `GET` | `/orderbook/:marketId` | Fetch current orderbook snapshot (L2 depth) | ❌ No |
| `GET` | `/klines` | Historical OHLCV candlesticks (`?market=SOL&interval=1m&limit=100`) | ❌ No |
| `GET` | `/positions/all` | List open positions with liquidation & PnL | ✅ Bearer |
| `GET` | `/positions/closed/:marketId` | Closed position logs and trade fills | ✅ Bearer |

### Administrative & Testing
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/funding/trigger/:marketId` | Trigger manual funding settlement | ✅ Bearer |
| `POST` | `/snapshot/trigger` | Trigger manual engine state snapshot | ✅ Bearer |

---

## 🗄 Database Schema (Prisma)

```prisma
model Users {
  id              String   @id @default(uuid())
  username        String
  password        String
  orders          Orders[]
  makerFills      Fill[]   @relation("makerfills")
  takerFills      Fill[]   @relation("takerfills")
}

model Orders {
  id              String    @id @default(uuid())
  userid          String
  marketid        String
  orderType       Ordertype // Market | Limit
  side            Side      // LONG | SHORT
  price           String
  slippage        String?
  qty             String
  initialMargin   String
  filledQty       String
  status          Status    // open | filled | cancelled | partiallyFilled
  CreatedAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Fill {
  id              String    @id @default(uuid())
  makerId         String
  takerId         String
  qty             String
  price           String
  makerOrderId    String
  takerOrderId    String
  marketId        String
  createdAt       DateTime  @default(now())
}

model EngineSnapshot {
  id           String   @id @default(uuid())
  lastStreamId String
  data         String   // Serialized JSON state of books, balances & positions
  createdAt    DateTime @default(now())
}

model Candle1m {
  id        String   @id @default(uuid())
  market    String
  timestamp DateTime
  open      Float
  high      Float
  low       Float
  close     Float
  volume    Float

  @@unique([market, timestamp])
  @@index([market, timestamp])
}
```

---

## 🚀 Getting Started & Local Setup

### Prerequisites
- [Bun](https://bun.com) (v1.1.0 or higher recommended)
- [PostgreSQL](https://www.postgresql.org/) (Running on `localhost:5432` or hosted instance)
- [Redis](https://redis.io/) (Running on `localhost:6379`)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/<your-username>/perps_v2.git
cd perps_v2
bun install
```

### 2. Configure Environment Variables
Create a `.env` file inside `packages/db/.env` and `apps/backend/.env`:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/perps_v2?schema=public"
JWT_SECRET="YOUR_SUPER_SECURE_JWT_SECRET"
PORT=3003
```

### 3. Initialize the Database
```bash
cd packages/db
bunx prisma generate
bunx prisma db push
cd ../..
```

### 4. Running the Complete System
To run the full stack, open separate terminal windows for each dedicated service:

#### Terminal 1: In-Memory Matching Engine
```bash
cd apps/backend/engine
bun run index.ts
```

#### Terminal 2: Database Pooler & Candlestick Aggregator
```bash
cd apps/backend
bun run cronjobs/databasepooler.ts
```

#### Terminal 3: API Gateway & WebSocket Server
```bash
cd apps/ws
bun run index.ts
```

#### Terminal 4: Frontend Trading Terminal
```bash
cd apps/web
bun run dev
```
Open **[http://localhost:3001](http://localhost:3001)** in your browser to start trading!

---

## 🛡 Production & Performance Highlights

- **Sub-Millisecond Engine Latency**: Zero blocking database operations in the matching loop.
- **Strict Numeric Price Sorting**: Prevents string-sorting bugs (`"148"` vs `"150"`) ensuring proper limit price matching.
- **Asynchronous Persistence**: Database write spikes never degrade live order matching.
- **Zero-Data-Loss Architecture**: Redis stream event logs allow exact state reconstitution upon cold restarts.
- **TradingView Integration**: Clean, responsive candlestick charting with automatic time-scale fitting and tick-level updates.

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for details.
