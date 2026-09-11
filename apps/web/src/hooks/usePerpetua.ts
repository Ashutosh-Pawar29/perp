"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export const API_BASE = "http://localhost:3000";
export const WS_URL = "ws://localhost:3000";

export interface Position {
  market: string;
  type: "LONG" | "SHORT";
  qty: number;
  margin: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  pnl: number;
  roe: number;
}

export interface OpenOrder {
  id: string;
  market: string;
  orderType: string;
  side: "LONG" | "SHORT";
  price: number;
  qty: number;
  filledQty: number;
  status: string;
  createdAt: string;
}

export interface OrderbookLevel {
  price: number;
  qty: number;
  total: number;
  percent: number;
}

export interface Trade {
  id: string;
  price: number;
  qty: number;
  side: "LONG" | "SHORT";
  time: string;
}

export interface MarketInfo {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  minQty: string;
  tickSize: string;
  maxLeverage: number;
}

export function usePerpetua() {
  // Auth state
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  // Market state
  const [selectedMarket, setSelectedMarket] = useState<string>("SOL");
  const [markets, setMarkets] = useState<MarketInfo[]>([
    { id: "SOL", symbol: "SOL-PERP", baseAsset: "SOL", quoteAsset: "USDT", minQty: "0.1", tickSize: "0.01", maxLeverage: 50 },
    { id: "ETH", symbol: "ETH-PERP", baseAsset: "ETH", quoteAsset: "USDT", minQty: "0.01", tickSize: "0.1", maxLeverage: 50 },
    { id: "BTC", symbol: "BTC-PERP", baseAsset: "BTC", quoteAsset: "USDT", minQty: "0.001", tickSize: "0.5", maxLeverage: 100 },
  ]);

  // Account balances
  const [availableBalance, setAvailableBalance] = useState<number>(0);
  const [lockedMargin, setLockedMargin] = useState<number>(0);

  // Orderbook & Trades
  const [bids, setBids] = useState<OrderbookLevel[]>([]);
  const [asks, setAsks] = useState<OrderbookLevel[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [markPrice, setMarkPrice] = useState<number>(150);
  const [lastTradedPrice, setLastTradedPrice] = useState<number>(150);

  // Positions & Orders
  const [positions, setPositions] = useState<Position[]>([]);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);

  // Modals state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);

  // Notification / Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<any>(null);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const parseAndSetOrderbook = useCallback((rawBids: any = {}, rawAsks: any = {}) => {
    let runningBidTotal = 0;
    const parsedBids: OrderbookLevel[] = Object.keys(rawBids)
      .map((p) => ({
        price: Number(p),
        qty: Number(rawBids[p]?.availableQty || rawBids[p] || 0),
        total: 0,
        percent: 0
      }))
      .filter((b) => b.qty > 0)
      .sort((a, b) => b.price - a.price)
      .slice(0, 15);

    const maxBidQty = Math.max(...parsedBids.map((b) => b.qty), 1);
    parsedBids.forEach((b) => {
      runningBidTotal += b.qty;
      b.total = runningBidTotal;
      b.percent = Math.min((b.qty / maxBidQty) * 100, 100);
    });

    let runningAskTotal = 0;
    const parsedAsks: OrderbookLevel[] = Object.keys(rawAsks)
      .map((p) => ({
        price: Number(p),
        qty: Number(rawAsks[p]?.availableQty || rawAsks[p] || 0),
        total: 0,
        percent: 0
      }))
      .filter((a) => a.qty > 0)
      .sort((a, b) => a.price - b.price)
      .slice(0, 15);

    const maxAskQty = Math.max(...parsedAsks.map((a) => a.qty), 1);
    parsedAsks.forEach((a) => {
      runningAskTotal += a.qty;
      a.total = runningAskTotal;
      a.percent = Math.min((a.qty / maxAskQty) * 100, 100);
    });

    setBids(parsedBids);
    setAsks(parsedAsks);
  }, []);

  // Fetch initial real orderbook snapshot immediately on mount or market change
  useEffect(() => {
    fetch(`${API_BASE}/orderbook/${selectedMarket}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && (data.bids || data.asks)) {
          parseAndSetOrderbook(data.bids, data.asks);
          if (data.lastTradedPrice) {
            setLastTradedPrice(Number(data.lastTradedPrice));
            setMarkPrice(Number(data.lastTradedPrice));
          }
        }
      })
      .catch((err) => console.warn("Failed to fetch initial orderbook snapshot:", err));
  }, [selectedMarket, parseAndSetOrderbook]);

  // 1. Initialize Auth from localStorage
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("perpetua_token");
      const savedUsername = localStorage.getItem("perpetua_username");
      const savedUserId = localStorage.getItem("perpetua_userId");
      if (savedToken) {
        setToken(savedToken);
        setUsername(savedUsername || "Trader");
        setUserId(savedUserId || null);
      }
    } catch {}
  }, []);

  // 2. Fetch User Balances & Positions
  const refreshAccountData = useCallback(async (activeToken?: string) => {
    const currentToken = activeToken || token;
    if (!currentToken) return;

    try {
      // Equity
      const eqRes = await fetch(`${API_BASE}/equity/available`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      if (eqRes.ok) {
        const eqData = await eqRes.json();
        setAvailableBalance(Number(eqData.available || 0));
        setLockedMargin(Number(eqData.locked || 0));
      }

      // Positions
      const posRes = await fetch(`${API_BASE}/positions/open`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      if (posRes.ok) {
        const posData = await posRes.json();
        const formatted: Position[] = (posData.positions || []).map((p: any) => {
          const entryPrice = Number(p.averagePrice || p.entryPrice || 100);
          const currentMark = markPrice || entryPrice;
          let pnl = 0;
          if (p.type === "LONG") {
            pnl = (currentMark - entryPrice) * Number(p.qty);
          } else {
            pnl = (entryPrice - currentMark) * Number(p.qty);
          }
          const margin = Number(p.margin || 1);
          const roe = margin > 0 ? (pnl / margin) * 100 : 0;
          return {
            market: p.market,
            type: p.type,
            qty: Number(p.qty),
            margin,
            entryPrice,
            markPrice: currentMark,
            liquidationPrice: Number(p.liquidationPrice || 0),
            pnl,
            roe
          };
        });
        setPositions(formatted);
      }

      // Open Orders
      const ordRes = await fetch(`${API_BASE}/orders/open`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });
      if (ordRes.ok) {
        const ordData = await ordRes.json();
        const formattedOrders: OpenOrder[] = (ordData.orders || []).map((o: any) => ({
          id: o.id,
          market: o.marketid,
          orderType: o.orderType,
          side: o.side,
          price: Number(o.price),
          qty: Number(o.qty),
          filledQty: Number(o.filledQty || 0),
          status: o.status,
          createdAt: o.CreatedAt ? new Date(o.CreatedAt).toLocaleTimeString() : "Just now"
        }));
        setOpenOrders(formattedOrders);
      }
    } catch (err) {
      console.warn("Error refreshing account data:", err);
    }
  }, [token, markPrice]);

  useEffect(() => {
    if (token) {
      refreshAccountData();
      const interval = setInterval(() => {
        refreshAccountData();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [token, refreshAccountData]);

  // 3. Connect to WebSocket
  useEffect(() => {
    let ws: WebSocket;
    let isMounted = true;

    const connectWs = () => {
      try {
        ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[WS] Connected to Perpetua WebSocket");
          // Heartbeat
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 15000);

          // Authenticate if token exists
          if (token) {
            ws.send(JSON.stringify({ type: "auth", token }));
          }

          // Subscribe to public market streams
          ws.send(JSON.stringify({ type: "subscribe", market: selectedMarket }));
          ws.send(JSON.stringify({ type: "subscribe", market: `kline:${selectedMarket}:1m` }));
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(event.data.toString());

            // Auth reply
            if (data.type === "authenticated") {
              setUserId(data.userId);
              try {
                localStorage.setItem("perpetua_userId", data.userId);
              } catch {}
            }

            // Public Market Data
            if (data.type === "message") {
              const msg = data.message;
              if (msg.type === "trade") {
                const newTrade: Trade = {
                  id: `tr_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
                  price: Number(msg.price),
                  qty: Number(msg.qty),
                  side: msg.takerId ? "SHORT" : "LONG",
                  time: new Date(msg.timestamp || Date.now()).toLocaleTimeString()
                };
                setRecentTrades((prev) => [newTrade, ...prev.slice(0, 49)]);
                setLastTradedPrice(Number(msg.price));
                setMarkPrice(Number(msg.price));
              }

              if (msg.type === "orderbook") {
                parseAndSetOrderbook(msg.bids, msg.asks);
                if (msg.lastTradedPrice) {
                  setLastTradedPrice(Number(msg.lastTradedPrice));
                  setMarkPrice(Number(msg.lastTradedPrice));
                }
              }
            }

            // Private User Events
            if (data.type === "private_message") {
              const msg = data.message;
              if (msg.type === "user_balance") {
                setAvailableBalance(Number(msg.available));
                setLockedMargin(Number(msg.locked));
              }

              if (msg.type === "user_order") {
                const updated = msg.order;
                if (updated) {
                  setOpenOrders((prev) => {
                    if (updated.status === "open" || updated.status === "partiallyFilled") {
                      const exists = prev.find((o) => o.id === updated.id);
                      if (exists) {
                        return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
                      }
                      return [
                        {
                          id: updated.id,
                          market: updated.marketid,
                          orderType: updated.orderType,
                          side: updated.side,
                          price: Number(updated.price),
                          qty: Number(updated.qty),
                          filledQty: Number(updated.filledQty),
                          status: updated.status,
                          createdAt: updated.CreatedAt || new Date().toISOString()
                        },
                        ...prev
                      ];
                    }
                    // Status filled or cancelled -> remove from open orders
                    return prev.filter((o) => o.id !== updated.id);
                  });
                  refreshAccountData();
                }
              }

              if (msg.type === "user_fill") {
                showToast(`Order filled: ${msg.qty} ${msg.market} @ $${msg.price} (${msg.role})`, "success");
                refreshAccountData();
              }

              if (msg.type === "user_liquidation") {
                showToast(`Position Liquidated: ${msg.qty} ${msg.market} @ $${msg.markPrice}`, "error");
                refreshAccountData();
              }
            }
          } catch (e) {
            console.warn("[WS] Error parsing message:", e);
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          console.log("[WS] Disconnected, reconnecting in 3s...");
          setTimeout(connectWs, 3000);
        };
      } catch (err) {
        console.error("[WS] Connection error:", err);
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        const socket = wsRef.current;
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        } else if (socket.readyState === WebSocket.CONNECTING) {
          socket.onopen = () => socket.close();
        }
      }
    };
  }, [token, selectedMarket, refreshAccountData, showToast]);

  // 4. Place Order Action
  const placeOrder = async (params: {
    market: string;
    type: "LONG" | "SHORT";
    orderType: "Limit" | "Market";
    price: number;
    qty: number;
    equity: number;
  }) => {
    if (!token) {
      setAuthModalOpen(true);
      return { success: false, message: "Please sign in first" };
    }

    try {
      const res = await fetch(`${API_BASE}/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(params)
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.message || "Failed to place order", "error");
        return { success: false, message: data.message };
      }
      showToast(params.orderType === "Market" ? "Market order executed!" : "Limit order placed!", "success");
      refreshAccountData();
      return { success: true, data };
    } catch (err: any) {
      showToast(err.message || "Network error", "error");
      return { success: false, message: err.message };
    }
  };

  // 5. Cancel Order Action
  const cancelOrder = async (orderId: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/order`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderid: orderId })
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Order cancelled", "info");
        setOpenOrders((prev) => prev.filter((o) => o.id !== orderId));
        refreshAccountData();
      } else {
        showToast(data.message || "Failed to cancel order", "error");
      }
    } catch (err: any) {
      showToast(err.message || "Error cancelling order", "error");
    }
  };

  // 6. Close Position Action (1-click market close)
  const closePosition = async (pos: Position) => {
    const oppositeSide = pos.type === "LONG" ? "SHORT" : "LONG";
    const res = await placeOrder({
      market: pos.market,
      type: oppositeSide,
      orderType: "Market",
      price: pos.markPrice,
      qty: pos.qty,
      equity: pos.margin
    });
    if (res.success) {
      showToast(`Position closed: ${pos.qty} ${pos.market}`, "success");
    }
  };

  // 7. Onramp (Deposit) Action
  const depositFunds = async (amount: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/onramp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ balance: String(amount) })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Successfully deposited $${amount.toLocaleString()} USDT!`, "success");
        setDepositModalOpen(false);
        refreshAccountData();
      } else {
        showToast(data.message || "Deposit failed", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // 8. Offramp (Withdraw) Action
  const withdrawFunds = async (amount: number) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/offramp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ balance: String(amount) })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Withdrew $${amount.toLocaleString()} USDT`, "success");
        setDepositModalOpen(false);
        refreshAccountData();
      } else {
        showToast(data.message || "Withdrawal failed", "error");
      }
    } catch (err: any) {
      showToast(err.message, "error");
    }
  };

  // 9. Sign in / Sign up
  const login = async (user: string, pass: string) => {
    try {
      const res = await fetch(`${API_BASE}/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        setUsername(user);
        try {
          localStorage.setItem("perpetua_token", data.token);
          localStorage.setItem("perpetua_username", user);
        } catch {}
        setAuthModalOpen(false);
        showToast(`Welcome back, ${user}!`, "success");
        refreshAccountData(data.token);
        return { success: true };
      }
      showToast(data.message || "Invalid credentials", "error");
      return { success: false, message: data.message };
    } catch (err: any) {
      showToast(err.message, "error");
      return { success: false, message: err.message };
    }
  };

  const signup = async (user: string, pass: string) => {
    try {
      const res = await fetch(`${API_BASE}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json();
      if (res.ok && data.message?.includes("done")) {
        // Auto-signin
        return await login(user, pass);
      }
      showToast(data.message || "Signup failed", "error");
      return { success: false, message: data.message };
    } catch (err: any) {
      showToast(err.message, "error");
      return { success: false, message: err.message };
    }
  };

  const logout = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "logout" }));
    }
    setToken(null);
    setUsername(null);
    setUserId(null);
    setAvailableBalance(0);
    setLockedMargin(0);
    setPositions([]);
    setOpenOrders([]);
    try {
      localStorage.removeItem("perpetua_token");
      localStorage.removeItem("perpetua_username");
      localStorage.removeItem("perpetua_userId");
    } catch {}
    showToast("Logged out successfully", "info");
  };

  return {
    token,
    userId,
    username,
    selectedMarket,
    setSelectedMarket,
    markets,
    availableBalance,
    lockedMargin,
    totalEquity: availableBalance + lockedMargin,
    bids,
    asks,
    recentTrades,
    markPrice,
    lastTradedPrice,
    positions,
    openOrders,
    authModalOpen,
    setAuthModalOpen,
    depositModalOpen,
    setDepositModalOpen,
    toast,
    placeOrder,
    cancelOrder,
    closePosition,
    depositFunds,
    withdrawFunds,
    login,
    signup,
    logout
  };
}
