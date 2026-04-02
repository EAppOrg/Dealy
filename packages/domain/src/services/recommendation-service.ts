import { prisma } from "@dealy/db";
import type { RankingInput } from "../types/recommendation";

const ALGORITHM_VERSION = "baseline-v1";

/**
 * Baseline ranking: sorts offers by total cost (price + shipping),
 * with a small boost for higher seller trust scores and newer observations.
 *
 * This is intentionally simple — real ranking sophistication is deferred
 * to a future batch. The algorithm is honest about its simplicity.
 */
export function baselineRank(offers: RankingInput[]): string[] {
  const scored = offers.map((o) => {
    const totalCost = o.price + (o.shippingCost ?? 0);
    // Small trust bonus: up to 5% discount equivalent for trusted sellers
    const trustDiscount = (o.sellerTrustScore ?? 0.5) * 0.05 * totalCost;
    // Recency bonus: prefer offers seen more recently (within last 24h = full bonus)
    const hoursSinceLastSeen =
      (Date.now() - o.lastSeenAt.getTime()) / (1000 * 60 * 60);
    const recencyFactor = Math.max(0, 1 - hoursSinceLastSeen / 168); // 7-day decay
    const recencyBonus = recencyFactor * 0.02 * totalCost;

    const effectiveCost = totalCost - trustDiscount - recencyBonus;
    return { offerId: o.offerId, effectiveCost };
  });

  scored.sort((a, b) => a.effectiveCost - b.effectiveCost);
  return scored.map((s) => s.offerId);
}

export const RecommendationService = {
  /**
   * Generate a recommendation snapshot for a given intent.
   * Fetches all offers linked to the intent's retrieval runs,
   * ranks them using the baseline algorithm, and stores the snapshot.
   */
  async generateForIntent(intentId: string) {
    // Find all offers associated with this intent via retrieval runs
    const runs = await prisma.retrievalRun.findMany({
      where: { intentId, status: "COMPLETED" },
      select: { sourceId: true },
    });

    if (runs.length === 0) {
      return null; // No completed runs — cannot recommend
    }

    const sourceIds = [...new Set(runs.map((r) => r.sourceId))];

    const offers = await prisma.offer.findMany({
      where: { sourceId: { in: sourceIds } },
      include: { seller: { select: { trustScore: true } } },
    });

    if (offers.length === 0) {
      return null; // No offers found
    }

    const rankingInputs: RankingInput[] = offers.map((o) => ({
      offerId: o.id,
      price: o.price,
      shippingCost: o.shippingCost,
      condition: o.condition,
      sellerTrustScore: o.seller?.trustScore ?? null,
      lastSeenAt: o.lastSeenAt,
    }));

    const rankedIds = baselineRank(rankingInputs);

    // Determine version (increment from last snapshot for this intent)
    const lastSnapshot = await prisma.recommendationSnapshot.findFirst({
      where: { intentId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (lastSnapshot?.version ?? 0) + 1;

    const confidence = offers.length >= 3 ? 0.6 : offers.length >= 1 ? 0.3 : 0;
    const explanation =
      `Baseline ranking of ${offers.length} offer(s) by total cost ` +
      `with seller trust and recency adjustments. ` +
      `Algorithm: ${ALGORITHM_VERSION}. ` +
      `Confidence is ${confidence < 0.5 ? "low" : "moderate"} due to ` +
      `${offers.length < 3 ? "limited offer data" : "reasonable offer coverage"}.`;

    const snapshot = await prisma.recommendationSnapshot.create({
      data: {
        intentId,
        version,
        rankedOfferIds: rankedIds,
        explanation,
        confidence,
        algorithm: ALGORITHM_VERSION,
      },
    });

    return {
      snapshotId: snapshot.id,
      intentId: snapshot.intentId,
      version: snapshot.version,
      rankedOfferIds: rankedIds,
      explanation: snapshot.explanation,
      confidence: snapshot.confidence,
      algorithm: snapshot.algorithm,
      createdAt: snapshot.createdAt,
    };
  },

  async getLatestForIntent(intentId: string) {
    const snapshot = await prisma.recommendationSnapshot.findFirst({
      where: { intentId },
      orderBy: { createdAt: "desc" },
    });

    if (!snapshot) return null;

    return {
      snapshotId: snapshot.id,
      intentId: snapshot.intentId,
      version: snapshot.version,
      rankedOfferIds: snapshot.rankedOfferIds as string[],
      explanation: snapshot.explanation,
      confidence: snapshot.confidence,
      algorithm: snapshot.algorithm,
      createdAt: snapshot.createdAt,
    };
  },
};
