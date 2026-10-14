import { expect, test, type Page } from "@playwright/test";
import { openRegister, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

let refundedReceipt = "";
let voidedReceipt = "";

async function approve(page: Page) {
  await page.getByRole("button", { name: "Get approval" }).click();
  await page.getByLabel("Manager email").fill("manager@demo.test");
  await page.getByLabel("Manager password").fill("password");
  await page.getByRole("button", { name: "Approve" }).click();
}

async function receiptNumber(page: Page): Promise<string> {
  const text = await page.getByText(/^Receipt #\d+$/).textContent();
  return text!.replace("Receipt #", "");
}

test("a cashier refunds one of two items with a manager's approval", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Espresso" }).click();
  await page.getByRole("button", { name: "Add Espresso" }).click();
  await page.getByRole("button", { name: "+ Customer" }).click();
  await page.getByLabel("Search customers").fill("Ana");
  await page.getByRole("button", { name: /Ana Reyes/ }).click();
  await page.getByRole("button", { name: "Pay $6.50" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Card", exact: true }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  refundedReceipt = await receiptNumber(page);

  await page.goto(`/orders?q=${refundedReceipt}`);
  await page.getByRole("link", { name: `#${refundedReceipt}`, exact: true }).click();
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  await page.getByRole("button", { name: "More Espresso" }).click();
  await expect(page.getByLabel("Refund amount 1")).toHaveValue("3.25");
  await approve(page);
  await page.getByRole("button", { name: "Refund $3.25" }).click();
  await expect(page.getByText(/Refund #\d+ recorded/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Partially refunded")).toBeVisible();
  await expect(page.getByText("Changed mind")).toBeVisible();
  await expect(page.getByText(/1 × Espresso · \$3\.25 · back to stock/)).toBeVisible();
});

test("a return at the register is paid back in cash", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Croissant" }).click();
  await page.getByRole("button", { name: "Pay $3.79" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByLabel("Cash received").fill("5");
  await page.getByRole("button", { name: "Complete sale" }).click();
  const receipt = await receiptNumber(page);
  await page.getByRole("button", { name: "New sale" }).click();

  await page.getByRole("button", { name: "Return", exact: true }).click();
  await page.getByLabel("Receipt number").fill(receipt);
  await page.getByRole("button", { name: "Find sale" }).click();
  await page.getByRole("button", { name: "More Croissant" }).click();
  await expect(page.getByRole("combobox", { name: "Refund method 1" })).toHaveText("Cash");
  await approve(page);
  await page.getByRole("button", { name: "Refund $3.79" }).click();
  await expect(page.getByText(/Refund #\d+ recorded/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByLabel("Search or scan a barcode")).toBeVisible();
});

test("a cashier voids their own sale and the till still balances", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Mug" }).click();
  await page.getByRole("button", { name: "Pay $16.24" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByLabel("Cash received").fill("20");
  await page.getByRole("button", { name: "Complete sale" }).click();
  voidedReceipt = await receiptNumber(page);

  await page.getByRole("button", { name: "Void sale" }).click();
  await page.getByLabel("Reason for the void").fill("Rang up the wrong item");
  await page.getByRole("dialog").getByRole("button", { name: "Void sale" }).click();
  await expect(page.getByText(`Receipt #${voidedReceipt} voided.`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Reprint last receipt" })).toHaveCount(0);

  await page.getByRole("button", { name: "Close till" }).click();
  await page.getByLabel(/Counted cash/).fill("100");
  await page.getByRole("dialog").getByRole("button", { name: "Close till" }).click();
  await expect(page.getByText("Cash refunds")).toBeVisible();
  await expect(page.getByText("Voided sales")).toBeVisible();
  await expect(page.getByText("None")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Open till" })).toBeVisible();
});

test("orders can be filtered and a sale shows its refunds", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/orders?status=voided");
  await expect(page.getByRole("link", { name: `#${voidedReceipt}`, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: `#${refundedReceipt}`, exact: true })).toHaveCount(0);
  await page.goto(`/orders?q=${refundedReceipt}`);
  await page.getByRole("link", { name: `#${refundedReceipt}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Refunds" })).toBeVisible();
  await expect(page.getByText("Open a till to give refunds")).toBeVisible();
  await expect(page.getByRole("button", { name: "Refund", exact: true })).toBeDisabled();
});

test("customers can be added, edited, and deleted only without sales", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/customers");
  await page.getByRole("link", { name: "New customer" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Zoe Quinn");
  await page.getByLabel("Email", { exact: true }).fill("zoe@example.com");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Zoe Quinn" })).toBeVisible();
  await page.getByLabel("Phone", { exact: true }).fill("+1 555 0199");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Customer saved.")).toBeVisible();
  await page.getByRole("button", { name: "Delete customer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole("link", { name: "Zoe Quinn" })).toHaveCount(0);

  await page.getByLabel("Search customers").fill("Ana");
  await page.getByLabel("Search customers").press("Enter");
  await page.getByRole("link", { name: "Ana Reyes" }).click();
  await expect(page.getByRole("link", { name: `#${refundedReceipt}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete customer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("This customer has sales and can't be deleted.")).toBeVisible();
});

test("a refund slip that doesn't exist returns 404", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/receipts/refunds/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
