import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@dealy/db";
import { pollOnce, sweepStaleRuns } from "../run-worker";
import { IntentService } from "../intent-service";
import {
  cleanDatabase,
  createTestWorkspace,
  createTestSource,
} from "../../__tests__/helpers";

// Mock global fetch to avoid real HTTP calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeDdgHtml(products: { title: string; price: string }[]) {
  return products
    .map(
      (p, i) =>
        `<div class="result">` +
        `<a class="result__a" href="https://example.com/product-${i}">${p.title}</a>` +
        `<a class="result__snippet">Great deal at ${p.price} — free shipping</a>` +
        `</div>`
    )
    .join("");
}

describe("run-worker", () => {
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
      title: "Worker test",
      query: "test query",
    });
    intentId = intent.id;

    const source = await createTestSource({
      name: "WorkerSource",
      slug: `worker-src-${Date.now()}`,
    });
    sourceId = source.id;
  });

  describe("pollOnce", () => {
    it("picks up PENDING run and transitions to COMPLETED", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () =>
          makeDdgHtml([{ title: "Test Product", price: "$99.00" }]),
      });

      // Create a PENDING run directly in DB (simulating trigger)
      const run = await prisma.retrievalRun.create({
        data: { intentId, sourceId, status: "PENDING" },
      });

      const { processed } = await pollOnce();
      expect(processed).toBe(1);

      // Verify run transitioned to COMPLETED
      const dbRun = await prisma.retrievalRun.findUnique({
        where: { id: run.id },
      });
      expect(dbRun!.status).toBe("COMPLETED");
      expect(dbRun!.startedAt).not.toBeNull();
      expect(dbRun!.completedAt).not.toBeNull();
      expect(dbRun!.itemsFound).toBe(1);
    });

    it("returns processed=0 when no PENDING runs exist", async () => {
      const { processed } = await pollOnce();
      expect(processed).toBe(0);
    });

    it("handles failed execution gracefully", async () => {
      mockFetch.mockRejectedValue(new Error("Network down"));

      const run = await prisma.retrievalRun.create({
        data: { intentId, sourceId, status: "PENDING" },
      });

      const { processed } = await pollOnce();
      expect(processed).toBe(1);

      const dbRun = await prisma.retrievalRun.findUnique({
        where: { id: run.id },
      });
      expect(dbRun!.status).toBe("FAILED");
      expect(dbRun!.errorMessage).toContain("Network down");
    });

    it("generates recommendation after all runs for intent complete", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        text: async () =>
          makeDdgHtml([{ title: "Rec Product", price: "$50.00" }]),
      });

      await prisma.retrievalRun.create({
        data: { intentId, sourceId, status: "PENDING" },
      });

      await pollOnce();

      // Check recommendation was generated
      const rec = await prisma.recommendationSnapshot.findFirst({
        where: { intentId },
      });
      expect(rec).not.toBeNull();
      expect(rec!.algorithm).toBe("baseline-v1");
    });
  });

  describe("sweepStaleRuns", () => {
    it("marks RUNNING runs older than timeout as FAILED", async () => {
      // Create a run that's been RUNNING for 10 minutes (stale)
      const staleRun = await prisma.retrievalRun.create({
        data: {
          intentId,
          sourceId,
          status: "RUNNING",
          startedAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      });

      const swept = await sweepStaleRuns();
      expect(swept).toBe(1);

      const dbRun = await prisma.retrievalRun.findUnique({
        where: { id: staleRun.id },
      });
      expect(dbRun!.status).toBe("FAILED");
      expect(dbRun!.errorMessage).toContain("process restart");
    });

    it("does not sweep recent RUNNING runs", async () => {
      await prisma.retrievalRun.create({
        data: {
          intentId,
          sourceId,
          status: "RUNNING",
          startedAt: new Date(), // just started
        },
      });

      const swept = await sweepStaleRuns();
      expect(swept).toBe(0);
    });

    it("does not sweep PENDING or COMPLETED runs", async () => {
      await prisma.retrievalRun.create({
        data: { intentId, sourceId, status: "PENDING" },
      });
      await prisma.retrievalRun.create({
        data: {
          intentId,
          sourceId,
          status: "COMPLETED",
          completedAt: new Date(),
        },
      });

      const swept = await sweepStaleRuns();
      expect(swept).toBe(0);
    });
  });

  describe("durability proof", () => {
    it("PENDING runs survive across poll cycles (DB-durable)", async () => {
      // Create PENDING run — this simulates what trigger does
      const run = await prisma.retrievalRun.create({
        data: { intentId, sourceId, status: "PENDING" },
      });

      // Verify it's in the DB regardless of any process state
      const dbRun = await prisma.retrievalRun.findUnique({
        where: { id: run.id },
      });
      expect(dbRun!.status).toBe("PENDING");

      // First poll with no fetch mock — will fail but run is claimed
      mockFetch.mockRejectedValue(new Error("Simulated crash"));
      await pollOnce();

      // Run is now FAILED (not lost)
      const afterCrash = await prisma.retrievalRun.findUnique({
        where: { id: run.id },
      });
      expect(afterCrash!.status).toBe("FAILED");
      expect(afterCrash!.errorMessage).not.toBeNull();
    });
  });
});
