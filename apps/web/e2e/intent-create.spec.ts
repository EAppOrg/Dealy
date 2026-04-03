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

test.describe("Intent creation flow", () => {
  test("create intent: submit, redirect, detail, and list persistence", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const uniqueTitle = `E2E keyboard hunt ${Date.now()}`;
    const uniqueQuery = "mechanical keyboard cherry mx brown";

    // Navigate to new intent page
    await page.goto("/intents/new");
    await expect(
      page.locator("h1", { hasText: "New Shopping Intent" })
    ).toBeVisible({ timeout: 15000 });

    // Fill required + optional fields
    await page.fill('input[name="title"]', uniqueTitle);
    await page.fill('input[name="query"]', uniqueQuery);
    await page.fill(
      "textarea#description",
      "Compact TKL keyboard for development"
    );
    await page.selectOption("select#priority", "HIGH");
    await page.fill('input[name="budgetMin"]', "80");
    await page.fill('input[name="budgetMax"]', "250");

    // Submit
    await page.click('button:has-text("Create Intent")');

    // --- REDIRECT PROOF ---
    // Should land on intent detail page (not /intents/new)
    await expect(page).toHaveURL(/\/intents\/(?!new)/, { timeout: 15000 });

    // --- DETAIL PAGE PROOF ---
    // Created intent's title, query, and fields are visible
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(uniqueQuery)).toBeVisible();
    await expect(page.getByText("ACTIVE").first()).toBeVisible();
    await expect(page.getByText("HIGH")).toBeVisible();
    await expect(page.getByText("Compare Offers").first()).toBeVisible();
    await expect(page.getByText("Run Search").first()).toBeVisible();

    // --- LIST PERSISTENCE PROOF ---
    // Verify via API that intent persisted and appears in the list
    const response = await page.request.get("/api/intents");
    const { intents } = await response.json();
    const found = intents.find(
      (i: { title: string }) => i.title === uniqueTitle
    );
    expect(found).toBeTruthy();
    expect(found.status).toBe("ACTIVE");
    expect(found.priority).toBe("HIGH");
  });

  test("empty required fields prevent submission (HTML validation)", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await page.goto("/intents/new");
    await expect(
      page.locator("h1", { hasText: "New Shopping Intent" })
    ).toBeVisible({ timeout: 15000 });

    // Click submit with empty fields
    await page.click('button:has-text("Create Intent")');
    // HTML required attribute prevents submission — still on /intents/new
    await expect(page).toHaveURL(/\/intents\/new/);

    // Fill title only, leave query empty
    await page.fill('input[name="title"]', "Partial intent");
    await page.click('button:has-text("Create Intent")');
    await expect(page).toHaveURL(/\/intents\/new/);
  });
});
