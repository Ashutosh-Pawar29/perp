import { httpServer } from 'backend';
import { WebSocket, WebSocketServer } from 'ws';
import { PubsubManager } from './sub';

const wss = new WebSocketServer({ server: httpServer });
const pubsubManager = PubsubManager.getInstance();

wss.on('connection', (socket) => {
    const clientId = `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    socket.send(JSON.stringify({ type: 'connected', clientId }));

    socket.on('message', async (rawData) => {
        try {
            const payload = JSON.parse(rawData.toString());

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
                socket.send(JSON.stringify({ type: 'pong' }));
            }
        } catch (error) {
            socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
    });

    socket.on('close', async () => {
        await pubsubManager.unsubscribeAll(clientId);
    });
});

const port = Number(process.env.PORT || 3000);
httpServer.listen(port, () => {
    console.log(`WebSocket & HTTP server running on http://localhost:${port}`);
});
