import { prisma } from "@dealy/db";

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
   * Trigger a retrieval run for an intent across all enabled sources.
   *
   * NOTE: This creates run records in PENDING status. Actual retrieval
   * execution (HTTP fetching, parsing, offer extraction) is deferred
   * to a future batch that adds background job processing. The service
   * boundary and run lifecycle model are established here.
   */
  async triggerForIntent(intentId: string) {
    const enabledSources = await prisma.source.findMany({
      where: { enabled: true },
    });

    if (enabledSources.length === 0) {
      return { runs: [], message: "No enabled sources configured" };
    }

    const runs = await prisma.retrievalRun.createManyAndReturn({
      data: enabledSources.map((source) => ({
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

    return {
      runs,
      message: `Created ${runs.length} retrieval run(s) in PENDING status. Background execution is not yet implemented.`,
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

    const sourceIds = [...new Set(runs.map((r) => r.sourceId))];

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

    return offers.map((o) => ({
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
