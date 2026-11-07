import { expect, test, type Page } from "@playwright/test";

function uniqueSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function signIn(page: Page) {
  const email = `e2e-${uniqueSuffix()}@example.com`;
  const response = await page.request.post("/api/test/sign-in", {
    data: { email },
  });
  expect(response.ok()).toBe(true);
}

async function fillOnboarding(page: Page, handle: string, year: string) {
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Month").selectOption("6");
  await page.getByLabel("Year").fill(year);
  await page.getByRole("button", { name: "Finish" }).click();
}

test("the whole site is marked noindex and shows the beta banner", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.headers()["x-robots-tag"]).toBe("noindex");
  await expect(page.getByText("This is a beta")).toBeVisible();
});

test("the health check reports ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
});

test("a logged-out visitor sees the sign-in option", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
});

test("a new user must finish onboarding before using the site", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);

  const handle = `player-${uniqueSuffix()}`;
  await fillOnboarding(page, handle, "1985");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(`@${handle}`)).toBeVisible();
});

test("onboarding explains a blocked or taken handle", async ({ page }) => {
  const handle = `taken-${uniqueSuffix()}`;
  await signIn(page);
  await page.goto("/onboarding");
  await fillOnboarding(page, handle, "1985");
  await expect(page.getByText(`@${handle}`)).toBeVisible();
  await page.context().clearCookies();

  await signIn(page);
  await page.goto("/onboarding");
  await fillOnboarding(page, "admin", "1985");
  await expect(page.getByText("That handle isn't available.")).toBeVisible();

  await fillOnboarding(page, handle, "1985");
  await expect(page.getByText("That handle is already taken.")).toBeVisible();
});

test("failing the age check deletes the account", async ({ page }) => {
  await signIn(page);
  await page.goto("/onboarding");
  await fillOnboarding(page, `young-${uniqueSuffix()}`, "2020");

  await expect(page).toHaveURL(/\/onboarding\/not-eligible$/);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("a user can sign out", async ({ page }) => {
  await signIn(page);
  await page.goto("/onboarding");
  await fillOnboarding(page, `leaver-${uniqueSuffix()}`, "1985");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
