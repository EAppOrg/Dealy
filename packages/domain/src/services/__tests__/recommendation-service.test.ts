import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@dealy/db";
import { RecommendationService } from "../recommendation-service";
import { IntentService } from "../intent-service";
import {
  cleanDatabase,
  createTestWorkspace,
  createTestSource,
  createTestOffer,
} from "../../__tests__/helpers";

describe("RecommendationService", () => {
  let workspaceId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const { workspace } = await createTestWorkspace();
    workspaceId = workspace.id;
  });

  describe("generateForIntent", () => {
    it("returns null when intent has no completed runs", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "No runs",
        query: "q",
      });

      const result = await RecommendationService.generateForIntent(intent.id);
      expect(result).toBeNull();
    });

    it("generates a ranked snapshot from available offers", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Has offers",
        query: "q",
      });

      const source = await createTestSource();

      // Create a completed retrieval run linking intent → source
      await prisma.retrievalRun.create({
        data: {
          intentId: intent.id,
          sourceId: source.id,
          status: "COMPLETED",
          itemsFound: 3,
        },
      });

      // Create 3 offers with different prices from this source
      const { offer: cheap } = await createTestOffer({
        sourceId: source.id,
        price: 100,
        shippingCost: 5,
        trustScore: 0.9,
      });
      const { offer: mid } = await createTestOffer({
        sourceId: source.id,
        price: 200,
        shippingCost: 0,
        trustScore: 0.8,
      });
      const { offer: expensive } = await createTestOffer({
        sourceId: source.id,
        price: 500,
        shippingCost: 0,
        trustScore: 0.95,
      });

      const result = await RecommendationService.generateForIntent(intent.id);

      expect(result).not.toBeNull();
      expect(result!.algorithm).toBe("baseline-v1");
      expect(result!.version).toBe(1);
      expect(result!.rankedOfferIds).toHaveLength(3);
      // Cheapest should be ranked first (100+5=105 < 200 < 500)
      expect(result!.rankedOfferIds[0]).toBe(cheap.id);
      expect(result!.confidence).toBe(0.6); // 3 offers → moderate confidence
      expect(result!.explanation).toContain("3 offer(s)");
      expect(result!.explanation).toContain("baseline-v1");
    });

    it("increments version on subsequent snapshots", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Versioned",
        query: "q",
      });

      const source = await createTestSource();

      await prisma.retrievalRun.create({
        data: {
          intentId: intent.id,
          sourceId: source.id,
          status: "COMPLETED",
          itemsFound: 1,
        },
      });

      await createTestOffer({ sourceId: source.id, price: 100 });

      const v1 = await RecommendationService.generateForIntent(intent.id);
      const v2 = await RecommendationService.generateForIntent(intent.id);

      expect(v1!.version).toBe(1);
      expect(v2!.version).toBe(2);
    });

    it("reports low confidence with fewer than 3 offers", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Low confidence",
        query: "q",
      });

      const source = await createTestSource();

      await prisma.retrievalRun.create({
        data: {
          intentId: intent.id,
          sourceId: source.id,
          status: "COMPLETED",
          itemsFound: 1,
        },
      });

      await createTestOffer({ sourceId: source.id, price: 100 });

      const result = await RecommendationService.generateForIntent(intent.id);

      expect(result!.confidence).toBe(0.3); // <3 offers → low
      expect(result!.explanation).toContain("low");
      expect(result!.explanation).toContain("limited offer data");
    });
  });

  describe("getLatestForIntent", () => {
    it("returns null when no snapshots exist", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "No snapshot",
        query: "q",
      });

      const result = await RecommendationService.getLatestForIntent(intent.id);
      expect(result).toBeNull();
    });

    it("returns the most recent snapshot", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Has snapshots",
        query: "q",
      });

      const older = new Date(Date.now() - 60000);
      const newer = new Date();
      await prisma.recommendationSnapshot.create({
        data: {
          intentId: intent.id,
          version: 1,
          rankedOfferIds: ["a", "b"],
          algorithm: "baseline-v1",
          createdAt: older,
        },
      });
      await prisma.recommendationSnapshot.create({
        data: {
          intentId: intent.id,
          version: 2,
          rankedOfferIds: ["b", "a"],
          algorithm: "baseline-v1",
          createdAt: newer,
        },
      });

      const result = await RecommendationService.getLatestForIntent(intent.id);

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
      expect(result!.rankedOfferIds).toEqual(["b", "a"]);
    });
  });
});
