import express from "express";
import type { Request, Response, NextFunction } from "express";
import bycrypt from "bcrypt";
import { prisma } from "db";
import { onrampschema, orderschema, signinschema, signupschema } from "zodvalidation";
import { loopfunction } from "./loopingfunction";
import type { toEngine } from "commons";

const jwt = require('jsonwebtoken')
const app = express();
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET;
const hashpass = process.env.hashpass

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
    catch (error) { console.error
        res.json({error})
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

let orderid = 5

app.post("/order", authenticateUser, async (req: Request, res: Response) => {
    let body = req.body
    const valid = orderschema.safeParse(body)
    if (!valid.success) {
        return res.json({ message: "invalid details" })
    }
    else {
        if (body.equity <= 0) {
            res.json({ "msg": "equity should be greater than zero" })
            return
        }
        orderid++
        body = {...body,orderid}
        const data: toEngine = {
            messageType: "order",
            userId: body.id.toString(),
            body: JSON.stringify(body)
        }
        const engineresponse = await loopfunction(data)
        console.log(engineresponse)
        if (engineresponse.status == "true") {
            return res.json({ message: " " })
        }
        else {
            return res.json({ message: "sorry something went wrong " })
        }
    }
})


app.delete('/order',authenticateUser,async (req,res)=>{
    const body = req.body
    const order = await prisma.orders.findFirst({where:{id:body.orderid}})
    if(!order){
        res.json({msg:"no order exist please recheck"})
        return
    }
    const dataToEngine = { price:order.price,qty:order.qty, type:order.orderType, market:order.marketid, id:order.id, orderid:order.id }
    const data:toEngine = {
        messageType:"delete-order",
        userId:body.id,
        body:JSON.stringify(dataToEngine)
    }
    const engineresponse = await loopfunction(data)
})

app.listen(3003)