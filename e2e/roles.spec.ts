import { expect, test } from "@playwright/test";
import { navLabels, signIn } from "./helpers";

test("owner sees every section", async ({ page }) => {
  await signIn(page, "owner@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  expect(await navLabels(page)).toEqual(["Register", "Products", "Orders", "Customers", "Reports", "Settings"]);
});

test("manager sees products and reports but not settings", async ({ page }) => {
  await signIn(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  expect(await navLabels(page)).toEqual(["Register", "Products", "Orders", "Customers", "Reports"]);
  await page.goto("/settings/stores");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

test("cashier sees only the selling sections", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  expect(await navLabels(page)).toEqual(["Register", "Orders", "Customers"]);
  for (const path of ["/products", "/reports", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
});

test("a wrong password shows an error", async ({ page }) => {
  await signIn(page, "owner@demo.test", "wrong-password");
  await expect(page.locator("#auth").getByRole("alert")).toHaveText("Email or password is incorrect.");
});

test("a deactivated account is turned away", async ({ page }) => {
  await signIn(page, "inactive@demo.test");
  await expect(page).toHaveURL(/\/login\?error=no-access$/);
  await expect(page.locator("#auth").getByRole("alert")).toContainText("doesn't have access");
});

test("signing in returns you to the page you asked for", async ({ page }) => {
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
  await page.getByLabel("Email").fill("cashier@demo.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/orders$/);
});

test("an off-site return path is ignored", async ({ page }) => {
  await page.goto("/login?next=//evil.test");
  await page.getByLabel("Email").fill("cashier@demo.test");
  await page.getByLabel("Password", { exact: true }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("http://localhost:3000/register");
});

test("an owner cannot deactivate themself", async ({ page }) => {
  await signIn(page, "owner@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/settings/staff");
  await page.getByRole("row", { name: /Olivia Owner/ }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Can sign in").click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("You can't deactivate your own account.");
});
