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
