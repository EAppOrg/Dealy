import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
    await expect(page.locator('input[name="email"]')).toBeVisible({
      timeout: 15000,
    });
  });

  test("unauthenticated user cannot access /alerts", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });

  test("unauthenticated user cannot access /admin/sources", async ({
    page,
  }) => {
    await page.goto("/admin/sources");
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').waitFor({ timeout: 15000 });
    await page.fill('input[name="email"]', "wrong@example.com");
    await page.fill('input[name="password"]', "wrongpassword");
    await page.click('button[type="submit"]');
    await expect(
      page.getByText("Invalid email or password")
    ).toBeVisible({ timeout: 15000 });
  });

  test("login with valid admin credentials succeeds", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').waitFor({ timeout: 15000 });
    await page.fill('input[name="email"]', "admin@dealy.app");
    await page.fill('input[name="password"]', "dealy123");
    await page.click('button[type="submit"]');

    await expect(
      page.locator("h1", { hasText: "Dashboard" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Alex Chen")).toBeVisible();
    await expect(page.getByText("Sign out")).toBeVisible();
  });
});
