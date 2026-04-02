import { NextRequest, NextResponse } from "next/server";
import { AlertService } from "@dealy/domain";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * POST /api/alerts/[id]/dismiss — Dismiss an alert.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

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
