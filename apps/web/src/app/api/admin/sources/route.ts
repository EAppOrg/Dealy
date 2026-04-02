import { NextRequest, NextResponse } from "next/server";
import { SourceService } from "@dealy/domain";

/**
 * GET /api/admin/sources — List all sources with counts.
 */
export async function GET() {
  try {
    const sources = await SourceService.list();
    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Failed to list sources:", error);
    return NextResponse.json(
      { message: "Failed to list sources" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/sources — Create a new source.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, slug, type, baseUrl, enabled, config } = body;

    if (!name || !slug || !type) {
      return NextResponse.json(
        { message: "name, slug, and type are required" },
        { status: 400 }
      );
    }

    const source = await SourceService.create({
      name,
      slug,
      type,
      baseUrl,
      enabled,
      config,
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error("Failed to create source:", error);
    return NextResponse.json(
      { message: "Failed to create source" },
      { status: 500 }
    );
  }
}
