import { NextRequest, NextResponse } from "next/server";
import { RetrievalService } from "@dealy/domain";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * GET /api/admin/runs/[id] — Get a specific retrieval run detail. Requires ADMIN role.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();
  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const run = await RetrievalService.getRunById(params.id);
    if (!run) {
      return NextResponse.json({ message: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ run });
  } catch (error) {
    console.error("Failed to get run:", error);
    return NextResponse.json(
      { message: "Failed to get run" },
      { status: 500 }
    );
  }
}
