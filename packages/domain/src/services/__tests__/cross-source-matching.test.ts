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

describe("cross-source-matching", () => {
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
      title: "Test intent",
      query: "test query",
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

  it("same title + brand from two sources reuses same CanonicalProduct", async () => {
    const title = "Sony WH-1000XM5 Wireless Headphones";

    // Source A finds the product
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title, price: "$298.00", url: "https://amazon.example.com/sony-xm5" },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // Source B finds the SAME product (same title, different URL)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title, price: "$289.00", url: "https://bestbuy.example.com/sony-xm5" },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Should have 2 offers (different sourceId+url)
    const offers = await prisma.offer.findMany();
    expect(offers).toHaveLength(2);

    // But only 1 canonical product (merged)
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe(title);
    expect(products[0].brand).toBe("Sony");

    // Both offers point to the same product
    expect(offers[0].productId).toBe(offers[1].productId);
    expect(offers[0].productId).toBe(products[0].id);
  });

  it("different titles with same brand do NOT merge", async () => {
    // Source A: a specific Sony product
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
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // Source B: a DIFFERENT Sony product
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WF-1000XM5 True Wireless Earbuds",
            price: "$248.00",
            url: "https://bestbuy.example.com/sony-wf-xm5",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // 2 offers AND 2 products — different titles mean different products
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(2);

    const offers = await prisma.offer.findMany();
    expect(offers).toHaveLength(2);
    expect(offers[0].productId).not.toBe(offers[1].productId);
  });

  it("null brand prevents matching — creates separate products", async () => {
    const title = "Mysterious Widget Pro 3000";

    // Source A
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title, price: "$49.00", url: "https://amazon.example.com/widget" },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // Source B — same title but no known brand
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title, price: "$45.00", url: "https://bestbuy.example.com/widget" },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Brand is null → no cross-source matching → 2 separate products
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(2);
    products.forEach((p) => expect(p.brand).toBeNull());
  });

  it("whitespace-normalized titles merge correctly", async () => {
    // Source A — title with extra whitespace
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "  Apple  AirPods   Max  ",
            price: "$549.00",
            url: "https://amazon.example.com/airpods-max",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // Source B — same title, normal whitespace
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Apple AirPods Max",
            price: "$529.00",
            url: "https://bestbuy.example.com/airpods-max",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Whitespace normalization should make these match
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(1);
    expect(products[0].brand).toBe("Apple");
  });

  it("same-source dedup still works alongside cross-source matching", async () => {
    const title = "Dell XPS 15 Laptop";
    const url = "https://amazon.example.com/dell-xps-15";

    // First run: creates product + offer
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => makeDdgHtml([{ title, price: "$1599.00", url }]),
    });
    const run1 = await createPendingRun(sourceAId);
    await executeRun(run1.id);

    // Second run, same source, same URL: dedup reuses offer
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => makeDdgHtml([{ title, price: "$1499.00", url }]),
    });
    const run2 = await createPendingRun(sourceAId);
    await executeRun(run2.id);

    // Third run, different source, same title: cross-source merges product
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          { title, price: "$1549.00", url: "https://bestbuy.example.com/dell-xps" },
        ]),
    });
    const run3 = await createPendingRun(sourceBId);
    await executeRun(run3.id);

    // 2 offers (same-source dedup merged runs 1+2 into 1 offer)
    // + 1 more offer from source B = 2 total offers
    const offers = await prisma.offer.findMany();
    expect(offers).toHaveLength(2);

    // But only 1 product (cross-source matched by brand+title)
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(1);
    expect(products[0].brand).toBe("Dell");
  });

  it("case-only title difference merges via Tier-1", async () => {
    // Source A — title in mixed case
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Sony WH-1000XM5 Wireless Headphones",
            price: "$298.00",
            url: "https://amazon.example.com/sony-xm5-a",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // Source B — same title, different casing only
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "sony wh-1000xm5 wireless headphones",
            price: "$279.00",
            url: "https://bestbuy.example.com/sony-xm5-b",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Case-insensitive Tier-1 → 1 product, 2 offers
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(1);
    expect(products[0].brand).toBe("Sony");

    const offers = await prisma.offer.findMany();
    expect(offers).toHaveLength(2);
    expect(offers[0].productId).toBe(offers[1].productId);
  });

  it("newly recognized brand (Anker) enables cross-source matching", async () => {
    const title = "Anker Soundcore Life Q20 Headphones";

    // Source A
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title,
            price: "$59.00",
            url: "https://amazon.example.com/anker-q20",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // Source B — same title
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title,
            price: "$54.00",
            url: "https://bestbuy.example.com/anker-q20",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Anker is now recognized → Tier-1 merges → 1 product, 2 offers
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(1);
    expect(products[0].brand).toBe("Anker");

    const offers = await prisma.offer.findMany();
    expect(offers).toHaveLength(2);
    expect(offers[0].productId).toBe(offers[1].productId);
  });

  it("excluded/unknown brand still prevents cross-source matching", async () => {
    const title = "Zyvora OmniWidget Pro 3000";

    // Source A
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title,
            price: "$49.00",
            url: "https://amazon.example.com/zyvora-pro",
          },
        ]),
    });
    const runA = await createPendingRun(sourceAId);
    await executeRun(runA.id);

    // Source B — same title
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title,
            price: "$45.00",
            url: "https://bestbuy.example.com/zyvora-pro",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Zyvora not in known brands → null brand → 2 separate products
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(2);
    products.forEach((p) => expect(p.brand).toBeNull());
  });

  it("different brands with same model name do NOT merge", async () => {
    // Hypothetical: two different brands, similar model name
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        makeDdgHtml([
          {
            title: "Samsung Galaxy Buds Pro",
            price: "$199.00",
            url: "https://amazon.example.com/samsung-buds",
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
            title: "Google Pixel Buds Pro",
            price: "$179.00",
            url: "https://bestbuy.example.com/pixel-buds",
          },
        ]),
    });
    const runB = await createPendingRun(sourceBId);
    await executeRun(runB.id);

    // Different brands → 2 separate products
    const products = await prisma.canonicalProduct.findMany();
    expect(products).toHaveLength(2);
    const brands = products.map((p) => p.brand).sort();
    expect(brands).toEqual(["Google", "Samsung"]);
  });
});
