import { prisma } from "@dealy/db";
import { afterAll } from "vitest";

afterAll(async () => {
  await prisma.$disconnect();
});
