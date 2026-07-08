import type { engineorder, Handleusersfilledqty, Users } from "commons";
function calculatereleazedpnl(exitPrice: number, holdingPrice: number, filledQty: number, markettype: string): number {
    if (markettype == "LONG") {
        const realizedPnl = (exitPrice - holdingPrice) * filledQty
        return realizedPnl
    }
    else {
        const realizedPnl = (holdingPrice - exitPrice) * filledQty
        return realizedPnl
    }
}


export function handleusersfilledqty(users: Users[], otherargs: Handleusersfilledqty,balances:Map<string, { available: string, locked: string }> ,args:{price: number,ordertype: string,market: string,leverage:string}) {
    let ordertype = args.ordertype
    let price = args.price
    let market = args.market
    let balance = balances.get(otherargs.userId)
    let marginchange = (price*otherargs.filledqty)/Number(args.leverage)
    // update users orders
    // will handle it when push to db
    //update users positions
    let positionhandled = false
    for (const user of users) {
        if (user.userId == otherargs.userId) {
            for (const position of user.positions) {
                if (!(price)) continue
                // if user already holds same market position and position already exist on same side then just increase number of holdings
                if (position.market === market && position.type === ordertype) {
                    let total_value = position.averagePrice * position.qty + otherargs.filledqty * price
                    let total_qty = position.qty + otherargs.filledqty
                    position.averagePrice = total_value / total_qty
                    position.qty = total_qty
                    position.margin += marginchange// need to  handle this and aslo consider levrage
                    positionhandled = true
                    break
                }
                // if user holds same market position but it is opposite then there are three cases and need to handle them(1. user trying to reduce holdings ,2. user trying to closing positions, 3.user is trying to close all holdings and trying to sit on other side )
                else if (position.market === market && balance) {
                    let total_qty = position.qty - otherargs.filledqty
                    if (total_qty > 0 ) {
                        const realizedPnl = calculatereleazedpnl(price, position.averagePrice, otherargs.filledqty, position.type)
                        position.qty = total_qty
                        position.margin -= marginchange
                        balance.locked = String(Number(balance.locked)-marginchange)
                        balance.available = String(Number(balance.available) + marginchange + realizedPnl)
                        balances.set(otherargs.userId,balance)
                        // obj.poolfund -= (marginchange + realizedPnl)
                        positionhandled = true
                        break
                    }
                    else if (total_qty == 0) {
                        const realizedPnl = calculatereleazedpnl(price, position.averagePrice, otherargs.filledqty, position.type)
                        balance.locked = String(Number(balance.locked)-marginchange)
                        balance.available = String(Number(balance.available) + marginchange + realizedPnl)
                        balances.set(otherargs.userId,balance)
                        // obj.poolfund -= (marginchange + realizedPnl)
                        let new_positions: { market: string; type: string; qty: number; margin: number; liquidationPrice: number; pnL?: number | undefined; averagePrice: number; }[] = []
                        for (const x of user.positions) {
                            if (x == position) continue
                            else {
                                new_positions = [...new_positions, x]
                            }
                        }
                        user.positions = new_positions
                        positionhandled = true
                        break
                    }
                    else {
                        if (!ordertype) continue
                        let new_qty = otherargs.filledqty - position.qty
                        let new_margin = (price*new_qty)/Number(args.leverage)
                        let new_position = { market: position.market, type: ordertype, qty: new_qty, margin: new_margin, liquidationPrice: 0, pnL: 0, averagePrice: price }
                        const realizedPnl = calculatereleazedpnl(price, position.averagePrice, position.qty, position.type)
                        balance.locked = String(Number(balance.locked)-marginchange)
                        balance.available = String(Number(balance.available)+marginchange + realizedPnl)
                        balances.set(otherargs.userId,balance)
                        // obj.poolfund -= (position.margin + realizedPnl)
                        let new_positions: { market: string; type: string; qty: number; margin: number; liquidationPrice: number; pnL?: number | undefined; averagePrice: number; }[] = []
                        for (const x of user.positions) {
                            if (x == position) continue
                            else {
                                new_positions = [...new_positions, x]
                            }
                        }
                        new_positions = [...new_positions, new_position]
                        user.positions = new_positions
                        positionhandled = true
                        break
                    }
                }
            }

            // if user does not hold any position in this market so we need to create a new position in his positions 
            if (!positionhandled) {
                if (!market || !ordertype || !price) continue
                let new_order_margin = marginchange
                // for(const order of user.orders){
                //     if(order.orderId==other_order.orderId){
                //         new_order_margin = order.margin*percent
                //     }
                // }
                let new_position = { market: market, type: ordertype, qty: otherargs.filledqty, margin: new_order_margin, liquidationPrice: 0, pnL: 0, averagePrice: price }
                user.positions = [...user.positions, new_position]
            }
        }
    }
    return
}