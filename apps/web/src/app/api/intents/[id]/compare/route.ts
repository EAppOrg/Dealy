import { NextRequest, NextResponse } from "next/server";
import { RetrievalService } from "@dealy/domain";

/**
 * GET /api/intents/[id]/compare — Get comparison table data for an intent.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const comparison = await RetrievalService.getComparisonForIntent(params.id);
    return NextResponse.json({ comparison });
  } catch (error) {
    console.error("Failed to get comparison:", error);
    return NextResponse.json(
      { message: "Failed to get comparison" },
      { status: 500 }
    );
  }
}
