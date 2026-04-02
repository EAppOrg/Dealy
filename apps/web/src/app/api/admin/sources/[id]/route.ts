import { NextRequest, NextResponse } from "next/server";
import { SourceService } from "@dealy/domain";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * PATCH /api/admin/sources/[id] — Update a source. Requires ADMIN role.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();
  if (ctx.role !== "ADMIN") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const source = await SourceService.update(params.id, body);
    return NextResponse.json({ source });
  } catch (error) {
    console.error("Failed to update source:", error);
    return NextResponse.json(
      { message: "Failed to update source" },
      { status: 500 }
    );
  }
}
