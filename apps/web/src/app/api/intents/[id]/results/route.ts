import { NextRequest, NextResponse } from "next/server";
import { RetrievalService, RecommendationService } from "@dealy/domain";

/**
 * GET /api/intents/[id]/results — Get offers and latest recommendation for an intent.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [offers, recommendation] = await Promise.all([
      RetrievalService.getOffersForIntent(params.id),
      RecommendationService.getLatestForIntent(params.id),
    ]);

    return NextResponse.json({ offers, recommendation });
  } catch (error) {
    console.error("Failed to get intent results:", error);
    return NextResponse.json(
      { message: "Failed to get results" },
      { status: 500 }
    );
  }
}
