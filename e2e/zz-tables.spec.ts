import { expect, test, type Page } from "@playwright/test";
import { openRegister, signIn } from "./helpers";

test.describe.configure({ mode: "serial" });

let tabUrl = "";

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

async function addLatteWithOat(page: Page) {
  await page.getByRole("button", { name: "Add Latte" }).click();
  await page.getByRole("button", { name: /^Small/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Oat/ }).click();
  await dialog.getByRole("button", { name: "Add to tab" }).click();
  await expect(dialog).toBeHidden();
}

test("a manager sets up the garden", async ({ page }) => {
  await asManagerAtMainStreet(page);
  await page.goto("/tables/setup");
  await page.getByLabel("New area name").fill("Garden");
  await page.getByRole("button", { name: "Add area" }).click();
  await page.getByLabel("New table name in Garden").fill("G1");
  await page.getByRole("button", { name: "Add table" }).last().click();
  await expect(page.getByLabel("Name for table G1")).toBeVisible();
  await page.getByLabel("New table name in Garden").fill("G2");
  await page.getByRole("button", { name: "Add table" }).last().click();
  await expect(page.getByLabel("Name for table G2")).toBeVisible();
});

test("a server on a phone opens G1, orders and sends", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, "cashier@demo.test");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/tables");
  await page.getByRole("button", { name: "Open G1" }).click();
  await page.getByLabel("Guests").fill("3");
  await page.getByRole("button", { name: "Open tab" }).click();
  await expect(page).toHaveURL(/\/tabs\//);
  tabUrl = new URL(page.url()).pathname;

  await addLatteWithOat(page);
  await page.getByRole("button", { name: /^Tab · 1 items/ }).click();
  await page.getByRole("button", { name: "Note for Latte – Small" }).click();
  await page.getByLabel("Note", { exact: true }).fill("extra hot");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByRole("dialog").getByText("extra hot")).toBeVisible();
  await page.keyboard.press("Escape");

  await addLatteWithOat(page);
  await page.getByRole("button", { name: "Add Croissant" }).click();
  await page.getByRole("button", { name: /^Tab · 3 items/ }).click();
  await page.getByRole("button", { name: "Send 3 to the kitchen" }).click();
  await expect(page.getByRole("button", { name: "Everything's sent" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("the kitchen sees the ticket and a void", async ({ page, context }) => {
  await signIn(page, "cashier@demo.test");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/kitchen");
  const ticket = page.getByRole("article", { name: /G1/ });
  await expect(ticket.getByText("Oat").first()).toBeVisible();
  await expect(ticket.getByText("extra hot")).toBeVisible();

  const server = await context.newPage();
  await server.goto(tabUrl);
  await server.getByRole("button", { name: "Void Croissant" }).click();
  await server.getByLabel("Reason").fill("Out of croissants");
  await server.getByRole("button", { name: "Void item" }).click();
  await expect(server.getByText(/Voided · Out of croissants/)).toBeVisible();

  await page.reload();
  await expect(ticket.getByText("VOID")).toBeVisible();
});

test("the bill marks the table", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto(tabUrl);
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Print bill" }).click();
  const bill = await popup;
  await expect(bill.getByText("G1", { exact: true })).toBeVisible();
  await bill.close();
  await page.goto("/tables");
  await expect(page.getByRole("link", { name: /^G1, .*bill printed/ })).toBeVisible();
});

test("the till takes one latte by card, then splits the rest in cash", async ({ page }) => {
  await openRegister(page);
  await page.goto(`/register?tab=${tabUrl.split("/").pop()}`);
  await expect(page.getByRole("heading", { name: "Paying G1" })).toBeVisible();
  await page.getByRole("button", { name: "Select none" }).click();
  await page.getByRole("checkbox", { name: "Pay Latte – Small" }).first().click();
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Card", exact: true }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByRole("button", { name: "Pay the rest" })).toBeVisible();

  await page.getByRole("button", { name: "Pay the rest" }).click();
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.getByRole("dialog").getByLabel("People").fill("2");
  await page.getByRole("dialog").getByRole("button", { name: "In cash" }).click();
  await expect(page.getByRole("dialog").getByText("Remaining")).toBeVisible();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await expect(page.getByText("Tab paid")).toBeVisible();

  await page.getByRole("link", { name: "Back to tables" }).click();
  await expect(page.getByRole("button", { name: "Open G1" })).toBeVisible();
});

test("the kitchen finishes and recalls a ticket, and sees counter sales", async ({ page }) => {
  await openRegister(page);
  await page.getByRole("button", { name: "Add Croissant" }).click();
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cash", exact: true }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  const receipt = (await page.getByText(/Receipt #\d+/).textContent())!.match(/#(\d+)/)![1];

  await page.goto("/kitchen");
  await expect(page.getByRole("article", { name: new RegExp(`#${receipt}$`) })).toBeVisible();
  const garden = page.getByRole("article", { name: /G1/ });
  await garden.getByRole("button", { name: "Done" }).click();
  await expect(garden).toBeHidden();
  await page.getByRole("button", { name: "Recall" }).click();
  await expect(page.getByRole("article", { name: /G1/ })).toBeVisible();
});

test("the kitchen chime stays on after a reload and asks for a tap to sound", async ({ page }) => {
  await signIn(page, "cashier@demo.test");
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/kitchen");
  await page.getByRole("checkbox", { name: "Chime on new ticket" }).click();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Chime on new ticket" })).toBeChecked();
  await expect(page.getByText("Tap anywhere to turn on the chime.")).toBeVisible();
  await page.getByRole("heading", { level: 1 }).click();
  await expect(page.getByText("Tap anywhere to turn on the chime.")).toBeHidden();
});
