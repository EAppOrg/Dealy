import { NextRequest, NextResponse } from "next/server";
import { AlertService } from "@dealy/domain";

/**
 * GET /api/alerts — List alerts for the current workspace.
 */
export async function GET(request: NextRequest) {
  const workspaceId =
    request.headers.get("x-workspace-id") ?? "stub-workspace-001";

  try {
    const alerts = await AlertService.listForWorkspace(workspaceId);
    const mapped = alerts.map((a) => ({
      id: a.id,
      intentId: a.intentId,
      intentTitle: a.intent.title,
      type: a.type,
      title: a.title,
      message: a.message,
      severity: a.severity,
      status: a.status,
      createdAt: a.createdAt,
      readAt: a.readAt,
    }));
    return NextResponse.json({ alerts: mapped });
  } catch (error) {
    console.error("Failed to list alerts:", error);
    return NextResponse.json(
      { message: "Failed to list alerts" },
      { status: 500 }
    );
  }
}
