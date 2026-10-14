import { expect, test } from "@playwright/test";

test("first run sets up the shop and signs the owner in @fresh", async ({ page }) => {
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel("Business name").fill("Corner Shop");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Store name").fill("Main Street");
  await page.getByLabel("Currency").fill("eur");
  await page.getByLabel("Standard tax rate (%)").fill("21");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Sam Owner");
  await page.getByLabel("Email").fill("sam@corner.test");
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("link", { name: "Settings" }).first()).toBeVisible();

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
