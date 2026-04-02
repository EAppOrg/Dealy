import { NextRequest, NextResponse } from "next/server";
import { IntentService } from "@dealy/domain";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * GET /api/intents/[id] — Get intent detail with recent runs, recommendations, alerts.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  try {
    const intent = await IntentService.getById(params.id);
    if (!intent) {
      return NextResponse.json({ message: "Intent not found" }, { status: 404 });
    }
    return NextResponse.json({ intent });
  } catch (error) {
    console.error("Failed to get intent:", error);
    return NextResponse.json(
      { message: "Failed to get intent" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/intents/[id] — Update intent fields.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  try {
    const body = await request.json();
    const intent = await IntentService.update(params.id, body);
    return NextResponse.json({ intent });
  } catch (error) {
    console.error("Failed to update intent:", error);
    return NextResponse.json(
      { message: "Failed to update intent" },
      { status: 500 }
    );
  }
}
