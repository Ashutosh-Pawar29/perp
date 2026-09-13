import { createClient } from "redis";
import type { engineorder, Handleusersfilledqty, retMatchingengine, Users } from "commons"
import { calculateLiquidationPrice, handleusersfilledqty } from "./handleusersfilledqty";
import { handlefillorder } from "./fillorder";
import { saveSnapshot, loadLatestSnapshot } from "./snapshot";
import { applyFunding } from "./funding";

const client = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
await client.connect()

const publisher = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" });
await publisher.connect();
const ENGINE_CONSUMER_GROUP = "engine";
const ENGINE_CONSUMER_NAME = "engine-worker";

try {
    await client.xGroupCreate("engine", ENGINE_CONSUMER_GROUP, "$", {
        MKSTREAM: true
    });
} catch (err: any) {
    if (!err.message?.includes("BUSYGROUP")) {
        console.error("Error creating consumer group:", err);
    }
}


type Bid = {
    availableQty: number,
    openOrders: { userId: string, qty: number, filledQty: number, orderId: string, createdAt: Date, leverage: string }[]
}

type Orderbook = {
    bids: Record<string, Bid>,
    asks: Record<string, Bid>,
    lastTradedPrice: number,
    indexPrice: number
    // poolfund: number
}
/*
bids: {string: {
    availableQty: number,
    openOrders: { userId: number, qty: number, filledQty: number, orderId: number, createdAt: Date }[]
}
}
*/

type Orderbooks = Record<string, Orderbook>
let insuranceFund: number = 0;
let lastProcessedStreamId: string = "0-0";
const balances: Map<string, { available: string, locked: string }> = new Map();
const positions: Users[] = [{
    userId: "1",
    positions: [
        { market: "SOL", type: "LONG", qty: 10, margin: 500, liquidationPrice: 80, averagePrice: 90 },
        { market: "ETH", type: "SHORT", qty: 1, margin: 500, liquidationPrice: 2000, averagePrice: 1900 }
    ]
}, {
    userId: "2",
    positions: [
        { market: "SOL", type: "SHORT", qty: 10, margin: 1000, liquidationPrice: 80, pnL: 200, averagePrice: 90 },
        { market: "ETH", type: "LONG", qty: 1, margin: 1000, liquidationPrice: 2000, pnL: -100, averagePrice: 1900 }
    ],
}];
const orderbooks: Orderbooks = {
    SOL: { bids: {}, asks: {}, lastTradedPrice: 150, indexPrice: 150 },
    ETH: { bids: {}, asks: {}, lastTradedPrice: 3400, indexPrice: 3400 },
    BTC: { bids: {}, asks: {}, lastTradedPrice: 64000, indexPrice: 64000 }
};

export function ensureMarketMakerLiquidity() {
    const MM_USER_ID = "00000000-0000-0000-0000-000000000001";
    balances.set(MM_USER_ID, { available: "100000000", locked: "0" });
    if (!positions.some(u => u.userId === MM_USER_ID)) {
        positions.push({ userId: MM_USER_ID, positions: [] });
    }

    // SOL Resting Liquidity
    const solAsks: Record<string, number> = { "150.2": 25, "150.5": 40, "150.8": 30, "151.0": 50, "151.2": 20 };
    const solBids: Record<string, number> = { "149.8": 25, "149.5": 40, "149.2": 30, "149.0": 50, "148.5": 20 };
    for (const [p, q] of Object.entries(solAsks)) {
        orderbooks.SOL.asks[p] = {
            availableQty: q,
            openOrders: [{ userId: MM_USER_ID, qty: q, filledQty: 0, orderId: `mm_ask_${p}`, createdAt: new Date(), leverage: "1" }]
        };
    }
    for (const [p, q] of Object.entries(solBids)) {
        orderbooks.SOL.bids[p] = {
            availableQty: q,
            openOrders: [{ userId: MM_USER_ID, qty: q, filledQty: 0, orderId: `mm_bid_${p}`, createdAt: new Date(), leverage: "1" }]
        };
    }

    // ETH Resting Liquidity
    const ethAsks: Record<string, number> = { "3402": 10, "3405": 15, "3410": 20 };
    const ethBids: Record<string, number> = { "3398": 10, "3395": 15, "3390": 20 };
    for (const [p, q] of Object.entries(ethAsks)) {
        orderbooks.ETH.asks[p] = {
            availableQty: q,
            openOrders: [{ userId: MM_USER_ID, qty: q, filledQty: 0, orderId: `mm_eth_ask_${p}`, createdAt: new Date(), leverage: "1" }]
        };
    }
    for (const [p, q] of Object.entries(ethBids)) {
        orderbooks.ETH.bids[p] = {
            availableQty: q,
            openOrders: [{ userId: MM_USER_ID, qty: q, filledQty: 0, orderId: `mm_eth_bid_${p}`, createdAt: new Date(), leverage: "1" }]
        };
    }

    // BTC Resting Liquidity
    const btcAsks: Record<string, number> = { "64050": 2, "64100": 3, "64200": 5 };
    const btcBids: Record<string, number> = { "63950": 2, "63900": 3, "63800": 5 };
    for (const [p, q] of Object.entries(btcAsks)) {
        orderbooks.BTC.asks[p] = {
            availableQty: q,
            openOrders: [{ userId: MM_USER_ID, qty: q, filledQty: 0, orderId: `mm_btc_ask_${p}`, createdAt: new Date(), leverage: "1" }]
        };
    }
    for (const [p, q] of Object.entries(btcBids)) {
        orderbooks.BTC.bids[p] = {
            availableQty: q,
            openOrders: [{ userId: MM_USER_ID, qty: q, filledQty: 0, orderId: `mm_btc_bid_${p}`, createdAt: new Date(), leverage: "1" }]
        };
    }

    for (const m of ["SOL", "ETH", "BTC"]) {
        const snap = getOrderbookSnapshot(m);
        const payload = JSON.stringify({
            type: "orderbook",
            market: m,
            bids: snap.bids,
            asks: snap.asks,
            lastTradedPrice: snap.lastTradedPrice,
            timestamp: Date.now()
        });
        publisher.set(`orderbook:${m}`, payload).catch(() => {});
        publisher.publish(m, payload).catch(() => {});
    }
}
ensureMarketMakerLiquidity();


