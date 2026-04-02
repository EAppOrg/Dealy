import { NextRequest, NextResponse } from "next/server";
import { IntentService } from "@dealy/domain";

/**
 * PATCH /api/intents/[id]/status — Change intent status.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json(
        { message: "status is required" },
        { status: 400 }
      );
    }

    const intent = await IntentService.changeStatus(params.id, status);
    return NextResponse.json({ intent });
  } catch (error) {
    console.error("Failed to change intent status:", error);
    return NextResponse.json(
      { message: "Failed to change status" },
      { status: 500 }
    );
  }
}
