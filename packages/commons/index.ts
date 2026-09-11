export type toEngine = {
    messageType: string,
    userId: string,
    balance?: string,
    body?: string,
    market?: string,
    price?: string
} | {
    messageType?: string,
    market: string,
    price: string
}

export interface EngineSnapshotData {
    balances: Record<string, { available: string; locked: string }>;
    positions: Users[];
    orderbooks: Record<string, any>;
    insuranceFund?: number;
    timestamp: number;
}

export interface FundingPayment {
    userId: string;
    market: string;
    positionType: string;
    fundingRate: number;
    payment: number;
}



interface BackendMessage {
    loopBackId: string;
    balance: string;
}

interface StreamMessage {
    id: string;
    message: BackendMessage;
}

interface StreamData {
    name: string;
    messages: StreamMessage[];
}

export type StreamResponse = StreamData[];

export interface FillRecord {
    makerId: string;
    takerId: string;
    qty: string;
    price: string;
    makerOrderId: string;
    takerOrderId: string;
    marketId: string;
}

export interface retMatchingengine {
    engargs : matchingengineargs,
    ordersupdate : engineorder[],
    fills: FillRecord[]
}

export type Bid = {
    availableQty: number,
    openOrders: { userId: string, qty: number, filledQty: number, orderId: string, createdAt: Date,leverage:string }[]
}

export type Handleusersfilledqty = {
    userId:string , orderId: string, filledqty: number,fullyfilled:boolean, percent:number
}

export interface matchingengineargs {
    market: string, Takertype: string, Takerqty: number, Takerprice: number, Takerequity: number, Takeruserid: string, Takerorderid: string,takerFilledQty:number
}


export interface Users {
    userId: string,
    positions: { market: string; type: string; qty: number; margin: number; liquidationPrice: number; pnL?: number; averagePrice: number; }[],

}


export interface engineorder {
  id          :    String  
  price?        :   String
  filledQty    :   String
}
