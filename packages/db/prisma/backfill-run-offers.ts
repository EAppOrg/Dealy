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
 * ═══════════════════════════════════════════════════════════════════════
 * OPERATOR RUNBOOK
 * ═══════════════════════════════════════════════════════════════════════
 *
 * WHEN TO RUN:
 *   After deploying the RunOffer migration (20260403100000_run_offer_association)
 *   to any environment that has pre-existing offers without RunOffer records.
 *
 * PRE-CHECK (run these queries against the target DB):
 *
 *   -- Count orphan offers (should be > 0 if backfill is needed)
 *   SELECT COUNT(*) FROM offers o
 *   WHERE NOT EXISTS (SELECT 1 FROM run_offers ro WHERE ro."offerId" = o.id);
 *
 *   -- Preview what will be matched
 *   SELECT o.title, o."createdAt", r.id AS run_id, si.title AS intent
 *   FROM offers o
 *   JOIN retrieval_runs r ON r."sourceId" = o."sourceId"
 *     AND r.status = 'COMPLETED' AND r."itemsFound" > 0
 *     AND r."startedAt" <= o."createdAt" AND r."completedAt" >= o."createdAt"
 *   JOIN shopping_intents si ON si.id = r."intentId"
 *   WHERE NOT EXISTS (SELECT 1 FROM run_offers ro WHERE ro."offerId" = o.id);
 *
 * EXECUTE:
 *   cd packages/db
 *   DATABASE_URL="<target-db-url>" npx tsx prisma/backfill-run-offers.ts
 *
 * POST-CHECK:
 *
 *   -- Verify orphan count dropped
 *   SELECT COUNT(*) FROM offers o
 *   WHERE NOT EXISTS (SELECT 1 FROM run_offers ro WHERE ro."offerId" = o.id);
 *
 *   -- Verify RunOffer rows created
 *   SELECT COUNT(*) FROM run_offers;
 *
 *   -- Verify restored visibility (pick an intent with backfilled offers)
 *   SELECT o.title, o.price FROM offers o
 *   JOIN run_offers ro ON ro."offerId" = o.id
 *   JOIN retrieval_runs r ON r.id = ro."runId"
 *   WHERE r."intentId" = '<intent-id>'
 *   ORDER BY o.price;
 *
 * IDEMPOTENCY: Safe to re-run. Uses upsert — will not create duplicate rows.
 *
 * SKIPPED RECORDS:
 *   - NO_MATCH: offers created outside all run windows (typically seeded data).
 *     Fix by reseeding: npx prisma db seed
 *   - AMBIGUOUS: offers inside overlapping run windows (multiple candidate runs).
 *     Must be resolved manually or by rerunning the intent.
 * ═══════════════════════════════════════════════════════════════════════
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
