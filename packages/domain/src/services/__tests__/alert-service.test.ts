import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@dealy/db";
import { AlertService } from "../alert-service";
import { IntentService } from "../intent-service";
import { cleanDatabase, createTestWorkspace } from "../../__tests__/helpers";

describe("AlertService", () => {
  let workspaceId: string;
  let intentId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const { workspace } = await createTestWorkspace();
    workspaceId = workspace.id;

    const intent = await IntentService.create({
      workspaceId,
      title: "Alert test intent",
      query: "test",
    });
    intentId = intent.id;
  });

  describe("create", () => {
    it("creates an alert with correct defaults", async () => {
      const alert = await AlertService.create({
        intentId,
        type: "PRICE_DROP",
        title: "Price dropped!",
        message: "Down to $99",
      });

      expect(alert.type).toBe("PRICE_DROP");
      expect(alert.title).toBe("Price dropped!");
      expect(alert.message).toBe("Down to $99");
      expect(alert.severity).toBe("INFO");
      expect(alert.status).toBe("UNREAD");
    });

    it("creates an alert with custom severity", async () => {
      const alert = await AlertService.create({
        intentId,
        type: "PRICE_THRESHOLD",
        title: "Budget exceeded",
        severity: "CRITICAL",
      });

      expect(alert.severity).toBe("CRITICAL");
    });
  });

  describe("markRead", () => {
    it("sets status to READ and records readAt", async () => {
      const alert = await AlertService.create({
        intentId,
        type: "NEW_OFFER",
        title: "New offer found",
      });

      const read = await AlertService.markRead(alert.id);

      expect(read.status).toBe("READ");
      expect(read.readAt).not.toBeNull();
    });
  });

  describe("dismiss", () => {
    it("sets status to DISMISSED", async () => {
      const alert = await AlertService.create({
        intentId,
        type: "NEW_OFFER",
        title: "Dismiss me",
      });

      const dismissed = await AlertService.dismiss(alert.id);
      expect(dismissed.status).toBe("DISMISSED");
    });
  });

  describe("listForWorkspace", () => {
    it("returns alerts for the workspace with intent title", async () => {
      await AlertService.create({
        intentId,
        type: "PRICE_DROP",
        title: "Alert A",
      });
      await AlertService.create({
        intentId,
        type: "NEW_OFFER",
        title: "Alert B",
      });

      const alerts = await AlertService.listForWorkspace(workspaceId);

      expect(alerts).toHaveLength(2);
      expect(alerts[0].intent.title).toBe("Alert test intent");
    });

    it("returns empty for workspace with no alerts", async () => {
      const alerts = await AlertService.listForWorkspace(workspaceId);
      expect(alerts).toHaveLength(0);
    });
  });

  describe("unreadCount", () => {
    it("counts only UNREAD alerts", async () => {
      const a1 = await AlertService.create({
        intentId,
        type: "PRICE_DROP",
        title: "Unread 1",
      });
      await AlertService.create({
        intentId,
        type: "PRICE_DROP",
        title: "Unread 2",
      });
      await AlertService.markRead(a1.id);

      const count = await AlertService.unreadCount(workspaceId);
      expect(count).toBe(1);
    });
  });
});
