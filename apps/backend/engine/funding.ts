import type { Users, FundingPayment } from "commons";

/**
 * Calculates and applies the perpetual funding rate payment across all open positions in a market.
 *
 * Funding Rate Mechanism:
 * - Premium = (Perp Price - Spot Index Price) / Spot Index Price
 * - Clamped between [-0.75%, +0.75%]
 * - If Funding Rate > 0 (Perp trading above spot): Longs pay Shorts.
 * - If Funding Rate < 0 (Perp trading below spot): Shorts pay Longs.
 */
export function applyFunding(
    market: string,
    orderbooks: Record<string, any>,
    positions: Users[],
    balances: Map<string, { available: string; locked: string }>
): { fundingRate: number; payments: FundingPayment[] } {
    const ob = orderbooks[market];
    if (!ob || !ob.indexPrice || ob.indexPrice <= 0 || !ob.lastTradedPrice) {
        return { fundingRate: 0, payments: [] };
    }

    const rawRate = (ob.lastTradedPrice - ob.indexPrice) / ob.indexPrice;
    // Clamp to [-0.0075, +0.0075] (max 0.75% per funding interval)
    const MAX_RATE = 0.0075;
    const fundingRate = Math.max(-MAX_RATE, Math.min(MAX_RATE, rawRate));

    const marketNormalized = market.replace(/USDT$/i, "").toUpperCase();
    const payments: FundingPayment[] = [];

    for (const u of positions) {
        for (const pos of u.positions) {
            const posMarket = pos.market.replace(/USDT$/i, "").toUpperCase();
            if (posMarket === marketNormalized && pos.qty > 0) {
                const notional = pos.qty * ob.indexPrice;
                // Positive fundingRate: Longs pay (+), Shorts receive (-)
                // Payment amount from the position holder's perspective (positive means payout/deduction)
                let payment = 0;
                if (pos.type === "LONG") {
                    payment = fundingRate * notional;
                } else {
                    payment = -fundingRate * notional;
                }

                let userBalance = balances.get(u.userId);
                if (userBalance) {
                    const currentAvail = Number(userBalance.available);
                    // Deduct payment (if payment > 0 user pays, if payment < 0 user receives)
                    const updatedAvail = currentAvail - payment;
                    userBalance.available = String(updatedAvail);
                    balances.set(u.userId, userBalance);
                }

                payments.push({
                    userId: u.userId,
                    market,
                    positionType: pos.type,
                    fundingRate,
                    payment
                });
            }
        }
    }

    if (payments.length > 0) {
        console.log(
            `[FUNDING SETTLED] Market: ${market}, Funding Rate: ${(fundingRate * 100).toFixed(4)}%, Applied payments to ${payments.length} positions.`
        );
    }

    return { fundingRate, payments };
}
