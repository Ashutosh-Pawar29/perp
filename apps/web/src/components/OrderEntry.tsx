"use client";

import React, { useState, useEffect } from "react";
import { Sliders, ShieldAlert, ArrowRight } from "lucide-react";

interface OrderEntryProps {
  market: string;
  markPrice: number;
  availableBalance: number;
  onPlaceOrder: (order: {
    market: string;
    type: "LONG" | "SHORT";
    orderType: "Limit" | "Market";
    price: number;
    qty: number;
    equity: number;
  }) => Promise<any>;
  selectedPrice?: number;
}

const LEVERAGE_PRESETS = [2, 5, 10, 20, 50];
const PERCENT_PRESETS = [25, 50, 75, 100];

export const OrderEntry: React.FC<OrderEntryProps> = ({
  market,
  markPrice,
  availableBalance,
  onPlaceOrder,
  selectedPrice
}) => {
  const [side, setSide] = useState<"LONG" | "SHORT">("LONG");
  const [orderType, setOrderType] = useState<"Limit" | "Market">("Limit");
  const [leverage, setLeverage] = useState<number>(10);
  const [priceInput, setPriceInput] = useState<string>(markPrice ? markPrice.toString() : "150");
  const [qtyInput, setQtyInput] = useState<string>("1");
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Auto-fill price from orderbook click
  useEffect(() => {
    if (selectedPrice) {
      setPriceInput(selectedPrice.toString());
    }
  }, [selectedPrice]);

  useEffect(() => {
    if (orderType === "Limit" && !priceInput && markPrice) {
      setPriceInput(markPrice.toString());
    }
  }, [markPrice, orderType, priceInput]);

  const currentPrice = orderType === "Market" ? markPrice : parseFloat(priceInput) || markPrice;
  const qty = parseFloat(qtyInput) || 0;
  const notional = currentPrice * qty;
  const requiredMargin = leverage > 0 ? notional / leverage : notional;
  const feeEstimate = notional * 0.0005; // 0.05%

  // Estimated liquidation price
  const estimatedLiqPrice =
    side === "LONG"
      ? Math.max(0, currentPrice * (1 - 1 / leverage * 0.9))
      : currentPrice * (1 + 1 / leverage * 0.9);

  // Quick percent of balance allocation
  const handlePercentClick = (percent: number) => {
    const targetMargin = (availableBalance * percent) / 100;
    const targetNotional = targetMargin * leverage;
    if (currentPrice > 0) {
      const calculatedQty = (targetNotional / currentPrice).toFixed(2);
      setQtyInput(calculatedQty);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qty <= 0) return;

    setSubmitting(true);
    await onPlaceOrder({
      market,
      type: side,
      orderType,
      price: currentPrice,
      qty,
      equity: Math.max(1, Math.round(requiredMargin))
    });
    setSubmitting(false);
  };

  return (
    <div style={{
      width: "300px",
      background: "var(--bg-secondary)",
      display: "flex",
      flexDirection: "column",
      height: "100%",
      fontSize: "12px",
      userSelect: "none"
    }}>
      {/* Side Segmented Switcher (Buy/Long vs Sell/Short) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        padding: "8px 12px 4px 12px",
        gap: "6px"
      }}>
        <button
          onClick={() => setSide("LONG")}
          style={{
            padding: "8px",
            borderRadius: "4px",
            fontWeight: 700,
            fontSize: "13px",
            background: side === "LONG" ? "var(--color-green)" : "var(--bg-elevated)",
            color: side === "LONG" ? "#000" : "var(--text-secondary)",
            boxShadow: side === "LONG" ? "0 0 16px var(--color-green-glow)" : "none"
          }}
        >
          Buy / Long
        </button>
        <button
          onClick={() => setSide("SHORT")}
          style={{
            padding: "8px",
            borderRadius: "4px",
            fontWeight: 700,
            fontSize: "13px",
            background: side === "SHORT" ? "var(--color-red)" : "var(--bg-elevated)",
            color: side === "SHORT" ? "#FFF" : "var(--text-secondary)",
            boxShadow: side === "SHORT" ? "0 0 16px var(--color-red-glow)" : "none"
          }}
        >
          Sell / Short
        </button>
      </div>

      {/* Limit vs Market Toggle */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 12px",
        gap: "8px"
      }}>
        <button
          onClick={() => setOrderType("Limit")}
          style={{
            padding: "4px 12px",
            borderRadius: "4px",
            fontWeight: 600,
            fontSize: "12px",
            background: orderType === "Limit" ? "var(--bg-elevated)" : "transparent",
            color: orderType === "Limit" ? "#FFF" : "var(--text-muted)",
            border: orderType === "Limit" ? "1px solid var(--border-focus)" : "1px solid transparent"
          }}
        >
          Limit
        </button>
        <button
          onClick={() => setOrderType("Market")}
          style={{
            padding: "4px 12px",
            borderRadius: "4px",
            fontWeight: 600,
            fontSize: "12px",
            background: orderType === "Market" ? "var(--bg-elevated)" : "transparent",
            color: orderType === "Market" ? "#FFF" : "var(--text-muted)",
            border: orderType === "Market" ? "1px solid var(--border-focus)" : "1px solid transparent"
          }}
        >
          Market
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Avail:</span>
          <span className="font-mono" style={{ fontSize: "11px", fontWeight: 600, color: "#FFF" }}>
            ${availableBalance.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Form Inputs */}
      <form onSubmit={handleSubmit} style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
        {/* Leverage Slider & Pills */}
        <div style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "6px",
          padding: "8px 10px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
              <Sliders size={12} /> Leverage
            </span>
            <span className="font-mono" style={{ fontWeight: 800, color: "var(--color-green)", fontSize: "13px" }}>
              {leverage}x
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={leverage}
            onChange={(e) => setLeverage(Number(e.target.value))}
            style={{ width: "100%", accentColor: "var(--color-green)", cursor: "pointer", height: "4px" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
            {LEVERAGE_PRESETS.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setLeverage(p)}
                style={{
                  fontSize: "10px",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  background: leverage === p ? "var(--bg-elevated)" : "transparent",
                  color: leverage === p ? "#FFF" : "var(--text-muted)",
                  border: leverage === p ? "1px solid var(--border-focus)" : "1px solid transparent"
                }}
              >
                {p}x
              </button>
            ))}
          </div>
        </div>

        {/* Price Input */}
        <div>
          <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
            Order Price
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="number"
              step="0.01"
              disabled={orderType === "Market"}
              value={orderType === "Market" ? "Market Price" : priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="0.00"
              style={{ width: "100%", paddingRight: "45px" }}
            />
            <span style={{ position: "absolute", right: "12px", top: "8px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
              USDT
            </span>
          </div>
        </div>

        {/* Quantity Input */}
        <div>
          <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
            Amount
          </label>
          <div style={{ position: "relative" }}>
            <input
              type="number"
              step="0.01"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              placeholder="0.00"
              style={{ width: "100%", paddingRight: "45px" }}
            />
            <span style={{ position: "absolute", right: "12px", top: "8px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 600 }}>
              {market}
            </span>
          </div>

          {/* Quick Balance Percentage Pills */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "4px", marginTop: "6px" }}>
            {PERCENT_PRESETS.map((pct) => (
              <button
                type="button"
                key={pct}
                onClick={() => handlePercentClick(pct)}
                style={{
                  padding: "3px 0",
                  borderRadius: "3px",
                  background: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  fontSize: "10px",
                  fontWeight: 600
                }}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Execution Preview & Calculations */}
        <div style={{
          background: "var(--bg-primary)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "6px",
          padding: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          fontSize: "11px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Order Value</span>
            <span className="font-mono" style={{ color: "#FFF" }}>${notional.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Margin Required</span>
            <span className="font-mono" style={{ color: "var(--color-green)", fontWeight: 600 }}>
              ${requiredMargin.toFixed(2)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "3px" }}>
              <ShieldAlert size={11} color="var(--color-red)" /> Est. Liq Price
            </span>
            <span className="font-mono" style={{ color: "var(--color-red)", fontWeight: 600 }}>
              ${estimatedLiqPrice.toFixed(2)}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text-muted)" }}>Fee (0.05%)</span>
            <span className="font-mono" style={{ color: "var(--text-secondary)" }}>${feeEstimate.toFixed(3)}</span>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || qty <= 0}
          style={{
            marginTop: "auto",
            marginBottom: "12px",
            padding: "12px",
            borderRadius: "4px",
            fontWeight: 800,
            fontSize: "14px",
            background: side === "LONG" ? "var(--color-green)" : "var(--color-red)",
            color: side === "LONG" ? "#000" : "#FFF",
            boxShadow: side === "LONG" ? "0 0 16px var(--color-green-glow)" : "0 0 16px var(--color-red-glow)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px"
          }}
        >
          {submitting ? (
            "Submitting..."
          ) : (
            <>
              {side === "LONG" ? `Buy / Long ${market}` : `Sell / Short ${market}`}
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
    </div>
  );
};