function getOrderbookSnapshot(market: string) {
    const ob = orderbooks[market];
    if (!ob) return { market, bids: {}, asks: {}, lastTradedPrice: 0 };

    // Purge empty price levels with 0 available quantity or no open orders
    for (const p in ob.bids) {
        if (!ob.bids[p] || (ob.bids[p].availableQty || 0) <= 0 || !ob.bids[p].openOrders?.length) {
            delete ob.bids[p];
        }
    }
    for (const p in ob.asks) {
        if (!ob.asks[p] || (ob.asks[p].availableQty || 0) <= 0 || !ob.asks[p].openOrders?.length) {
            delete ob.asks[p];
        }
    }

    return {
        market,
        bids: ob.bids,
        asks: ob.asks,
        lastTradedPrice: ob.lastTradedPrice
    };
}


async function processEngineMessage(message: any, isReplay: boolean = false) {
    if (!message || !message.messageType && !(message.market && message.price)) return;
    console.log(isReplay ? `[REPLAY] ${message.messageType}` : `[LIVE] ${message.messageType}`, message);

    if (message.messageType == "signup") {
        balances.set(message.userId, { "available": message.balance, "locked": message.balance });
        positions.push({ userId: message.userId, positions: [] });
        if (!isReplay) {
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId,
                status: "true"
            });
        }
    }

    else if (message.messageType == "onramp") {
        let userbalances = balances.get(message.userId);
        if (!userbalances) {
            if (!isReplay) {
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: "false"
                });
            }
        } else {
            let availabebalance = Number(userbalances.available);
            availabebalance += Number(message.balance!);
            balances.set(message.userId, { "available": String(availabebalance), "locked": userbalances.locked });
            if (!isReplay) {
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: String(true)
                });
                await publisher.publish(`user:${message.userId}`, JSON.stringify({
                    type: "user_balance",
                    available: String(availabebalance),
                    locked: userbalances.locked,
                    timestamp: Date.now()
                }));
            }
        }
    }

    else if (message.messageType == "offramp") {
        let userbalances = balances.get(message.userId);
        if (!userbalances) {
            if (!isReplay) {
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: "false",
                    response: "User balance not found"
                });
            }
        } else {
            let availabebalance = Number(userbalances.available);
            let withdrawAmount = Number(message.balance);
            if (availabebalance >= withdrawAmount && withdrawAmount > 0) {
                userbalances.available = String(availabebalance - withdrawAmount);
                balances.set(message.userId, userbalances);
                if (!isReplay) {
                    await publisher.xAdd("to-backend", "*", {
                        loopBackId: message.loopBackId,
                        status: "true",
                        response: String(withdrawAmount)
                    });
                    await publisher.publish(`user:${message.userId}`, JSON.stringify({
                        type: "user_balance",
                        available: userbalances.available,
                        locked: userbalances.locked,
                        timestamp: Date.now()
                    }));
                }
            } else {

                if (!isReplay) {
                    await publisher.xAdd("to-backend", "*", {
                        loopBackId: message.loopBackId,
                        status: "false",
                        response: "Insufficient available balance"
                    });
                }
            }
        }
    }

    // orders handling 
    else if (message.messageType == "order") {
        let body = JSON.parse(message.body);
        const { price, qty, equity, type, market, id, orderType, orderid } = body;
        const isMarket = orderType?.toLowerCase() === "market";
        const levrage = (Number(price) * Number(qty)) / (Number(equity) || 1);

        let balance = balances.get(message.userId);
        if (!balance) {
            if (!isReplay) {
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: "false",
                    response: "not find balance entry",
                    databaseQuery: "delete order",
                    databaseData: JSON.stringify({ orderid })
                });
            }
            return;
        } else {
            if (Number(balance.available) < Number(equity)) {
                if (!isReplay) {
                    await publisher.xAdd("to-backend", "*", {
                        loopBackId: message.loopBackId,
                        status: "false",
                        response: "not sufficient balance",
                        databaseQuery: "delete order",
                        databaseData: JSON.stringify({ orderid })
                    });
                }
                return;
            } else {
                for (const u of positions) {
                    if (u.userId === id) {
                        let positionexist = false;
                        for (const position of u.positions) {
                            if (position.market == market) {
                                positionexist = true;
                                if (position.type == type) {
                                    balance.available = String(Number(balance.available) - Number(equity));
                                    balance.locked = String(Number(balance.locked) + Number(equity));
                                    balances.set(id, balance);
                                    break;
                                } else {
                                    if (Number(position.qty) >= Number(qty)) {
                                        break;
                                    } else {
                                        balance.available = String(Number(balance.available) - ((Number(qty) - Number(position.qty)) * Number(price)) / levrage);
                                        balance.locked = String(Number(balance.locked) + ((Number(qty) - Number(position.qty)) * Number(price)) / levrage);
                                        balances.set(id, balance);
                                        break;
                                    }
                                }
                            }
                        }
                        if (!positionexist) {
                            balance.available = String(Number(balance.available) - Number(equity));
                            balance.locked = String(Number(balance.locked) + Number(equity));
                            balances.set(id, balance);
                        }

                        const filledorderdetails = matchingengine(market, type, qty, price, equity, message.userId, orderid, orderType);

                        if (isMarket) {
                            const totalFilled = Number(filledorderdetails.updatedorders.at(-1)?.filledQty || 0);
                            const unfilledQty = Math.max(0, qty - totalFilled);
                            const unfilledMargin = (unfilledQty / qty) * Number(equity);
                            if (unfilledMargin > 0) {
                                balance.available = String(Number(balance.available) + unfilledMargin);
                                balance.locked = String(Math.max(0, Number(balance.locked) - unfilledMargin));
                                balances.set(id, balance);
                            }
                            if (totalFilled === 0) {
                                filledorderdetails.status = false;
                            }
                        }

                        if (!isReplay) {
                            const takerBal = balances.get(id);
                            if (takerBal) {
                                await publisher.publish(`user:${id}`, JSON.stringify({
                                    type: "user_balance",
                                    available: takerBal.available,
                                    locked: takerBal.locked,
                                    timestamp: Date.now()
                                }));
                            }
                            if (filledorderdetails.fills && filledorderdetails.fills.length > 0) {
                                const makerIds = new Set(filledorderdetails.fills.map(f => f.makerId));
                                for (const makerId of makerIds) {
                                    const makerBal = balances.get(makerId);
                                    if (makerBal) {
                                        await publisher.publish(`user:${makerId}`, JSON.stringify({
                                            type: "user_balance",
                                            available: makerBal.available,
                                            locked: makerBal.locked,
                                            timestamp: Date.now()
                                        }));
                                    }
                                }
                            }

                            if (filledorderdetails.status) {
                                await publisher.xAdd("to-backend", "*", {
                                    loopBackId: message.loopBackId,
                                    status: "true",
                                    response: `${filledorderdetails.updatedorders.at(-1)?.filledQty}`,
                                    databaseQuery: "update order",
                                    databaseData: JSON.stringify({ orders: filledorderdetails.updatedorders, fills: filledorderdetails.fills, orderbook: getOrderbookSnapshot(market) })
                                });
                            } else {
                                await publisher.xAdd("to-backend", "*", {
                                    loopBackId: message.loopBackId,
                                    status: "false",
                                    response: isMarket ? "market order unfilled - cancelled" : "order rejected",
                                    databaseQuery: "delete order",
                                    databaseData: JSON.stringify({ orderid })
                                });
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    else if (message.messageType === "markPrice" || message.messageType === "liquidation" || (message.market && message.price && !message.messageType)) {
        const market = message.market;
        const price = Number(message.price);
        if (market && !isNaN(price)) {
            const ob = orderbooks[market];
            if (ob) {
                ob.indexPrice = price;
            }
            liquidationChecks(market, price);
        }
    }

    else if (message.messageType == 'delete-order') {
        let body = JSON.parse(message.body);
        const { price, qty, type, market, id, orderid } = body;
        let updates = [];
        let orderDeleted = false;
        if (type == "LONG") {
            let openorders = orderbooks[market]?.bids[price]?.openOrders;
            if (openorders) {
                for (const order of openorders) {
                    if (order.orderId == orderid) {
                        let remainingQty = order.qty - order.filledQty;
                        const bid = orderbooks[market]?.bids[price];
                        if (bid) {
                            bid.availableQty -= remainingQty;
                        }
                        const idx = openorders.indexOf(order);
                        openorders.splice(idx, 1);
                        if (bid && (bid.availableQty <= 0 || openorders.length === 0)) {
                            delete orderbooks[market]?.bids[price];
                        }
                        orderDeleted = true;
                        updates.push(order);
                        // Release locked margin
                        let userBalance = balances.get(id);
                        if (userBalance) {
                            const refundMargin = (remainingQty * Number(price)) / (Number(order.leverage) || 1);
                            userBalance.locked = String(Math.max(0, Number(userBalance.locked) - refundMargin));
                            userBalance.available = String(Number(userBalance.available) + refundMargin);
                            balances.set(id, userBalance);
                        }
                        break;
                    }
                }
            }
        } else {
            let openorders = orderbooks[market]?.asks[price]?.openOrders;
            if (openorders) {
                for (const order of openorders) {
                    if (order.orderId == orderid) {
                        let remainingQty = order.qty - order.filledQty;
                        const ask = orderbooks[market]?.asks[price];
                        if (ask) {
                            ask.availableQty -= remainingQty;
                        }
                        const idx = openorders.indexOf(order);
                        openorders.splice(idx, 1);
                        if (ask && (ask.availableQty <= 0 || openorders.length === 0)) {
                            delete orderbooks[market]?.asks[price];
                        }
                        orderDeleted = true;
                        updates.push(order);
                        // Release locked margin
                        let userBalance = balances.get(id);
                        if (userBalance) {
                            const refundMargin = (remainingQty * Number(price)) / (Number(order.leverage) || 1);
                            userBalance.locked = String(Math.max(0, Number(userBalance.locked) - refundMargin));
                            userBalance.available = String(Number(userBalance.available) + refundMargin);
                            balances.set(id, userBalance);
                        }
                        break;
                    }
                }
            }
        }
        if (!isReplay) {
            if (orderDeleted) {
                const userBalance = balances.get(id);
                if (userBalance) {
                    await publisher.publish(`user:${id}`, JSON.stringify({
                        type: "user_balance",
                        available: userBalance.available,
                        locked: userBalance.locked,
                        timestamp: Date.now()
                    }));
                }
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: String(true),
                    databaseQuery: "update order",
                    databaseData: JSON.stringify({ orders: updates.map(o => ({ id: o.orderId, filledQty: String(o.filledQty), status: "cancelled" })), orderbook: getOrderbookSnapshot(market) }),
                    update: JSON.stringify({ updates })
                });
            } else {
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: String(false),
                    response: "Order not found"
                });
            }
        }
    }

    else if (message.messageType == 'cancel-all') {
        let body = message.body ? JSON.parse(message.body) : {};
        let market = body.market;
        let userId = message.userId;
        let cancelledOrders: string[] = [];
        let refundedMargin = 0;

        const ob = orderbooks[market];
        if (ob) {
            for (const price in ob.bids) {
                const bid = ob.bids[price];
                if (!bid) continue;
                const remaining = [];
                for (const order of bid.openOrders) {
                    if (order.userId === userId) {
                        const unFilled = order.qty - order.filledQty;
                        bid.availableQty -= unFilled;
                        cancelledOrders.push(order.orderId);
                        refundedMargin += (unFilled * Number(price)) / (Number(order.leverage) || 1);
                    } else {
                        remaining.push(order);
                    }
                }
                bid.openOrders = remaining;
                if (bid.availableQty <= 0) delete ob.bids[price];
            }

            for (const price in ob.asks) {
                const ask = ob.asks[price];
                if (!ask) continue;
                const remaining = [];
                for (const order of ask.openOrders) {
                    if (order.userId === userId) {
                        const unFilled = order.qty - order.filledQty;
                        ask.availableQty -= unFilled;
                        cancelledOrders.push(order.orderId);
                        refundedMargin += (unFilled * Number(price)) / (Number(order.leverage) || 1);
                    } else {
                        remaining.push(order);
                    }
                }
                ask.openOrders = remaining;
                if (ask.availableQty <= 0) delete ob.asks[price];
            }
        }

        let userBalance = balances.get(userId);
        if (userBalance && refundedMargin > 0) {
            userBalance.locked = String(Math.max(0, Number(userBalance.locked) - refundedMargin));
            userBalance.available = String(Number(userBalance.available) + refundedMargin);
            balances.set(userId, userBalance);
        }

        if (!isReplay) {
            if (userBalance) {
                await publisher.publish(`user:${userId}`, JSON.stringify({
                    type: "user_balance",
                    available: userBalance.available,
                    locked: userBalance.locked,
                    timestamp: Date.now()
                }));
            }
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId,
                status: "true",
                response: JSON.stringify({ cancelledCount: cancelledOrders.length, cancelledOrders }),
                databaseQuery: "update order",
                databaseData: JSON.stringify({
                    orders: cancelledOrders.map(id => ({ id, filledQty: "0", status: "cancelled" })),
                    orderbook: getOrderbookSnapshot(market)
                })
            });
        }
    }

    else if (message.messageType === "funding") {
        let body = message.body ? JSON.parse(message.body) : {};
        let market = body.market || "SOL";
        const { fundingRate, payments } = applyFunding(market, orderbooks, positions, balances);
        if (!isReplay) {
            for (const payment of payments) {
                const userBal = balances.get(payment.userId);
                await publisher.publish(`user:${payment.userId}`, JSON.stringify({
                    type: "user_funding",
                    market,
                    fundingRate,
                    payment: payment.payment,
                    positionType: payment.positionType,
                    balance: userBal,
                    timestamp: Date.now()
                }));
            }
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId,
                status: "true",
                response: JSON.stringify({ market, fundingRate, paymentsCount: payments.length })
            });
        }
    }

    else if (message.messageType === "snapshot") {
        const snapId = await saveSnapshot(lastProcessedStreamId, balances, positions, orderbooks, insuranceFund);
        if (!isReplay) {
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId,
                status: snapId ? "true" : "false",
                response: snapId || "failed"
            });
        }
    }

    else if (message.messageType === "get-equity") {
        let userBalance = balances.get(message.userId) || { available: "0", locked: "0" };
        if (!isReplay) {
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId,
                status: "true",
                response: JSON.stringify(userBalance)
            });
        }
    }

    else if (message.messageType === "get-positions") {
        let body = message.body ? JSON.parse(message.body) : {};
        let market = body.market;
        let userEntry = positions.find((u) => u.userId === message.userId);
        let userPositions = userEntry ? userEntry.positions : [];
        if (market && market !== "all") {
            userPositions = userPositions.filter((p) => p.market === market);
        }
        if (!isReplay) {
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId,
                status: "true",
                response: JSON.stringify(userPositions)
            });
        }
    }

    else if (message.messageType === "get-orderbook") {
        let body = message.body ? JSON.parse(message.body) : {};
        let market = (body.market || "SOL").toUpperCase();
        const snapshot = getOrderbookSnapshot(market);
        if (!isReplay) {
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId,
                status: "true",
                response: JSON.stringify(snapshot)
            });
        }
    }
}

