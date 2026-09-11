import { prisma } from "db";
import type { Users, EngineSnapshotData } from "commons";

export interface LoadedSnapshot {
    lastStreamId: string;
    balances: Map<string, { available: string; locked: string }>;
    positions: Users[];
    orderbooks: Record<string, any>;
    insuranceFund: number;
    createdAt: Date;
}

/**
 * Persists the current in-memory engine state into the PostgreSQL database.
 */
export async function saveSnapshot(
    lastStreamId: string,
    balances: Map<string, { available: string; locked: string }>,
    positions: Users[],
    orderbooks: Record<string, any>,
    insuranceFund: number = 0
): Promise<string | null> {
    try {
        const balancesObj: Record<string, { available: string; locked: string }> = Object.fromEntries(balances);
        const snapshotPayload: EngineSnapshotData = {
            balances: balancesObj,
            positions,
            orderbooks,
            insuranceFund,
            timestamp: Date.now()
        };

        const created = await prisma.engineSnapshot.create({
            data: {
                lastStreamId,
                data: JSON.stringify(snapshotPayload)
            }
        });

        console.log(`[SNAPSHOT] Saved engine snapshot ${created.id} at stream ID: ${lastStreamId}`);

        // Prune older snapshots: retain only the latest 5
        const oldSnapshots = await prisma.engineSnapshot.findMany({
            orderBy: { createdAt: "desc" },
            skip: 5,
            select: { id: true }
        });

        if (oldSnapshots.length > 0) {
            await prisma.engineSnapshot.deleteMany({
                where: { id: { in: oldSnapshots.map((s) => s.id) } }
            });
        }

        return created.id;
    } catch (error) {
        console.error("[SNAPSHOT ERROR] Failed to save engine snapshot:", error);
        return null;
    }
}

/**
 * Loads the latest snapshot from the PostgreSQL database for engine crash recovery.
 */
export async function loadLatestSnapshot(): Promise<LoadedSnapshot | null> {
    try {
        const latest = await prisma.engineSnapshot.findFirst({
            orderBy: { createdAt: "desc" }
        });

        if (!latest) {
            console.log("[SNAPSHOT] No previous snapshot found. Starting with initial state.");
            return null;
        }

        const parsed: EngineSnapshotData = JSON.parse(latest.data);
        const balancesMap = new Map<string, { available: string; locked: string }>(
            Object.entries(parsed.balances || {})
        );

        console.log(
            `[SNAPSHOT] Loaded latest snapshot ${latest.id} (created at ${latest.createdAt.toISOString()}) at stream ID: ${latest.lastStreamId}`
        );

        return {
            lastStreamId: latest.lastStreamId,
            balances: balancesMap,
            positions: parsed.positions || [],
            orderbooks: parsed.orderbooks || {},
            insuranceFund: parsed.insuranceFund || 0,
            createdAt: latest.createdAt
        };
    } catch (error) {
        console.error("[SNAPSHOT ERROR] Failed to load latest snapshot:", error);
        return null;
    }
}
