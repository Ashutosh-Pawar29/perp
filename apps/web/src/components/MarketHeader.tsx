"use client";

import React, { useState } from "react";
import { ChevronDown, TrendingUp, Clock } from "lucide-react";
import type { MarketInfo } from "../hooks/usePerpetua";

interface MarketHeaderProps {
  selectedMarket: string;
  markets: MarketInfo[];
  onSelectMarket: (market: string) => void;
  markPrice: number;
  lastTradedPrice: number;
}

export const MarketHeader: React.FC<MarketHeaderProps> = ({
  selectedMarket,
  markets,
  onSelectMarket,
  markPrice,
  lastTradedPrice
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Mock 24h stats based on current price
  const changePercent = +2.45;
  const high24h = markPrice * 1.045;
  const low24h = markPrice * 0.962;
  const volume24h = 1428500;
  const fundingRate = 0.0001; // 0.01%

  return (
    <div style={{
      height: "46px",
      background: "var(--bg-secondary)",
      borderBottom: "1px solid var(--border-default)",
      display: "flex",
      alignItems: "center",
      padding: "0 16px",
      gap: "24px",
      position: "relative",
      fontSize: "12px"
    }}>
      {/* Market Selector Pill */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "4px 8px",
            borderRadius: "4px",
            background: dropdownOpen ? "var(--bg-elevated)" : "transparent",
            border: "1px solid var(--border-subtle)"
          }}
        >
          <div style={{
            width: "18px",
            height: "18px",
            borderRadius: "50%",
            background: selectedMarket === "SOL" ? "#9945FF" : selectedMarket === "ETH" ? "#627EEA" : "#F7931A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontWeight: 800,
            color: "#FFF"
          }}>
            {selectedMarket[0]}
          </div>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#FFF" }}>{selectedMarket}-PERP</span>
          <ChevronDown size={14} color="var(--text-muted)" />
        </button>

        {dropdownOpen && (
          <div style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "4px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-default)",
            borderRadius: "6px",
            boxShadow: "0 12px 24px rgba(0,0,0,0.6)",
            zIndex: 100,
            minWidth: "180px",
            padding: "4px"
          }}>
            {markets.map((m) => (
              <div
                key={m.id}
                onClick={() => {
                  onSelectMarket(m.id);
                  setDropdownOpen(false);
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: selectedMarket === m.id ? "var(--bg-elevated)" : "transparent"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = selectedMarket === m.id ? "var(--bg-elevated)" : "transparent")}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontWeight: 600, color: "#FFF" }}>{m.symbol}</span>
                </div>
                <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{m.maxLeverage}x</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Mark / Last Price */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span className="font-mono" style={{ fontSize: "18px", fontWeight: 800, color: "var(--color-green)" }}>
          ${markPrice.toFixed(2)}
        </span>
        <span className="font-mono" style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          Index: ${(markPrice * 0.9998).toFixed(2)}
        </span>
      </div>

      <div style={{ width: "1px", height: "20px", background: "var(--border-subtle)" }} />

      {/* 24h Change */}
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>24h Change</div>
        <div className="font-mono" style={{ fontWeight: 600, color: changePercent >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
          {changePercent >= 0 ? `+${changePercent.toFixed(2)}%` : `${changePercent.toFixed(2)}%`}
        </div>
      </div>

      {/* 24h High */}
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>24h High</div>
        <div className="font-mono" style={{ fontWeight: 500, color: "var(--text-primary)" }}>
          ${high24h.toFixed(2)}
        </div>
      </div>

      {/* 24h Low */}
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>24h Low</div>
        <div className="font-mono" style={{ fontWeight: 500, color: "var(--text-primary)" }}>
          ${low24h.toFixed(2)}
        </div>
      </div>

      {/* 24h Volume */}
      <div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>24h Volume</div>
        <div className="font-mono" style={{ fontWeight: 500, color: "var(--text-primary)" }}>
          ${(volume24h / 1000000).toFixed(2)}M
        </div>
      </div>

      <div style={{ width: "1px", height: "20px", background: "var(--border-subtle)" }} />

      {/* Funding Rate & Countdown */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase" }}>Funding / Countdown</div>
          <div className="font-mono" style={{ fontWeight: 600, color: "var(--color-green)", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>{(fundingRate * 100).toFixed(4)}%</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>in 04:12:30</span>
          </div>
        </div>
      </div>
    </div>
  );
};
