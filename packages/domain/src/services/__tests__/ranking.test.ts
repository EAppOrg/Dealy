import { describe, it, expect } from "vitest";
import { baselineRank } from "../recommendation-service";
import type { RankingInput } from "../../types/recommendation";

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);

function makeOffer(
  id: string,
  price: number,
  opts: Partial<Omit<RankingInput, "offerId" | "price">> = {}
): RankingInput {
  return {
    offerId: id,
    price,
    shippingCost: opts.shippingCost ?? 0,
    condition: opts.condition ?? "NEW",
    sellerTrustScore: opts.sellerTrustScore ?? 0.5,
    lastSeenAt: opts.lastSeenAt ?? now,
  };
}

describe("baselineRank", () => {
  it("ranks by total cost ascending (lowest first)", () => {
    const result = baselineRank([
      makeOffer("expensive", 500),
      makeOffer("cheap", 100),
      makeOffer("mid", 300),
    ]);

    expect(result[0]).toBe("cheap");
    expect(result[1]).toBe("mid");
    expect(result[2]).toBe("expensive");
  });

  it("includes shipping cost in total cost calculation", () => {
    const result = baselineRank([
      makeOffer("low-price-high-ship", 100, { shippingCost: 50 }),
      makeOffer("high-price-free-ship", 140, { shippingCost: 0 }),
    ]);

    // 100 + 50 = 150 vs 140 + 0 = 140
    expect(result[0]).toBe("high-price-free-ship");
    expect(result[1]).toBe("low-price-high-ship");
  });

  it("handles null shipping cost as zero", () => {
    const result = baselineRank([
      makeOffer("with-ship", 100, { shippingCost: 20 }),
      makeOffer("null-ship", 100, { shippingCost: null }),
    ]);

    // null shipping = 0, so 100 + 0 < 100 + 20
    expect(result[0]).toBe("null-ship");
    expect(result[1]).toBe("with-ship");
  });

  it("gives bonus to higher trust score sellers", () => {
    // Both same total cost; higher trust should rank first
    const result = baselineRank([
      makeOffer("low-trust", 200, { sellerTrustScore: 0.1 }),
      makeOffer("high-trust", 200, { sellerTrustScore: 0.99 }),
    ]);

    expect(result[0]).toBe("high-trust");
  });

  it("handles null trust score with default 0.5", () => {
    const result = baselineRank([
      makeOffer("null-trust", 200, { sellerTrustScore: null }),
      makeOffer("high-trust", 200, { sellerTrustScore: 0.99 }),
    ]);

    // null → 0.5 default, 0.99 is higher → more discount
    expect(result[0]).toBe("high-trust");
  });

  it("gives recency bonus to recently seen offers", () => {
    const result = baselineRank([
      makeOffer("old", 200, { lastSeenAt: hoursAgo(168) }), // 7 days ago (zero bonus)
      makeOffer("recent", 200, { lastSeenAt: hoursAgo(1) }), // 1 hour ago (full bonus)
    ]);

    expect(result[0]).toBe("recent");
  });

  it("returns empty array for empty input", () => {
    expect(baselineRank([])).toEqual([]);
  });

  it("returns single item for single input", () => {
    const result = baselineRank([makeOffer("only", 100)]);
    expect(result).toEqual(["only"]);
  });

  it("cost difference outweighs trust/recency bonuses", () => {
    // $100 price gap should outweigh any trust/recency bonus
    const result = baselineRank([
      makeOffer("pricey-but-trusted", 300, {
        sellerTrustScore: 0.99,
        lastSeenAt: now,
      }),
      makeOffer("cheap-but-sketchy", 200, {
        sellerTrustScore: 0.1,
        lastSeenAt: hoursAgo(100),
      }),
    ]);

    expect(result[0]).toBe("cheap-but-sketchy");
  });
});
