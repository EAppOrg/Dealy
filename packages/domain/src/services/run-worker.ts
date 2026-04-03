import { prisma } from "@dealy/db";
import { executeRun } from "./run-executor";
import { RecommendationService } from "./recommendation-service";
import { generateAlertsForRun } from "./alert-generator";

const POLL_INTERVAL_MS = 3000;
const STALE_RUN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SCHEDULER_CHECK_INTERVAL = 10; // check due intents every N poll cycles
let pollCount = 0;
let workerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Claim and execute one PENDING run.
 * Uses atomic update-where to prevent double-claiming.
 */
async function processNextRun(): Promise<boolean> {
  const pendingRun = await prisma.retrievalRun.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, intentId: true },
  });

  if (!pendingRun) return false;

  const claimed = await prisma.retrievalRun.updateMany({
    where: { id: pendingRun.id, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  if (claimed.count === 0) return false;

  try {
    await executeRun(pendingRun.id);
  } catch (err) {
    console.error(`Worker: run ${pendingRun.id} failed:`, err);
    await prisma.retrievalRun.updateMany({
      where: { id: pendingRun.id, status: "RUNNING" },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage:
          err instanceof Error ? err.message : "Unexpected worker error",
      },
    });
  }

  // Generate alerts for this run
  try {
    await generateAlertsForRun(pendingRun.id);
  } catch (err) {
    console.error(`Worker: alert generation for run ${pendingRun.id} failed:`, err);
  }

  // Check if all runs for this intent are now terminal
  const activeRuns = await prisma.retrievalRun.count({
    where: {
      intentId: pendingRun.intentId,
      status: { in: ["PENDING", "RUNNING"] },
    },
  });

  if (activeRuns === 0) {
    const completedWithItems = await prisma.retrievalRun.count({
      where: {
        intentId: pendingRun.intentId,
        status: "COMPLETED",
        itemsFound: { gt: 0 },
      },
    });

    if (completedWithItems > 0) {
      try {
        await RecommendationService.generateForIntent(pendingRun.intentId);
      } catch (err) {
        console.error(
          `Worker: recommendation for ${pendingRun.intentId} failed:`,
          err
        );
      }
    }
  }

  return true;
}

/**
 * Sweep stale RUNNING runs older than timeout → FAILED.
 */
export async function sweepStaleRuns(): Promise<number> {
  const staleThreshold = new Date(Date.now() - STALE_RUN_TIMEOUT_MS);

  const result = await prisma.retrievalRun.updateMany({
    where: {
      status: "RUNNING",
      startedAt: { lt: staleThreshold },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
      errorMessage: "Run timed out — likely interrupted by process restart",
    },
  });

  if (result.count > 0) {
    console.log(`Worker: swept ${result.count} stale RUNNING run(s) to FAILED`);
  }

  return result.count;
}

/**
 * Find monitor-enabled intents that are due for automatic retrieval.
 *
 * An intent is due when:
 * - monitorEnabled = true
 * - monitorInterval is set (minutes)
 * - status is ACTIVE or MONITORING
 * - lastMonitoredAt is null OR older than monitorInterval
 * - no PENDING/RUNNING runs exist for it (prevents duplicate enqueue)
 */
export async function checkDueIntents(): Promise<number> {
  const now = new Date();

  // Find eligible intents
  const eligibleIntents = await prisma.shoppingIntent.findMany({
    where: {
      monitorEnabled: true,
      monitorInterval: { not: null },
      status: { in: ["ACTIVE", "MONITORING"] },
    },
    select: {
      id: true,
      monitorInterval: true,
      lastMonitoredAt: true,
    },
  });

  let enqueued = 0;

  for (const intent of eligibleIntents) {
    if (!intent.monitorInterval) continue;

    // Check if due
    const intervalMs = intent.monitorInterval * 60 * 1000;
    if (intent.lastMonitoredAt) {
      const elapsed = now.getTime() - intent.lastMonitoredAt.getTime();
      if (elapsed < intervalMs) continue; // not due yet
    }

    // Check for existing active runs (prevent duplicate enqueue)
    const activeRuns = await prisma.retrievalRun.count({
      where: {
        intentId: intent.id,
        status: { in: ["PENDING", "RUNNING"] },
      },
    });
    if (activeRuns > 0) continue;

    // Enqueue: create PENDING runs for all enabled sources
    const enabledSources = await prisma.source.findMany({
      where: { enabled: true },
      select: { id: true },
    });

    if (enabledSources.length === 0) continue;

    await prisma.retrievalRun.createMany({
      data: enabledSources.map((source) => ({
        intentId: intent.id,
        sourceId: source.id,
        status: "PENDING" as const,
      })),
    });

    await prisma.shoppingIntent.update({
      where: { id: intent.id },
      data: { lastMonitoredAt: now },
    });

    enqueued++;
    console.log(
      `Scheduler: enqueued runs for intent "${intent.id}" (interval: ${intent.monitorInterval}min)`
    );
  }

  return enqueued;
}

/**
 * Single poll cycle: sweep stale, check scheduler, process pending runs.
 */
export async function pollOnce(): Promise<{
  swept: number;
  scheduled: number;
  processed: number;
}> {
  const swept = await sweepStaleRuns();

  // Run scheduler check every N poll cycles (not every 3s)
  let scheduled = 0;
  pollCount++;
  if (pollCount % SCHEDULER_CHECK_INTERVAL === 0) {
    try {
      scheduled = await checkDueIntents();
    } catch (err) {
      console.error("Scheduler check error:", err);
    }
  }

  let processed = 0;
  for (let i = 0; i < 10; i++) {
    const didWork = await processNextRun();
    if (!didWork) break;
    processed++;
  }

  return { swept, scheduled, processed };
}

/**
 * Start the worker + scheduler poll loop.
 */
export function startWorker(): void {
  if (workerInterval) return;

  console.log(
    `Worker: started (poll every ${POLL_INTERVAL_MS / 1000}s, scheduler every ${(POLL_INTERVAL_MS * SCHEDULER_CHECK_INTERVAL) / 1000}s, stale timeout ${STALE_RUN_TIMEOUT_MS / 60000}min)`
  );

  sweepStaleRuns().catch(console.error);

  workerInterval = setInterval(async () => {
    try {
      await pollOnce();
    } catch (err) {
      console.error("Worker poll error:", err);
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the worker poll loop.
 */
export function stopWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    pollCount = 0;
    console.log("Worker: stopped");
  }
}