async function matching() {
    while (1) {
        let response: any;
        try {
            response = await client.xReadGroup(ENGINE_CONSUMER_GROUP, ENGINE_CONSUMER_NAME, [{
                key: "engine",
                id: ">"
            }], {
                BLOCK: 0,
                COUNT: 1
            });
        } catch (err) {
            console.error("Error reading from engine stream:", err);
            continue;
        }

        if (!response || !Array.isArray(response) || response.length === 0) continue;
        const streamEntry = response[0]?.messages?.[0];
        if (!streamEntry) continue;

        const message = streamEntry.message;
        const messageId = streamEntry.id;
        lastProcessedStreamId = messageId;
        await client.xAck("engine", ENGINE_CONSUMER_GROUP, messageId);
        await processEngineMessage(message, false);
    }
}





function addOrderToOrderbook(
    obj: Orderbook,
    side: "LONG" | "SHORT",
    price: number,
    userId: string,
    originalQty: number,
    remainingQty: number,
    filledQty: number,
    orderId: string,
    leverage: string
): { orderOnOrderbook: boolean; fullyfilled: boolean } {
    const book = side === "LONG" ? obj.bids : obj.asks;
    let orderOnOrderbook = false;
    for (const existing_order in book) {
        if (!book[existing_order]) continue;
        if (Number(existing_order) == price) {
            book[existing_order].availableQty += remainingQty;
            const createdAt = new Date();
            book[existing_order].openOrders = [
                ...book[existing_order].openOrders,
                { userId, qty: originalQty, filledQty, orderId, createdAt, leverage }
            ];
            orderOnOrderbook = true;
            break;
        }
    }
    if (!orderOnOrderbook) {
        book[String(price)] = {
            availableQty: remainingQty,
            openOrders: [{ userId, qty: originalQty, filledQty, orderId, createdAt: new Date(), leverage }]
        };
        // Sort bids descending, asks ascending
        if (side === "LONG") {
            obj.bids = Object.fromEntries(
                Object.entries(obj.bids).sort(
                    ([priceA], [priceB]) => Number(priceB) - Number(priceA)
                )
            );
        } else {
            obj.asks = Object.fromEntries(
                Object.entries(obj.asks).sort(
                    ([priceA], [priceB]) => Number(priceA) - Number(priceB)
                )
            );
        }
        orderOnOrderbook = true;
    }
    return { orderOnOrderbook, fullyfilled: false };
}




