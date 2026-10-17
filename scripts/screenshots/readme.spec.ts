import { expect, test, type Page } from "@playwright/test";
import { openRegister, signIn } from "../../e2e/helpers";

const out = "docs/screenshots";
const MAIN_STREET = "00000000-0000-0000-0000-000000000101";

async function hideDevTools(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
}

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await signIn(page, email);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.context().addCookies([{ name: "pos-store", value: MAIN_STREET, url: "http://localhost:3000" }]);
}

async function pickSmall(page: Page) {
  const small = page.getByRole("button", { name: /^Small/ });
  await small.waitFor({ timeout: 1500 }).then(() => small.click()).catch(() => undefined);
}

async function sell(page: Page, items: string[], method: "Cash" | "Card") {
  for (const item of items) {
    await page.getByRole("button", { name: `Add ${item}` }).click();
    await pickSmall(page);
  }
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: method, exact: true }).click();
  await page.getByRole("button", { name: "Complete sale" }).click();
  await page.getByRole("button", { name: "New sale" }).click();
}

async function openTab(page: Page, table: string, guests: string, items: string[], send: boolean) {
  await page.goto("/tables");
  await page.getByRole("button", { name: `Open ${table}` }).click();
  await page.getByLabel("Guests").fill(guests);
  await page.getByRole("button", { name: "Open tab" }).click();
  await expect(page).toHaveURL(/\/tabs\//);
  for (const item of items) {
    await page.getByRole("button", { name: `Add ${item}` }).click();
    await pickSmall(page);
    await page.waitForTimeout(400);
  }
  if (send) await page.getByRole("button", { name: /^Send \d+ to the kitchen/ }).click();
  await page.waitForTimeout(500);
  return page.url();
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}.png` });
}

test("README screenshots", async ({ page }) => {
  await hideDevTools(page);

  await openRegister(page);
  await sell(page, ["Latte", "Croissant"], "Card");
  await sell(page, ["Cold Brew", "Banana Bread"], "Cash");
  await sell(page, ["Cappuccino", "Cappuccino", "Blueberry Muffin"], "Card");
  await sell(page, ["Honey Jar"], "Card");
  await sell(page, ["Americano", "Bagel"], "Cash");

  await openTab(page, "T1", "4", ["Latte", "Latte", "Croissant", "Cinnamon Roll"], true);
  const tab = await openTab(page, "P1", "2", ["Cappuccino", "Pain au Chocolat", "Banana Bread"], true);
  await openTab(page, "T3", "3", ["Cold Brew", "Bagel"], false);
  await page.goto(tab);
  const popup = page.waitForEvent("popup");
  await page.getByRole("link", { name: "Print bill" }).click();
  await (await popup).close();

  await page.goto("/register");
  await page.getByRole("button", { name: "Add Latte" }).click();
  await pickSmall(page);
  await page.getByRole("button", { name: "Add Croissant" }).click();
  await page.getByRole("button", { name: "Add Cookies" }).click();
  await shot(page, "register");
  await shot(page, "role-cashier");

  await page.goto(tab);
  await shot(page, "tab");
  await page.goto("/kitchen");
  await shot(page, "kitchen");

  await signInAs(page, "manager@demo.test");
  await page.goto("/reports");
  await shot(page, "reports");
  await page.goto("/products");
  await shot(page, "role-manager");

  await signInAs(page, "owner@demo.test");
  await page.goto("/settings/staff");
  await shot(page, "role-owner");

  await page.context().clearCookies();
  await signIn(page, "inactive@demo.test");
  await expect(page.getByText("This account doesn't have access.", { exact: false })).toBeVisible();
  await shot(page, "role-inactive");

  await signInAs(page, "cashier@demo.test");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tables");
  await shot(page, "tables-phone");
});
