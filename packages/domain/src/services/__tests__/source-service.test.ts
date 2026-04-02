import { describe, it, expect, beforeEach } from "vitest";
import { SourceService } from "../source-service";
import { cleanDatabase } from "../../__tests__/helpers";

describe("SourceService", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe("create", () => {
    it("creates a source with correct defaults", async () => {
      const source = await SourceService.create({
        name: "Amazon",
        slug: "amazon",
        type: "MARKETPLACE",
        baseUrl: "https://www.amazon.com",
      });

      expect(source.name).toBe("Amazon");
      expect(source.slug).toBe("amazon");
      expect(source.type).toBe("MARKETPLACE");
      expect(source.enabled).toBe(true);
    });
  });

  describe("list", () => {
    it("returns sources ordered by name with counts", async () => {
      await SourceService.create({
        name: "Newegg",
        slug: "newegg",
        type: "RETAILER",
      });
      await SourceService.create({
        name: "Amazon",
        slug: "amazon",
        type: "MARKETPLACE",
      });

      const sources = await SourceService.list();

      expect(sources).toHaveLength(2);
      expect(sources[0].name).toBe("Amazon"); // alphabetical
      expect(sources[1].name).toBe("Newegg");
      expect(sources[0]._count).toBeDefined();
      expect(sources[0]._count.retrievalRuns).toBe(0);
      expect(sources[0]._count.offers).toBe(0);
    });
  });

  describe("update", () => {
    it("disables a source", async () => {
      const source = await SourceService.create({
        name: "eBay",
        slug: "ebay",
        type: "MARKETPLACE",
      });

      const updated = await SourceService.update(source.id, {
        enabled: false,
      });

      expect(updated.enabled).toBe(false);
      expect(updated.name).toBe("eBay"); // unchanged
    });
  });

  describe("getEnabledSources", () => {
    it("returns only enabled sources", async () => {
      await SourceService.create({
        name: "Active",
        slug: "active",
        type: "RETAILER",
        enabled: true,
      });
      const disabled = await SourceService.create({
        name: "Disabled",
        slug: "disabled",
        type: "RETAILER",
      });
      await SourceService.update(disabled.id, { enabled: false });

      const enabled = await SourceService.getEnabledSources();

      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe("Active");
    });
  });
});