function matchingengine(market: string, Takertype: string, Takerqty: number, Takerprice: number, Takerequity: number, Takeruserid: string, Takerorderid: string, TakerOrderType: string) {
    const isMarket = TakerOrderType?.toLowerCase() === "market";
    for (const stock in orderbooks) {
        let leverage = (Takerqty * Takerprice) / (Takerequity || 1)
        const obj = orderbooks[stock]
        if (!obj) continue
        if (stock === market) {
            let takerFilledQty = 0
            let fullyfilled = true
            let Taker: retMatchingengine = {
                engargs: { market: market, Takertype: Takertype, Takerqty: Takerqty, Takerprice: Takerprice, Takerequity: Takerequity, Takeruserid: Takeruserid, Takerorderid: Takerorderid, takerFilledQty: takerFilledQty },
                ordersupdate: [],
                fills: []
            }
            if (Takertype == "LONG") {
                // For LONG orders: match against ASKS in strictly ASCENDING price order (cheapest ask first)
                const sortedAskPrices = Object.keys(obj.asks)
                    .map(Number)
                    .filter(p => !isNaN(p) && (obj.asks[String(p)]?.availableQty || 0) > 0 && (obj.asks[String(p)]?.openOrders?.length || 0) > 0)
                    .sort((a, b) => a - b);

                for (const askPrice of sortedAskPrices) {
                    if (Taker.engargs.Takerqty <= 0) {
                        fullyfilled = true;
                        break;
                    }
                    if (!isMarket && askPrice > Takerprice) {
                        // Asks are sorted ascending; since this ask is above the limit buy price, no further asks can match
                        break;
                    }
                    const priceKey = String(askPrice);
                    const bookLevel = obj.asks[priceKey];
                    if (!bookLevel || bookLevel.availableQty <= 0) continue;

                    const args = { price: askPrice, ordertype: "SHORT", market: market };
                    let y = handlefillorder(bookLevel, positions, Taker.engargs, balances, args);
                    Taker.engargs = y.engargs;
                    Taker.ordersupdate = [...Taker.ordersupdate, ...y.ordersupdate];
                    Taker.fills = [...Taker.fills, ...(y.fills || [])];

                    if (bookLevel.availableQty <= 0 || bookLevel.openOrders.length === 0) {
                        delete obj.asks[priceKey];
                    }
                }
                if (Taker.engargs.Takerqty > 0 && !isMarket) {
                    const res = addOrderToOrderbook(obj, "LONG", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString());
                    fullyfilled = res.fullyfilled;
                    Taker.engargs.Takerqty = 0;
                }
            }
            else if (Takertype === "SHORT") {
                // For SHORT orders: match against BIDS in strictly DESCENDING price order (highest bid first)
                const sortedBidPrices = Object.keys(obj.bids)
                    .map(Number)
                    .filter(p => !isNaN(p) && (obj.bids[String(p)]?.availableQty || 0) > 0 && (obj.bids[String(p)]?.openOrders?.length || 0) > 0)
                    .sort((a, b) => b - a);

                for (const bidPrice of sortedBidPrices) {
                    if (Taker.engargs.Takerqty <= 0) {
                        fullyfilled = true;
                        break;
                    }
                    if (!isMarket && bidPrice < Takerprice) {
                        // Bids are sorted descending; since this bid is below the limit sell price, no further bids can match
                        break;
                    }
                    const priceKey = String(bidPrice);
                    const bookLevel = obj.bids[priceKey];
                    if (!bookLevel || bookLevel.availableQty <= 0) continue;

                    const args = { price: bidPrice, ordertype: "LONG", market: market };
                    let y = handlefillorder(bookLevel, positions, Taker.engargs, balances, args);
                    Taker.engargs = y.engargs;
                    Taker.ordersupdate = [...Taker.ordersupdate, ...y.ordersupdate];
                    Taker.fills = [...Taker.fills, ...(y.fills || [])];

                    if (bookLevel.availableQty <= 0 || bookLevel.openOrders.length === 0) {
                        delete obj.bids[priceKey];
                    }
                }
                if (Taker.engargs.Takerqty > 0 && !isMarket) {
                    const res = addOrderToOrderbook(obj, "SHORT", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString());
                    fullyfilled = res.fullyfilled;
                    Taker.engargs.Takerqty = 0;
                }
            }

            let yz: engineorder = { id: Takerorderid, filledQty: Taker.engargs.takerFilledQty.toString() }
            const updatedorders = [...Taker.ordersupdate, yz]
            const executionStatus = Taker.engargs.takerFilledQty > 0 || (!isMarket)

            if (Taker.engargs.takerFilledQty > 0) {
                const executionPrice = Taker.fills.length > 0 ? Number(Taker.fills[Taker.fills.length - 1].price) : Takerprice;
                const TAKER_FEE_RATE = 0.0005; // 0.05%
                const fee = Taker.engargs.takerFilledQty * executionPrice * TAKER_FEE_RATE;
                let takerBalance = balances.get(Takeruserid);
                if (takerBalance) {
                    takerBalance.available = String(Math.max(0, Number(takerBalance.available) - fee));
                    balances.set(Takeruserid, takerBalance);
                    insuranceFund += fee;
                }
                obj.lastTradedPrice = executionPrice;
            }

            return { status: executionStatus, updatedorders, fills: Taker.fills }

        }
    }
    return { status: false, updatedorders: [] }
}





