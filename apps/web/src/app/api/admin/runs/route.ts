import { NextRequest, NextResponse } from "next/server";
import { RetrievalService } from "@dealy/domain";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * GET /api/admin/runs — List retrieval runs with optional filters. Requires ADMIN role.
 */
export async function GET(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();
  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const intentId = searchParams.get("intentId") ?? undefined;
  const sourceId = searchParams.get("sourceId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  try {
    const runs = await RetrievalService.listRuns({
      intentId,
      sourceId,
      status,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Failed to list runs:", error);
    return NextResponse.json(
      { message: "Failed to list runs" },
      { status: 500 }
    );
  }
}
