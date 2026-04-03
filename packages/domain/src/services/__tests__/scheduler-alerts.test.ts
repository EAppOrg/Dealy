import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@dealy/db";
import { checkDueIntents } from "../run-worker";
import { generateAlertsForRun } from "../alert-generator";
import { IntentService } from "../intent-service";
import {
  cleanDatabase,
  createTestWorkspace,
  createTestSource,
  createTestOffer,
} from "../../__tests__/helpers";

// Mock fetch for run-executor (imported transitively by worker)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("checkDueIntents (scheduler)", () => {
  let workspaceId: string;
  let sourceId: string;

  beforeEach(async () => {
    await cleanDatabase();
    mockFetch.mockReset();
    const { workspace } = await createTestWorkspace();
    workspaceId = workspace.id;
    const source = await createTestSource({
      name: "SchedSrc",
      slug: `sched-src-${Date.now()}`,
    });
    sourceId = source.id;
  });

  it("enqueues runs for a due monitor-enabled intent", async () => {
    const intent = await IntentService.create({
      workspaceId,
      title: "Monitored",
      query: "test",
      monitorEnabled: true,
      monitorInterval: 1, // 1 minute
    });
    // Set lastMonitoredAt to 2 minutes ago (overdue)
    await prisma.shoppingIntent.update({
      where: { id: intent.id },
      data: { lastMonitoredAt: new Date(Date.now() - 2 * 60 * 1000) },
    });

    const enqueued = await checkDueIntents();
    expect(enqueued).toBe(1);

    // Verify PENDING runs were created
    const runs = await prisma.retrievalRun.findMany({
      where: { intentId: intent.id, status: "PENDING" },
    });
    expect(runs.length).toBeGreaterThan(0);
  });

  it("does not enqueue for intent that is not yet due", async () => {
    const intent = await IntentService.create({
      workspaceId,
      title: "Not due",
      query: "test",
      monitorEnabled: true,
      monitorInterval: 60, // 1 hour
    });
    await prisma.shoppingIntent.update({
      where: { id: intent.id },
      data: { lastMonitoredAt: new Date() }, // just monitored
    });

    const enqueued = await checkDueIntents();
    expect(enqueued).toBe(0);
  });

  it("does not enqueue for non-monitored intents", async () => {
    await IntentService.create({
      workspaceId,
      title: "No monitor",
      query: "test",
      monitorEnabled: false,
    });

    const enqueued = await checkDueIntents();
    expect(enqueued).toBe(0);
  });

  it("does not double-enqueue when PENDING runs already exist", async () => {
    const intent = await IntentService.create({
      workspaceId,
      title: "Has pending",
      query: "test",
      monitorEnabled: true,
      monitorInterval: 1,
    });
    await prisma.shoppingIntent.update({
      where: { id: intent.id },
      data: { lastMonitoredAt: new Date(Date.now() - 5 * 60 * 1000) },
    });

    // Create an existing PENDING run
    await prisma.retrievalRun.create({
      data: { intentId: intent.id, sourceId, status: "PENDING" },
    });

    const enqueued = await checkDueIntents();
    expect(enqueued).toBe(0);
  });

  it("enqueues for intent with null lastMonitoredAt (never monitored)", async () => {
    await IntentService.create({
      workspaceId,
      title: "Never monitored",
      query: "test",
      monitorEnabled: true,
      monitorInterval: 60,
    });

    const enqueued = await checkDueIntents();
    expect(enqueued).toBe(1);
  });
});

