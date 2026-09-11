import React, { useState } from "react";
import { usePerpetua } from "./hooks/usePerpetua";
import { Navbar } from "./components/Navbar";
import { MarketHeader } from "./components/MarketHeader";
import { TradingChart } from "./components/TradingChart";
import { Orderbook } from "./components/Orderbook";
import { OrderEntry } from "./components/OrderEntry";
import { PositionsDock } from "./components/PositionsDock";
import { AuthModal } from "./components/AuthModal";
import { DepositModal } from "./components/DepositModal";

export default function App() {
  const {
    username,
    selectedMarket,
    setSelectedMarket,
    markets,
    availableBalance,
    lockedMargin,
    totalEquity,
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
  } = usePerpetua();

  const [selectedOrderbookPrice, setSelectedOrderbookPrice] = useState<number | undefined>(undefined);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      background: "var(--bg-primary)"
    }}>
      {/* 1. Top Navbar */}
      <Navbar
        username={username}
        availableBalance={availableBalance}
        lockedMargin={lockedMargin}
        totalEquity={totalEquity}
        onOpenAuth={() => setAuthModalOpen(true)}
        onOpenDeposit={() => setDepositModalOpen(true)}
        onLogout={logout}
      />

      {/* 2. Market Stats Subheader */}
      <MarketHeader
        selectedMarket={selectedMarket}
        markets={markets}
        onSelectMarket={setSelectedMarket}
        markPrice={markPrice}
        lastTradedPrice={lastTradedPrice}
      />

      {/* 3. Main Trading Workspace */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}>
        {/* Top Split: Chart + Orderbook + Order Entry */}
        <div style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
          overflow: "hidden"
        }}>
          {/* TradingView Candlestick Chart */}
          <TradingChart market={selectedMarket} />

          {/* Depth Ladder / Orderbook */}
          <Orderbook
            bids={bids}
            asks={asks}
            recentTrades={recentTrades}
            lastTradedPrice={lastTradedPrice}
            onSelectPrice={(p) => setSelectedOrderbookPrice(p)}
          />

          {/* Order Placement Form */}
          <OrderEntry
            market={selectedMarket}
            markPrice={markPrice}
            availableBalance={availableBalance}
            onPlaceOrder={placeOrder}
            selectedPrice={selectedOrderbookPrice}
          />
        </div>

        {/* Bottom Split: Positions & Open Orders Dock */}
        <PositionsDock
          positions={positions}
          openOrders={openOrders}
          onClosePosition={closePosition}
          onCancelOrder={cancelOrder}
        />
      </div>

      {/* 4. Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onLogin={login}
        onSignup={signup}
      />

      <DepositModal
        isOpen={depositModalOpen}
        onClose={() => setDepositModalOpen(false)}
        availableBalance={availableBalance}
        onDeposit={depositFunds}
        onWithdraw={withdrawFunds}
      />

      {/* 5. Toast Feedback Banner */}
      {toast && (
        <div style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          background: toast.type === "success" ? "rgba(0, 245, 160, 0.95)" : toast.type === "error" ? "rgba(255, 59, 105, 0.95)" : "rgba(33, 43, 61, 0.95)",
          color: toast.type === "success" ? "#000" : "#FFF",
          padding: "12px 18px",
          borderRadius: "6px",
          fontWeight: 700,
          fontSize: "13px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
