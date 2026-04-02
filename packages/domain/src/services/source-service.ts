import { prisma, type Prisma } from "@dealy/db";
import type { SourceType } from "@dealy/db";

export interface CreateSourceInput {
  name: string;
  slug: string;
  type: SourceType;
  baseUrl?: string;
  enabled?: boolean;
  config?: Prisma.InputJsonValue;
}

export interface UpdateSourceInput {
  name?: string;
  type?: SourceType;
  baseUrl?: string | null;
  enabled?: boolean;
  config?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
}

export const SourceService = {
  async list() {
    return prisma.source.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { retrievalRuns: true, offers: true } },
      },
    });
  },

  async getById(id: string) {
    return prisma.source.findUnique({
      where: { id },
      include: {
        _count: { select: { retrievalRuns: true, offers: true } },
      },
    });
  },

  async create(input: CreateSourceInput) {
    return prisma.source.create({
      data: {
        name: input.name,
        slug: input.slug,
        type: input.type,
        baseUrl: input.baseUrl,
        enabled: input.enabled ?? true,
        config: input.config,
      },
    });
  },

  async update(id: string, input: UpdateSourceInput) {
    return prisma.source.update({
      where: { id },
      data: input,
    });
  },

  async getEnabledSources() {
    return prisma.source.findMany({
      where: { enabled: true },
      orderBy: { name: "asc" },
    });
  },
};
