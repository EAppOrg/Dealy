import { NextRequest, NextResponse } from "next/server";
import { IntentService } from "@dealy/domain";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * GET /api/intents — List intents for the current workspace.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  try {
    const intents = await IntentService.list(ctx.workspaceId);
    return NextResponse.json({ intents });
  } catch (error) {
    console.error("Failed to list intents:", error);
    return NextResponse.json(
      { message: "Failed to list intents" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/intents — Create a new shopping intent.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  try {
    const body = await request.json();
    const {
      title,
      description,
      query,
      priority,
      budgetMin,
      budgetMax,
      currency,
      monitorEnabled,
      monitorInterval,
    } = body;

    if (!title || !query) {
      return NextResponse.json(
        { message: "title and query are required" },
        { status: 400 }
      );
    }

    const intent = await IntentService.create({
      workspaceId: ctx.workspaceId,
      title,
      description,
      query,
      priority,
      budgetMin,
      budgetMax,
      currency,
      monitorEnabled,
      monitorInterval,
    });

    return NextResponse.json({ intent }, { status: 201 });
  } catch (error) {
    console.error("Failed to create intent:", error);
    return NextResponse.json(
      { message: "Failed to create intent" },
      { status: 500 }
    );
  }
}
