import { NextRequest, NextResponse } from "next/server";
import { RetrievalService } from "@dealy/domain";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * POST /api/intents/[id]/run — Trigger retrieval runs for this intent.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  try {
    const result = await RetrievalService.triggerForIntent(params.id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to trigger run:", error);
    return NextResponse.json(
      { message: "Failed to trigger retrieval run" },
      { status: 500 }
    );
  }
}
