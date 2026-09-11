"use client";

import React, { useState } from "react";
import type { OrderbookLevel, Trade } from "../hooks/usePerpetua";

interface OrderbookProps {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  recentTrades: Trade[];
  lastTradedPrice: number;
  onSelectPrice?: (price: number) => void;
}

export const Orderbook: React.FC<OrderbookProps> = ({
  bids,
  asks,
  recentTrades,
  lastTradedPrice,
  onSelectPrice
}) => {
  const [activeTab, setActiveTab] = useState<"book" | "trades">("book");

  const highestBid = bids.length > 0 ? bids[0].price : 0;
  const lowestAsk = asks.length > 0 ? asks[0].price : 0;
  const spread = (lowestAsk > 0 && highestBid > 0) ? Math.max(0, Number((lowestAsk - highestBid).toFixed(2))) : 0;

  return (
    <div style={{
      width: "280px",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-secondary)",
      borderRight: "1px solid var(--border-default)",
      height: "100%",
      fontSize: "11px",
      userSelect: "none"
    }}>
      {/* Tabs */}
      <div style={{
        height: "36px",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        padding: "0 8px"
      }}>
        <button
          onClick={() => setActiveTab("book")}
          style={{
            flex: 1,
            height: "100%",
            borderBottom: activeTab === "book" ? "2px solid var(--color-green)" : "2px solid transparent",
            color: activeTab === "book" ? "#FFF" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: "12px"
          }}
        >
          Orderbook
        </button>
        <button
          onClick={() => setActiveTab("trades")}
          style={{
            flex: 1,
            height: "100%",
            borderBottom: activeTab === "trades" ? "2px solid var(--color-green)" : "2px solid transparent",
            color: activeTab === "trades" ? "#FFF" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: "12px"
          }}
        >
          Trades
        </button>
      </div>

      {activeTab === "book" ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            padding: "6px 12px",
            color: "var(--text-muted)",
            fontWeight: 600,
            fontSize: "10px",
            textTransform: "uppercase"
          }}>
            <span>Price (USDT)</span>
            <span style={{ textAlign: "right" }}>Size</span>
            <span style={{ textAlign: "right" }}>Total</span>
          </div>

          {/* Asks (Red) - Displayed from highest price down to lowest price near spread */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", overflowY: "hidden" }}>
            {asks.length === 0 ? (
              <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: "11px" }}>
                No open asks
              </div>
            ) : (
              [...asks].reverse().map((ask, idx) => (
                <div
                  key={`ask-${idx}`}
                  onClick={() => onSelectPrice && onSelectPrice(ask.price)}
                  style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    padding: "2.5px 12px",
                    cursor: "pointer",
                    lineHeight: 1.4
                  }}
                >
                  {/* Visual Depth Fill Bar */}
                  <div style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: `${ask.percent}%`,
                    background: "rgba(255, 59, 105, 0.12)",
                    pointerEvents: "none"
                  }} />
                  <span className="font-mono text-red" style={{ fontWeight: 600, position: "relative" }}>
                    {ask.price.toFixed(2)}
                  </span>
                  <span className="font-mono" style={{ textAlign: "right", color: "var(--text-primary)", position: "relative" }}>
                    {ask.qty.toFixed(2)}
                  </span>
                  <span className="font-mono text-muted" style={{ textAlign: "right", position: "relative" }}>
                    {ask.total.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Middle Spread Bar */}
          <div style={{
            padding: "8px 12px",
            background: "var(--bg-elevated)",
            borderTop: "1px solid var(--border-subtle)",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span className="font-mono" style={{ fontSize: "14px", fontWeight: 800, color: "var(--color-green)" }}>
                ${lastTradedPrice.toFixed(2)}
              </span>
              <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Last Price</span>
            </div>
            <div className="font-mono" style={{ fontSize: "10px", color: "var(--text-muted)" }}>
              Spread: {spread.toFixed(2)}
            </div>
          </div>

          {/* Bids (Green) */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden" }}>
            {bids.length === 0 ? (
              <div style={{ padding: "16px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: "11px" }}>
                No open bids
              </div>
            ) : (
              bids.map((bid, idx) => (
                <div
                  key={`bid-${idx}`}
                  onClick={() => onSelectPrice && onSelectPrice(bid.price)}
                  style={{
                    position: "relative",
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    padding: "2.5px 12px",
                    cursor: "pointer",
                    lineHeight: 1.4
                  }}
                >
                  {/* Visual Depth Fill Bar */}
                  <div style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: `${bid.percent}%`,
                    background: "rgba(0, 245, 160, 0.12)",
                    pointerEvents: "none"
                  }} />
                  <span className="font-mono text-green" style={{ fontWeight: 600, position: "relative" }}>
                    {bid.price.toFixed(2)}
                  </span>
                  <span className="font-mono" style={{ textAlign: "right", color: "var(--text-primary)", position: "relative" }}>
                    {bid.qty.toFixed(2)}
                  </span>
                  <span className="font-mono text-muted" style={{ textAlign: "right", position: "relative" }}>
                    {bid.total.toFixed(2)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Recent Trades Stream */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            padding: "6px 12px",
            color: "var(--text-muted)",
            fontWeight: 600,
            fontSize: "10px",
            textTransform: "uppercase"
          }}>
            <span>Price</span>
            <span style={{ textAlign: "right" }}>Size</span>
            <span style={{ textAlign: "right" }}>Time</span>
          </div>
          {recentTrades.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
              No recent trades yet
            </div>
          ) : (
            recentTrades.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  padding: "3px 12px",
                  lineHeight: 1.4
                }}
              >
                <span className={`font-mono ${t.side === "LONG" ? "text-green" : "text-red"}`} style={{ fontWeight: 600 }}>
                  {t.price.toFixed(2)}
                </span>
                <span className="font-mono" style={{ textAlign: "right", color: "var(--text-primary)" }}>
                  {t.qty.toFixed(2)}
                </span>
                <span className="font-mono text-muted" style={{ textAlign: "right", fontSize: "10px" }}>
                  {t.time}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
