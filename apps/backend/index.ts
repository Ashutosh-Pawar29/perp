import express from "express";
import { createServer } from "node:http";
import type { Request, Response, NextFunction } from "express";
import bycrypt from "bcrypt";
import { prisma, Prisma } from "db";
import { onrampschema, orderschema, signinschema, signupschema } from "zodvalidation";
import { loopfunction } from "./loopingfunction";
import type { toEngine } from "commons";
import { createClient } from "redis";

const redisClient = createClient();
redisClient.connect().catch((err) => console.error("Redis connect error in backend:", err));

const jwt = require('jsonwebtoken')
export const app = express();
export const httpServer = createServer(app);
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

const JWT_SECRET = (process.env.JWT_SECRET || "JWT_SECRET@123").trim();

const authenticateUser = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ message: "Unauthorized: No token provided" });
    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const id = decoded.id
        req.body = {
            ...req.body,
            id
        }
        next();
    } catch (error) {
        console.log(error)
        res.status(403).json({ message: "Invalid or expired token" });
    }
};


app.post("/signup", async (req, res) => {
    const body = req.body;
    const valid = signupschema.safeParse(body)
    if (!valid.success) {
        return res.json({ message: "invalid details sent !!!" })
    }
    try {
        const user = await prisma.users.findFirst({ where: { username: body.username } })
        if (user) { return res.json({ message: "user already exist. Please login..." }) }
        else {
            const hashpass = await bycrypt.genSalt(10);
            const hashedpass = await bycrypt.hash(body.password, hashpass!)
            // console.log(hashedpass)
            const user = await prisma.users.create({
                data: {
                    username: body.username,
                    password: hashedpass
                }
            })
            if (user) {
                const data: toEngine = {
                    messageType: "signup",
                    userId: user.id.toString(),
                    balance: "0"
                }
                // console.log("before")
                const engineresponse = await loopfunction(data)
                // console.log("after")
                // console.log(engineresponse)
                return res.json({ message: "signup done... you may login..." })
            }
            else {
                return res.json({ message: "sorry please try again some time later" })
            }
        }
    }
    catch (error) {
        console.error
        res.json({ error })
    }
})


app.post("/signin", async (req, res) => {
    const body = req.body;
    const valid = signinschema.safeParse(body)
    if (!valid.success) {
        return res.json({ message: "invalid details sent !!!" })
    }
    else {
        const user = await prisma.users.findFirst({
            where: {
                username: body.username
            }
        })
        // console.log(user)
        if (!user) {
            return res.json({ message: "invalid username" })
        }
        else {
            const verified = await bycrypt.compare(body.password, user.password);
            if (verified) {
                const id = user.id
                const token = jwt.sign({ id }, JWT_SECRET)
                res.json({ token });
                return;
            }
            else {
                return res.json({ message: "incorrect password " })
            }
        }
    }

})



app.post("/onramp", authenticateUser, async (req, res) => {
    const body = req.body;
    const valid = onrampschema.safeParse(body)
    if (!valid.success) {
        return res.json({ message: "invalid details sent !!!" })
    }
    else {
        const data: toEngine = {
            messageType: "onramp",
            userId: body.id.toString(),
            balance: body.balance
        }
        const engineresponse = await loopfunction(data)
        console.log(engineresponse)
        if (engineresponse.status == "true") {
            return res.json({ message: "funds added....." })
        }
        else {
            return res.json({ message: "sorry something went wrong " })
        }
    }
})

