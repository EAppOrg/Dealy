import { test, expect, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.locator('input[name="email"]').waitFor({ timeout: 15000 });
  await page.fill('input[name="email"]', "admin@dealy.app");
  await page.fill('input[name="password"]', "dealy123");
  await page.click('button[type="submit"]');
  await expect(
    page.locator("h1", { hasText: "Dashboard" })
  ).toBeVisible({ timeout: 15000 });
}

test.describe("Authenticated app flows", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("dashboard renders sidebar, stats, and content", async ({ page }) => {
    // Sidebar navigation
    await expect(page.locator("aside a[href='/']")).toBeVisible();
    await expect(page.locator("aside a[href='/alerts']")).toBeVisible();
    await expect(page.locator("aside a[href='/preferences']")).toBeVisible();

    // Stats cards
    await expect(page.getByText("Active Intents")).toBeVisible();
    await expect(page.getByText("Unread Alerts")).toBeVisible();

    // New Intent button (in header area, not the inline link)
    await expect(page.locator('a[href="/intents/new"]').first()).toBeVisible();
  });

  test("intent detail page renders seeded data", async ({ page }) => {
    const response = await page.request.get("/api/intents");
    const { intents } = await response.json();
    const seededIntent = intents.find(
      (i: { title: string }) => i.title === "New development laptop"
    );

    await page.goto(`/intents/${seededIntent.id}`);
    await expect(
      page.getByText("New development laptop")
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("ACTIVE").first()).toBeVisible();
    await expect(page.getByText("Compare Offers")).toBeVisible();
    await expect(page.getByText("Run Search")).toBeVisible();
  });

  test("compare page renders offer section", async ({ page }) => {
    const response = await page.request.get("/api/intents");
    const { intents } = await response.json();
    const seededIntent = intents.find(
      (i: { title: string }) => i.title === "New development laptop"
    );

    await page.goto(`/intents/${seededIntent.id}/compare`);
    await expect(
      page.locator("h1", { hasText: "Compare Offers" })
    ).toBeVisible({ timeout: 15000 });
    // The page renders a table or empty state — verify the heading and back link
    await expect(page.getByText("Back to Intent")).toBeVisible();
  });

  test("alerts page renders content", async ({ page }) => {
    await page.goto("/alerts");
    await expect(
      page.locator("h1", { hasText: "Alerts" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("PRICE DROP").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("preferences page renders form", async ({ page }) => {
    await page.goto("/preferences");
    await expect(
      page.locator("h1", { hasText: "Preferences" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator("select#currency")).toBeVisible();
    await expect(page.getByText("Save Preferences")).toBeVisible();
  });

  test("admin sources page renders seeded sources", async ({ page }) => {
    await page.goto("/admin/sources");
    await expect(
      page.locator("h1", { hasText: "Sources" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Amazon").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Add Source")).toBeVisible();
  });

  test("admin runs page renders seeded runs", async ({ page }) => {
    await page.goto("/admin/runs");
    await expect(
      page.locator("h1", { hasText: "Retrieval Runs" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("COMPLETED").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("new intent page renders form", async ({ page }) => {
    await page.goto("/intents/new");
    await expect(
      page.locator("h1", { hasText: "New Shopping Intent" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator('input[name="title"]')).toBeVisible();
    await expect(page.locator('input[name="query"]')).toBeVisible();
  });
});
