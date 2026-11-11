import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

function unique() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

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

async function loggedOut(browser: Browser) {
  const context = await browser.newContext();
  return { page: await context.newPage(), close: () => context.close() };
}

async function addJcm800(page: Page, opts: { public?: boolean } = {}) {
  await page.goto("/gear/marshall/jcm800-2203");
  await page.getByRole("link", { name: "Add to my gear" }).click();
  await expect(page).toHaveURL(/\/collection\/add/);
  await page
    .getByLabel("Finish", { exact: true })
    .selectOption({ label: "Black and Gold" });
  await page.getByLabel("Nickname (optional)").fill("The Plexi-ish");
  await page.getByLabel("Mods (optional)").fill("Extra gain stage");
  if (opts.public) await page.getByLabel(/Show on my public profile/).check();
  await page.getByRole("button", { name: "Add to my gear" }).click();
  await expect(page.getByText("Added to your gear")).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2]!;
}

test("collection items are private until made public", async ({
  page,
  browser,
}) => {
  const handle = await signUp(page);
  const id = await addJcm800(page);

  await page.goto(`/u/${handle}`);
  await expect(page.getByRole("link", { name: /The Plexi-ish/ })).toBeVisible();
  await expect(page.getByText("Private", { exact: true })).toBeVisible();

  const visitor = await loggedOut(browser);
  await visitor.page.goto(`/u/${handle}`);
  await expect(visitor.page.getByText("No public gear yet.")).toBeVisible();
  const hidden = await visitor.page.goto(`/u/${handle}/gear/${id}`);
  expect(hidden?.status()).toBe(404);

  await page.goto(`/collection/${id}/edit`);
  await page.getByLabel(/Show on my public profile/).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(`/u/${handle}/gear/${id}`);

  const shown = await visitor.page.goto(`/u/${handle}/gear/${id}`);
  expect(shown?.status()).toBe(200);
  await expect(
    visitor.page.getByRole("heading", { name: "The Plexi-ish" }),
  ).toBeVisible();
  await expect(visitor.page.getByText("Black and Gold")).toBeVisible();
  await expect(visitor.page.getByText("Extra gain stage")).toBeVisible();
  await visitor.close();
});

test("changing the handle redirects old links", async ({ page }) => {
  const handle = await signUp(page);
  const renamed = `${handle}-x`;
  await page.goto("/settings");
  await page.getByLabel("Display name").fill("Test Player");
  await page.getByLabel("Bio (optional)").fill("Fuzz and more fuzz");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("textbox", { name: "Handle" }).fill(renamed);
  await page.getByRole("button", { name: "Change handle" }).click();
  await expect(page).toHaveURL(`/u/${renamed}`);
  await expect(
    page.getByRole("heading", { name: "Test Player" }),
  ).toBeVisible();
  await expect(page.getByText("Fuzz and more fuzz")).toBeVisible();

  const old = await page.request.get(`/u/${handle}`, { maxRedirects: 0 });
  expect(old.status()).toBe(308);
  expect(old.headers().location).toContain(`/u/${renamed}`);

  await page.goto("/settings");
  await expect(page.getByText(/You can change it again on/)).toBeVisible();
});

test("a photo is private until approved, then shows on the gear page", async ({
  page,
  browser,
}) => {
  const handle = await signUp(page);
  const id = await addJcm800(page, { public: true });

  const photo = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#356" },
  })
    .jpeg()
    .toBuffer();
  await page.getByLabel("Add a photo").setInputFiles({
    name: "amp.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  await page.getByLabel(/Offer this photo for the catalog page/).check();
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Waiting for review")).toBeVisible();
  const src = await page
    .getByRole("img", { name: /photo 1/ })
    .getAttribute("src");
  expect(src).toMatch(/^\/api\/images\//);
  expect((await page.request.get(src!)).status()).toBe(200);

  const visitor = await loggedOut(browser);
  expect((await visitor.page.request.get(src!)).status()).toBe(404);
  await visitor.page.goto(`/u/${handle}/gear/${id}`);
  await expect(visitor.page.getByRole("img", { name: /photo/ })).toHaveCount(0);

  // An admin approves it for the gear page.
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await signUp(adminPage, "admin");
  await adminPage.goto("/admin/images");
  const item = adminPage
    .getByRole("listitem")
    .filter({ hasText: `by @${handle}` });
  await item
    .getByRole("button", { name: "Approve and use on the gear page" })
    .click();
  await expect(
    adminPage.getByText("Approved and added to the gear page."),
  ).toBeVisible();
  await admin.close();

  expect((await visitor.page.request.get(src!)).status()).toBe(200);
  await visitor.page.goto(`/u/${handle}/gear/${id}`);
  await expect(
    visitor.page.getByRole("img", { name: /photo 1/ }),
  ).toBeVisible();
  await visitor.page.goto("/gear/marshall/jcm800-2203");
  await expect(
    visitor.page.getByRole("link", { name: `@${handle}` }),
  ).toBeVisible();
  await visitor.close();
});
