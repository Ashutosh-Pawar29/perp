import { createClient } from "redis";
import WebSocket from "ws";


const MARKET_PRICES = new Map<
    string,
    {
        price: number;
        timestamp: number;
    }
>();

type BINANCE_MARK_PRICE = {
    e: "markPriceUpdate";
    E: number; // Event time
    s: string; // Symbol
    p: string; // Mark Price
    i: string; // Index Price
    r: string; // Funding Rate
    T: number; // Next Funding Time
};

async function LiveDataFetch() {
    const url = "wss://fstream.binance.com/market/ws";
    const connection = new WebSocket(url);
    const client = createClient()
    await client.connect()
    connection.on("open", () => {
        console.log("Connected to Binance");

        connection.send(
            JSON.stringify({
                method: "SUBSCRIBE",
                params: [
                    "btcusdt@markPrice",
                    "ethusdt@markPrice",
                    "solusdt@markPrice",
                ],
                id: 1,
            })
        );
    });

    let nextTimestamp = 0;

    connection.on("message", async (rawMessage) => {
        const data: BINANCE_MARK_PRICE = JSON.parse(rawMessage.toString());
        // console.log(MARKET_PRICES)
        if (!data.s) return
        MARKET_PRICES.set(data.s, {
            price: Number(data.p),
            timestamp: data.E,
        });

        if (data.E >= nextTimestamp) {
            console.clear();
            console.log("Current Prices\n");

            for (const [symbol, value] of MARKET_PRICES) {
                client.xAdd('engine','*',{
                    market:symbol,
                    price:value.price.toString()
                })
                console.log(
                    `${symbol} : ${value.price} (${new Date(value.timestamp).toLocaleTimeString()})`
                );
            }

            nextTimestamp = data.E + 30_000; // 30 seconds
        }
    });

    connection.on("error", (err) => {
        console.error(err);
    });

    connection.on("close", () => {
        console.log("Disconnected");
    });
}

await LiveDataFetch();