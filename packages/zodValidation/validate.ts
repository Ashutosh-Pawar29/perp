import { z} from "zod";

const signupschema = z.object({
    username:z.string().min(6),
    password: z.string().min(6)
})

const signinschema = z.object({
    username : z.string().min(6),
    password : z.string().min(6)
})

const onrampschema = z.object({
    id:z.string(),
    balance : z.string()
})


const orderschema = z.object({
    price: z.number().int(),
    qty: z.number().int(),
    equity: z.number().int(),
    type: z.string(),
    market: z.string(),
    id: z.string(),
    orderType: z.string()
});


export {signupschema,signinschema,onrampschema,orderschema}