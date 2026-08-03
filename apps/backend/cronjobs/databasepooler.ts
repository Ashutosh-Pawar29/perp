import { prisma } from "db";
import { createClient } from "redis"

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

    while (1) {
        let rawData = await client.xRead([{ key: "to-backend", id: "$" }], { COUNT: 1, BLOCK: 0 });
        if (!rawData || !Array.isArray(rawData) || rawData.length === 0) continue;

        const data = rawData as unknown as RedisResponse;
        const firstStream = data[0];
        if (!firstStream || !firstStream.messages || firstStream.messages.length === 0) continue;

        const message = firstStream.messages[0]?.message;
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
                const addedQty = parseFloat(i.filledQty || "0");
                const newFilledQty = currentQty + addedQty;
                const totalQty = parseFloat(order.qty || "0");
                let newStatus: "open" | "filled" | "cancelled" | "partiallyFilled" = "open";
                if (newFilledQty >= totalQty) {
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
            }
            let fillsToCreate = database_updates.fills || [];
            for (let f of fillsToCreate) {
                console.log("Creating fill record:", f);
                try {
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

                    // Publish trade event to Redis PubSub for WebSocket subscribers
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
                    await pubClient.publish(f.marketId, tradePayload);
                    await pubClient.publish(f.marketId.toLowerCase(), tradePayload);
                } catch (err) {
                    console.error("Failed to create fill record:", err);
                }
            }

            // Publish orderbook snapshot to Redis PubSub if provided
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
                await pubClient.publish(ob.market, obPayload);
                await pubClient.publish(ob.market.toLowerCase(), obPayload);
            }
        } else if (message.databaseQuery == "delete order") {
            if (!message.databaseData) continue;
            let data = JSON.parse(message.databaseData);
            if (data.orderid) {
                await prisma.orders.update({
                    where: { id: data.orderid },
                    data: { status: "cancelled" }
                });
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
                await pubClient.publish(ob.market, obPayload);
                await pubClient.publish(ob.market.toLowerCase(), obPayload);
            }
        }
        // last_id = firstStream.messages[0]?.id as string
    }
}

main();
