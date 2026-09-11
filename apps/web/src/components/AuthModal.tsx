"use client";

import React, { useState } from "react";
import { X, Lock, User, Sparkles } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: string, pass: string) => Promise<any>;
  onSignup: (user: string, pass: string) => Promise<any>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onSignup
}) => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isLoginMode) {
      const res = await onLogin(username, password);
      if (!res.success) setError(res.message);
    } else {
      const res = await onSignup(username, password);
      if (!res.success) setError(res.message);
    }
    setLoading(false);
  };

  const handleDemoSignIn = async () => {
    setUsername("trader_alice");
    setPassword("Password@123");
    setLoading(true);
    const res = await onLogin("trader_alice", "Password@123");
    if (!res.success) {
      // If doesn't exist, create demo account
      await onSignup("trader_alice", "Password@123");
    }
    setLoading(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: 800, color: "#FFF" }}>
              {isLoginMode ? "Sign In to Perpetua" : "Create Perpetua Account"}
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              {isLoginMode ? "Access your perpetual positions and balances" : "Start trading perpetuals with up to 50x leverage"}
            </p>
          </div>
          <button onClick={onClose} style={{ padding: "4px", color: "var(--text-muted)" }}>
            <X size={18} />
          </button>
        </div>

        {/* Mode Switcher */}
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
            onClick={() => {
              setIsLoginMode(true);
              setError(null);
            }}
            style={{
              padding: "6px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 700,
              background: isLoginMode ? "var(--bg-elevated)" : "transparent",
              color: isLoginMode ? "#FFF" : "var(--text-muted)"
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLoginMode(false);
              setError(null);
            }}
            style={{
              padding: "6px",
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: 700,
              background: !isLoginMode ? "var(--bg-elevated)" : "transparent",
              color: !isLoginMode ? "#FFF" : "var(--text-muted)"
            }}
          >
            Register
          </button>
        </div>

        {error && (
          <div style={{
            background: "var(--color-red-bg)",
            border: "1px solid rgba(255, 59, 105, 0.3)",
            color: "var(--color-red)",
            padding: "8px 12px",
            borderRadius: "4px",
            fontSize: "12px",
            marginBottom: "14px"
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>
              Username
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username (min 6 chars)"
                style={{ width: "100%", paddingLeft: "34px" }}
              />
              <User size={14} color="var(--text-muted)" style={{ position: "absolute", left: "10px", top: "10px" }} />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password (min 6 chars)"
                style={{ width: "100%", paddingLeft: "34px" }}
              />
              <Lock size={14} color="var(--text-muted)" style={{ position: "absolute", left: "10px", top: "10px" }} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: "6px",
              padding: "12px",
              borderRadius: "4px",
              background: "var(--color-green)",
              color: "#000",
              fontWeight: 800,
              fontSize: "13px",
              boxShadow: "0 0 16px var(--color-green-glow)"
            }}
          >
            {loading ? "Processing..." : isLoginMode ? "Sign In" : "Create Account"}
          </button>
        </form>

        {/* Demo Fast Login */}
        <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px solid var(--border-subtle)" }}>
          <button
            type="button"
            onClick={handleDemoSignIn}
            style={{
              width: "100%",
              padding: "9px",
              borderRadius: "4px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              fontSize: "12px",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px"
            }}
          >
            <Sparkles size={14} color="var(--color-green)" /> Quick Demo Account Sign-In
          </button>
        </div>
      </div>
    </div>
  );
};
