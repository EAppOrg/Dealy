import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@dealy/db";
import { registerUser } from "../registration-service";
import { cleanDatabase } from "../../__tests__/helpers";

describe("registerUser", () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  it("creates user, workspace, and membership atomically", async () => {
    const result = await registerUser({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "secret123",
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBeDefined();
    expect(result.workspaceId).toBeDefined();

    // Verify user
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
    });
    expect(user).not.toBeNull();
    expect(user!.email).toBe("jane@example.com");
    expect(user!.name).toBe("Jane Doe");
    expect(user!.passwordHash).not.toBeNull();
    expect(user!.role).toBe("MEMBER");

    // Verify workspace
    const workspace = await prisma.workspace.findUnique({
      where: { id: result.workspaceId },
    });
    expect(workspace).not.toBeNull();
    expect(workspace!.name).toBe("Jane Doe's Workspace");

    // Verify membership
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: result.userId, workspaceId: result.workspaceId },
    });
    expect(member).not.toBeNull();
    expect(member!.role).toBe("OWNER");
  });

  it("normalizes email to lowercase", async () => {
    const result = await registerUser({
      name: "Test",
      email: "TEST@Example.COM",
      password: "secret123",
    });

    expect(result.success).toBe(true);
    const user = await prisma.user.findUnique({
      where: { id: result.userId },
    });
    expect(user!.email).toBe("test@example.com");
  });

  it("rejects duplicate email", async () => {
    await registerUser({
      name: "First",
      email: "dup@example.com",
      password: "secret123",
    });

    const result = await registerUser({
      name: "Second",
      email: "dup@example.com",
      password: "secret456",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });

  it("rejects empty name", async () => {
    const result = await registerUser({
      name: "",
      email: "a@b.com",
      password: "secret123",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Name");
  });

  it("rejects short password", async () => {
    const result = await registerUser({
      name: "Test",
      email: "a@b.com",
      password: "12345",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("6 characters");
  });

  it("rejects invalid email", async () => {
    const result = await registerUser({
      name: "Test",
      email: "notanemail",
      password: "secret123",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("email");
  });
});
