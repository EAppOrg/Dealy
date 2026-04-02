import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@dealy/db";
import { getAuthContext, unauthorizedResponse } from "@/lib/session";

/**
 * GET /api/preferences — Get current user's preferences.
 */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  try {
    let prefs = await prisma.userPreference.findUnique({
      where: { userId: ctx.userId },
    });

    if (!prefs) {
      prefs = {
        id: "",
        userId: ctx.userId,
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
  const ctx = await getAuthContext();
  if (!ctx) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { currency, locale, alertEmail, alertPush, maxBudgetAlert } = body;

    const prefs = await prisma.userPreference.upsert({
      where: { userId: ctx.userId },
      create: {
        userId: ctx.userId,
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
