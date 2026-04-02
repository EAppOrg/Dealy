import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@dealy/db";
import { IntentService } from "../intent-service";
import { cleanDatabase, createTestWorkspace } from "../../__tests__/helpers";

describe("IntentService", () => {
  let workspaceId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const { workspace } = await createTestWorkspace();
    workspaceId = workspace.id;
  });

  describe("create", () => {
    it("creates an intent with required fields and correct defaults", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Buy a monitor",
        query: "4K monitor 27 inch",
      });

      expect(intent.title).toBe("Buy a monitor");
      expect(intent.query).toBe("4K monitor 27 inch");
      expect(intent.status).toBe("ACTIVE");
      expect(intent.priority).toBe("MEDIUM");
      expect(intent.currency).toBe("USD");
      expect(intent.monitorEnabled).toBe(false);
      expect(intent.workspaceId).toBe(workspaceId);
    });

    it("creates an intent with all optional fields", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Gaming chair",
        query: "ergonomic gaming chair",
        priority: "HIGH",
        budgetMin: 200,
        budgetMax: 500,
        currency: "EUR",
        monitorEnabled: true,
        monitorInterval: 120,
      });

      expect(intent.priority).toBe("HIGH");
      expect(intent.budgetMin).toBe(200);
      expect(intent.budgetMax).toBe(500);
      expect(intent.currency).toBe("EUR");
      expect(intent.monitorEnabled).toBe(true);
      expect(intent.monitorInterval).toBe(120);
    });
  });

  describe("list", () => {
    it("returns non-archived intents for a workspace", async () => {
      await IntentService.create({
        workspaceId,
        title: "Active one",
        query: "q1",
      });
      const archived = await IntentService.create({
        workspaceId,
        title: "Archived one",
        query: "q2",
      });
      await IntentService.archive(archived.id);

      const intents = await IntentService.list(workspaceId);

      expect(intents).toHaveLength(1);
      expect(intents[0].title).toBe("Active one");
    });

    it("returns empty list for workspace with no intents", async () => {
      const intents = await IntentService.list(workspaceId);
      expect(intents).toHaveLength(0);
    });
  });

  describe("getById", () => {
    it("returns intent with related runs, recommendations, and alerts", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Detail test",
        query: "q",
      });

      const result = await IntentService.getById(intent.id);

      expect(result).not.toBeNull();
      expect(result!.title).toBe("Detail test");
      expect(result!.retrievalRuns).toBeDefined();
      expect(result!.recommendations).toBeDefined();
      expect(result!.alertEvents).toBeDefined();
    });

    it("returns null for non-existent ID", async () => {
      const result = await IntentService.getById("nonexistent-id");
      expect(result).toBeNull();
    });
  });

  describe("archive", () => {
    it("sets status to ARCHIVED and archivedAt timestamp", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "To archive",
        query: "q",
      });

      const archived = await IntentService.archive(intent.id);

      expect(archived.status).toBe("ARCHIVED");
      expect(archived.archivedAt).not.toBeNull();
    });
  });

  describe("changeStatus", () => {
    it("changes intent status", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Status test",
        query: "q",
      });

      const paused = await IntentService.changeStatus(intent.id, "PAUSED");
      expect(paused.status).toBe("PAUSED");
    });

    it("enables monitoring when status changes to MONITORING", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Monitor test",
        query: "q",
      });

      const monitoring = await IntentService.changeStatus(
        intent.id,
        "MONITORING"
      );
      expect(monitoring.status).toBe("MONITORING");
      expect(monitoring.monitorEnabled).toBe(true);
    });
  });

  describe("update", () => {
    it("updates specified fields only", async () => {
      const intent = await IntentService.create({
        workspaceId,
        title: "Original",
        query: "original query",
      });

      const updated = await IntentService.update(intent.id, {
        title: "Updated",
        budgetMax: 999,
      });

      expect(updated.title).toBe("Updated");
      expect(updated.query).toBe("original query"); // unchanged
      expect(updated.budgetMax).toBe(999);
    });
  });
});
