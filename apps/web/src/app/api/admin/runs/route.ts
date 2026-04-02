import { NextRequest, NextResponse } from "next/server";
import { RetrievalService } from "@dealy/domain";

/**
 * GET /api/admin/runs — List retrieval runs with optional filters.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const intentId = searchParams.get("intentId") ?? undefined;
  const sourceId = searchParams.get("sourceId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  try {
    const runs = await RetrievalService.listRuns({ intentId, sourceId, status });
    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Failed to list runs:", error);
    return NextResponse.json(
      { message: "Failed to list runs" },
      { status: 500 }
    );
  }
}
