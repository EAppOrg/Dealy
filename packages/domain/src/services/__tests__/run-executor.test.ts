import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@dealy/db";
import { executeRun } from "../run-executor";
import {
  cleanDatabase,
  createTestWorkspace,
  createTestSource,
} from "../../__tests__/helpers";
import { IntentService } from "../intent-service";

// Mock global fetch to avoid real HTTP calls in tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeDdgHtml(products: { title: string; price: string; url?: string }[]) {
  // Mimic DuckDuckGo HTML search result structure
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

describe("executeRun", () => {
  let workspaceId: string;
  let intentId: string;
  let sourceId: string;

  beforeEach(async () => {
    await cleanDatabase();
    mockFetch.mockReset();
    const { workspace } = await createTestWorkspace();
    workspaceId = workspace.id;

    const intent = await IntentService.create({
      workspaceId,
      title: "Test keyboard",
      query: "mechanical keyboard",
    });
    intentId = intent.id;

    const source = await createTestSource({ name: "TestStore", slug: `test-store-${Date.now()}` });
    sourceId = source.id;
  });

  async function createPendingRun() {
    return prisma.retrievalRun.create({
      data: { intentId, sourceId, status: "PENDING" },
    });
  }

  it("transitions PENDING → RUNNING → COMPLETED on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title: "Keychron K2 Keyboard", price: "$79.99" },
          { title: "Corsair K70 RGB", price: "$129.95" },
        ]),
    });

    const run = await createPendingRun();
    const result = await executeRun(run.id);

    expect(result.status).toBe("COMPLETED");
    expect(result.itemsFound).toBe(2);

    // Verify DB state
    const dbRun = await prisma.retrievalRun.findUnique({ where: { id: run.id } });
    expect(dbRun!.status).toBe("COMPLETED");
    expect(dbRun!.startedAt).not.toBeNull();
    expect(dbRun!.completedAt).not.toBeNull();
    expect(dbRun!.itemsFound).toBe(2);
  });

  it("persists products, offers, and price observations", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([{ title: "Sony WH-1000XM5", price: "$298.00" }]),
    });

    const run = await createPendingRun();
    await executeRun(run.id);

    // Verify product created
    const products = await prisma.canonicalProduct.findMany({
      where: { name: "Sony WH-1000XM5" },
    });
    expect(products).toHaveLength(1);
    expect(products[0].brand).toBe("Sony");

    // Verify offer created
    const offers = await prisma.offer.findMany({
      where: { sourceId },
    });
    expect(offers).toHaveLength(1);
    expect(offers[0].price).toBe(298.0);
    expect(offers[0].title).toBe("Sony WH-1000XM5");

    // Verify price observation
    const observations = await prisma.priceObservation.findMany({
      where: { offerId: offers[0].id },
    });
    expect(observations).toHaveLength(1);
    expect(observations[0].price).toBe(298.0);
  });

  it("transitions to FAILED on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    const run = await createPendingRun();
    const result = await executeRun(run.id);

    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("429");

    const dbRun = await prisma.retrievalRun.findUnique({ where: { id: run.id } });
    expect(dbRun!.status).toBe("FAILED");
    expect(dbRun!.errorMessage).toContain("429");
    expect(dbRun!.completedAt).not.toBeNull();
  });

  it("transitions to FAILED on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const run = await createPendingRun();
    const result = await executeRun(run.id);

    expect(result.status).toBe("FAILED");
    expect(result.error).toBe("Network timeout");

    const dbRun = await prisma.retrievalRun.findUnique({ where: { id: run.id } });
    expect(dbRun!.status).toBe("FAILED");
    expect(dbRun!.errorMessage).toBe("Network timeout");
  });

  it("COMPLETED with 0 items when search returns no parseable prices", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html><body>No shopping results</body></html>",
    });

    const run = await createPendingRun();
    const result = await executeRun(run.id);

    expect(result.status).toBe("COMPLETED");
    expect(result.itemsFound).toBe(0);

    const dbRun = await prisma.retrievalRun.findUnique({ where: { id: run.id } });
    expect(dbRun!.status).toBe("COMPLETED");
    expect(dbRun!.itemsFound).toBe(0);
  });

  it("creates seller from source if not existing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([{ title: "Test Product", price: "$50.00" }]),
    });

    const run = await createPendingRun();
    await executeRun(run.id);

    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    const seller = await prisma.seller.findUnique({
      where: { slug: source!.slug },
    });
    expect(seller).not.toBeNull();
    expect(seller!.name).toBe(source!.name);
  });
});
