import { createClient } from "redis";
import type { engineorder, Handleusersfilledqty, retMatchingengine, Users } from "commons"
import { calculateLiquidationPrice, handleusersfilledqty } from "./handleusersfilledqty";
import { handlefillorder } from "./fillorder";

const client = createClient();
await client.connect()

const publisher = createClient();
await publisher.connect();
// client.xGroupCreate("engine", "engine", "$", {
//     MKSTREAM: true
// });


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
    SOL: { bids: {}, asks: {}, lastTradedPrice: 90, indexPrice: 90.01 },
    ETH: { bids: {}, asks: {}, lastTradedPrice: 1900, indexPrice: 1899.9 }
}


async function matching() {
    while (1) {
        const response = await client.xReadGroup("engine", "engine", [{
            key: "engine",
            id: ">"
        }], {
            BLOCK: 0,
            COUNT: 1
        })

        // // @ts-ignore
        // console.log(response[0].messages[0]);
        // @ts-ignore
        const message = response[0].messages[0].message;
        console.log(message)
        if (message.messageType == "signup") {

            balances.set(message.userId, { "available": message.balance, "locked": message.balance })
            positions.push({ userId: message.userId, positions: [] })
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId
            })
        }

        else if (message.messageType == "onramp") {
            let userbalances = balances.get(message.userId)
            if (!userbalances) {
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: "false"
                })
            }
            else {
                let availabebalance = Number(userbalances.available)
                availabebalance += Number(message.balance!)
                balances.set(message.userId, { "available": String(availabebalance), "locked": userbalances.locked })
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: String(true)
                })
            }
            console.log(balances)
        }

        // orders handling 
        else if (message.messageType == "order") {
            let body = JSON.parse(message.body)
            const { price, qty, equity, type, market, id, orderType, orderid } = body
            const isMarket = orderType?.toLowerCase() === "market"
            const levrage = (Number(price) * Number(qty)) / (Number(equity) || 1)

            let balance = balances.get(message.userId)
            if (!balance) {
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: "false",
                    response: "not find balance entry",
                    databaseQuery: "delete order",
                    databaseData: JSON.stringify({ orderid })
                })
                continue
            }
            else {
                if (Number(balance.available) < Number(equity)) {
                    await publisher.xAdd("to-backend", "*", {
                        loopBackId: message.loopBackId,
                        status: "false",
                        response: "not sufficient balance",
                        databaseQuery: "delete order",
                        databaseData: JSON.stringify({ orderid })
                    })
                    continue
                }
                else {
                    for (const u of positions) {
                        if (u.userId === id) {
                            let positionexist = false
                            for (const position of u.positions) {
                                if (position.market == market) {
                                    positionexist = true
                                    if (position.type == type) {
                                        balance.available = String(Number(balance.available) - Number(equity))
                                        balance.locked = String(Number(balance.locked) + Number(equity))
                                        balances.set(id, balance)
                                        break
                                    }
                                    else {
                                        if (Number(position.qty) >= Number(qty)) {
                                            break
                                        }
                                        else {
                                            balance.available = String(Number(balance.available) - ((Number(qty) - Number(position.qty)) * Number(price)) / levrage)
                                            balance.locked = String(Number(balance.locked) + ((Number(qty) - Number(position.qty)) * Number(price)) / levrage)
                                            balances.set(id, balance)
                                            break
                                        }
                                    }
                                    break
                                }
                            }
                            if (!positionexist) {
                                balance.available = String(Number(balance.available) - Number(equity))
                                balance.locked = String(Number(balance.locked) + Number(equity))
                                balances.set(id, balance)
                            }

                            const filledorderdetails = matchingengine(market, type, qty, price, equity, message.userId, orderid, orderType)

                            if (isMarket) {
                                const totalFilled = Number(filledorderdetails.updatedorders.at(-1)?.filledQty || 0)
                                const unfilledQty = Math.max(0, qty - totalFilled)
                                const unfilledMargin = (unfilledQty / qty) * Number(equity)
                                if (unfilledMargin > 0) {
                                    balance.available = String(Number(balance.available) + unfilledMargin)
                                    balance.locked = String(Math.max(0, Number(balance.locked) - unfilledMargin))
                                    balances.set(id, balance)
                                }
                                if (totalFilled === 0) {
                                    filledorderdetails.status = false
                                }
                            }

                            if (filledorderdetails.status) {
                                await publisher.xAdd("to-backend", "*", {
                                    loopBackId: message.loopBackId,
                                    status: "true",
                                    response: `${filledorderdetails.updatedorders.at(-1)?.filledQty}`,
                                    databaseQuery: "update order",
                                    databaseData: JSON.stringify({ orders: filledorderdetails.updatedorders })
                                })
                            }
                            else {
                                await publisher.xAdd("to-backend", "*", {
                                    loopBackId: message.loopBackId,
                                    status: "false",
                                    response: isMarket ? "market order unfilled - cancelled" : "order rejected",
                                    databaseQuery: "delete order",
                                    databaseData: JSON.stringify({ orderid })
                                })
                            }
                            break
                        }
                    }
                }
            }
            console.log("------------------------------------")
            console.log(orderbooks)
            console.log("------------------------------------")
            console.log(balances)
            console.log("------------------------------------")
            console.log(positions)
            console.log("------------------------------------")
        }

        else if (message.messageType === "markPrice" || message.messageType === "liquidation" || (message.market && message.price && !message.messageType)) {
            const market = message.market;
            const price = Number(message.price);
            if (market && !isNaN(price)) {
                liquidationChecks(market, price);
            }
        }

        else if (message.messageType == 'delete-order') {
            let body = JSON.parse(message.body)
            const { price, qty, type, market, id, orderid } = body
            let updates = []
            let orderDeleted = false
            if (type == "LONG") {
                let openorders = orderbooks[market]?.bids[price]?.openOrders
                if (!openorders) continue
                for (const order of openorders) {
                    if (order.orderId == orderid) {
                        let qty = order.qty - order.filledQty
                        const bid = orderbooks[market]?.bids[price]
                        if (bid) {
                            bid.availableQty -= qty
                        }
                        const idx = openorders.indexOf(order)
                        openorders.splice(idx, 1)
                        orderDeleted = true
                        updates.push(order)
                        break
                    }
                }

            }
            else {
                let openorders = orderbooks[market]?.asks[price]?.openOrders
                if (!openorders) continue
                for (const order of openorders) {
                    if (order.orderId == orderid) {
                        let qty = order.qty - order.filledQty
                        const ask = orderbooks[market]?.asks[price]
                        if (ask) {
                            ask.availableQty -= qty
                        }
                        const idx = openorders.indexOf(order)
                        openorders.splice(idx, 1)
                        orderDeleted = true
                        updates.push(order)
                        break
                    }
                }
            }
            if (orderDeleted) {
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: String(true),
                    databaseQuery: "update order",
                    update: JSON.stringify({ updates })
                })
            }
            else {
                await publisher.xAdd("to-backend", "*", {
                    loopBackId: message.loopBackId,
                    status: String(false)
                })
            }
        }

        else if (message.messageType === "get-equity") {
            let userBalance = balances.get(message.userId) || { available: "0", locked: "0" };
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId,
                status: "true",
                response: JSON.stringify(userBalance)
            });
        }

        else if (message.messageType === "get-positions") {
            let body = message.body ? JSON.parse(message.body) : {};
            let market = body.market;
            let userEntry = positions.find((u) => u.userId === message.userId);
            let userPositions = userEntry ? userEntry.positions : [];
            if (market && market !== "all") {
                userPositions = userPositions.filter((p) => p.market === market);
            }
            await publisher.xAdd("to-backend", "*", {
                loopBackId: message.loopBackId,
                status: "true",
                response: JSON.stringify(userPositions)
            });
        }
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
                ordersupdate: []
            }
            if (Takertype == "LONG") {
                for (const prices in obj.asks) {
                    if (Taker.engargs.Takerqty <= 0) {
                        fullyfilled = true
                        break
                    }
                    if (isMarket || Number(prices) <= Takerprice) {
                        if (!obj.asks[prices]) continue
                        if (obj.asks[prices].availableQty == 0) continue
                        else {
                            const args = { price: Number(prices), ordertype: "SHORT", market: market }
                            let y = handlefillorder(obj.asks[prices], positions, Taker.engargs, balances, args)
                            Taker.engargs = y.engargs
                            Taker.ordersupdate = [...Taker.ordersupdate, ...y.ordersupdate]
                        }
                        if (obj.asks[prices].availableQty == 0) {
                            delete obj.asks[prices]
                        }
                    }
                    else {
                        if (Taker.engargs.Takerqty <= 0) {
                            fullyfilled = true
                            break
                        }
                        if (!isMarket) {
                            const res = addOrderToOrderbook(obj, "LONG", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                            fullyfilled = res.fullyfilled
                            Taker.engargs.Takerqty = 0
                        }
                        break
                    }
                }
                if (Taker.engargs.Takerqty > 0 && !isMarket) {
                    const res = addOrderToOrderbook(obj, "LONG", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                    fullyfilled = res.fullyfilled
                    Taker.engargs.Takerqty = 0
                }
            }
            else if (Takertype === "SHORT") {
                for (const prices in obj.bids) {
                    if (Taker.engargs.Takerqty <= 0) {
                        fullyfilled = true
                        break
                    }
                    if (isMarket || Number(prices) >= Takerprice) {
                        if (!obj.bids[prices]) continue
                        if (obj.bids[prices].availableQty == 0) continue
                        else {
                            const args = { price: Number(prices), ordertype: "LONG", market: market }
                            let y = handlefillorder(obj.bids[prices], positions, Taker.engargs, balances, args)
                            Taker.engargs = y.engargs
                            Taker.ordersupdate = [...Taker.ordersupdate, ...y.ordersupdate]
                        }
                        if (obj.bids[prices].availableQty == 0) {
                            delete obj.bids[prices]
                        }
                    }
                    else {
                        if (Taker.engargs.Takerqty <= 0) {
                            fullyfilled = true
                            break
                        }
                        if (!isMarket) {
                            const res = addOrderToOrderbook(obj, "SHORT", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                            fullyfilled = res.fullyfilled
                            Taker.engargs.Takerqty = 0
                        }
                        break
                    }
                }
                if (Taker.engargs.Takerqty > 0 && !isMarket) {
                    const res = addOrderToOrderbook(obj, "SHORT", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                    fullyfilled = res.fullyfilled
                    Taker.engargs.Takerqty = 0
                }
            }

            let yz: engineorder = { id: Takerorderid, filledQty: Taker.engargs.takerFilledQty.toString() }
            const updatedorders = [...Taker.ordersupdate, yz]
            const executionStatus = Taker.engargs.takerFilledQty > 0 || (!isMarket)
            return { status: executionStatus, updatedorders }
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


liquidationChecks("btc", 7)

matching();