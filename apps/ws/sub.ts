import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

export type MessageHandler = (message: string, channel: string) => void;

export class PubsubManager {
    private static instance: PubsubManager | null = null;
    private subscribersByChannel: Map<string, Set<string>>;
    private handlersByChannel: Map<string, Map<string, MessageHandler>>;
    private redisclient: RedisClientType;

    constructor() {
        this.subscribersByChannel = new Map<string, Set<string>>();
        this.handlersByChannel = new Map<string, Map<string, MessageHandler>>();
        this.redisclient = createClient();
    }

    static getInstance(): PubsubManager {
        if (!PubsubManager.instance) {
            PubsubManager.instance = new PubsubManager();
        }

        return PubsubManager.instance;
    }

    private async ensureConnected(): Promise<void> {
        if (!this.redisclient.isOpen) {
            await this.redisclient.connect();
        }
    }

    async sub(clientId: string, market: string, handler: MessageHandler): Promise<void> {
        await this.ensureConnected();

        if (!this.subscribersByChannel.has(market)) {
            this.subscribersByChannel.set(market, new Set<string>());
        }

        const channelSubscribers = this.subscribersByChannel.get(market)!;
        channelSubscribers.add(clientId);

        if (!this.handlersByChannel.has(market)) {
            this.handlersByChannel.set(market, new Map<string, MessageHandler>());
        }

        this.handlersByChannel.get(market)!.set(clientId, handler);

        if (channelSubscribers.size === 1) {
            await this.redisclient.subscribe(market, (message) => {
                this.handleMessage(market, message);
            });
        }
    }

    async unsub(clientId: string, market: string): Promise<void> {
        await this.ensureConnected();

        const channelSubscribers = this.subscribersByChannel.get(market);
        if (channelSubscribers) {
            channelSubscribers.delete(clientId);
            this.handlersByChannel.get(market)?.delete(clientId);

            if (channelSubscribers.size === 0) {
                this.subscribersByChannel.delete(market);
                this.handlersByChannel.delete(market);
                await this.redisclient.unsubscribe(market);
                console.log(`Unsubscribed from Redis channel: ${market}`);
            }
        }
    }

    async unsubscribeAll(clientId: string): Promise<void> {
        await this.ensureConnected();

        for (const market of Array.from(this.subscribersByChannel.keys())) {
            const channelSubscribers = this.subscribersByChannel.get(market);
            if (channelSubscribers?.has(clientId)) {
                await this.unsub(clientId, market);
            }
        }
    }

    private handleMessage(channel: string, message: string): void {
        const handlers = this.handlersByChannel.get(channel);
        if (!handlers) {
            return;
        }

        for (const handler of handlers.values()) {
            handler(message, channel);
        }
    }
}
