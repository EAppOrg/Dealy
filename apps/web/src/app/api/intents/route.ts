import { NextRequest, NextResponse } from "next/server";
import { IntentService } from "@dealy/domain";

/**
 * GET /api/intents — List intents for the current workspace.
 */
export async function GET(request: NextRequest) {
  const workspaceId =
    request.headers.get("x-workspace-id") ?? "stub-workspace-001";

  try {
    const intents = await IntentService.list(workspaceId);
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
  const workspaceId =
    request.headers.get("x-workspace-id") ?? "stub-workspace-001";

  try {
    const body = await request.json();
    const { title, description, query, priority, budgetMin, budgetMax, currency, monitorEnabled, monitorInterval } = body;

    if (!title || !query) {
      return NextResponse.json(
        { message: "title and query are required" },
        { status: 400 }
      );
    }

    const intent = await IntentService.create({
      workspaceId,
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
