import { NextRequest, NextResponse } from "next/server";
import { AlertService } from "@dealy/domain";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * POST /api/alerts/[id]/read — Mark an alert as read.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  try {
    const alert = await AlertService.markRead(params.id);
    return NextResponse.json({ alert });
  } catch (error) {
    console.error("Failed to mark alert as read:", error);
    return NextResponse.json(
      { message: "Failed to mark alert as read" },
      { status: 500 }
    );
  }
}