function executeADL(market: string, counterpartySide: string, requiredQty: number, currentPrice: number) {
    const marketNormalized = market.replace(/USDT$/i, "").toUpperCase();
    let remainingToDeleverage = requiredQty;

    // Collect all active positions matching market and counterpartySide
    let candidates: { user: Users; pos: { market: string; type: string; qty: number; margin: number; liquidationPrice: number; pnL?: number; averagePrice: number }; pnlPercent: number }[] = [];

    for (let u of positions) {
        for (let pos of u.positions) {
            const posMarket = pos.market.replace(/USDT$/i, "").toUpperCase();
            if (posMarket === marketNormalized && pos.type === counterpartySide && pos.qty > 0) {
                let pnlPercent = 0;
                if (counterpartySide === "LONG") {
                    pnlPercent = (currentPrice - pos.averagePrice) / (pos.averagePrice || 1);
                } else {
                    pnlPercent = (pos.averagePrice - currentPrice) / (pos.averagePrice || 1);
                }
                candidates.push({ user: u, pos, pnlPercent });
            }
        }
    }

    // Sort candidates descending by pnlPercent (most profitable positions deleveraged first)
    candidates.sort((a, b) => b.pnlPercent - a.pnlPercent);

    for (let candidate of candidates) {
        if (remainingToDeleverage <= 0) break;

        const deleverageQty = Math.min(candidate.pos.qty, remainingToDeleverage);
        const marginPerUnit = candidate.pos.margin / candidate.pos.qty;
        const releasedMargin = marginPerUnit * deleverageQty;

        let realizedPnl = 0;
        if (counterpartySide === "LONG") {
            realizedPnl = (currentPrice - candidate.pos.averagePrice) * deleverageQty;
        } else {
            realizedPnl = (candidate.pos.averagePrice - currentPrice) * deleverageQty;
        }

        // Update user balances
        let userBalance = balances.get(candidate.user.userId);
        if (userBalance) {
            const currentLocked = Number(userBalance.locked);
            const currentAvail = Number(userBalance.available);
            userBalance.locked = String(Math.max(0, currentLocked - releasedMargin));
            userBalance.available = String(Math.max(0, currentAvail + releasedMargin + realizedPnl));
            balances.set(candidate.user.userId, userBalance);
        }

        // Reduce candidate position
        candidate.pos.qty -= deleverageQty;
        candidate.pos.margin -= releasedMargin;
        remainingToDeleverage -= deleverageQty;

        console.log(`[ADL EXECUTED] Deleveraged ${deleverageQty} units from User ${candidate.user.userId} on ${market} ${counterpartySide} @ mark price ${currentPrice}. Realized PnL: ${realizedPnl}`);

        publisher.publish(`user:${candidate.user.userId}`, JSON.stringify({
            type: "user_adl",
            market,
            positionType: counterpartySide,
            deleveragedQty: deleverageQty,
            realizedPnl,
            markPrice: currentPrice,
            timestamp: Date.now()
        })).catch(err => console.error("Error publishing ADL event:", err));

        if (userBalance) {
            publisher.publish(`user:${candidate.user.userId}`, JSON.stringify({
                type: "user_balance",
                available: userBalance.available,
                locked: userBalance.locked,
                timestamp: Date.now()
            })).catch(err => console.error("Error publishing balance after ADL:", err));
        }

        if (candidate.pos.qty <= 0) {
            const idx = candidate.user.positions.indexOf(candidate.pos);
            if (idx !== -1) {
                candidate.user.positions.splice(idx, 1);
            }
        } else {
            candidate.pos.liquidationPrice = calculateLiquidationPrice(candidate.pos.type, candidate.pos.averagePrice, candidate.pos.margin, candidate.pos.qty);
        }
    }
}

