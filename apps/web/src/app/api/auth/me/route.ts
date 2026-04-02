import { NextResponse } from "next/server";

/**
 * GET /api/auth/me
 *
 * Returns the current user context. In this MVP foundation, returns a
 * stub user. Real auth provider integration is deferred to a future batch.
 */
export async function GET() {
  // STUB: Real auth is not yet wired. This returns a placeholder user
  // so pages can render without auth infrastructure. Replace with real
  // session lookup when auth is implemented.
  const stubUser = {
    id: "stub-user-001",
    email: "user@dealy.app",
    name: "Dealy User",
    role: "ADMIN",
    workspaceId: "stub-workspace-001",
    workspaceName: "Default Workspace",
  };

  return NextResponse.json(stubUser);
}
