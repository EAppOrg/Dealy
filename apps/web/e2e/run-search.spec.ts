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

test.describe("Run Search flow", () => {
  test("trigger Run Search on a fresh intent and see results appear", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // Create a fresh intent via API so we have a clean starting point
    const createRes = await page.request.post("/api/intents", {
      data: {
        title: `Run Search E2E ${Date.now()}`,
        query: "wireless bluetooth earbuds price",
      },
    });
    const { intent } = await createRes.json();

    // Navigate to the intent detail page
    await page.goto(`/intents/${intent.id}`);
    await expect(page.getByText(intent.title)).toBeVisible({
      timeout: 15000,
    });

    // Verify initial state: no runs yet
    await expect(
      page.getByText("No retrieval runs yet")
    ).toBeVisible();
    await expect(
      page.getByText("No recommendations yet")
    ).toBeVisible();

    // Click Run Search
    const runButton = page.getByRole("button", { name: "Run Search" });
    await expect(runButton).toBeVisible();
    await expect(runButton).toBeEnabled();
    await runButton.click();

    // Button should show "Running..." while executing
    await expect(
      page.getByRole("button", { name: "Running..." })
    ).toBeVisible({ timeout: 5000 });

    // Wait for execution to complete — button reverts to "Run Search"
    // Retrieval makes real HTTP calls, so allow generous timeout
    await expect(
      page.getByRole("button", { name: "Run Search" })
    ).toBeVisible({ timeout: 60000 });
    await expect(
      page.getByRole("button", { name: "Run Search" })
    ).toBeEnabled();

    // Verify runs appeared — at least one COMPLETED badge should be visible
    // (some sources may return 0 items but still COMPLETED)
    await expect(page.getByText("COMPLETED").first()).toBeVisible();

    // "No retrieval runs yet" should be gone
    await expect(page.getByText("No retrieval runs yet")).not.toBeVisible();

    // Verify at least one run shows an "items" count
    await expect(page.getByText(/\d+ items/).first()).toBeVisible();
  });

  test("Run Search results are visible on the compare page for seeded intent", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // Use the seeded "New development laptop" intent which already has
    // COMPLETED runs and offers from seed data
    const listRes = await page.request.get("/api/intents");
    const { intents } = await listRes.json();
    const seeded = intents.find(
      (i: { title: string }) => i.title === "New development laptop"
    );

    // Navigate to compare page
    await page.goto(`/intents/${seeded.id}/compare`);
    await expect(
      page.locator("h1", { hasText: "Compare Offers" })
    ).toBeVisible({ timeout: 15000 });

    // Seeded data should show offer rows (not empty state)
    // The seeded intent has COMPLETED runs with offers at known prices
    await expect(page.getByText("Back to Intent")).toBeVisible();

    // At least one price should be visible (seeded offers have $ prices)
    await expect(page.getByText(/\$[\d,]+/).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("Run Search on seeded intent adds new runs alongside existing ones", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // Use seeded intent that already has runs
    const listRes = await page.request.get("/api/intents");
    const { intents } = await listRes.json();
    const seeded = intents.find(
      (i: { title: string }) =>
        i.title === "Noise-cancelling headphones for office"
    );

    await page.goto(`/intents/${seeded.id}`);
    await expect(page.getByText(seeded.title)).toBeVisible({
      timeout: 15000,
    });

    // Count existing COMPLETED badges before running
    const completedBefore = await page.getByText("COMPLETED").count();

    // Trigger new run
    await page.getByRole("button", { name: "Run Search" }).click();
    await expect(
      page.getByRole("button", { name: "Running..." })
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("button", { name: "Run Search" })
    ).toBeVisible({ timeout: 60000 });

    // Should have more COMPLETED runs now (new runs added to existing)
    const completedAfter = await page.getByText("COMPLETED").count();
    expect(completedAfter).toBeGreaterThan(completedBefore);
  });
});
