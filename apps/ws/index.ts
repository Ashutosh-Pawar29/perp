import { httpServer } from 'backend';
import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { PubsubManager } from './sub';
import { createClient } from 'redis';

const redisReader = createClient();
redisReader.connect().catch((err) => console.error("Redis reader connect error in ws:", err));

const wss = new WebSocketServer({ server: httpServer });
const pubsubManager = PubsubManager.getInstance();
const JWT_SECRET = process.env.JWT_SECRET || "JWT_SECRET@123";
const authenticatedUsers = new Map<string, string>(); // clientId -> userId

wss.on('connection', (socket) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    socket.send(JSON.stringify({ type: 'connected', clientId }));

    socket.on('message', async (rawData) => {
        try {
            const payload = JSON.parse(rawData.toString());

            // 1. Authenticate WebSocket Client for Private Stream
            if (payload.type === 'auth') {
                const token = String(payload.token || '').trim();
                if (!token) {
                    socket.send(JSON.stringify({ type: 'error', message: 'Token is required for auth' }));
                    return;
                }

                try {
                    const decoded: any = jwt.verify(token, JWT_SECRET);
                    const userId = String(decoded.id);
                    const privateChannel = `user:${userId}`;

                    // Subscribe client to private user channel
                    await pubsubManager.sub(clientId, privateChannel, (message, channel) => {
                        if (socket.readyState === WebSocket.OPEN) {
                            try {
                                const parsedMessage = JSON.parse(message);
                                socket.send(JSON.stringify({ type: 'private_message', channel, message: parsedMessage }));
                            } catch {
                                socket.send(JSON.stringify({ type: 'private_message', channel, message }));
                            }
                        }
                    });

                    authenticatedUsers.set(clientId, userId);
                    socket.send(JSON.stringify({ type: 'authenticated', userId }));
                    console.log(`[WS] Client ${clientId} authenticated as user ${userId}`);
                } catch (err) {
                    socket.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
                }
                return;
            }

            // 2. Unauthenticate / Logout Private Stream
            if (payload.type === 'logout') {
                const userId = authenticatedUsers.get(clientId);
                if (userId) {
                    await pubsubManager.unsub(clientId, `user:${userId}`);
                    authenticatedUsers.delete(clientId);
                    socket.send(JSON.stringify({ type: 'unauthenticated' }));
                    console.log(`[WS] Client ${clientId} logged out`);
                }
                return;
            }

            // 3. Public Market Data Subscriptions
            if (payload.type === 'subscribe') {
                const market = String(payload.market || '').trim();

                if (!market) {
                    socket.send(JSON.stringify({ type: 'error', message: 'market is required' }));
                    return;
                }

                await pubsubManager.sub(clientId, market, (message, channel) => {
                    if (socket.readyState === WebSocket.OPEN) {
                        try {
                            const parsedMessage = JSON.parse(message);
                            socket.send(JSON.stringify({ type: 'message', channel, message: parsedMessage }));
                        } catch {
                            socket.send(JSON.stringify({ type: 'message', channel, message }));
                        }
                    }
                });

                socket.send(JSON.stringify({ type: 'subscribed', market }));

                if (!market.startsWith("kline:")) {
                    try {
                        const cached = await redisReader.get(`orderbook:${market.toUpperCase()}`);
                        if (cached && socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ type: 'message', channel: market, message: JSON.parse(cached) }));
                        }
                    } catch (e) {
                        console.error("Error sending cached orderbook to client:", e);
                    }
                }
            }

            if (payload.type === 'unsubscribe') {
                const market = String(payload.market || '').trim();

                if (!market) {
                    socket.send(JSON.stringify({ type: 'error', message: 'market is required' }));
                    return;
                }

                await pubsubManager.unsub(clientId, market);
                socket.send(JSON.stringify({ type: 'unsubscribed', market }));
            }

            if (payload.type === 'ping') {
                socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
        } catch (error) {
            socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });

    socket.on('close', async () => {
        const userId = authenticatedUsers.get(clientId);
        if (userId) {
            await pubsubManager.unsub(clientId, `user:${userId}`);
            authenticatedUsers.delete(clientId);
        }
        await pubsubManager.unsubscribeAll(clientId);
    });
});


const port = Number(process.env.PORT || 3000);
httpServer.listen(port, () => {
    console.log(`WebSocket & HTTP server running on http://localhost:${port}`);
});
