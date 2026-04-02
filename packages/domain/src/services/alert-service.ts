import { prisma, type Prisma } from "@dealy/db";
import type { CreateAlertInput } from "../types/alert";

export const AlertService = {
  async listForWorkspace(workspaceId: string) {
    return prisma.alertEvent.findMany({
      where: {
        intent: { workspaceId },
      },
      include: {
        intent: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  },

  async create(input: CreateAlertInput) {
    return prisma.alertEvent.create({
      data: {
        intentId: input.intentId,
        type: input.type,
        title: input.title,
        message: input.message,
        severity: input.severity ?? "INFO",
        metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  },

  async markRead(id: string) {
    return prisma.alertEvent.update({
      where: { id },
      data: { status: "READ", readAt: new Date() },
    });
  },

  async dismiss(id: string) {
    return prisma.alertEvent.update({
      where: { id },
      data: { status: "DISMISSED" },
    });
  },

  async unreadCount(workspaceId: string) {
    return prisma.alertEvent.count({
      where: {
        intent: { workspaceId },
        status: "UNREAD",
      },
    });
  },
};
