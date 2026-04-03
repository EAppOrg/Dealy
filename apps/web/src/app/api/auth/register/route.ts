import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@dealy/domain";

/**
 * POST /api/auth/register — Create a new user account with workspace.
 * Public route — no auth required.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    const result = await registerUser({ name, email, password });

    if (!result.success) {
      return NextResponse.json(
        { message: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        message: "Account created successfully",
        userId: result.userId,
        workspaceId: result.workspaceId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration failed:", error);
    return NextResponse.json(
      { message: "Registration failed" },
      { status: 500 }
    );
  }
}
