/**
 * Integration proof: historical RunOffer backfill.
 *
 * Constructs a deterministic legacy-style dataset — offers and runs with
 * known timestamps but NO RunOffer associations — then exercises the exact
 * same temporal+source matching logic the operator backfill script uses.
 *
 * Covers all classification cases:
 * - EXACT_1: offer created within exactly one run's execution window
 * - NO_MATCH: offer created outside all run windows
 * - MULTI: offer created within overlapping run windows (ambiguous)
 *
 * Proves:
 * - correct matching and association for unambiguous offers
 * - skipped association for ambiguous and unmatched offers
 * - restored visibility in intent-scoped reads after backfill
 * - no cross-intent leakage introduced
 * - idempotency on re-run
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@dealy/db";
import { RetrievalService } from "../retrieval-service";
import {
  cleanDatabase,
  createTestWorkspace,
  createTestSource,
} from "../../__tests__/helpers";
import { IntentService } from "../intent-service";

/**
 * Core backfill matching logic — identical to the operator script.
 * Returns { backfilled, skippedNoMatch, skippedMulti } counts.
 */
async function runBackfillLogic(): Promise<{
  backfilled: number;
  skippedNoMatch: number;
  skippedMulti: number;
}> {
  const orphanOffers: any[] = await prisma.$queryRawUnsafe(`
    SELECT o.id, o."sourceId", o."createdAt", o.title
    FROM offers o
    WHERE NOT EXISTS (SELECT 1 FROM run_offers ro WHERE ro."offerId" = o.id)
    ORDER BY o."createdAt" ASC
  `);

  let backfilled = 0;
  let skippedNoMatch = 0;
  let skippedMulti = 0;

  for (const offer of orphanOffers) {
    const candidates: any[] = await prisma.$queryRawUnsafe(
      `
      SELECT r.id
      FROM retrieval_runs r
      WHERE r."sourceId" = $1
        AND r.status = 'COMPLETED'
        AND r."itemsFound" > 0
        AND r."startedAt" <= $2
        AND r."completedAt" >= $2
      `,
      offer.sourceId,
      offer.createdAt
    );

    if (candidates.length === 1) {
      await prisma.runOffer.upsert({
        where: {
          runId_offerId: {
            runId: candidates[0].id,
            offerId: offer.id,
          },
        },
        create: {
          runId: candidates[0].id,
          offerId: offer.id,
        },
        update: {},
      });
      backfilled++;
    } else if (candidates.length === 0) {
      skippedNoMatch++;
    } else {
      skippedMulti++;
    }
  }

  return { backfilled, skippedNoMatch, skippedMulti };
}

