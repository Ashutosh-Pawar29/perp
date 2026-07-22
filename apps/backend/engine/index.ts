import { createClient } from "redis";
import type { engineorder, Handleusersfilledqty, retMatchingengine } from "commons"
import { handleusersfilledqty } from "./handleusersfilledqty";
import { handlefillorder } from "./fillorder";

const client = createClient();
await client.connect()

const publisher = createClient();
await publisher.connect();
client.xGroupCreate("engine", "engine", "$", {
    MKSTREAM: true
});

interface Users {
    userId: string,
    positions: { market: string; type: string; qty: number; margin: number; liquidationPrice: number; pnL?: number; averagePrice: number; }[],
    // orders: { orderId: number, market: string, type: string, qty: number, margin: number, orderType: string, price: number, status: string }[];
    // orders are moved to database so add them to db 
    // same for fills and users 
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

            const levrage = (Number(price) * Number(qty)) / Number(equity)

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

                            const filledorderdetails = matchingengine(market, type, qty, price, equity, message.userId, orderid) // send levrage 
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
                                    response: "no such market exist",
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




function matchingengine(market: string, Takertype: string, Takerqty: number, Takerprice: number, Takerequity: number, Takeruserid: string, Takerorderid: string) {
    for (const stock in orderbooks) {
        let leverage = (Takerqty * Takerprice) / Takerequity
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
                console.log("reached here")
                //first sort the asks ascending
                // if asks length == 0 then orders will never go in loop below 

                if (!Object.keys(obj.asks).length) {
                    console.log("reached inside else of loop")
                    if (Taker.engargs.Takerqty <= 0) {
                        fullyfilled = true
                        break
                    }
                    const res = addOrderToOrderbook(obj, "LONG", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                    fullyfilled = res.fullyfilled
                    Taker.engargs.Takerqty = 0
                }
                for (const prices in obj.asks) {
                    if (Taker.engargs.Takerqty <= 0) {
                        fullyfilled = true
                        break
                    }
                    console.log("reached inside loop of matching")
                    if (Number(prices) <= Takerprice) {
                        if (Taker.engargs.Takerqty <= 0) {
                            fullyfilled = true
                            break
                        }
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
                        console.log("reached inside else of loop")
                        if (Taker.engargs.Takerqty <= 0) {
                            fullyfilled = true
                            break
                        }
                        const res = addOrderToOrderbook(obj, "LONG", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                        fullyfilled = res.fullyfilled
                        Taker.engargs.Takerqty = 0
                        break
                    }
                }
                if (Taker.engargs.Takerqty) {
                    const res = addOrderToOrderbook(obj, "LONG", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                    fullyfilled = res.fullyfilled
                    Taker.engargs.Takerqty = 0
                }
            }
            else if (Takertype === "SHORT") {
                if (!Object.keys(obj.bids).length) {
                    if (Taker.engargs.Takerqty <= 0) {
                        fullyfilled = true
                        break
                    }
                    const res = addOrderToOrderbook(obj, "SHORT", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                    fullyfilled = res.fullyfilled
                    Taker.engargs.Takerqty = 0
                }
                for (const prices in obj.bids) {
                    if (Taker.engargs.Takerqty <= 0) {
                        fullyfilled = true
                        break
                    }
                    if (Number(prices) >= Takerprice) {
                        if (Taker.engargs.Takerqty <= 0) {
                            fullyfilled = true
                            break
                        }
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
                        const res = addOrderToOrderbook(obj, "SHORT", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                        fullyfilled = res.fullyfilled
                        Taker.engargs.Takerqty = 0
                        break
                    }

                }
                if (Taker.engargs.Takerqty) {
                    const res = addOrderToOrderbook(obj, "SHORT", Takerprice, Takeruserid, Takerqty, Taker.engargs.Takerqty, Taker.engargs.takerFilledQty, Takerorderid, leverage.toString())
                    fullyfilled = res.fullyfilled
                    Taker.engargs.Takerqty = 0
                }
            }
            let percent = Taker.engargs.takerFilledQty / Takerqty
            let args = { price: Takerprice, ordertype: Takertype, market: market, leverage: leverage.toString() }
            let otherargs: Handleusersfilledqty = { userId: Takeruserid, orderId: Takerorderid, filledqty: Taker.engargs.takerFilledQty, fullyfilled: fullyfilled, percent: percent }
            console.log(`percent : ${percent}`)
            if (Taker.engargs.takerFilledQty) {
                handleusersfilledqty(positions, otherargs, balances, args)
            }
            let yz: engineorder = { id: Takerorderid, filledQty: Taker.engargs.takerFilledQty.toString() }
            const updatedorders = [...Taker.ordersupdate, yz]
            return { status: true, updatedorders }
        }
    }
    return { status: false, updatedorders: [] }
}





function liquidationChecks() {
    const ws = new WebSocket("wss://stream.binance.com");
    ws.send("{MESSAGE: SUBSCRIBE, MARKET: SOL}");
    ws.onmessage = () => {

    }
}

matching();