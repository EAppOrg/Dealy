/**
 * One-time backfill: create RunOffer associations for historical offers
 * that predate the RunOffer model.
 *
 * Matching rule (deterministic, conservative):
 * - Same sourceId between offer and run
 * - Run status = COMPLETED with itemsFound > 0
 * - offer.createdAt falls within [run.startedAt, run.completedAt]
 *
 * Only creates associations for unambiguous matches (exactly 1 candidate run).
 * Skips offers with 0 or >1 candidate runs.
 * Idempotent: uses upsert on @@unique([runId, offerId]).
 *
 * Usage: npx tsx prisma/backfill-run-offers.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backfill() {
  console.log("RunOffer backfill — starting...\n");

  // Find all offers without RunOffer records
  const orphanOffers: any[] = await prisma.$queryRawUnsafe(`
    SELECT o.id, o."sourceId", o."createdAt", o.title
    FROM offers o
    WHERE NOT EXISTS (SELECT 1 FROM run_offers ro WHERE ro."offerId" = o.id)
    ORDER BY o."createdAt" ASC
  `);

  console.log(`Orphan offers found: ${orphanOffers.length}`);

  let backfilled = 0;
  let skippedNoMatch = 0;
  let skippedMulti = 0;

  for (const offer of orphanOffers) {
    // Find candidate runs: same source, completed with items, temporal window contains offer creation
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
      // Unambiguous — create association (idempotent via upsert)
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
      console.log(`  ✓ Backfilled: "${(offer.title || "").substring(0, 50)}" → run ${candidates[0].id.substring(0, 16)}...`);
    } else if (candidates.length === 0) {
      skippedNoMatch++;
      console.log(`  ⊘ No match: "${(offer.title || "").substring(0, 50)}" (likely seeded data)`);
    } else {
      skippedMulti++;
      console.log(`  ⚠ Ambiguous (${candidates.length} matches): "${(offer.title || "").substring(0, 50)}" — skipped`);
    }
  }

  console.log(`\n=== BACKFILL SUMMARY ===`);
  console.log(`  Backfilled: ${backfilled}`);
  console.log(`  Skipped (no match): ${skippedNoMatch}`);
  console.log(`  Skipped (ambiguous): ${skippedMulti}`);
  console.log(`  Total processed: ${orphanOffers.length}`);

  // Verify final state
  const totalRO: any[] = await prisma.$queryRawUnsafe("SELECT COUNT(*)::int AS cnt FROM run_offers");
  const remainingOrphans: any[] = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS cnt FROM offers o
    WHERE NOT EXISTS (SELECT 1 FROM run_offers ro WHERE ro."offerId" = o.id)
  `);
  console.log(`\n=== POST-BACKFILL STATE ===`);
  console.log(`  Total RunOffer rows: ${totalRO[0].cnt}`);
  console.log(`  Offers still without RunOffer: ${remainingOrphans[0].cnt}`);

  await prisma.$disconnect();
}

backfill().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