describe("generateAlertsForRun (alert generation)", () => {
  let workspaceId: string;
  let intentId: string;
  let sourceId: string;

  beforeEach(async () => {
    await cleanDatabase();
    const { workspace } = await createTestWorkspace();
    workspaceId = workspace.id;
    const intent = await IntentService.create({
      workspaceId,
      title: "Alert test",
      query: "test",
    });
    intentId = intent.id;
    const source = await createTestSource({
      name: "AlertSrc",
      slug: `alert-src-${Date.now()}`,
    });
    sourceId = source.id;
  });

  it("generates RUN_FAILED alert for failed run", async () => {
    const run = await prisma.retrievalRun.create({
      data: {
        intentId,
        sourceId,
        status: "FAILED",
        errorMessage: "HTTP 429 rate limited",
        completedAt: new Date(),
      },
    });

    const count = await generateAlertsForRun(run.id);
    expect(count).toBe(1);

    const alerts = await prisma.alertEvent.findMany({
      where: { intentId, type: "RUN_FAILED" },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toContain("AlertSrc");
    expect(alerts[0].severity).toBe("WARNING");
  });

  it("generates NEW_OFFER alert for first completed run with offers", async () => {
    const startedAt = new Date();
    const run = await prisma.retrievalRun.create({
      data: {
        intentId,
        sourceId,
        status: "COMPLETED",
        itemsFound: 1,
        startedAt,
        completedAt: new Date(),
      },
    });

    // Create an offer from this run
    const { offer } = await createTestOffer({
      sourceId,
      price: 99.99,
    });
    // Set timestamps to after run started
    await prisma.offer.update({
      where: { id: offer.id },
      data: { createdAt: new Date(), lastSeenAt: new Date() },
    });
    // Associate offer with run
    await prisma.runOffer.create({
      data: { runId: run.id, offerId: offer.id },
    });

    const count = await generateAlertsForRun(run.id);
    expect(count).toBe(1);

    const alerts = await prisma.alertEvent.findMany({
      where: { intentId, type: "NEW_OFFER" },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toContain("AlertSrc");
    expect(alerts[0].message).toContain("$99.99");
  });

  it("generates PRICE_DROP alert when new price is lower than previous", async () => {
    const oldTime = new Date(Date.now() - 60000);
    const newTime = new Date();

    // Previous completed run + old offer
    const oldRun = await prisma.retrievalRun.create({
      data: {
        intentId,
        sourceId,
        status: "COMPLETED",
        itemsFound: 1,
        startedAt: new Date(oldTime.getTime() - 1000),
        completedAt: oldTime,
      },
    });
    const { offer: oldOffer } = await createTestOffer({
      sourceId,
      price: 200.0,
    });
    await prisma.offer.update({
      where: { id: oldOffer.id },
      data: { createdAt: new Date(oldTime.getTime() - 500) },
    });
    await prisma.priceObservation.create({
      data: {
        offerId: oldOffer.id,
        price: 200.0,
        observedAt: new Date(oldTime.getTime() - 500),
      },
    });
    await prisma.runOffer.create({
      data: { runId: oldRun.id, offerId: oldOffer.id },
    });

    // New run + cheaper offer
    const run = await prisma.retrievalRun.create({
      data: {
        intentId,
        sourceId,
        status: "COMPLETED",
        itemsFound: 1,
        startedAt: newTime,
        completedAt: new Date(),
      },
    });
    const { offer: newOffer } = await createTestOffer({
      sourceId,
      price: 150.0,
    });
    await prisma.offer.update({
      where: { id: newOffer.id },
      data: { createdAt: newTime, lastSeenAt: newTime },
    });
    await prisma.runOffer.create({
      data: { runId: run.id, offerId: newOffer.id },
    });

    const count = await generateAlertsForRun(run.id);
    expect(count).toBe(1);

    const alerts = await prisma.alertEvent.findMany({
      where: { intentId, type: "PRICE_DROP" },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toContain("25%");
    expect(alerts[0].message).toContain("$200.00");
    expect(alerts[0].message).toContain("$150.00");
  });

  it("returns 0 for completed run with no items", async () => {
    const run = await prisma.retrievalRun.create({
      data: {
        intentId,
        sourceId,
        status: "COMPLETED",
        itemsFound: 0,
        completedAt: new Date(),
      },
    });

    const count = await generateAlertsForRun(run.id);
    expect(count).toBe(0);
  });
});