function liquidationChecks(market: string, price: number) {
    const marketNormalized = market.replace(/USDT$/i, "").toUpperCase();
    for (let u of positions) {
        let remainingPositions = [];
        for (let position of u.positions) {
            const posMarket = position.market.replace(/USDT$/i, "").toUpperCase();
            if (posMarket === marketNormalized && position.liquidationPrice > 0) {
                let isLiquidated = false;
                if (position.type === "LONG" && price <= position.liquidationPrice) {
                    isLiquidated = true;
                } else if (position.type === "SHORT" && price >= position.liquidationPrice) {
                    isLiquidated = true;
                }

                if (isLiquidated) {
                    console.log(`[LIQUIDATION EVENT] User ${u.userId} position liquidated! Market: ${position.market}, Type: ${position.type}, Qty: ${position.qty}, AvgPrice: ${position.averagePrice}, LiqPrice: ${position.liquidationPrice}, CurrentMarkPrice: ${price}`);
                    
                    // 1. Wipe out liquidated user's locked margin
                    let userBalance = balances.get(u.userId);
                    if (userBalance) {
                        const currentLocked = Number(userBalance.locked);
                        userBalance.locked = String(Math.max(0, currentLocked - position.margin));
                        balances.set(u.userId, userBalance);
                    }

                    publisher.publish(`user:${u.userId}`, JSON.stringify({
                        type: "user_liquidation",
                        market: position.market,
                        positionType: position.type,
                        qty: position.qty,
                        averagePrice: position.averagePrice,
                        liquidationPrice: position.liquidationPrice,
                        markPrice: price,
                        marginLost: position.margin,
                        timestamp: Date.now()
                    })).catch(err => console.error("Error publishing liquidation event:", err));

                    if (userBalance) {
                        publisher.publish(`user:${u.userId}`, JSON.stringify({
                            type: "user_balance",
                            available: userBalance.available,
                            locked: userBalance.locked,
                            timestamp: Date.now()
                        })).catch(err => console.error("Error publishing balance after liquidation:", err));
                    }

                    // 2. Execute Market order on opposite side to match against orderbook counterparty liquidity
                    const liqSide = position.type === "LONG" ? "SHORT" : "LONG";
                    const liqOrderId = `liq_${u.userId}_${Date.now()}`;
                    const filledResult = matchingengine(position.market, liqSide, position.qty, price, position.margin, `liquidation_${u.userId}`, liqOrderId, "market");

                    const totalFilledOnOrderbook = Number(filledResult.updatedorders.at(-1)?.filledQty || 0);
                    const remainingUnfilledQty = Math.max(0, position.qty - totalFilledOnOrderbook);

                    // 3. If orderbook liquidity runs out, trigger Auto-Deleveraging (ADL) on top-profit counterparties!
                    if (remainingUnfilledQty > 0) {
                        console.log(`[ADL TRIGGERED] Orderbook unfilled qty: ${remainingUnfilledQty}. Executing Auto-Deleveraging on ${position.market} ${position.type} counterparties...`);
                        executeADL(position.market, position.type, remainingUnfilledQty, price);
                    }

                    continue; // Position is removed from liquidated user
                }
            }
            remainingPositions.push(position);
        }
        u.positions = remainingPositions;
    }
}


