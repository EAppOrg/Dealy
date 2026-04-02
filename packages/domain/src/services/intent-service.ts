import { prisma } from "@dealy/db";
import type { CreateIntentInput, UpdateIntentInput } from "../types/intent";
import type { IntentStatus } from "@dealy/db";

export const IntentService = {
  async list(workspaceId: string) {
    return prisma.shoppingIntent.findMany({
      where: { workspaceId, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
    });
  },

  async getById(id: string) {
    return prisma.shoppingIntent.findUnique({
      where: { id },
      include: {
        retrievalRuns: { orderBy: { createdAt: "desc" }, take: 10 },
        recommendations: { orderBy: { createdAt: "desc" }, take: 1 },
        alertEvents: {
          where: { status: "UNREAD" },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
    });
  },

  async create(input: CreateIntentInput) {
    return prisma.shoppingIntent.create({
      data: {
        workspaceId: input.workspaceId,
        title: input.title,
        description: input.description,
        query: input.query,
        priority: input.priority ?? "MEDIUM",
        budgetMin: input.budgetMin,
        budgetMax: input.budgetMax,
        currency: input.currency ?? "USD",
        monitorEnabled: input.monitorEnabled ?? false,
        monitorInterval: input.monitorInterval,
        status: "ACTIVE",
      },
    });
  },

  async update(id: string, input: UpdateIntentInput) {
    return prisma.shoppingIntent.update({
      where: { id },
      data: input,
    });
  },

  async archive(id: string) {
    return prisma.shoppingIntent.update({
      where: { id },
      data: { status: "ARCHIVED", archivedAt: new Date() },
    });
  },

  async changeStatus(id: string, status: IntentStatus) {
    const data: Record<string, unknown> = { status };
    if (status === "ARCHIVED") {
      data.archivedAt = new Date();
    }
    if (status === "MONITORING") {
      data.monitorEnabled = true;
    }
    return prisma.shoppingIntent.update({ where: { id }, data });
  },
};
