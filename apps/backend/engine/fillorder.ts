
import type {  Bid, Users, Handleusersfilledqty, matchingengineargs, engineorder, retMatchingengine } from 'commons'
import { handleusersfilledqty } from './handleusersfilledqty'

export function handlefillorder(orderbookentry: Bid, users: Users[], Taker: matchingengineargs,balances:Map<string, { available: string, locked: string }> ,args:{price: number,ordertype: string,market: string;}): retMatchingengine {
    let ordersUpdate:engineorder[] = []
    //orderbook entry has a orders that can fill the taker order(can be full or partial)
    let Takerstatus = Taker
    for (const order of orderbookentry.openOrders) {
        if(order.userId == Taker.Takeruserid) {
            continue
        }
        if (Takerstatus.Takerqty <= 0) break
        let makersAskedqty = order.qty - order.filledQty
        let deletemakerorder = false
        const makeruserid = order.userId
        const makerorderid = order.orderId
        let makersfilledqty = 0
        let settlemargin = 0
        let percent = 0
        if (makersAskedqty <= Takerstatus.Takerqty) {
            //full order of maker will be filled 
            makersfilledqty = makersAskedqty
            order.filledQty += makersfilledqty
            deletemakerorder = true
            Takerstatus.takerFilledQty += makersAskedqty
            orderbookentry.availableQty -= makersAskedqty
            Takerstatus.Takerqty -= makersAskedqty
            percent = (makersfilledqty / order.qty)
            let x:engineorder = {id:makerorderid,filledQty:String(makersfilledqty)}
            let otherargs: Handleusersfilledqty = { userId: makeruserid, orderId: makerorderid, filledqty: makersfilledqty, fullyfilled: deletemakerorder, percent: percent }
            ordersUpdate = [...ordersUpdate,x]
            let newargs = {...args,leverage:order.leverage}
            handleusersfilledqty(users, otherargs,balances,newargs)
        }
        else {
            makersfilledqty = Taker.Takerqty
            order.filledQty += makersfilledqty
            Takerstatus.takerFilledQty += makersfilledqty
            orderbookentry.availableQty -= makersfilledqty
            Takerstatus.Takerqty -= makersfilledqty
            percent = (makersfilledqty / order.qty)
            let x:engineorder = {id:makerorderid,filledQty:String(makersfilledqty)}
            let otherargs: Handleusersfilledqty = { userId: makeruserid, orderId: makerorderid, filledqty: makersfilledqty, fullyfilled: deletemakerorder, percent: percent }
            ordersUpdate = [...ordersUpdate,x]
            let newargs = {...args,leverage:order.leverage}
            handleusersfilledqty(users, otherargs,balances,newargs)
            break
            // partial maker order will be filled and full takers order will be filled 
            // and you need to break the loop when takerstatus.qty == 0
        }
        if (deletemakerorder) {
            const idx = orderbookentry.openOrders.indexOf(order)
            orderbookentry.openOrders.splice(idx, 1)
        }
    }
    const res = {"engargs":Takerstatus,"ordersupdate":ordersUpdate}
    return res
}