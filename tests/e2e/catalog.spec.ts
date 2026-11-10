import { expect, test, type Page } from "@playwright/test";

function unique() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

/** Signs in a fresh test user and finishes onboarding. Returns the handle. */
async function signUp(page: Page, role: "user" | "admin" = "user") {
  const handle = `e2e-${unique()}`;
  const response = await page.request.post("/api/test/sign-in", {
    data: { email: `${handle}@example.com`, role },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/onboarding");
  await page.getByLabel("Handle").fill(handle);
  await page.getByLabel("Month").selectOption("6");
  await page.getByLabel("Year").fill("1985");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page).toHaveURL("/");
  return handle;
}

async function submitPedal(page: Page, model: string) {
  await page.goto("/gear/submit");
  await page.getByLabel("Brand").fill("E2E Effects");
  await page.getByLabel("Model").fill(model);
  await page.getByLabel("Category").selectOption("fuzz");
  await page.getByLabel("Kind of gear").selectOption("mono_pedal");
  await page.getByLabel("Volts").fill("9");
  await page.getByLabel("Finishes (optional)").fill("Sparkle Green");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByText("Waiting for review")).toBeVisible();
  return new URL(page.url()).pathname;
}

test("search tolerates typos and leads to a gear page", async ({ page }) => {
  await page.goto("/gear");
  await page.getByRole("searchbox").fill("ibanes ts9");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: /TS9 Tube Screamer/ }).click();

  await expect(page).toHaveURL("/gear/ibanez/ts9");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "TS9 Tube Screamer",
  );
  await expect(page.getByText("A variant of")).toBeVisible();
  await expect(page.getByText(/Not yet checked against/)).toBeVisible();
});

test("a gear page shows jacks, power and where the data came from", async ({
  page,
}) => {
  await page.goto("/gear?category=overdrive");
  await page.getByRole("link", { name: /SD-1 Super OverDrive/ }).click();
  await expect(page).toHaveTitle(/BOSS SD-1 Super OverDrive/);
  await expect(page.getByText("draws 10 mA")).toBeVisible();
  await expect(page.getByText("Input → Output")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "the maker's published specs" }),
  ).toHaveAttribute("href", /boss\.info/);
});

test("a submission stays hidden until an admin approves it", async ({
  page,
  browser,
}) => {
  await signUp(page);
  const path = await submitPedal(page, `Fuzz ${unique()}`);
  await expect(page.getByText("Sparkle Green")).toBeVisible();

  // Logged out, and as another member: not found.
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get(path)).status()).toBe(404);
  const other = await (await browser.newContext()).newPage();
  await signUp(other);
  expect((await other.goto(path))?.status()).toBe(404);
  expect((await other.goto("/admin/catalog"))?.status()).toBe(404);

  // An admin approves it, and now everyone can see it.
  const admin = await (await browser.newContext()).newPage();
  await signUp(admin, "admin");
  await admin.goto("/admin/catalog");
  const entry = admin.getByRole("listitem", { name: /E2E Effects Fuzz/ });
  await entry
    .filter({ has: admin.locator(`a[href="${path}"]`) })
    .getByRole("button", { name: "Approve" })
    .click();
  await expect(admin.getByText("Approved.")).toBeVisible();
  expect((await anonymous.request.get(path)).status()).toBe(200);
  await anonymous.close();
});

test("merging a duplicate redirects its URL to the item it joined", async ({
  page,
  browser,
}) => {
  await signUp(page);
  const path = await submitPedal(page, `Dupe ${unique()}`);

  const admin = await (await browser.newContext()).newPage();
  await signUp(admin, "admin");
  await admin.goto("/admin/catalog");
  const entry = admin
    .getByRole("listitem")
    .filter({ has: admin.locator(`a[href="${path}"]`) });
  await entry.getByLabel("Merge into").fill("boss/sd-1");
  await entry.getByRole("button", { name: "Merge" }).click();
  await expect(admin.getByText(/Merged into BOSS SD-1/)).toBeVisible();

  const response = await page.request.get(path, { maxRedirects: 0 });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toMatch(/\/gear\/boss\/sd-1$/);
  await page.goto(path);
  await expect(page).toHaveURL("/gear/boss/sd-1");
});
