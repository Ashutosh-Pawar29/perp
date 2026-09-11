"use client";

import React from "react";
import { Wallet, ArrowDownRight, ArrowUpRight, LogIn, LogOut, User, Activity } from "lucide-react";

interface NavbarProps {
  username: string | null;
  availableBalance: number;
  lockedMargin: number;
  totalEquity: number;
  onOpenAuth: () => void;
  onOpenDeposit: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  username,
  availableBalance,
  lockedMargin,
  totalEquity,
  onOpenAuth,
  onOpenDeposit,
  onLogout
}) => {
  return (
    <header style={{
      height: "54px",
      background: "var(--bg-secondary)",
      borderBottom: "1px solid var(--border-default)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 16px",
      zIndex: 50
    }}>
      {/* Brand & Left Navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          {/* Logo Mark: Infinity / Perpetual Helix */}
          <div style={{
            width: "28px",
            height: "28px",
            borderRadius: "6px",
            background: "linear-gradient(135deg, #00F5A0 0%, #6C5DD3 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 16px rgba(0, 245, 160, 0.3)"
          }}>
            <span style={{ color: "#000", fontWeight: 900, fontSize: "16px", lineHeight: 1 }}>∞</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-0.5px", color: "#FFF" }}>PERPETUA</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-green)", textTransform: "uppercase", letterSpacing: "1px" }}>DEX</span>
          </div>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button style={{
            padding: "6px 12px",
            borderRadius: "4px",
            background: "var(--bg-elevated)",
            color: "#FFF",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }}>
            <Activity size={14} color="var(--color-green)" /> Trade
          </button>
        </nav>
      </div>

      {/* Right Account & Equity Stats */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {username ? (
          <>
            {/* Equity Card */}
            <div style={{
              display: "flex",
              alignItems: "center",
              background: "var(--bg-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "6px",
              padding: "4px 12px",
              gap: "16px"
            }}>
              <div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Total Equity</div>
                <div className="font-mono" style={{ fontSize: "13px", fontWeight: 700, color: "#FFF" }}>
                  ${totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ width: "1px", height: "20px", background: "var(--border-default)" }} />
              <div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>Available</div>
                <div className="font-mono" style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-green)" }}>
                  ${availableBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ width: "1px", height: "20px", background: "var(--border-default)" }} />
              <div>
                <div style={{ fontSize: "10px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>In Orders</div>
                <div className="font-mono" style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>
                  ${lockedMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Deposit / Withdraw Action Button */}
            <button
              onClick={onOpenDeposit}
              style={{
                background: "var(--color-green-bg)",
                border: "1px solid rgba(0, 245, 160, 0.3)",
                color: "var(--color-green)",
                padding: "6px 12px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                transition: "all 0.15s ease"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--color-green)";
                e.currentTarget.style.color = "#000";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--color-green-bg)";
                e.currentTarget.style.color = "var(--color-green)";
              }}
            >
              <Wallet size={14} /> Deposit / Withdraw
            </button>

            {/* User Badge & Logout */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 10px",
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border-default)",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: 500
              }}>
                <User size={13} color="var(--text-secondary)" />
                <span>{username}</span>
              </div>
              <button
                onClick={onLogout}
                title="Log Out"
                style={{
                  padding: "6px",
                  borderRadius: "4px",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <LogOut size={14} />
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={onOpenAuth}
            style={{
              background: "var(--color-green)",
              color: "#000",
              fontWeight: 700,
              fontSize: "13px",
              padding: "7px 16px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 0 16px rgba(0, 245, 160, 0.25)"
            }}
          >
            <LogIn size={15} /> Sign In / Register
          </button>
        )}
      </div>
    </header>
  );
};
