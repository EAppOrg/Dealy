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

describe("model-matching", () => {
  let workspaceId: string;
  let intentId: string;
  let sourceAId: string;
  let sourceBId: string;

  beforeEach(async () => {
    await cleanDatabase();
    mockFetch.mockReset();

    const { workspace } = await createTestWorkspace();
    workspaceId = workspace.id;

    const intent = await IntentService.create({
      workspaceId,
      title: "Model test",
      query: "test",
    });
    intentId = intent.id;

    const sourceA = await createTestSource({
      name: "Amazon",
      slug: `amazon-${Date.now()}`,
      type: "MARKETPLACE",
    });
    sourceAId = sourceA.id;

    const sourceB = await createTestSource({
      name: "BestBuy",
      slug: `bestbuy-${Date.now()}`,
      type: "RETAILER",
    });
    sourceBId = sourceB.id;
  });

  async function createPendingRun(sourceId: string) {
    return prisma.retrievalRun.create({
      data: { intentId, sourceId, status: "PENDING" },
    });
  }

  it("same brand + same model, different titles → merged via model matching", async () => {
    // Source A: full descriptive title
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black",
            price: "$298.00",
            url: "https://amazon.example.com/sony-xm5",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // Source B: shorter different title, same model
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WH-1000XM5 Over-the-Ear Headphones",
            price: "$289.00",
            url: "https://bestbuy.example.com/sony-xm5",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // 2 offers but 1 product (model-matched)
    const offers = await prisma.offer.findMany();
    expect(offers).toHaveLength(2);

    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(1);
    expect(products[0].brand).toBe("Sony");
    expect(products[0].model).toBe("WH-1000XM5");
    expect(offers[0].productId).toBe(offers[1].productId);
  });

  it("same brand, different model → NOT merged", async () => {
    // WH-1000XM5 (over-ear)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WH-1000XM5 Wireless Headphones",
            price: "$298.00",
            url: "https://amazon.example.com/wh-xm5",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // WF-1000XM5 (earbuds) — different model
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WF-1000XM5 True Wireless Earbuds",
            price: "$248.00",
            url: "https://bestbuy.example.com/wf-xm5",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(2);
    const models = products.map((p) => p.model).sort();
    expect(models).toEqual(["WF-1000XM5", "WH-1000XM5"]);
  });

  it("storage blocker prevents merge: 256GB vs 512GB", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Samsung Galaxy S24 256GB Smartphone",
            price: "$799.00",
            url: "https://amazon.example.com/s24-256",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Samsung Galaxy S24 512GB Phone",
            price: "$899.00",
            url: "https://bestbuy.example.com/s24-512",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Same model (S24) but different storage → NOT merged
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(2);
  });

  it("chip generation blocker: M3 vs M4", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Apple MacBook Air M3 Laptop 13-inch",
            price: "$1099.00",
            url: "https://amazon.example.com/air-m3",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Apple MacBook Air M4 13-inch Laptop",
            price: "$1199.00",
            url: "https://bestbuy.example.com/air-m4",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Same model token but different chip gen → NOT merged
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(2);
  });

  it("null brand prevents model matching", async () => {
    // No recognized brand
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Anker SoundCore A3i Earbuds",
            price: "$39.00",
            url: "https://amazon.example.com/anker-a3i",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Anker SoundCore A3i Wireless Earbuds",
            price: "$35.00",
            url: "https://bestbuy.example.com/anker-a3i",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Anker not in known brands → no model matching → 2 products
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(2);
  });

  it("model is persisted on newly created products", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WH-1000XM5 Wireless Headphones",
            price: "$298.00",
            url: "https://amazon.example.com/sony-xm5",
          },
        ]),
    });
    const run = await createPendingRun(sourceAId);
    await executeRun(run.id);

    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(1);
    expect(products[0].model).toBe("WH-1000XM5");
    expect(products[0].brand).toBe("Sony");
  });

  it("exact title matching still takes priority over model matching", async () => {
    const exactTitle = "Sony WH-1000XM5 Exact Same Title";

    // Source A
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title: exactTitle, price: "$298.00", url: "https://amazon.example.com/a" },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // Source B — exact same title
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title: exactTitle, price: "$289.00", url: "https://bestbuy.example.com/b" },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Should merge via exact title (tier 1), not model (tier 2)
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(1);
  });

  it("weak tokens (Pro, Max, RGB) are NOT treated as models", async () => {
    // "Apple AirPods Pro" — "Pro" is not a model
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Apple AirPods Pro Wireless Earbuds",
            price: "$199.00",
            url: "https://amazon.example.com/airpods-pro",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    const products = await prisma.canonicalProduct.findMany();
    expect(products[0].model).toBeNull();
  });

  it("existing within-source dedup still works with model matching", async () => {
    const url = "https://amazon.example.com/sony-xm5";

    // First run
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title: "Sony WH-1000XM5 Headphones", price: "$298.00", url },
        ]),
    });
    const run1 = await createPendingRun(sourceAId);
    await executeRun(run1.id);

    // Second run — same URL, same source → offer dedup
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title: "Sony WH-1000XM5 Headphones", price: "$279.00", url },
        ]),
    });
    const run2 = await createPendingRun(sourceAId);
    await executeRun(run2.id);

    const offers = await prisma.offer.findMany();
    expect(offers).toHaveLength(1);

    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(1);
    expect(products[0].model).toBe("WH-1000XM5");
  });
});
