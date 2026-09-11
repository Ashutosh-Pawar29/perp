import React, { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries, type IChartApi } from "lightweight-charts";
import { API_BASE, WS_URL } from "../hooks/usePerpetua";

interface TradingChartProps {
  market: string;
}

const TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];
const DEFAULT_BAR_SPACING = 9;
const DEFAULT_RIGHT_OFFSET = 12;

export const TradingChart: React.FC<TradingChartProps> = ({ market }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const lastBarRef = useRef<any>(null);
  const [activeInterval, setActiveInterval] = useState<string>("15m");
  const [loading, setLoading] = useState<boolean>(true);
  const [chartError, setChartError] = useState<string | null>(null);

  const handleZoomIn = () => {
    if (!chartRef.current) return;
    const current = chartRef.current.timeScale().options().barSpacing || DEFAULT_BAR_SPACING;
    chartRef.current.timeScale().applyOptions({
      barSpacing: Math.min(30, current * 1.35)
    });
  };

  const handleZoomOut = () => {
    if (!chartRef.current) return;
    const current = chartRef.current.timeScale().options().barSpacing || DEFAULT_BAR_SPACING;
    chartRef.current.timeScale().applyOptions({
      barSpacing: Math.max(1, current * 0.72)
    });
  };

  const handleResetZoom = () => {
    if (!chartRef.current) return;
    chartRef.current.timeScale().applyOptions({
      barSpacing: DEFAULT_BAR_SPACING,
      rightOffset: DEFAULT_RIGHT_OFFSET
    });
    chartRef.current.timeScale().scrollToRealTime();
  };

  // Initialize chart and load historical klines
  useEffect(() => {
    if (!chartContainerRef.current) return;

    let chart: IChartApi | null = null;
    let candleSeries: any = null;
    let ws: WebSocket | null = null;
    let isCancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    try {
      // 1. Create Lightweight Chart with comfortable zoomed-out default spacing
      chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "#090B0E" },
          textColor: "#8F9CAE",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11
        },
        grid: {
          vertLines: { color: "rgba(31, 38, 55, 0.4)" },
          horzLines: { color: "rgba(31, 38, 55, 0.4)" }
        },
        crosshair: {
          vertLine: { color: "#556070", width: 1, style: 3 },
          horzLine: { color: "#556070", width: 1, style: 3 }
        },
        timeScale: {
          borderColor: "#1F2637",
          timeVisible: true,
          secondsVisible: false,
          barSpacing: DEFAULT_BAR_SPACING,
          minBarSpacing: 0.5,
          rightOffset: DEFAULT_RIGHT_OFFSET,
          fixLeftEdge: false,
          fixRightEdge: false
        },
        rightPriceScale: {
          borderColor: "#1F2637",
          autoScale: true
        },
        autoSize: false
      });

      chartRef.current = chart;

      // 2. Add Candlestick Series (Lightweight Charts v5 API)
      candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#00F5A0",
        downColor: "#FF3B69",
        borderUpColor: "#00F5A0",
        borderDownColor: "#FF3B69",
        wickUpColor: "#00F5A0",
        wickDownColor: "#FF3B69"
      });

      seriesRef.current = candleSeries;
      setChartError(null);

      // 3. Setup ResizeObserver for responsive layout
      resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0 || !chart) return;
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      });
      resizeObserver.observe(chartContainerRef.current);
    } catch (e: any) {
      console.error("[TradingChart] Error initializing chart:", e);
      setChartError(e.message || "Failed to initialize chart");
      return;
    }

    // 4. Fetch Historical Data from REST API
    setLoading(true);

    fetch(`${API_BASE}/klines?market=${market}&interval=${activeInterval}&limit=300`)
      .then((res) => res.json())
      .then((data) => {
        if (isCancelled || !chart || !candleSeries) return;
        setLoading(false);

        if (data.candles && data.candles.length > 0) {
          // Deduplicate and sort chronologically ascending
          const timeMap = new Map<number, any>();
          for (const c of data.candles) {
            timeMap.set(c.time, {
              time: Number(c.time),
              open: Number(c.open),
              high: Number(c.high),
              low: Number(c.low),
              close: Number(c.close)
            });
          }
          const sorted = Array.from(timeMap.values()).sort((a, b) => a.time - b.time);
          candleSeries.setData(sorted);
          lastBarRef.current = sorted[sorted.length - 1];

          // Apply clean zoomed-out bar spacing and scroll to latest candle
          chart.timeScale().applyOptions({
            barSpacing: DEFAULT_BAR_SPACING,
            rightOffset: DEFAULT_RIGHT_OFFSET
          });
          chart.timeScale().scrollToRealTime();
        } else {
          // Only if database has ZERO candles: generate a few recent bars for the current session
          const basePrice = market === "BTC" ? 64000 : market === "ETH" ? 3400 : 150;
          const nowSec = Math.floor(Date.now() / 1000);
          const intervalSec =
            activeInterval === "1m"
              ? 60
              : activeInterval === "5m"
              ? 300
              : activeInterval === "15m"
              ? 900
              : activeInterval === "1h"
              ? 3600
              : activeInterval === "4h"
              ? 14400
              : 86400;

          // Keep strictly within recent hours, never days or months into the past
          const barCount = Math.min(20, Math.max(3, Math.floor(7200 / intervalSec)));
          const dummyBars = [];
          let currentPrice = basePrice;

          for (let i = barCount; i >= 0; i--) {
            const time = Math.floor((nowSec - i * intervalSec) / intervalSec) * intervalSec;
            const volatility = currentPrice * 0.002;
            const open = currentPrice;
            const change = (Math.random() - 0.49) * volatility;
            const close = Number((open + change).toFixed(2));
            const high = Number((Math.max(open, close) + Math.random() * volatility * 0.6).toFixed(2));
            const low = Number((Math.min(open, close) - Math.random() * volatility * 0.6).toFixed(2));
            dummyBars.push({ time, open, high, low, close });
            currentPrice = close;
          }

          candleSeries.setData(dummyBars);
          lastBarRef.current = dummyBars[dummyBars.length - 1];

          // Apply clean zoomed-out bar spacing and scroll to latest candle
          chart.timeScale().applyOptions({
            barSpacing: DEFAULT_BAR_SPACING,
            rightOffset: DEFAULT_RIGHT_OFFSET
          });
          chart.timeScale().scrollToRealTime();
        }
      })
      .catch((err) => {
        console.warn("Could not load klines:", err);
        setLoading(false);
      });

    // 5. WebSocket Live Kline & Trade Streaming
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
      ws?.send(JSON.stringify({ type: "subscribe", market: `kline:${market}:1m` }));
      ws?.send(JSON.stringify({ type: "subscribe", market: market }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data.toString());
        if (payload.type === "message") {
          const msg = payload.message;

          // Live trade tick
          if (msg.type === "trade" && seriesRef.current) {
            const tradePrice = Number(msg.price);
            const nowSeconds = Math.floor((msg.timestamp || Date.now()) / 1000);
            const bucketSeconds =
              activeInterval === "1m"
                ? 60
                : activeInterval === "5m"
                ? 300
                : activeInterval === "15m"
                ? 900
                : activeInterval === "1h"
                ? 3600
                : activeInterval === "4h"
                ? 14400
                : 86400;
            const candleTime = Math.floor(nowSeconds / bucketSeconds) * bucketSeconds;

            if (lastBarRef.current && lastBarRef.current.time === candleTime) {
              lastBarRef.current = {
                time: candleTime,
                open: lastBarRef.current.open,
                high: Math.max(lastBarRef.current.high, tradePrice),
                low: Math.min(lastBarRef.current.low, tradePrice),
                close: tradePrice
              };
            } else {
              lastBarRef.current = {
                time: candleTime,
                open: tradePrice,
                high: tradePrice,
                low: tradePrice,
                close: tradePrice
              };
            }

            try {
              seriesRef.current.update(lastBarRef.current);
            } catch {}
          }

          // Dedicated Kline Tick from aggregator
          if (msg.type === "kline" && msg.candle && seriesRef.current) {
            try {
              seriesRef.current.update({
                time: Number(msg.candle.time),
                open: Number(msg.candle.open),
                high: Number(msg.candle.high),
                low: Number(msg.candle.low),
                close: Number(msg.candle.close)
              });
            } catch {}
          }
        }
      } catch {}
    };

    return () => {
      isCancelled = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else if (ws.readyState === WebSocket.CONNECTING) {
          const socket = ws;
          socket.onopen = () => {
            socket.close();
          };
        }
      }
      if (chart) {
        chart.remove();
      }
    };
  }, [market, activeInterval]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-primary)",
        borderRight: "1px solid var(--border-default)",
        position: "relative",
        height: "100%",
        minWidth: 0,
        minHeight: 0
      }}
    >
      {/* Timeframe Bar & Zoom Controls */}
      <div
        style={{
          height: "36px",
          background: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          gap: "4px"
        }}
      >
        <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginRight: "6px" }}>
          INTERVAL
        </span>
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            onClick={() => setActiveInterval(tf)}
            style={{
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 600,
              background: activeInterval === tf ? "var(--bg-elevated)" : "transparent",
              color: activeInterval === tf ? "#FFF" : "var(--text-secondary)",
              border: activeInterval === tf ? "1px solid var(--border-focus)" : "1px solid transparent",
              cursor: "pointer"
            }}
          >
            {tf}
          </button>
        ))}

        {loading && (
          <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "8px" }}>
            Loading...
          </span>
        )}

        {/* Zoom In, Zoom Out, and Reset Buttons */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            onClick={handleZoomOut}
            title="Zoom Out (-)"
            style={{
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              fontSize: "14px",
              fontWeight: 700,
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer"
            }}
          >
            −
          </button>
          <button
            onClick={handleZoomIn}
            title="Zoom In (+)"
            style={{
              width: "24px",
              height: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "4px",
              fontSize: "14px",
              fontWeight: 700,
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer"
            }}
          >
            +
          </button>
          <button
            onClick={handleResetZoom}
            title="Reset to default zoom view"
            style={{
              padding: "3px 8px",
              height: "24px",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: 600,
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer"
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Canvas Chart Area */}
      {chartError ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "8px",
            color: "var(--text-secondary)"
          }}
        >
          <span>Failed to load chart canvas: {chartError}</span>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "6px 12px",
              background: "var(--color-brand)",
              color: "#fff",
              borderRadius: "4px",
              fontSize: "12px",
              cursor: "pointer"
            }}
          >
            Reload Chart
          </button>
        </div>
      ) : (
        <div
          ref={chartContainerRef}
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            minHeight: 0,
            position: "relative"
          }}
        />
      )}
    </div>
  );
};
