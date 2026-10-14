import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

async function openRegister(page: Page) {
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

test("a cashier sells with a discount and gives change", async ({ page }) => {
  await openRegister(page);
  await page.getByLabel("Search or scan a barcode").fill("ESPRESSO-DEFAULT");
  await page.getByLabel("Search or scan a barcode").press("Enter");
  await page.getByRole("button", { name: "Add Croissant" }).click();
  await page.getByRole("button", { name: "Discount Croissant" }).click();
  await page.getByLabel("Percentage off").fill("10");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("button", { name: "Pay $6.66" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByLabel("Cash received").fill("10");
  await expect(page.getByText("Change $3.34")).toBeVisible();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText("Change due $3.34")).toBeVisible();
  const href = await page.getByRole("link", { name: "Print receipt" }).getAttribute("href");
  await page.goto(href!.replace("?print=1", ""));
  await expect(page.getByText(/Receipt #\d+/)).toBeVisible();
  await expect(page.getByText("Croissant")).toBeVisible();
  await expect(page.getByText("$6.66").first()).toBeVisible();
});

test("a big discount needs a manager's approval", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Espresso" }).click();
  await page.getByRole("button", { name: "Discount sale" }).click();
  await page.getByLabel("Percentage off").fill("50");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("button", { name: "Get approval" }).click();
  await page.getByLabel("Manager email").fill("manager@demo.test");
  await page.getByLabel("Manager password").fill("password");
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Discount approved")).toBeVisible();
  await page.getByRole("button", { name: "Pay $1.62" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Card", exact: true }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText(/Receipt #\d+/)).toBeVisible();
});

test("a sale can be split between card and cash", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Mug" }).click();
  await page.getByRole("button", { name: "Pay $16.24" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Card", exact: true }).click();
  await page.getByLabel("Card amount").fill("10");
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await expect(page.getByLabel("Cash amount")).toHaveValue("6.24");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText(/Receipt #\d+/)).toBeVisible();
});

test("a scan right after tapping a tile adds the scanned item", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Croissant" }).click();
  await page.keyboard.type("ESPRESSO-DEFAULT");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Remove Espresso" })).toBeVisible();
  await expect(page.getByLabel("Quantity of Croissant")).toHaveText("1");
  await page.getByRole("button", { name: "Clear" }).click();
});

test("closing the till compares counted and expected cash", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Close till" }).click();
  await page.getByLabel(/Counted cash/).fill("120");
  await page.getByRole("dialog").getByRole("button", { name: "Close till" }).click();
  await expect(page.getByText("Expected")).toBeVisible();
  await expect(page.getByText("$112.90")).toBeVisible();
  await expect(page.getByText("Over $7.10")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Open till" })).toBeVisible();
});

test("a receipt that doesn't exist returns 404", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/receipts/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
