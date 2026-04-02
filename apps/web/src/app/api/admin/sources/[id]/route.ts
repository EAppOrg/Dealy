import { NextRequest, NextResponse } from "next/server";
import { SourceService } from "@dealy/domain";

/**
 * PATCH /api/admin/sources/[id] — Update a source.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
