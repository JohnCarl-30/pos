import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers";

async function openReports(page: Page, query = "") {
  await signIn(page, "manager@demo.test");
  const store = page.getByRole("combobox", { name: "Current store" });
  await expect(store).toBeVisible();
  if ((await store.textContent())?.trim() !== "Main Street") {
    await store.click();
    await page.getByRole("option", { name: "Main Street" }).click();
    await expect(store).toHaveText("Main Street");
  }
  await page.goto(`/reports${query}`);
  await expect(page.getByRole("heading", { name: "Reports · Main Street" })).toBeVisible();
}

test("a manager sees today's sales and the cashier who voided a cash sale", async ({ page }) => {
  await openReports(page);
  await expect(page.getByText("Net sales", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Staff", exact: true }).click();
  await expect(page.getByRole("cell", { name: /Casey Cashier/ })).toBeVisible();
  await expect(page.getByText("Voided a cash sale")).toBeVisible();
});

test("the date range lives in the URL", async ({ page }) => {
  await openReports(page);
  await page.getByRole("combobox", { name: "Date range" }).click();
  await page.getByRole("option", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/range=7d/);
  await expect(page.getByRole("combobox", { name: "Date range" })).toHaveText("Last 7 days");
});

test("products and cash-ups show today's trading", async ({ page }) => {
  await openReports(page, "?tab=products");
  await expect(page.getByRole("cell", { name: "Espresso", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Cash-ups", exact: true }).click();
  await expect(page.getByText("Balanced").first()).toBeVisible();
  await expect(page.getByText("Over $7.10")).toBeVisible();
});

test("a report downloads as CSV", async ({ page }) => {
  await openReports(page);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const file = await (await download).path();
  expect(readFileSync(file, "utf8").replace(/^﻿/, "").split("\r\n")[0]).toBe("metric,value");
});

test("cashiers can't open reports", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await expect(page).toHaveURL(/\/register$/);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
