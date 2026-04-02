import { NextResponse } from "next/server";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * GET /api/auth/me — Returns the current authenticated user context.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  return NextResponse.json({
    id: ctx.userId,
    email: ctx.email,
    name: ctx.name,
    role: ctx.role,
    workspaceId: ctx.workspaceId,
    workspaceName: ctx.workspaceName,
  });
}
