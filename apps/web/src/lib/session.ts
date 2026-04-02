import { NextResponse } from "next/server";
import { auth } from "./auth";
import { prisma } from "@dealy/db";

export interface AuthContext {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  workspaceId: string;
  workspaceName: string;
}

/**
 * Get the authenticated user's context including their workspace.
 * Returns null if not authenticated or no workspace membership.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const member = await prisma.workspaceMember.findFirst({
    where: { userId: session.user.id },
    include: {
      workspace: true,
      user: { select: { name: true, email: true, role: true } },
    },
    orderBy: { joinedAt: "asc" },
  });

  if (!member) return null;

  return {
    userId: session.user.id,
    email: member.user.email,
    name: member.user.name,
    role: member.user.role,
    workspaceId: member.workspace.id,
    workspaceName: member.workspace.name,
  };
}

/**
 * Return a 401 JSON response for unauthenticated API requests.
 */
export function unauthorizedResponse() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}
