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

test.describe("Run Search flow (async background execution)", () => {
  test("trigger returns fast, runs appear as PENDING, then poll to COMPLETED", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // Create a fresh intent
    const createRes = await page.request.post("/api/intents", {
      data: {
        title: `Async Run E2E ${Date.now()}`,
        query: "wireless bluetooth earbuds price",
      },
    });
    const { intent } = await createRes.json();

    // Navigate to detail
    await page.goto(`/intents/${intent.id}`);
    await expect(page.getByText(intent.title)).toBeVisible({
      timeout: 15000,
    });

    // Verify initial empty state
    await expect(page.getByText("No retrieval runs yet")).toBeVisible();

    // Click Run Search — returns fast now (background execution)
    const runButton = page.getByRole("button", { name: "Run Search" });
    await runButton.click();

    // Button should show "Running..." quickly (not waiting for full execution)
    await expect(
      page.getByRole("button", { name: "Running..." })
    ).toBeVisible({ timeout: 5000 });

    // PENDING runs should appear on the page after the fast POST + first refresh
    // (The UI fetches intent data immediately after POST returns)
    await expect(page.getByText("PENDING").first()).toBeVisible({
      timeout: 10000,
    });

    // "No retrieval runs yet" should be gone
    await expect(page.getByText("No retrieval runs yet")).not.toBeVisible();

    // Wait for background execution + polling to show COMPLETED
    // The UI polls every 2s. Execution may take several seconds.
    await expect(page.getByText("COMPLETED").first()).toBeVisible({
      timeout: 60000,
    });

    // Button should revert to "Run Search" once all runs finish
    await expect(
      page.getByRole("button", { name: "Run Search" })
    ).toBeEnabled({ timeout: 60000 });
  });

  test("compare page shows offers for seeded intent with completed runs", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    const listRes = await page.request.get("/api/intents");
    const { intents } = await listRes.json();
    const seeded = intents.find(
      (i: { title: string }) => i.title === "New development laptop"
    );

    await page.goto(`/intents/${seeded.id}/compare`);
    await expect(
      page.locator("h1", { hasText: "Compare Offers" })
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByText("Back to Intent")).toBeVisible();
    await expect(page.getByText(/\$[\d,]+/).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("Run Search on seeded intent adds new runs", async ({ page }) => {
    await loginAsAdmin(page);

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

    const completedBefore = await page.getByText("COMPLETED").count();

    // Trigger — returns fast
    await page.getByRole("button", { name: "Run Search" }).click();

    // Wait for new runs to reach COMPLETED via polling
    await expect(async () => {
      const completedNow = await page.getByText("COMPLETED").count();
      expect(completedNow).toBeGreaterThan(completedBefore);
    }).toPass({ timeout: 60000 });
  });
});
