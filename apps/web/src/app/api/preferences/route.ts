import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@dealy/db";

const STUB_USER_ID = "stub-user-001";

/**
 * GET /api/preferences — Get current user's preferences.
 */
export async function GET() {
  try {
    let prefs = await prisma.userPreference.findUnique({
      where: { userId: STUB_USER_ID },
    });

    if (!prefs) {
      // Return defaults if no preferences record exists
      prefs = {
        id: "",
        userId: STUB_USER_ID,
        currency: "USD",
        locale: "en-US",
        alertEmail: true,
        alertPush: false,
        maxBudgetAlert: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    console.error("Failed to get preferences:", error);
    return NextResponse.json(
      { message: "Failed to get preferences" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/preferences — Update current user's preferences.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { currency, locale, alertEmail, alertPush, maxBudgetAlert } = body;

    const prefs = await prisma.userPreference.upsert({
      where: { userId: STUB_USER_ID },
      create: {
        userId: STUB_USER_ID,
        currency: currency ?? "USD",
        locale: locale ?? "en-US",
        alertEmail: alertEmail ?? true,
        alertPush: alertPush ?? false,
        maxBudgetAlert: maxBudgetAlert ?? null,
      },
      update: {
        ...(currency !== undefined && { currency }),
        ...(locale !== undefined && { locale }),
        ...(alertEmail !== undefined && { alertEmail }),
        ...(alertPush !== undefined && { alertPush }),
        ...(maxBudgetAlert !== undefined && { maxBudgetAlert }),
      },
    });

    return NextResponse.json({ preferences: prefs });
  } catch (error) {
    console.error("Failed to update preferences:", error);
    return NextResponse.json(
      { message: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
