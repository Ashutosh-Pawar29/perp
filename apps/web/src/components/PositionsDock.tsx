"use client";

import React, { useState } from "react";
import type { Position, OpenOrder } from "../hooks/usePerpetua";
import { X, CheckCircle2 } from "lucide-react";

interface PositionsDockProps {
  positions: Position[];
  openOrders: OpenOrder[];
  onClosePosition: (position: Position) => void;
  onCancelOrder: (orderId: string) => void;
}

export const PositionsDock: React.FC<PositionsDockProps> = ({
  positions,
  openOrders,
  onClosePosition,
  onCancelOrder
}) => {
  const [activeTab, setActiveTab] = useState<"positions" | "orders">("positions");

  return (
    <div style={{
      height: "230px",
      background: "var(--bg-secondary)",
      borderTop: "1px solid var(--border-default)",
      display: "flex",
      flexDirection: "column",
      fontSize: "12px",
      userSelect: "none"
    }}>
      {/* Dock Tabs Header */}
      <div style={{
        height: "36px",
        background: "var(--bg-primary)",
        borderBottom: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: "16px"
      }}>
        <button
          onClick={() => setActiveTab("positions")}
          style={{
            height: "100%",
            borderBottom: activeTab === "positions" ? "2px solid var(--color-green)" : "2px solid transparent",
            color: activeTab === "positions" ? "#FFF" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          Positions ({positions.length})
        </button>

        <button
          onClick={() => setActiveTab("orders")}
          style={{
            height: "100%",
            borderBottom: activeTab === "orders" ? "2px solid var(--color-green)" : "2px solid transparent",
            color: activeTab === "orders" ? "#FFF" : "var(--text-muted)",
            fontWeight: 700,
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          Open Orders ({openOrders.length})
        </button>
      </div>

      {/* Dock Content Table */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {activeTab === "positions" ? (
          positions.length === 0 ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)"
            }}>
              <p>No open positions</p>
              <span style={{ fontSize: "11px", marginTop: "4px" }}>Place a trade to open a perpetual position</span>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  borderBottom: "1px solid var(--border-subtle)",
                  background: "var(--bg-secondary)"
                }}>
                  <th style={{ padding: "8px 16px" }}>Market</th>
                  <th style={{ padding: "8px 16px" }}>Size</th>
                  <th style={{ padding: "8px 16px" }}>Entry Price</th>
                  <th style={{ padding: "8px 16px" }}>Mark Price</th>
                  <th style={{ padding: "8px 16px" }}>Liq. Price</th>
                  <th style={{ padding: "8px 16px" }}>Margin</th>
                  <th style={{ padding: "8px 16px" }}>Unrealized PnL</th>
                  <th style={{ padding: "8px 16px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p, idx) => (
                  <tr
                    key={`pos-${idx}`}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      transition: "background 0.1s ease"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "10px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: 700, color: "#FFF" }}>{p.market}-PERP</span>
                        <span className={p.type === "LONG" ? "badge-long" : "badge-short"}>
                          {p.type}
                        </span>
                      </div>
                    </td>
                    <td className="font-mono" style={{ padding: "10px 16px", fontWeight: 600 }}>
                      {p.qty} {p.market}
                    </td>
                    <td className="font-mono text-secondary" style={{ padding: "10px 16px" }}>
                      ${(Number(p.entryPrice) || 0).toFixed(2)}
                    </td>
                    <td className="font-mono text-secondary" style={{ padding: "10px 16px" }}>
                      ${(Number(p.markPrice) || 0).toFixed(2)}
                    </td>
                    <td className="font-mono text-red" style={{ padding: "10px 16px", fontWeight: 600 }}>
                      ${(Number(p.liquidationPrice) || 0).toFixed(2)}
                    </td>
                    <td className="font-mono text-secondary" style={{ padding: "10px 16px" }}>
                      ${(Number(p.margin) || 0).toFixed(2)}
                    </td>
                    <td className="font-mono" style={{ padding: "10px 16px" }}>
                      <div style={{ fontWeight: 700, color: (Number(p.pnl) || 0) >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
                        {(Number(p.pnl) || 0) >= 0 ? `+$${(Number(p.pnl) || 0).toFixed(2)}` : `-$${Math.abs(Number(p.pnl) || 0).toFixed(2)}`}
                        <span style={{ fontSize: "11px", marginLeft: "4px", opacity: 0.85 }}>
                          ({(Number(p.roe) || 0) >= 0 ? `+${(Number(p.roe) || 0).toFixed(2)}%` : `${(Number(p.roe) || 0).toFixed(2)}%`})
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => onClosePosition(p)}
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          color: "#FFF",
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: "4px"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--color-red)";
                          e.currentTarget.style.color = "#FFF";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "var(--bg-elevated)";
                          e.currentTarget.style.color = "#FFF";
                        }}
                      >
                        Market Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          /* Open Orders Table */
          openOrders.length === 0 ? (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)"
            }}>
              <p>No open orders</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  textTransform: "uppercase",
                  borderBottom: "1px solid var(--border-subtle)",
                  background: "var(--bg-secondary)"
                }}>
                  <th style={{ padding: "8px 16px" }}>Time</th>
                  <th style={{ padding: "8px 16px" }}>Market</th>
                  <th style={{ padding: "8px 16px" }}>Type</th>
                  <th style={{ padding: "8px 16px" }}>Side</th>
                  <th style={{ padding: "8px 16px" }}>Price</th>
                  <th style={{ padding: "8px 16px" }}>Amount</th>
                  <th style={{ padding: "8px 16px" }}>Filled</th>
                  <th style={{ padding: "8px 16px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {openOrders.map((o) => (
                  <tr
                    key={o.id}
                    style={{
                      borderBottom: "1px solid var(--border-subtle)",
                      transition: "background 0.1s ease"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="font-mono text-muted" style={{ padding: "10px 16px", fontSize: "11px" }}>
                      {new Date(o.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: "10px 16px", fontWeight: 700, color: "#FFF" }}>
                      {o.market}-PERP
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--text-secondary)" }}>
                      {o.orderType}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <span className={o.side === "LONG" ? "badge-long" : "badge-short"}>
                        {o.side}
                      </span>
                    </td>
                    <td className="font-mono text-secondary" style={{ padding: "10px 16px", fontWeight: 600 }}>
                      ${(Number(o.price) || 0).toFixed(2)}
                    </td>
                    <td className="font-mono text-secondary" style={{ padding: "10px 16px" }}>
                      {o.qty}
                    </td>
                    <td className="font-mono text-secondary" style={{ padding: "10px 16px" }}>
                      {o.filledQty} / {o.qty} ({(((Number(o.filledQty) || 0) / (Number(o.qty) || 1)) * 100).toFixed(0)}%)
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      <button
                        onClick={() => onCancelOrder(o.id)}
                        style={{
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border-default)",
                          color: "var(--color-red)",
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "4px 8px",
                          borderRadius: "4px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px"
                        }}
                      >
                        <X size={12} /> Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
};
