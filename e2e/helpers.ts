import { expect, type Page } from "@playwright/test";

export async function signIn(page: Page, email: string, password = "password") {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function navLabels(page: Page) {
  await expect(page.getByRole("navigation", { name: "Primary" }).first()).toBeVisible();
  return page.getByRole("navigation", { name: "Primary" }).first().getByRole("link").allTextContents();
}

export async function openRegister(page: Page) {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  const picker = page.getByRole("button", { name: "Counter 1" });
  const openTill = page.getByRole("button", { name: "Open till" });
  const search = page.getByLabel("Search or scan a barcode");
  await expect(picker.or(openTill).or(search)).toBeVisible();
  if (await picker.isVisible()) await picker.click();
  await expect(openTill.or(search)).toBeVisible();
  if (await openTill.isVisible()) {
    await page.getByLabel(/Starting cash/).fill("100");
    await openTill.click();
  }
  await expect(search).toBeVisible();
}
