"use client";

import React, { useState } from "react";
import { X, ArrowDownRight, ArrowUpRight, DollarSign } from "lucide-react";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number;
  onDeposit: (amount: number) => Promise<any>;
  onWithdraw: (amount: number) => Promise<any>;
}

const PRESETS = [1000, 5000, 10000, 25000];

export const DepositModal: React.FC<DepositModalProps> = ({
  isOpen,
  onClose,
  availableBalance,
  onDeposit,
  onWithdraw
}) => {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amountInput, setAmountInput] = useState<string>("5000");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(amountInput);
    if (isNaN(amount) || amount <= 0) return;

    setLoading(true);
    if (tab === "deposit") {
      await onDeposit(amount);
    } else {
      await onWithdraw(amount);
    }
    setLoading(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <h3 style={{ fontSize: "17px", fontWeight: 800, color: "#FFF" }}>
            {tab === "deposit" ? "Deposit Funds (USDT)" : "Withdraw Funds (USDT)"}
          </h3>
          <button onClick={onClose} style={{ padding: "4px", color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          background: "var(--bg-primary)",
          borderRadius: "6px",
          padding: "3px",
          marginBottom: "18px"
        }}>
          <button
            type="button"
            onClick={() => setTab("deposit")}
            style={{
              padding: "7px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: tab === "deposit" ? "var(--color-green-bg)" : "transparent",
              color: tab === "deposit" ? "var(--color-green)" : "var(--text-muted)"
            }}
          >
            <ArrowDownRight size={14} /> Deposit
          </button>
          <button
            type="button"
            onClick={() => setTab("withdraw")}
            style={{
              padding: "7px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              background: tab === "withdraw" ? "var(--color-red-bg)" : "transparent",
              color: tab === "withdraw" ? "var(--color-red)" : "var(--text-muted)"
            }}
          >
            <ArrowUpRight size={14} /> Withdraw
          </button>
        </div>

        {tab === "withdraw" && (
          <div style={{
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "12px",
            display: "flex",
            justifyContent: "space-between"
          }}>
            <span>Available for Withdrawal:</span>
            <span className="font-mono text-green" style={{ fontWeight: 600 }}>
              ${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>
              Amount (USDT)
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="number"
                step="1"
                min={1}
                max={tab === "withdraw" ? availableBalance : undefined}
                required
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0.00"
                style={{ width: "100%", paddingLeft: "32px", fontSize: "14px" }}
              />
              <DollarSign size={14} color="var(--text-muted)" style={{ position: "absolute", left: "10px", top: "10px" }} />
            </div>

            {/* Presets */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px", marginTop: "8px" }}>
              {PRESETS.map((p) => (
                <button
                  type="button"
                  key={p}
                  onClick={() => setAmountInput(String(p))}
                  style={{
                    padding: "5px",
                    borderRadius: "4px",
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    fontSize: "11px",
                    fontWeight: 600
                  }}
                >
                  ${(p / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "6px",
              padding: "12px",
              borderRadius: "4px",
              background: tab === "deposit" ? "var(--color-green)" : "var(--color-red)",
              color: tab === "deposit" ? "#000" : "#FFF",
              fontWeight: 800,
              fontSize: "13px",
              boxShadow: tab === "deposit" ? "0 0 16px var(--color-green-glow)" : "0 0 16px var(--color-red-glow)"
            }}
          >
            {loading ? "Processing..." : tab === "deposit" ? "Confirm Deposit" : "Confirm Withdrawal"}
          </button>
        </form>
      </div>
    </div>
  );
};
