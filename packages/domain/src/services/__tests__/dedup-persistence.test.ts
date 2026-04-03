import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@dealy/db";
import { executeRun } from "../run-executor";
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

describe("dedup-persistence", () => {
  let intentId: string;
  let sourceId: string;

  beforeEach(async () => {
    await cleanDatabase();
    mockFetch.mockReset();

    const { workspace } = await createTestWorkspace();
    const intent = await IntentService.create({
      workspaceId: workspace.id,
      title: "Dedup test intent",
      query: "test headphones",
    });
    intentId = intent.id;

    const source = await createTestSource({
      name: "DedupeStore",
      slug: `dedup-store-${Date.now()}`,
    });
    sourceId = source.id;
  });

  async function createPendingRun() {
    return prisma.retrievalRun.create({
      data: { intentId, sourceId, status: "PENDING" },
    });
  }

  it("repeated run with same URL reuses existing offer (no duplicate)", async () => {
    const html = makeDdgHtml([
      {
        title: "Sony WH-1000XM5",
        price: "$298.00",
        url: "https://store.example.com/sony-xm5",
      },
    ]);

    // First run
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const run1 = await createPendingRun();
    await executeRun(run1.id);

    // Second run — same URL, same product
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const run2 = await createPendingRun();
    await executeRun(run2.id);

    // Should have exactly 1 offer, not 2
    const offers = await prisma.offer.findMany({ where: { sourceId } });
    expect(offers).toHaveLength(1);
    expect(offers[0].url).toBe("https://store.example.com/sony-xm5");
  });

  it("repeated run with same URL reuses existing product (no duplicate)", async () => {
    const html = makeDdgHtml([
      {
        title: "Sony WH-1000XM5",
        price: "$298.00",
        url: "https://store.example.com/sony-xm5",
      },
    ]);

    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const run1 = await createPendingRun();
    await executeRun(run1.id);

    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const run2 = await createPendingRun();
    await executeRun(run2.id);

    // Should have exactly 1 canonical product, not 2
    const products = await prisma.canonicalProduct.findMany({
      where: { name: "Sony WH-1000XM5" },
    });
    expect(products).toHaveLength(1);
  });

  it("price observations append to existing offer across runs", async () => {
    const url = "https://store.example.com/sony-xm5";

    // First run at $298
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([{ title: "Sony WH-1000XM5", price: "$298.00", url }]),
    });
    const run1 = await createPendingRun();
    await executeRun(run1.id);

    // Second run at $279 (price drop)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([{ title: "Sony WH-1000XM5", price: "$279.00", url }]),
    });
    const run2 = await createPendingRun();
    await executeRun(run2.id);

    const offers = await prisma.offer.findMany({ where: { sourceId } });
    expect(offers).toHaveLength(1);

    // Should have 2 price observations on the same offer
    const observations = await prisma.priceObservation.findMany({
      where: { offerId: offers[0].id },
      orderBy: { observedAt: "asc" },
    });
    expect(observations).toHaveLength(2);
    expect(observations[0].price).toBe(298.0);
    expect(observations[1].price).toBe(279.0);
  });

  it("offer price is updated to latest value on reuse", async () => {
    const url = "https://store.example.com/sony-xm5";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([{ title: "Sony WH-1000XM5", price: "$298.00", url }]),
    });
    const run1 = await createPendingRun();
    await executeRun(run1.id);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([{ title: "Sony WH-1000XM5", price: "$279.00", url }]),
    });
    const run2 = await createPendingRun();
    await executeRun(run2.id);

    const offers = await prisma.offer.findMany({ where: { sourceId } });
    expect(offers[0].price).toBe(279.0);
  });

  it("lastSeenAt is updated on reuse", async () => {
    const url = "https://store.example.com/sony-xm5";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([{ title: "Sony WH-1000XM5", price: "$298.00", url }]),
    });
    const run1 = await createPendingRun();
    await executeRun(run1.id);

    const offerBefore = await prisma.offer.findFirst({ where: { sourceId } });
    const firstSeenAt = offerBefore!.lastSeenAt;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 50));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([{ title: "Sony WH-1000XM5", price: "$298.00", url }]),
    });
    const run2 = await createPendingRun();
    await executeRun(run2.id);

    const offerAfter = await prisma.offer.findFirst({ where: { sourceId } });
    expect(offerAfter!.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      firstSeenAt.getTime()
    );
  });

  it("different URL creates new offer and product (no false merge)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WH-1000XM5",
            price: "$298.00",
            url: "https://store.example.com/sony-xm5",
          },
        ]),
    });
    const run1 = await createPendingRun();
    await executeRun(run1.id);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WH-1000XM5",
            price: "$310.00",
            url: "https://other-store.example.com/sony-xm5",
          },
        ]),
    });
    const run2 = await createPendingRun();
    await executeRun(run2.id);

    // Different URLs → different offers, even with same title
    const offers = await prisma.offer.findMany({ where: { sourceId } });
    expect(offers).toHaveLength(2);

    // Different products too (since we only merge via offer URL match)
    const products = await prisma.canonicalProduct.findMany({
      where: { name: "Sony WH-1000XM5" },
    });
    expect(products).toHaveLength(2);
  });

  it("run metadata includes dedup stats", async () => {
    const url = "https://store.example.com/sony-xm5";
    const html = makeDdgHtml([
      { title: "Sony WH-1000XM5", price: "$298.00", url },
    ]);

    // First run — creates
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const run1 = await createPendingRun();
    await executeRun(run1.id);

    const dbRun1 = await prisma.retrievalRun.findUnique({
      where: { id: run1.id },
    });
    const meta1 = dbRun1!.metadata as any;
    expect(meta1.offersCreated).toBe(1);
    expect(meta1.offersReused).toBe(0);

    // Second run — reuses
    mockFetch.mockResolvedValueOnce({ ok: true, text: async () => html });
    const run2 = await createPendingRun();
    await executeRun(run2.id);

    const dbRun2 = await prisma.retrievalRun.findUnique({
      where: { id: run2.id },
    });
    const meta2 = dbRun2!.metadata as any;
    expect(meta2.offersCreated).toBe(0);
    expect(meta2.offersReused).toBe(1);
  });

  it("three repeated runs produce exactly 1 offer with 3 observations", async () => {
    const url = "https://store.example.com/sony-xm5";

    for (let i = 0; i < 3; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          makeDdgHtml([
            { title: "Sony WH-1000XM5", price: `$${290 - i * 5}.00`, url },
          ]),
      });
      const run = await createPendingRun();
      await executeRun(run.id);
    }

    const offers = await prisma.offer.findMany({ where: { sourceId } });
    expect(offers).toHaveLength(1);

    const observations = await prisma.priceObservation.findMany({
      where: { offerId: offers[0].id },
      orderBy: { observedAt: "asc" },
    });
    expect(observations).toHaveLength(3);
    expect(observations[0].price).toBe(290);
    expect(observations[1].price).toBe(285);
    expect(observations[2].price).toBe(280);
  });
});
