# 🖥️ Perpetua Web — Trading Interface

The frontend trading terminal for **Perpetua**, built with **React 19**, **Vite**, **TypeScript**, and **TradingView Lightweight Charts v5**.

## ✨ Features
- **TradingView Lightweight Charts v5**: High-performance multi-timeframe candlestick charting with volume bars, live price crosshairs, and custom responsive zooming.
- **Live L2 Orderbook**: Real-time bids and asks depth ladder with visual volume bars and sub-second WebSocket updates.
- **Order Placement**: Market and Limit orders, Long and Short execution, configurable leverage slider (up to 50x / 100x), and real-time margin requirement calculator.
- **Positions Dock**: Live open positions tracking unrealized PnL, entry price, liquidation price, margin allocation, and one-click market close.
- **Open & Historical Orders**: Live view of resting limit orders with one-click cancellation.
- **Deposit & Wallet**: Collateral on-ramp/off-ramp simulation and live balance updates.

## 🚀 Running Locally

```bash
# From repository root
bun --filter web dev

# Or directly in this directory
bun run dev
```

The web app will run at `http://localhost:3001`.