async function hydrateAndStart() {
    console.log("[HYDRATION] Initializing engine state...");
    try {
        const snapshot = await loadLatestSnapshot();
        if (snapshot) {
            balances.clear();
            for (const [k, v] of snapshot.balances) {
                balances.set(k, v);
            }
            positions.length = 0;
            positions.push(...snapshot.positions);
            for (const k in orderbooks) delete orderbooks[k];
            Object.assign(orderbooks, snapshot.orderbooks);
            insuranceFund = snapshot.insuranceFund || 0;
            lastProcessedStreamId = snapshot.lastStreamId;

            console.log(`[HYDRATION] Replaying Redis stream from ${lastProcessedStreamId}...`);
            try {
                const rangeMessages = await client.xRange("engine", `(${lastProcessedStreamId}`, "+");
                if (rangeMessages && rangeMessages.length > 0) {
                    console.log(`[HYDRATION] Replaying ${rangeMessages.length} messages...`);
                    for (const entry of rangeMessages) {
                        await processEngineMessage(entry.message, true);
                        lastProcessedStreamId = entry.id;
                    }
                    console.log(`[HYDRATION] Finished replay. Current stream ID: ${lastProcessedStreamId}`);
                }
            } catch (err) {
                console.error("[HYDRATION ERROR] Failed to replay stream entries:", err);
            }
        } else {
            console.log("[HYDRATION] No snapshot found. Running with initial state.");
        }
    } catch (err) {
        console.error("[HYDRATION ERROR] Failed during snapshot load:", err);
    }

    ensureMarketMakerLiquidity();

    if (lastProcessedStreamId !== "0-0") {
        try {
            await client.xGroupSetId("engine", ENGINE_CONSUMER_GROUP, lastProcessedStreamId);
        } catch (err) {
            console.error("[HYDRATION] Error setting consumer group cursor:", err);
        }
    }

    // Schedule snapshot every 5 minutes
    setInterval(async () => {
        if (lastProcessedStreamId && lastProcessedStreamId !== "0-0") {
            await saveSnapshot(lastProcessedStreamId, balances, positions, orderbooks, insuranceFund);
        }
    }, 5 * 60 * 1000);

    await matching();
}

hydrateAndStart();