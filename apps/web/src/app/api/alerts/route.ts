import { NextResponse } from "next/server";
import { AlertService } from "@dealy/domain";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * GET /api/alerts — List alerts for the current workspace.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  try {
    const alerts = await AlertService.listForWorkspace(ctx.workspaceId);
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