app.post("/offramp", authenticateUser, async (req: Request, res: Response) => {
    try {
        const body = req.body;
        const amount = Number(body.balance);
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ message: "Invalid withdrawal amount" });
        }
        const data: toEngine = {
            messageType: "offramp",
            userId: body.id.toString(),
            balance: String(amount)
        };
        const engineresponse: any = await loopfunction(data);
        if (engineresponse.status === "true") {
            return res.json({ message: "Funds withdrawn successfully", amount: engineresponse.response });
        } else {
            return res.status(400).json({ message: engineresponse.response || "Withdrawal failed" });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/order", authenticateUser, async (req: Request, res: Response) => {
    try {
        let body = req.body;
        const valid = orderschema.safeParse(body);
        if (!valid.success) {
            return res.status(400).json({ message: "invalid details", errors: valid.error.format() });
        }
        if (body.equity <= 0) {
            return res.status(400).json({ msg: "equity should be greater than zero" });
        }

        const normalizedOrderType = body.orderType?.toLowerCase() === "market" ? "Market" : "Limit";
        const normalizedSide = body.type?.toUpperCase() === "SHORT" ? "SHORT" : "LONG";

        let odr = await prisma.orders.create({
            data: {
                userid: body.id,
                marketid: body.market,
                orderType: normalizedOrderType,
                side: normalizedSide,
                price: body.price.toString(),
                slippage: "0",
                qty: body.qty.toString(),
                initialMargin: body.equity.toString(),
                filledQty: "0",
                status: "open"
            }
        });
        console.log(odr);
        let orderid = odr.id;
        body = { ...body, orderid, orderType: normalizedOrderType, type: normalizedSide };
        const data: toEngine = {
            messageType: "order",
            userId: body.id.toString(),
            body: JSON.stringify(body)
        };
        const engineresponse: any = await loopfunction(data);
        console.log(engineresponse);
        if (engineresponse.status == "true") {
            return res.json({
                message: " Order executed successfully ",
                filled_qty: engineresponse.response
            });
        } else {
            return res.status(400).json({ message: engineresponse.response || "sorry something went wrong " });
        }
    } catch (error: any) {
        console.error("Error creating order:", error);
        return res.status(500).json({ message: "Internal server error", error: error?.message });
    }
});


