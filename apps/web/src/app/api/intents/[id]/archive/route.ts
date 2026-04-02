import { NextRequest, NextResponse } from "next/server";
import { IntentService } from "@dealy/domain";

/**
 * POST /api/intents/[id]/archive — Archive an intent.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const intent = await IntentService.archive(params.id);
    return NextResponse.json({ intent });
  } catch (error) {
    console.error("Failed to archive intent:", error);
    return NextResponse.json(
      { message: "Failed to archive intent" },
      { status: 500 }
    );
  }
}
