import { prisma } from "db";
import { createClient, type RedisClientType } from "redis";

export interface TradeInput {
    market: string;
    price: number;
    qty: number;
    timestamp?: number;
}

export interface CandleBar {
    market: string;
    timestamp: number; // Unix timestamp in ms, aligned to minute (e.g. 10:15:00.000)
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export class CandleAggregator {
    private activeCandles: Map<string, CandleBar> = new Map();
    private pubClient: any = null;
    private flushTimer: any = null;

    constructor() {}

    async init(pubClient?: any): Promise<void> {
        if (pubClient) {
            this.pubClient = pubClient;
        } else {
            this.pubClient = createClient();
            await this.pubClient.connect();
        }

        // Periodic flush every 5 seconds to ensure candles whose minute has closed are persisted
        this.flushTimer = setInterval(() => {
            this.flushOldCandles().catch((err) => {
                console.error("[CANDLE AGGREGATOR] Error in periodic flush:", err);
            });
        }, 5000);
    }

    async processTrade(trade: TradeInput): Promise<CandleBar> {
        const market = trade.market.toUpperCase();
        const tradeTime = trade.timestamp || Date.now();
        const minuteBucket = Math.floor(tradeTime / 60000) * 60000;

        let candle = this.activeCandles.get(market);

        if (!candle) {
            candle = {
                market,
                timestamp: minuteBucket,
                open: trade.price,
                high: trade.price,
                low: trade.price,
                close: trade.price,
                volume: trade.qty
            };
            this.activeCandles.set(market, candle);
        } else if (minuteBucket === candle.timestamp) {
            candle.high = Math.max(candle.high, trade.price);
            candle.low = Math.min(candle.low, trade.price);
            candle.close = trade.price;
            candle.volume += trade.qty;
        } else if (minuteBucket > candle.timestamp) {
            // Previous minute finished, persist it
            await this.persistCandle(candle);

            // Start new minute candle
            candle = {
                market,
                timestamp: minuteBucket,
                open: trade.price,
                high: trade.price,
                low: trade.price,
                close: trade.price,
                volume: trade.qty
            };
            this.activeCandles.set(market, candle);
        }

        // Persist current candle state so /klines API always has the latest up-to-date candle
        await this.persistCandle(candle);
        await this.publishLiveCandle(candle);

        return candle;
    }

    async persistCandle(candle: CandleBar): Promise<void> {
        try {
            await prisma.candle1m.upsert({
                where: {
                    market_timestamp: {
                        market: candle.market,
                        timestamp: new Date(candle.timestamp)
                    }
                },
                update: {
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume
                },
                create: {
                    market: candle.market,
                    timestamp: new Date(candle.timestamp),
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume
                }
            });
        } catch (err) {
            console.error(`[CANDLE AGGREGATOR] Failed to persist candle for ${candle.market}:`, err);
        }
    }

    private async publishLiveCandle(candle: CandleBar): Promise<void> {
        if (!this.pubClient) return;

        const payload = JSON.stringify({
            type: "kline",
            market: candle.market,
            interval: "1m",
            candle: {
                time: Math.floor(candle.timestamp / 1000), // Standard UNIX epoch seconds for charting
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close,
                volume: candle.volume
            }
        });

        try {
            await this.pubClient.publish(`kline:${candle.market}:1m`, payload);
            await this.pubClient.publish(`kline:${candle.market.toLowerCase()}:1m`, payload);
            await this.pubClient.publish(candle.market, payload);
        } catch (err) {
            console.error(`[CANDLE AGGREGATOR] Failed to publish kline tick:`, err);
        }
    }

    private async flushOldCandles(): Promise<void> {
        const now = Date.now();
        for (const [market, candle] of this.activeCandles.entries()) {
            if (now - candle.timestamp >= 60000) {
                await this.persistCandle(candle);
            }
        }
    }

    stop(): void {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
}

export const candleAggregator = new CandleAggregator();