app.delete('/order', authenticateUser, async (req: Request, res: Response) => {
    try {
        const body = req.body;
        const order = await prisma.orders.findFirst({ where: { id: body.orderid } });
        if (!order) {
            return res.status(404).json({ message: "No order exists, please recheck" });
        }
        if (order.userid !== body.id) {
            return res.status(403).json({ message: "Unauthorized to cancel this order" });
        }
        const dataToEngine = { price: order.price, qty: order.qty, type: order.side, market: order.marketid, id: order.userid, orderid: order.id };
        const data: toEngine = {
            messageType: "delete-order",
            userId: body.id,
            body: JSON.stringify(dataToEngine)
        };
        const engineresponse: any = await loopfunction(data);
        if (engineresponse.status === "true") {
            return res.json({ message: "Order cancelled successfully", orderid: body.orderid });
        } else {
            return res.status(400).json({ message: engineresponse.response || "Order cancellation failed in engine" });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});


app.get("/equity/available", authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.body.id;
        const data: toEngine = {
            messageType: "get-equity",
            userId: userId.toString(),
            body: ""
        };
        const engineresponse: any = await loopfunction(data);
        if (engineresponse.status === "true" && engineresponse.response) {
            const balance = JSON.parse(engineresponse.response);
            return res.json({ available: balance.available, locked: balance.locked });
        } else {
            return res.status(404).json({ message: "Equity data not found" });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get(["/positions/all", "/positions/open"], authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.body.id;
        const data: toEngine = {
            messageType: "get-positions",
            userId: userId.toString(),
            body: JSON.stringify({ market: "all" })
        };
        const engineresponse: any = await loopfunction(data);
        if (engineresponse.status === "true" && engineresponse.response) {
            const positions = JSON.parse(engineresponse.response);
            return res.json({ positions });
        } else {
            return res.json({ positions: [] });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/orders/open", authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.body.id;
        const market = req.query.market as string | undefined;
        const whereClause: any = {
            userid: userId.toString(),
            status: { in: ["open", "partiallyFilled"] }
        };
        if (market) {
            whereClause.marketid = market;
        }
        const openOrders = await prisma.orders.findMany({
            where: whereClause,
            orderBy: { CreatedAt: "desc" }
        });
        return res.json({ orders: openOrders });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/positions/open/:marketId", authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.body.id;
        const marketId = req.params.marketId as string;
        const data: toEngine = {
            messageType: "get-positions",
            userId: userId.toString(),
            body: JSON.stringify({ market: marketId })
        };
        const engineresponse: any = await loopfunction(data);
        if (engineresponse.status === "true" && engineresponse.response) {
            const positions = JSON.parse(engineresponse.response);
            return res.json({ positions });
        } else {
            return res.json({ positions: [] });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/positions/closed/:marketId", authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.body.id;
        const marketId = req.params.marketId as string;
        const closedOrders = await prisma.orders.findMany({
            where: {
                userid: userId.toString(),
                marketid: marketId,
                status: { in: ["filled", "cancelled"] }
            },
            orderBy: { updatedAt: "desc" }
        });
        const fills = await prisma.fill.findMany({
            where: {
                marketId: marketId,
                OR: [
                    { makerId: userId.toString() },
                    { takerId: userId.toString() }
                ]
            },
            orderBy: { createdAt: "desc" }
        });
        return res.json({ closedOrders, fills });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/orders/open/:marketId", authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.body.id;
        const marketId = req.params.marketId as string;
        const openOrders = await prisma.orders.findMany({
            where: {
                userid: userId.toString(),
                marketid: marketId,
                status: { in: ["open", "partiallyFilled"] }
            },
            orderBy: { CreatedAt: "desc" }
        });
        return res.json({ orders: openOrders });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/orders/:marketId", authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.body.id;
        const marketId = req.params.marketId as string;
        const allOrders = await prisma.orders.findMany({
            where: {
                userid: userId.toString(),
                marketid: marketId
            },
            orderBy: { CreatedAt: "desc" }
        });
        return res.json({ orders: allOrders });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get(["/orderbook/:marketId", "/orderbook", "/depth/:marketId", "/depth"], async (req: Request, res: Response) => {
    try {
        const marketParam = (req.params.marketId || req.query.market || "SOL") as string;
        const market = marketParam.toUpperCase();

        try {
            const cached = await redisClient.get(`orderbook:${market}`);
            if (cached) {
                return res.json(JSON.parse(cached));
            }
        } catch {}

        const data: toEngine = {
            messageType: "get-orderbook",
            userId: "system",
            body: JSON.stringify({ market })
        };
        const engineresponse: any = await loopfunction(data);
        if (engineresponse.status === "true" && engineresponse.response) {
            const ob = JSON.parse(engineresponse.response);
            return res.json({
                type: "orderbook",
                market,
                bids: ob.bids,
                asks: ob.asks,
                lastTradedPrice: ob.lastTradedPrice
            });
        }
        return res.json({ market, bids: {}, asks: {}, lastTradedPrice: 0 });
    } catch (error) {
        console.error("Error fetching orderbook:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.delete("/orders/all/:marketId", authenticateUser, async (req: Request, res: Response) => {
    try {
        const userId = req.body.id;
        const marketId = req.params.marketId as string;
        const data: toEngine = {
            messageType: "cancel-all",
            userId: userId.toString(),
            body: JSON.stringify({ market: marketId })
        };
        const engineresponse: any = await loopfunction(data);
        if (engineresponse.status === "true") {
            const result = JSON.parse(engineresponse.response || "{}");
            return res.json({ message: "All open orders cancelled", ...result });
        } else {
            return res.status(400).json({ message: "Failed to cancel orders" });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.get("/markets", async (_req: Request, res: Response) => {
    try {
        const markets = [
            { id: "SOL", symbol: "SOL-PERP", baseAsset: "SOL", quoteAsset: "USDT", minQty: "0.1", tickSize: "0.01", maxLeverage: 50 },
            { id: "ETH", symbol: "ETH-PERP", baseAsset: "ETH", quoteAsset: "USDT", minQty: "0.01", tickSize: "0.1", maxLeverage: 50 },
            { id: "BTC", symbol: "BTC-PERP", baseAsset: "BTC", quoteAsset: "USDT", minQty: "0.001", tickSize: "0.5", maxLeverage: 100 },
        ];
        return res.json({ markets });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

const INTERVAL_SECONDS: Record<string, number> = {
    "1m": 60,
    "3m": 180,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "2h": 7200,
    "4h": 14400,
    "6h": 21600,
    "12h": 43200,
    "1d": 86400,
};

app.get("/klines", async (req: Request, res: Response) => {
    try {
        const market = String(req.query.market || "SOL").toUpperCase();
        const interval = String(req.query.interval || "1m").toLowerCase();
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 1000);
        const startTime = req.query.startTime ? Number(req.query.startTime) : undefined;
        const endTime = req.query.endTime ? Number(req.query.endTime) : undefined;

        if (interval === "1m") {
            const candles = await prisma.candle1m.findMany({
                where: {
                    market,
                    ...(startTime ? { timestamp: { gte: new Date(startTime) } } : {}),
                    ...(endTime ? { timestamp: { lte: new Date(endTime) } } : {})
                },
                orderBy: { timestamp: "desc" },
                take: limit
            });

            return res.json({
                market,
                interval: "1m",
                candles: candles.reverse().map((c) => ({
                    time: Math.floor(c.timestamp.getTime() / 1000),
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close,
                    volume: c.volume
                }))
            });
        }

        const bucketSeconds = INTERVAL_SECONDS[interval] || 900;
        const startFilter = startTime ? Prisma.sql`AND "timestamp" >= ${new Date(startTime)}` : Prisma.empty;
        const endFilter = endTime ? Prisma.sql`AND "timestamp" <= ${new Date(endTime)}` : Prisma.empty;

        const rawCandles: any[] = await prisma.$queryRaw`
            SELECT 
                to_timestamp(floor(extract('epoch' from "timestamp") / ${bucketSeconds}) * ${bucketSeconds}) AS "bucket",
                (ARRAY_AGG("open" ORDER BY "timestamp" ASC))[1] AS "open",
                MAX("high") AS "high",
                MIN("low") AS "low",
                (ARRAY_AGG("close" ORDER BY "timestamp" DESC))[1] AS "close",
                SUM("volume") AS "volume"
            FROM "Candle1m"
            WHERE "market" = ${market}
            ${startFilter}
            ${endFilter}
            GROUP BY "bucket"
            ORDER BY "bucket" DESC
            LIMIT ${limit};
        `;

        return res.json({
            market,
            interval,
            candles: rawCandles.reverse().map((c) => ({
                time: Math.floor(new Date(c.bucket).getTime() / 1000),
                open: Number(c.open),
                high: Number(c.high),
                low: Number(c.low),
                close: Number(c.close),
                volume: Number(c.volume)
            }))
        });
    } catch (error) {
        console.error("Error querying klines:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/funding/trigger/:marketId", authenticateUser, async (req: Request, res: Response) => {
    try {
        const marketId = req.params.marketId as string;
        const data: toEngine = {
            messageType: "funding",
            userId: req.body.id.toString(),
            body: JSON.stringify({ market: marketId })
        };
        const engineresponse: any = await loopfunction(data);
        return res.json({ message: "Funding rate settlement processed", ...JSON.parse(engineresponse.response || "{}") });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/snapshot/trigger", authenticateUser, async (req: Request, res: Response) => {
    try {
        const data: toEngine = {
            messageType: "snapshot",
            userId: req.body.id.toString()
        };
        const engineresponse: any = await loopfunction(data);
        return res.json({ message: "Engine snapshot triggered", snapshotId: engineresponse.response });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
});

if (import.meta.main) {
    const port = Number(process.env.PORT || 3003);
    httpServer.listen(port, () => {
        console.log(`Backend server running on http://localhost:${port}`);
    });
}