describe("backfill-proof", () => {
  let workspaceId: string;
  let sourceId: string;
  let intentAId: string;
  let intentBId: string;

  // Fixed timestamps for deterministic matching
  const t0 = new Date("2026-01-01T10:00:00Z");
  const t1 = new Date("2026-01-01T10:00:01Z");
  const t2 = new Date("2026-01-01T10:00:02Z");
  const t3 = new Date("2026-01-01T10:00:03Z");
  const t4 = new Date("2026-01-01T10:00:04Z");
  const t5 = new Date("2026-01-01T10:00:05Z");
  const t6 = new Date("2026-01-01T10:00:06Z");
  const t7 = new Date("2026-01-01T10:00:07Z");
  const tOutside = new Date("2026-01-01T12:00:00Z"); // hours after all runs

  beforeEach(async () => {
    await cleanDatabase();

    const { workspace } = await createTestWorkspace();
    workspaceId = workspace.id;

    const source = await createTestSource({
      name: "BackfillStore",
      slug: `backfill-store-${Date.now()}`,
    });
    sourceId = source.id;

    const intentA = await IntentService.create({
      workspaceId,
      title: "Laptops",
      query: "laptop",
    });
    intentAId = intentA.id;

    const intentB = await IntentService.create({
      workspaceId,
      title: "Headphones",
      query: "headphones",
    });
    intentBId = intentB.id;
  });

  async function createLegacyOffer(opts: {
    title: string;
    url: string;
    price: number;
    createdAt: Date;
  }) {
    const product = await prisma.canonicalProduct.create({
      data: { name: opts.title, brand: "TestBrand" },
    });
    return prisma.offer.create({
      data: {
        productId: product.id,
        sourceId,
        url: opts.url,
        price: opts.price,
        title: opts.title,
        createdAt: opts.createdAt,
        firstSeenAt: opts.createdAt,
        lastSeenAt: opts.createdAt,
      },
    });
  }

  it("full backfill flow: matches, skips, restores visibility, idempotent", async () => {
    // === SETUP: Create legacy-style data with NO RunOffer records ===

    // Run A: Intent A, window [t0, t3]
    const runA = await prisma.retrievalRun.create({
      data: {
        intentId: intentAId,
        sourceId,
        status: "COMPLETED",
        itemsFound: 2,
        startedAt: t0,
        completedAt: t3,
      },
    });

    // Run B: Intent B, window [t4, t7] — non-overlapping with Run A
    const runB = await prisma.retrievalRun.create({
      data: {
        intentId: intentBId,
        sourceId,
        status: "COMPLETED",
        itemsFound: 1,
        startedAt: t4,
        completedAt: t7,
      },
    });

    // Offer 1: created at t1 — inside Run A's window only → EXACT_1
    const offer1 = await createLegacyOffer({
      title: "Dell XPS 15",
      url: "https://store.example.com/dell-xps-15",
      price: 1599,
      createdAt: t1,
    });

    // Offer 2: created at t2 — inside Run A's window only → EXACT_1
    const offer2 = await createLegacyOffer({
      title: "Lenovo ThinkPad X1",
      url: "https://store.example.com/thinkpad-x1",
      price: 1899,
      createdAt: t2,
    });

    // Offer 3: created at t5 — inside Run B's window only → EXACT_1
    const offer3 = await createLegacyOffer({
      title: "Sony WH-1000XM5",
      url: "https://store.example.com/sony-xm5",
      price: 298,
      createdAt: t5,
    });

    // Offer 4: created at tOutside — outside all run windows → NO_MATCH
    const offer4 = await createLegacyOffer({
      title: "Seeded Product",
      url: "https://store.example.com/seeded",
      price: 49,
      createdAt: tOutside,
    });

    // === BEFORE STATE: all offers invisible in intent-scoped reads ===

    const compareABefore = await RetrievalService.getComparisonForIntent(intentAId);
    expect(compareABefore).toHaveLength(0);

    const compareBBefore = await RetrievalService.getComparisonForIntent(intentBId);
    expect(compareBBefore).toHaveLength(0);

    const orphansBefore = await prisma.$queryRawUnsafe<any[]>(
      "SELECT COUNT(*)::int AS cnt FROM offers o WHERE NOT EXISTS (SELECT 1 FROM run_offers ro WHERE ro.\"offerId\" = o.id)"
    );
    expect(orphansBefore[0].cnt).toBe(4);

    // === RUN BACKFILL ===

    const result1 = await runBackfillLogic();

    expect(result1.backfilled).toBe(3);       // offers 1, 2, 3
    expect(result1.skippedNoMatch).toBe(1);   // offer 4
    expect(result1.skippedMulti).toBe(0);

    // === AFTER STATE: matched offers visible, unmatched still invisible ===

    const compareAAfter = await RetrievalService.getComparisonForIntent(intentAId);
    expect(compareAAfter).toHaveLength(2);
    const aTitles = compareAAfter.map((c: any) => c.productName).sort();
    expect(aTitles).toEqual(["Dell XPS 15", "Lenovo ThinkPad X1"]);

    const compareBAfter = await RetrievalService.getComparisonForIntent(intentBId);
    expect(compareBAfter).toHaveLength(1);
    expect(compareBAfter[0].productName).toBe("Sony WH-1000XM5");

    // No cross-intent leakage: Intent A does not see Intent B's offer
    const aOfferIds = compareAAfter.map((c: any) => c.offerId);
    expect(aOfferIds).not.toContain(offer3.id);

    // Offer 4 (no-match) is still invisible in both
    const allVisible = [...compareAAfter, ...compareBAfter];
    const visibleIds = allVisible.map((c: any) => c.offerId);
    expect(visibleIds).not.toContain(offer4.id);

    // Exactly 1 orphan remains (offer 4)
    const orphansAfter = await prisma.$queryRawUnsafe<any[]>(
      "SELECT COUNT(*)::int AS cnt FROM offers o WHERE NOT EXISTS (SELECT 1 FROM run_offers ro WHERE ro.\"offerId\" = o.id)"
    );
    expect(orphansAfter[0].cnt).toBe(1);

    // RunOffer associations point to correct runs
    const roForOffer1 = await prisma.runOffer.findMany({
      where: { offerId: offer1.id },
    });
    expect(roForOffer1).toHaveLength(1);
    expect(roForOffer1[0].runId).toBe(runA.id);

    const roForOffer3 = await prisma.runOffer.findMany({
      where: { offerId: offer3.id },
    });
    expect(roForOffer3).toHaveLength(1);
    expect(roForOffer3[0].runId).toBe(runB.id);

    // === IDEMPOTENCY: running backfill again changes nothing ===

    const result2 = await runBackfillLogic();

    expect(result2.backfilled).toBe(0);       // already done
    expect(result2.skippedNoMatch).toBe(1);   // offer 4 still unmatched
    expect(result2.skippedMulti).toBe(0);

    // Counts unchanged
    const roCountAfter2 = await prisma.runOffer.count();
    expect(roCountAfter2).toBe(3);
  });

  it("ambiguous offer (inside overlapping run windows) is correctly skipped", async () => {
    // Run A: window [t0, t5]
    await prisma.retrievalRun.create({
      data: {
        intentId: intentAId,
        sourceId,
        status: "COMPLETED",
        itemsFound: 1,
        startedAt: t0,
        completedAt: t5,
      },
    });

    // Run B: window [t3, t7] — overlaps with Run A at [t3, t5]
    await prisma.retrievalRun.create({
      data: {
        intentId: intentBId,
        sourceId,
        status: "COMPLETED",
        itemsFound: 1,
        startedAt: t3,
        completedAt: t7,
      },
    });

    // Offer in overlap zone: created at t4 → inside both windows → MULTI
    const ambiguousOffer = await createLegacyOffer({
      title: "Ambiguous Product",
      url: "https://store.example.com/ambiguous",
      price: 199,
      createdAt: t4,
    });

    const result = await runBackfillLogic();

    expect(result.backfilled).toBe(0);
    expect(result.skippedMulti).toBe(1);

    // Offer remains orphaned — no RunOffer created
    const ro = await prisma.runOffer.findMany({
      where: { offerId: ambiguousOffer.id },
    });
    expect(ro).toHaveLength(0);

    // Offer invisible in both intents
    const compareA = await RetrievalService.getComparisonForIntent(intentAId);
    const compareB = await RetrievalService.getComparisonForIntent(intentBId);
    expect(compareA).toHaveLength(0);
    expect(compareB).toHaveLength(0);
  });
});
