import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

async function chooseOption(page: Page, trigger: string, option: string) {
  await page.getByRole("combobox", { name: trigger }).click();
  await page.getByRole("option", { name: option }).click();
}

test("a manager creates a product and manages its stock", async ({ page }) => {
  await signIn(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/products/new");
  await page.getByLabel("Name", { exact: true }).fill("E2E Cookie");
  await page.getByLabel("Variant 1 name").fill("Plain");
  await page.getByLabel("Variant 1 SKU").fill("E2E-PLAIN");
  await page.getByLabel("Variant 1 price").fill("2.50");
  await page.getByRole("button", { name: "Add variant" }).click();
  await page.getByLabel("Variant 2 name").fill("Choc");
  await page.getByLabel("Variant 2 SKU").fill("E2E-CHOC");
  await page.getByLabel("Variant 2 price").fill("3,00");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}$/);

  await page.getByRole("link", { name: "Stock" }).click();
  await expect(page.getByTestId("stock-E2E-PLAIN")).toHaveText("0");

  await page.getByRole("button", { name: "Update stock for Plain" }).click();
  await page.getByLabel("Quantity").fill("10");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("stock-E2E-PLAIN")).toHaveText("10");

  await page.getByRole("button", { name: "Update stock for Plain" }).click();
  await chooseOption(page, "What happened", "Counted the shelf");
  await page.getByLabel("Counted on the shelf").fill("7");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("stock-E2E-PLAIN")).toHaveText("7");
  await expect(page.getByText("Counted").first()).toBeVisible();
  await expect(page.getByText("−3").first()).toBeVisible();
});

test("a duplicate SKU is reported on the right row", async ({ page }) => {
  await signIn(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/products/new");
  await page.getByLabel("Name", { exact: true }).fill("Clash");
  await page.getByLabel("Variant 1 SKU").fill("LATTE-SMALL");
  await page.getByLabel("Variant 1 price").fill("1");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Already used by Latte" })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Clash");
});

test("CSV import previews errors and applies a clean file", async ({ page }) => {
  await signIn(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/products/import");

  const bad = "product,sku,price\nE2E Scone,E2E-SCONE,2.00\nE2E Bun,E2E-BUN,abc\n";
  await page.getByLabel("CSV file").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from(bad) });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("1 new · 0 updated · 0 unchanged · 1 error")).toBeVisible();
  await expect(page.getByText("Price must be an amount like 4.50")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Import/ })).toBeDisabled();

  const good = "product;sku;price\nE2E Scone;E2E-SCONE;2,00\nE2E Bun;E2E-BUN;1,50\n";
  await page.getByLabel("CSV file").setInputFiles({ name: "good.csv", mimeType: "text/csv", buffer: Buffer.from(good) });
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("2 new · 0 updated · 0 unchanged · 0 errors")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Imported 2 rows" })).toBeVisible();

  await page.goto("/products?q=E2E-BUN");
  await expect(page.getByRole("link", { name: "E2E Bun" })).toBeVisible();
});

test("export downloads the catalog as CSV", async ({ page }) => {
  await signIn(page, "manager@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/products");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^products-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("cashiers cannot reach the catalog", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  for (const path of ["/products", "/products/new", "/products/stock", "/products/import"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  }
});
