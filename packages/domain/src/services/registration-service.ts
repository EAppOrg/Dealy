import { prisma } from "@dealy/db";
import bcrypt from "bcryptjs";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface RegisterResult {
  success: boolean;
  userId?: string;
  workspaceId?: string;
  error?: string;
}

/**
 * Register a new user with automatic workspace bootstrap.
 *
 * Creates user, workspace, and membership in a single Prisma transaction.
 * The user becomes the OWNER of their first workspace.
 */
export async function registerUser(
  input: RegisterInput
): Promise<RegisterResult> {
  const { name, email, password } = input;

  // Validate
  if (!name || name.trim().length < 1) {
    return { success: false, error: "Name is required" };
  }
  if (!email || !email.includes("@")) {
    return { success: false, error: "Valid email is required" };
  }
  if (!password || password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters" };
  }

  // Check duplicate
  const existing = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });
  if (existing) {
    return { success: false, error: "An account with this email already exists" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + `-${Date.now().toString(36)}`;

  // Atomic transaction: user + workspace + membership
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: email.toLowerCase().trim(),
        name: name.trim(),
        passwordHash,
        role: "MEMBER",
      },
    });

    const workspace = await tx.workspace.create({
      data: {
        name: `${name.trim()}'s Workspace`,
        slug,
      },
    });

    await tx.workspaceMember.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: "OWNER",
      },
    });

    return { userId: user.id, workspaceId: workspace.id };
  });

  return {
    success: true,
    userId: result.userId,
    workspaceId: result.workspaceId,
  };
}
