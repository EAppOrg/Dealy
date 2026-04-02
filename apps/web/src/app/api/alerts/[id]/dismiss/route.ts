import { NextRequest, NextResponse } from "next/server";
import { AlertService } from "@dealy/domain";

/**
 * POST /api/alerts/[id]/dismiss — Dismiss an alert.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const alert = await AlertService.dismiss(params.id);
    return NextResponse.json({ alert });
  } catch (error) {
    console.error("Failed to dismiss alert:", error);
    return NextResponse.json(
      { message: "Failed to dismiss alert" },
      { status: 500 }
    );
  }
}
