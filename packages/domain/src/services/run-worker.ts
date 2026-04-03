import { prisma } from "@dealy/db";
import { executeRun } from "./run-executor";
import { RecommendationService } from "./recommendation-service";

const POLL_INTERVAL_MS = 3000;
const STALE_RUN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

let workerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Claim and execute one PENDING run.
 *
 * Uses an atomic update-where to prevent double-claiming:
 * only transitions PENDING → RUNNING if the run is still PENDING.
 * Returns true if a run was claimed and executed.
 */
async function processNextRun(): Promise<boolean> {
  // Find the oldest PENDING run
  const pendingRun = await prisma.retrievalRun.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: { id: true, intentId: true },
  });

  if (!pendingRun) return false;

  // Atomic claim: only transition if still PENDING (prevents double-claim)
  const claimed = await prisma.retrievalRun.updateMany({
    where: { id: pendingRun.id, status: "PENDING" },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  if (claimed.count === 0) return false; // another worker claimed it

  try {
    await executeRun(pendingRun.id);
  } catch (err) {
    console.error(`Worker: run ${pendingRun.id} failed:`, err);
    // executeRun already handles FAILED status, but catch unexpected errors
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

  // Check if all runs for this intent are now terminal
  const activeRuns = await prisma.retrievalRun.count({
    where: {
      intentId: pendingRun.intentId,
      status: { in: ["PENDING", "RUNNING"] },
    },
  });

  if (activeRuns === 0) {
    // All runs for this intent are done — generate recommendation
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
 * Sweep stale RUNNING runs that have been stuck for longer than the timeout.
 * This handles runs orphaned by process crashes.
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
 * Single poll cycle: sweep stale runs, then process pending runs.
 */
export async function pollOnce(): Promise<{
  swept: number;
  processed: number;
}> {
  const swept = await sweepStaleRuns();

  let processed = 0;
  // Process up to 10 runs per poll cycle to avoid blocking
  for (let i = 0; i < 10; i++) {
    const didWork = await processNextRun();
    if (!didWork) break;
    processed++;
  }

  return { swept, processed };
}

/**
 * Start the worker poll loop.
 * Polls for PENDING runs every POLL_INTERVAL_MS.
 * Safe to call multiple times — only one loop runs.
 */
export function startWorker(): void {
  if (workerInterval) return; // already running

  console.log(
    `Worker: started (poll every ${POLL_INTERVAL_MS / 1000}s, stale timeout ${STALE_RUN_TIMEOUT_MS / 60000}min)`
  );

  // Run an initial sweep on startup
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
    console.log("Worker: stopped");
  }
}
