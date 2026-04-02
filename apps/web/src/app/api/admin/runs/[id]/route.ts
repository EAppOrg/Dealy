import { NextRequest, NextResponse } from "next/server";
import { RetrievalService } from "@dealy/domain";

/**
 * GET /api/admin/runs/[id] — Get a specific retrieval run detail.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
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
