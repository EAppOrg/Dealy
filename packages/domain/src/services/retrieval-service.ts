import { prisma } from "@dealy/db";
import { executeRun } from "./run-executor";
import { RecommendationService } from "./recommendation-service";

/**
 * Execute all runs for an intent asynchronously (fire-and-forget).
 * This function is NOT awaited by the trigger route — it runs in the
 * background after the HTTP response has been sent.
 *
 * Each run transitions PENDING → RUNNING → COMPLETED/FAILED.
 * After all runs finish, a recommendation snapshot is auto-generated.
 */
async function executeRunsAsync(
  runIds: string[],
  intentId: string
): Promise<void> {
  let totalItems = 0;

  for (const runId of runIds) {
    try {
      const result = await executeRun(runId);
      totalItems += result.itemsFound;
    } catch (err) {
      console.error(`Background run ${runId} failed:`, err);
    }
  }

  if (totalItems > 0) {
    try {
      await RecommendationService.generateForIntent(intentId);
    } catch (err) {
      console.error(`Recommendation generation failed for ${intentId}:`, err);
    }
  }
}

export const RetrievalService = {
  async listRuns(filters?: {
    intentId?: string;
    sourceId?: string;
    status?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (filters?.intentId) where.intentId = filters.intentId;
    if (filters?.sourceId) where.sourceId = filters.sourceId;
    if (filters?.status) where.status = filters.status;

    return prisma.retrievalRun.findMany({
      where,
      include: {
        intent: { select: { id: true, title: true } },
        source: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },

  async getRunById(id: string) {
    return prisma.retrievalRun.findUnique({
      where: { id },
      include: {
        intent: { select: { id: true, title: true, query: true } },
        source: { select: { id: true, name: true, type: true } },
      },
    });
  },

  /**
   * Trigger retrieval runs for an intent.
   *
   * Creates PENDING run records and kicks off background execution.
   * Returns immediately — does NOT wait for execution to complete.
   * The caller should poll run status to observe progress.
   */
  async triggerForIntent(intentId: string) {
    const enabledSources = await prisma.source.findMany({
      where: { enabled: true },
    });

    if (enabledSources.length === 0) {
      return { runs: [], message: "No enabled sources configured" };
    }

    // Create run records in PENDING state
    const runs = await prisma.retrievalRun.createManyAndReturn({
      data: enabledSources.map((source: { id: string }) => ({
        intentId,
        sourceId: source.id,
        status: "PENDING" as const,
      })),
    });

    // Update intent's last monitored timestamp
    await prisma.shoppingIntent.update({
      where: { id: intentId },
      data: { lastMonitoredAt: new Date() },
    });

    // Fire-and-forget: start background execution without awaiting
    const runIds = runs.map((r) => r.id);
    executeRunsAsync(runIds, intentId).catch((err) =>
      console.error("Background execution batch error:", err)
    );

    return {
      runs: runs.map((r) => ({
        runId: r.id,
        sourceId: r.sourceId,
        status: r.status,
      })),
      message: `Created ${runs.length} run(s). Execution started in background.`,
    };
  },

  /**
   * Get offers associated with an intent (via its retrieval run sources).
   */
  async getOffersForIntent(intentId: string) {
    const runs = await prisma.retrievalRun.findMany({
      where: { intentId, status: "COMPLETED" },
      select: { sourceId: true },
    });

    const sourceIds = [
      ...new Set(runs.map((r: { sourceId: string }) => r.sourceId)),
    ];

    if (sourceIds.length === 0) return [];

    return prisma.offer.findMany({
      where: { sourceId: { in: sourceIds } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            brand: true,
            model: true,
            imageUrl: true,
          },
        },
        source: { select: { name: true } },
        seller: { select: { name: true, trustScore: true } },
      },
      orderBy: { price: "asc" },
    });
  },

  /**
   * Build comparison data for an intent's offers.
   */
  async getComparisonForIntent(intentId: string) {
    const offers = await this.getOffersForIntent(intentId);

    return offers.map((o: any) => ({
      offerId: o.id,
      productName: o.product.name,
      sellerName: o.seller?.name ?? null,
      sourceName: o.source.name,
      price: o.price,
      shippingCost: o.shippingCost,
      totalCost: o.price + (o.shippingCost ?? 0),
      condition: o.condition,
      url: o.url,
      lastSeenAt: o.lastSeenAt,
    }));
  },
};
