import { expect, test, type Page } from "@playwright/test";
import { openRegister, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

async function asManagerAtMainStreet(page: Page) {
  await signIn(page, "manager@demo.test");
  const store = page.getByRole("combobox", { name: "Current store" });
  await expect(store).toBeVisible();
  if ((await store.textContent())?.trim() !== "Main Street") {
    await store.click();
    await page.getByRole("option", { name: "Main Street" }).click();
    await expect(store).toHaveText("Main Street");
  }
}

test("a manager sets up a milk choice for lattes", async ({ page }) => {
  await asManagerAtMainStreet(page);
  await page.goto("/products/modifiers");
  await page.getByRole("button", { name: "New group" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Milk");
  await dialog.getByLabel("Min choices").fill("1");
  await dialog.getByLabel("Max choices").fill("1");
  await dialog.getByLabel("Option name 1").fill("Whole");
  await dialog.getByLabel("Option name 2").fill("Oat");
  await dialog.getByLabel("Price change 2").fill("0.50");
  await dialog.getByRole("button", { name: "Save group" }).click();
  await expect(page.getByRole("cell", { name: "Milk", exact: true })).toBeVisible();

  await page.goto("/products?q=Latte");
  await page.getByRole("link", { name: "Latte", exact: true }).click();
  await page.getByRole("checkbox", { name: /^Milk/ }).click();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Product saved.")).toBeVisible();
});

test("a cashier must pick a milk, adds a tip and prints a kitchen ticket", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Latte" }).click();
  await page.getByRole("button", { name: /^Small/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Add to sale" })).toBeDisabled();
  await dialog.getByRole("button", { name: /^Oat/ }).click();
  await expect(dialog.getByText("$4.70 each")).toBeVisible();
  await dialog.getByRole("button", { name: "Add to sale" }).click();
  await expect(page.getByText("Oat", { exact: true })).toBeVisible();
  await page.getByLabel("Name for the order").fill("Sam");

  await page.getByRole("button", { name: "Pay $5.09" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "15%" }).click();
  await expect(page.getByText("Due $5.85")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByLabel("Cash received").fill("10");
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText(/Tip \$0\.76/)).toBeVisible();

  const receipt = await page.getByRole("link", { name: "Print receipt" }).getAttribute("href");
  const kitchen = await page.getByRole("link", { name: "Print kitchen ticket" }).getAttribute("href");
  await page.goto(receipt!.replace("?print=1", ""));
  await expect(page.getByText("Oat")).toBeVisible();
  await expect(page.getByText("Tip", { exact: true })).toBeVisible();
  await page.goto(kitchen!.replace("?print=1", ""));
  await expect(page.getByText("For Sam")).toBeVisible();
  await expect(page.getByText("Oat")).toBeVisible();
  await expect(page.getByText(/\$/)).toHaveCount(0);
});

test("closing the till counts the cash tip", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Close till" }).click();
  await page.getByLabel(/Counted cash/).fill("105.85");
  await page.getByRole("dialog").getByRole("button", { name: "Close till" }).click();
  await expect(page.getByText("Cash tips")).toBeVisible();
  await expect(page.getByText("None")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
});

test("the reports show tips", async ({ page }) => {
  await asManagerAtMainStreet(page);
  await page.goto("/reports");
  await expect(page.getByText("Tips", { exact: true }).first()).toBeVisible();
});
