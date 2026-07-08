
import type { toEngine } from "commons";
import { createClient } from "redis";

const client = createClient(); 
client.connect()

const subscriber = createClient();
subscriber.connect();

const BACKEND_CONSUMER_GROUP = "backend-" + Math.random();

await client.xGroupCreate("to-backend", BACKEND_CONSUMER_GROUP, "$", {
    MKSTREAM: true
});
type BackendResponse = {
    loopBackId: string;
    status: string;
};


const loopbackResolves = new Map<string,(value: BackendResponse) => void >();

export function loopfunction(
    message: toEngine
): Promise<BackendResponse> {

    return new Promise(async (resolve, reject) => {

        const loopBackId = Math.random().toString();

        await client.xAdd(
            "engine",
            "*",
            {
                loopBackId,
                ...message
            }
        );

        loopbackResolves.set(
            loopBackId,
            resolve
        );

        setTimeout(() => {

            if (loopbackResolves.has(loopBackId)) {

                reject("Timeout");

                loopbackResolves.delete(loopBackId);
            }

        }, 10000);
    });
}


async function main() {
    while(1) {
        const response = await subscriber.xReadGroup(BACKEND_CONSUMER_GROUP, BACKEND_CONSUMER_GROUP, [{
            key: "to-backend",
            id: ">"
        }], {
            BLOCK: 0,
            COUNT: 1
        })
    
        if(!response) continue;
        // @ts-ignore
        const rloopBackId = response[0].messages[0].message.loopBackId;
         // @ts-ignore
        loopbackResolves.get(rloopBackId)?.(response[0].messages[0].message);
        loopbackResolves.delete(rloopBackId);
    } 
}



main();