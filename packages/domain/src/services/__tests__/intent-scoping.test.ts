import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@dealy/db";
import { executeRun } from "../run-executor";
import { RetrievalService } from "../retrieval-service";
import { RecommendationService } from "../recommendation-service";
import {
  cleanDatabase,
  createTestWorkspace,
  createTestSource,
} from "../../__tests__/helpers";
import { IntentService } from "../intent-service";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeDdgHtml(
  products: { title: string; price: string; url?: string }[]
) {
  return products
    .map(
      (p, i) =>
        `<div class="result">` +
        `<a class="result__a" href="${p.url ?? `https://example.com/product-${i}`}">${p.title}</a>` +
        `<a class="result__snippet">Great deal at ${p.price} — free shipping available</a>` +
        `</div>`
    )
    .join("");
}

describe("intent-scoping", () => {
  let workspaceId: string;
  let sourceId: string;
  let intentAId: string;
  let intentBId: string;

  beforeEach(async () => {
    await cleanDatabase();
    mockFetch.mockReset();

    const { workspace } = await createTestWorkspace();
    workspaceId = workspace.id;

    const source = await createTestSource({
      name: "SharedStore",
      slug: `shared-store-${Date.now()}`,
    });
    sourceId = source.id;

    const intentA = await IntentService.create({
      workspaceId,
      title: "Gaming laptop",
      query: "gaming laptop",
    });
    intentAId = intentA.id;

    const intentB = await IntentService.create({
      workspaceId,
      title: "Wireless earbuds",
      query: "wireless earbuds",
    });
    intentBId = intentB.id;
  });

  async function createPendingRun(intentId: string) {
    return prisma.retrievalRun.create({
      data: { intentId, sourceId, status: "PENDING" },
    });
  }

  it("Intent B cannot see Intent A-only offers in compare", async () => {
    // Intent A run — finds a laptop
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Razer Blade 16 Gaming Laptop",
            price: "$2499.00",
            url: "https://store.example.com/razer-blade-16",
          },
        ]),
    });
    const runA = await createPendingRun(intentAId);
    await executeRun(runA.id);

    // Intent B run — finds earbuds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WF-1000XM5 Earbuds",
            price: "$248.00",
            url: "https://store.example.com/sony-wf-1000xm5",
          },
        ]),
    });
    const runB = await createPendingRun(intentBId);
    await executeRun(runB.id);

    // Intent A compare should show ONLY the laptop
    const compareA = await RetrievalService.getComparisonForIntent(intentAId);
    expect(compareA).toHaveLength(1);
    expect(compareA[0].productName).toContain("Razer");

    // Intent B compare should show ONLY the earbuds
    const compareB = await RetrievalService.getComparisonForIntent(intentBId);
    expect(compareB).toHaveLength(1);
    expect(compareB[0].productName).toContain("Sony");
  });

  it("Intent B cannot see Intent A-only offers in recommendations", async () => {
    // Intent A run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Dell XPS 15 Laptop",
            price: "$1899.00",
            url: "https://store.example.com/dell-xps-15",
          },
        ]),
    });
    const runA = await createPendingRun(intentAId);
    await executeRun(runA.id);

    // Intent B run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Apple AirPods Pro 2",
            price: "$199.00",
            url: "https://store.example.com/airpods-pro-2",
          },
        ]),
    });
    const runB = await createPendingRun(intentBId);
    await executeRun(runB.id);

    // Generate recommendations for both
    const recA = await RecommendationService.generateForIntent(intentAId);
    const recB = await RecommendationService.generateForIntent(intentBId);

    expect(recA).not.toBeNull();
    expect(recB).not.toBeNull();

    // Each recommendation should only rank its own offers
    expect(recA!.rankedOfferIds).toHaveLength(1);
    expect(recB!.rankedOfferIds).toHaveLength(1);

    // Offer IDs should be different
    expect(recA!.rankedOfferIds[0]).not.toBe(recB!.rankedOfferIds[0]);
  });

  it("dedup still works: repeated run for same intent reuses offers", async () => {
    const url = "https://store.example.com/razer-blade-16";
    const html = makeDdgHtml([
      { title: "Razer Blade 16", price: "$2499.00", url },
    ]);

    // First run
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const run1 = await createPendingRun(intentAId);
    await executeRun(run1.id);

    // Second run — same intent, same URL
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const run2 = await createPendingRun(intentAId);
    await executeRun(run2.id);

    // Still only 1 offer
    const offers = await prisma.offer.findMany({ where: { sourceId } });
    expect(offers).toHaveLength(1);

    // Compare for Intent A shows 1 offer, not 2
    const compare = await RetrievalService.getComparisonForIntent(intentAId);
    expect(compare).toHaveLength(1);

    // 2 price observations
    const obs = await prisma.priceObservation.findMany({
      where: { offerId: offers[0].id },
    });
    expect(obs).toHaveLength(2);
  });

  it("offer without RunOffer is invisible; adding RunOffer restores visibility", async () => {
    // Simulate a legacy offer created before RunOffer model existed
    const product = await prisma.canonicalProduct.create({
      data: { name: "Legacy Laptop", brand: "Dell" },
    });
    const legacyOffer = await prisma.offer.create({
      data: {
        productId: product.id,
        sourceId,
        url: "https://store.example.com/legacy-laptop",
        price: 999,
        title: "Legacy Laptop",
      },
    });

    // Create a completed run for Intent A
    const run = await prisma.retrievalRun.create({
      data: {
        intentId: intentAId,
        sourceId,
        status: "COMPLETED",
        itemsFound: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    // Without RunOffer, legacy offer is invisible
    const compareBefore = await RetrievalService.getComparisonForIntent(
      intentAId
    );
    expect(compareBefore).toHaveLength(0);

    // Simulate backfill: create RunOffer association
    await prisma.runOffer.create({
      data: { runId: run.id, offerId: legacyOffer.id },
    });

    // Now the legacy offer is visible
    const compareAfter = await RetrievalService.getComparisonForIntent(
      intentAId
    );
    expect(compareAfter).toHaveLength(1);
    expect(compareAfter[0].productName).toBe("Legacy Laptop");

    // Idempotency: creating same RunOffer again should fail with unique constraint
    await expect(
      prisma.runOffer.create({
        data: { runId: run.id, offerId: legacyOffer.id },
      })
    ).rejects.toThrow();
  });

  it("shared offer discovered by both intents appears in both", async () => {
    const sharedUrl = "https://store.example.com/universal-product";
    const html = makeDdgHtml([
      { title: "Universal USB-C Hub", price: "$49.00", url: sharedUrl },
    ]);

    // Both intents discover the same offer
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const runA = await createPendingRun(intentAId);
    await executeRun(runA.id);

    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const runB = await createPendingRun(intentBId);
    await executeRun(runB.id);

    // Only 1 offer exists (dedup by URL)
    const offers = await prisma.offer.findMany({ where: { sourceId } });
    expect(offers).toHaveLength(1);

    // Both intents should see it
    const compareA = await RetrievalService.getComparisonForIntent(intentAId);
    const compareB = await RetrievalService.getComparisonForIntent(intentBId);
    expect(compareA).toHaveLength(1);
    expect(compareB).toHaveLength(1);
    expect(compareA[0].offerId).toBe(compareB[0].offerId);
  });
});
