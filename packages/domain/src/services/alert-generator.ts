import { prisma } from "@dealy/db";

/**
 * Generate alerts from a completed retrieval run's outcomes.
 *
 * Checks for:
 * - PRICE_DROP: new offer price < best previous offer price for same source+intent
 * - NEW_OFFER: offers found from a source that had no prior offers for this intent
 * - RUN_FAILED: run ended in FAILED status
 */
export async function generateAlertsForRun(runId: string): Promise<number> {
  const run = await prisma.retrievalRun.findUnique({
    where: { id: runId },
    include: {
      intent: { select: { id: true, title: true, budgetMax: true } },
      source: { select: { id: true, name: true } },
    },
  });

  if (!run) return 0;

  let alertsCreated = 0;

  // RUN_FAILED alert
  if (run.status === "FAILED") {
    await prisma.alertEvent.create({
      data: {
        intentId: run.intentId,
        type: "RUN_FAILED",
        title: `${run.source.name} retrieval failed`,
        message: run.errorMessage ?? "Retrieval run failed during execution",
        severity: "WARNING",
      },
    });
    return 1;
  }

  if (run.status !== "COMPLETED" || run.itemsFound === 0) return 0;

  // Get offers discovered by this run via run-offer associations
  const runOfferRecords = await prisma.runOffer.findMany({
    where: { runId: run.id },
    select: { offerId: true },
  });
  const offerIds = runOfferRecords.map((ro) => ro.offerId);

  const recentOffers = offerIds.length > 0
    ? await prisma.offer.findMany({
        where: { id: { in: offerIds } },
        orderBy: { price: "asc" },
      })
    : [];

  if (recentOffers.length === 0) return 0;

  // Check for previous offers from same source for this intent's runs
  const previousRuns = await prisma.retrievalRun.findMany({
    where: {
      intentId: run.intentId,
      sourceId: run.sourceId,
      status: "COMPLETED",
      id: { not: run.id },
      completedAt: { not: null },
    },
    orderBy: { completedAt: "desc" },
    take: 1,
  });

  if (previousRuns.length === 0) {
    // NEW_OFFER: first time this source returned offers for this intent
    const bestPrice = recentOffers[0].price;
    await prisma.alertEvent.create({
      data: {
        intentId: run.intentId,
        type: "NEW_OFFER",
        title: `New offers found on ${run.source.name}`,
        message:
          `${recentOffers.length} offer(s) found starting at $${bestPrice.toFixed(2)}`,
        severity: "INFO",
        metadata: {
          sourceId: run.sourceId,
          offerCount: recentOffers.length,
          bestPrice,
        } as any,
      },
    });
    alertsCreated++;
  } else {
    // Compare to previous best price from this intent+source's prior runs.
    // Find offer IDs from prior runs, then find cheapest historical observation.
    const priorRunIds = previousRuns.map((r) => r.id);
    const priorRunOffers = await prisma.runOffer.findMany({
      where: { runId: { in: priorRunIds } },
      select: { offerId: true },
      distinct: ["offerId"],
    });
    const priorOfferIds = priorRunOffers.map((ro) => ro.offerId);

    const previousBestObs = priorOfferIds.length > 0
      ? await prisma.priceObservation.findFirst({
          where: {
            offerId: { in: priorOfferIds },
            observedAt: { lt: run.startedAt ?? run.createdAt },
          },
          orderBy: { price: "asc" },
        })
      : null;

    if (previousBestObs && recentOffers.length > 0) {
      const previousBest = previousBestObs.price;
      const newBest = recentOffers[0].price;

      if (newBest < previousBest) {
        const drop = previousBest - newBest;
        const pct = ((drop / previousBest) * 100).toFixed(0);

        await prisma.alertEvent.create({
          data: {
            intentId: run.intentId,
            type: "PRICE_DROP",
            title: `Price dropped ${pct}% on ${run.source.name}`,
            message:
              `Best price dropped from $${previousBest.toFixed(2)} to $${newBest.toFixed(2)} ` +
              `(save $${drop.toFixed(2)})`,
            severity: drop / previousBest > 0.1 ? "WARNING" : "INFO",
            metadata: {
              sourceId: run.sourceId,
              previousPrice: previousBest,
              newPrice: newBest,
              dropAmount: drop,
              dropPercent: parseFloat(pct),
            } as any,
          },
        });
        alertsCreated++;
      }
    }
  }

  return alertsCreated;
}

/**
 * Generate a RUN_FAILED alert directly (called by worker on execution failure).
 */
export async function generateRunFailedAlert(
  runId: string
): Promise<void> {
  await generateAlertsForRun(runId);
}
