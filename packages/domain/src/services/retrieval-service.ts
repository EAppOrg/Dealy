import { prisma } from "@dealy/db";
import { executeRun } from "./run-executor";
import { RecommendationService } from "./recommendation-service";

export const RetrievalService = {
  async listRuns(filters?: { intentId?: string; sourceId?: string; status?: string }) {
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
   * Trigger retrieval runs for an intent across all enabled sources.
   *
   * Creates run records, executes each one in-process (real HTTP search),
   * and auto-generates a recommendation snapshot from the results.
   */
  async triggerForIntent(intentId: string) {
    const enabledSources = await prisma.source.findMany({
      where: { enabled: true },
    });

    if (enabledSources.length === 0) {
      return { runs: [], message: "No enabled sources configured" };
    }

    // Create run records
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

    // Execute each run in-process
    const results = [];
    for (const run of runs) {
      const result = await executeRun(run.id);
      results.push({ runId: run.id, ...result });
    }

    // Auto-generate recommendation from newly found offers
    const totalItems = results.reduce((sum, r) => sum + r.itemsFound, 0);
    let recommendation = null;
    if (totalItems > 0) {
      recommendation =
        await RecommendationService.generateForIntent(intentId);
    }

    const completed = results.filter((r) => r.status === "COMPLETED").length;
    const failed = results.filter((r) => r.status === "FAILED").length;

    return {
      runs: results,
      totalItems,
      recommendation,
      message:
        `Executed ${runs.length} run(s): ${completed} completed, ${failed} failed. ` +
        `Found ${totalItems} item(s).` +
        (recommendation
          ? ` Recommendation v${recommendation.version} generated.`
          : ""),
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

    const sourceIds = [...new Set(runs.map((r: { sourceId: string }) => r.sourceId))];

    if (sourceIds.length === 0) return [];

    return prisma.offer.findMany({
      where: { sourceId: { in: sourceIds } },
      include: {
        product: { select: { id: true, name: true, brand: true, model: true, imageUrl: true } },
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
