import { test, expect } from "@playwright/test";

test.describe("Registration flow", () => {
  const testEmail = `e2e-${Date.now()}@test.dealy.app`;
  const testName = "E2E Test User";
  const testPassword = "testpass123";

  test("new user can sign up, land in authenticated app, and see workspace context", async ({
    page,
  }) => {
    // Navigate to signup page (should be accessible unauthenticated)
    await page.goto("/signup");
    await expect(
      page.locator("h1", { hasText: "Dealy" })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Create your account")).toBeVisible();

    // Fill the registration form
    await page.fill('input[name="name"]', testName);
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);

    // Submit
    await page.click('button:has-text("Create account")');

    // Should auto-sign-in and land on dashboard
    await expect(
      page.locator("h1", { hasText: "Dashboard" })
    ).toBeVisible({ timeout: 15000 });

    // Authenticated shell should show the new user's name
    await expect(page.getByText(testName)).toBeVisible();
    await expect(page.getByText("Sign out")).toBeVisible();

    // Verify workspace-backed API works for the new user
    const meRes = await page.request.get("/api/auth/me");
    const me = await meRes.json();
    expect(me.email).toBe(testEmail.toLowerCase());
    expect(me.name).toBe(testName);
    expect(me.workspaceId).toBeTruthy();
    expect(me.workspaceName).toContain(testName);
  });

  test("duplicate email shows error", async ({ page }) => {
    // First registration (use the email from the test above if running sequentially,
    // or create a fresh one)
    const dupEmail = `dup-${Date.now()}@test.dealy.app`;

    // Register via API first
    await page.request.post("/api/auth/register", {
      data: { name: "First", email: dupEmail, password: "secret123" },
    });

    // Try to register same email via UI
    await page.goto("/signup");
    await page.fill('input[name="name"]', "Second");
    await page.fill('input[name="email"]', dupEmail);
    await page.fill('input[name="password"]', "secret456");
    await page.click('button:has-text("Create account")');

    // Should show error, stay on signup page
    await expect(
      page.getByText("already exists")
    ).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/\/signup/);
  });

  test("login page links to signup", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Create one")).toBeVisible();
    await page.click("text=Create one");
    await expect(page).toHaveURL(/\/signup/);
  });

  test("signup page links to login", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText("Sign in")).toBeVisible();
    await page.click('a:has-text("Sign in")');
    await expect(page).toHaveURL(/\/login/);
  });
});
