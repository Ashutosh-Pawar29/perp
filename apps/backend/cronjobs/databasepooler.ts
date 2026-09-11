import { prisma } from "db";
import { createClient } from "redis";
import { candleAggregator } from "./candleAggregator";

type RedisResponse = {
    name: string;
    messages: {
        id: string;
        message: {
            [x: string]: string;
        };
        millisElapsedFromDelivery?: number | undefined;
        deliveriesCounter?: number | undefined;
    }[];
}[];

async function main() {
    const client = createClient();
    await client.connect();

    const pubClient = createClient();
    await pubClient.connect();
    await candleAggregator.init(pubClient);

    const DB_POOLER_GROUP = "db-pooler-group";
    const DB_POOLER_CONSUMER = "db-pooler-worker-1";

    try {
        await client.xGroupCreate("to-backend", DB_POOLER_GROUP, "$", {
            MKSTREAM: true
        });
    } catch (err: any) {
        if (!err.message?.includes("BUSYGROUP")) {
            console.error("Error creating consumer group for pooler:", err);
        }
    }

    console.log("[DB POOLER] Running and listening to 'to-backend' stream via consumer group...");

    while (1) {
        let rawData: any;
        try {
            rawData = await client.xReadGroup(
                DB_POOLER_GROUP,
                DB_POOLER_CONSUMER,
                [{ key: "to-backend", id: ">" }],
                { COUNT: 1, BLOCK: 0 }
            );
        } catch (err) {
            console.error("Error reading stream in databasepooler:", err);
            continue;
        }

        if (!rawData || !Array.isArray(rawData) || rawData.length === 0) continue;

        const data = rawData as unknown as RedisResponse;
        const firstStream = data[0];
        if (!firstStream || !firstStream.messages || firstStream.messages.length === 0) continue;

        const streamMessage = firstStream.messages[0];
        if (!streamMessage) continue;

        const message = streamMessage.message;
        const streamId = streamMessage.id;
        await client.xAck("to-backend", DB_POOLER_GROUP, streamId);

        if (!message) continue;

        if (message.databaseQuery == "update order") {
            if (!message.databaseData) continue;
            let database_updates = JSON.parse(message.databaseData);
            let ordersToUpdate = database_updates.orders || [];
            for (let i of ordersToUpdate) {
                console.log("Updating order ID:", i.id);
                const order = await prisma.orders.findUnique({
                    where: {
                        id: i.id,
                    },
                    select: {
                        filledQty: true,
                        qty: true,
                    },
                });

                if (!order) {
                    console.error(`Order not found: ${i.id}`);
                    continue;
                }

                const currentQty = parseFloat(order.filledQty || "0");
                const addedQty = i.status === "cancelled" ? 0 : parseFloat(i.filledQty || "0");
                const newFilledQty = i.status === "cancelled" ? currentQty : currentQty + addedQty;
                const totalQty = parseFloat(order.qty || "0");
                let newStatus: "open" | "filled" | "cancelled" | "partiallyFilled" = "open";
                if (i.status === "cancelled") {
                    newStatus = "cancelled";
                } else if (newFilledQty >= totalQty) {
                    newStatus = "filled";
                } else if (newFilledQty > 0) {
                    newStatus = "partiallyFilled";
                } else {
                    newStatus = "open";
                }

                const updatedOrder = await prisma.orders.update({
                    where: {
                        id: i.id,
                    },
                    data: {
                        filledQty: String(newFilledQty),
                        status: newStatus,
                    },
                });

                console.log("Updated order:", updatedOrder);

                // Publish private user_order update
                const userOrderPayload = JSON.stringify({
                    type: "user_order",
                    order: updatedOrder,
                    timestamp: Date.now()
                });
                await pubClient.publish(`user:${updatedOrder.userid}`, userOrderPayload);
            }
            let fillsToCreate = database_updates.fills || [];
            for (let f of fillsToCreate) {
                console.log("Creating fill record:", f);

                // 1. Publish trade event to Redis PubSub for public WebSocket subscribers
                const tradePayload = JSON.stringify({
                    type: "trade",
                    market: f.marketId,
                    price: f.price,
                    qty: f.qty,
                    makerId: f.makerId,
                    takerId: f.takerId,
                    makerOrderId: f.makerOrderId,
                    takerOrderId: f.takerOrderId,
                    timestamp: Date.now()
                });
                pubClient.publish(f.marketId, tradePayload).catch(() => {});
                pubClient.publish(f.marketId.toLowerCase(), tradePayload).catch(() => {});

                // 2. Publish private fill notification to maker and taker
                const makerFillPayload = JSON.stringify({
                    type: "user_fill",
                    role: "maker",
                    market: f.marketId,
                    price: f.price,
                    qty: f.qty,
                    orderId: f.makerOrderId,
                    timestamp: Date.now()
                });
                pubClient.publish(`user:${f.makerId}`, makerFillPayload).catch(() => {});

                const takerFillPayload = JSON.stringify({
                    type: "user_fill",
                    role: "taker",
                    market: f.marketId,
                    price: f.price,
                    qty: f.qty,
                    orderId: f.takerOrderId,
                    timestamp: Date.now()
                });
                pubClient.publish(`user:${f.takerId}`, takerFillPayload).catch(() => {});

                // 3. Update 1-minute candlestick aggregator & persist to PostgreSQL
                candleAggregator.processTrade({
                    market: f.marketId,
                    price: parseFloat(f.price),
                    qty: parseFloat(f.qty),
                    timestamp: Date.now()
                }).catch((err) => {
                    console.error("[CANDLE AGGREGATOR] Error processing trade:", err);
                });

                // 4. Persist fill to DB (safely ensuring MM orders exist in Orders table)
                try {
                    if (f.makerOrderId && f.makerOrderId.startsWith("mm_")) {
                        await prisma.orders.upsert({
                            where: { id: f.makerOrderId },
                            update: {},
                            create: {
                                id: f.makerOrderId,
                                userid: f.makerId,
                                marketid: f.marketId,
                                orderType: "Limit",
                                side: f.makerOrderId.includes("bid") ? "LONG" : "SHORT",
                                price: f.price,
                                qty: f.qty,
                                initialMargin: "0",
                                filledQty: f.qty,
                                status: "filled"
                            }
                        }).catch(() => {});
                    }

                    await prisma.fill.create({
                        data: {
                            makerId: f.makerId,
                            takerId: f.takerId,
                            qty: f.qty,
                            price: f.price,
                            makerOrderId: f.makerOrderId,
                            takerOrderId: f.takerOrderId,
                            marketId: f.marketId
                        }
                    });
                } catch (err) {
                    console.error("Failed to create fill record in DB:", err);
                }
            }


            // Publish orderbook snapshot to Redis PubSub and cache in Redis key
            let ob = database_updates.orderbook;
            if (ob && ob.market) {
                const obPayload = JSON.stringify({
                    type: "orderbook",
                    market: ob.market,
                    bids: ob.bids,
                    asks: ob.asks,
                    lastTradedPrice: ob.lastTradedPrice,
                    timestamp: Date.now()
                });
                await pubClient.set(`orderbook:${ob.market.toUpperCase()}`, obPayload);
                await pubClient.publish(ob.market, obPayload);
                await pubClient.publish(ob.market.toLowerCase(), obPayload);
            }
        } else if (message.databaseQuery == "delete order") {
            if (!message.databaseData) continue;
            let data = JSON.parse(message.databaseData);
            if (data.orderid) {
                const cancelledOrder = await prisma.orders.update({
                    where: { id: data.orderid },
                    data: { status: "cancelled" }
                });
                const userOrderPayload = JSON.stringify({
                    type: "user_order",
                    order: cancelledOrder,
                    timestamp: Date.now()
                });
                await pubClient.publish(`user:${cancelledOrder.userid}`, userOrderPayload);
            }

            if (data.orderbook && data.orderbook.market) {
                const ob = data.orderbook;
                const obPayload = JSON.stringify({
                    type: "orderbook",
                    market: ob.market,
                    bids: ob.bids,
                    asks: ob.asks,
                    lastTradedPrice: ob.lastTradedPrice,
                    timestamp: Date.now()
                });
                await pubClient.set(`orderbook:${ob.market.toUpperCase()}`, obPayload);
                await pubClient.publish(ob.market, obPayload);
                await pubClient.publish(ob.market.toLowerCase(), obPayload);
            }
        }
    }
}

main();
