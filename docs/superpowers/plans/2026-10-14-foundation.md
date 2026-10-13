# POS Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the open-source POS repo with the sales-crm starter, a secured Supabase schema, staff login, a one-time setup wizard, the role-aware app shell, and working Settings for stores, tax and staff.

**Architecture:** Next.js 16 App Router on Supabase. Server Components read through a per-request Supabase server client. Server Actions write and return an `ActionResult`. Postgres row-level security enforces roles, using helper functions in a non-exposed `private` schema. `proxy.ts` refreshes the session and routes visitors to `/setup` or `/login`. Pure logic (money, tax, routing, roles, store selection, validation) lives in `lib/` and is unit-tested with Vitest; database rules are tested with pgTAP; one Playwright suite covers the flows end to end.

**Tech Stack:** Next.js 16.4, React 19, Tailwind 4, Zustand, Radix UI, cmdk, `@supabase/ssr` 0.12, `@supabase/supabase-js` 2, zod 4, Vitest 4, Playwright 1.6x, Supabase CLI 2 (local Docker stack), pgTAP.

**Spec:** `docs/superpowers/specs/2026-10-14-foundation-design.md`

## Global Constraints

- Repo: `/Users/dyeyyyc/Documents/pos`. Work on branch `foundation-7c2e`. Never `git push` without asking the user first.
- Starter source: `/Users/dyeyyyc/Documents/sales-crm` (read-only; never modify it).
- Next.js 16: use `proxy.ts` (exported `proxy` function), not `middleware.ts`. `params`, `searchParams`, `cookies()` and `headers()` are async. When unsure, read `node_modules/next/dist/docs/`.
- Money is integer minor units (`bigint` in SQL, `number` in TS). No floats in money math. Format and parse only through `lib/money.ts`; tax only through `lib/tax.ts`.
- Every `public` table has RLS enabled. `anon` has no table privileges. `security definer` functions live in schema `private`, or in `public` only with `execute` revoked from `public, anon, authenticated`.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only; imported only from `lib/supabase/admin.ts`).
- Roles, lowest to highest: `cashier` < `manager` < `owner`. Nav: cashier → Register, Orders, Customers; manager adds Products, Reports; owner adds Settings. Hidden routes call `notFound()`.
- Seeded logins (password `password`): `owner@demo.test`, `manager@demo.test`, `cashier@demo.test`, `inactive@demo.test` (deactivated).
- Code style (CONVENTIONS.md): no code comments; Tailwind only; every button is `Button` from `@/components/_ui/button` with explicit `variant` and `size`; icons are SVG files imported through SVGR, no icon libraries; `h1`–`h3`/`p` take their type from `globals.css` (no extra font classes on them).
- Register route: interactive targets at least 44px (`min-h-11`).
- Before any SQL task, load the `supabase` and `supabase-postgres-best-practices` skills. Before UI tasks, skim `CONVENTIONS.md`; run the `better-interface` skill over finished screens in Task 14.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

## Review Focus

1. **Login `next` parameter pointing off-site** (`/login?next=//evil.test`) — must land on `/register`, never another origin. Pinned by `safeNext` tests in Task 7 and an e2e test in Task 14.
2. **An owner demoting or deactivating themself** — would lock the business out of Settings. Must be rejected with a clear message. Pinned by `staffChangeError` tests in Task 13.
3. **Setup submitted twice or after completion** — must never create a second business or owner. Pinned by pgTAP in Task 5 and the e2e `/setup` 404 check in Task 14.
4. **Money and percentages typed in local formats** (`12,50`, `1.234,56`, `¥1,000`, `8,25`) — must parse to the right minor units and basis points or be rejected, never silently scaled. Pinned by `parseMoney` tests in Task 2 and `parsePercentToBps` tests in Task 11.
5. **Store cookie pointing at a store the staff member lost access to** — must fall back to an allowed store, never show another store's data. Pinned by `pickStore` tests in Task 7 (and RLS tests in Task 4).

---

### Task 1: Scaffold the repo from the sales-crm starter

**Files:**
- Create (copied): config files, `.claude/`, `.agents/`, `skills-lock.json`, `AGENTS.md`, `LICENSE`, `components/_ui/`, `components/_common/{filter-menu,segment-bar,scroll-to-top}.tsx`, `components/_common/sidebar/{sidebar-nav-item,sidebar-section,sidebar-resizer}.tsx`, `components/motion-primitives/`, `lib/{utils,easings,inline-asset,sidebar}.ts`, `hooks/`, `fonts/`, `scripts/`, `app/{globals.css,favicon.ico,icon.svg,apple-icon.png}`, `public/assets/images/_common/`, `public/logo.png`
- Create (new): `CLAUDE.md`, `CONVENTIONS.md`, `app/layout.tsx`, `app/page.tsx`, `app/robots.ts`, `public/assets/images/_common/{x,square,check-square,minus-square}.svg`, `public/assets/images/_common/nav/*.svg`
- Modify: `components/_ui/dialog.tsx:8`, `components/_ui/checkbox.tsx:6-8`, `package.json`

**Interfaces:**
- Produces: a building Next app; icons at `@/public/assets/images/_common/nav/{register,products,orders,customers,reports,settings,store,log-out}.svg`.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/dyeyyyc/Documents/pos
git switch -c foundation-7c2e
```

- [ ] **Step 2: Copy the starter without CRM-specific files**

```bash
cd /Users/dyeyyyc/Documents/pos
SRC=/Users/dyeyyyc/Documents/sales-crm
rsync -a \
  --exclude /.git --exclude /node_modules --exclude /.next --exclude /docs \
  --exclude /components/companies --exclude /data --exclude /stores \
  --exclude /lib/companies.ts --exclude /lib/csv.ts --exclude /lib/seo.ts \
  --exclude /app/sitemap.ts --exclude /app/llms.txt --exclude /app/page.tsx \
  --exclude /app/layout.tsx --exclude /app/robots.ts \
  --exclude /components/_common/sparkline.tsx --exclude /components/_common/header.tsx \
  --exclude /components/_common/sidebar/sidebar.tsx \
  --exclude /components/_common/sidebar/sidebar-content.tsx \
  --exclude /public/assets/images/companies \
  --exclude /.builderrules --exclude /.mcp.json --exclude /README.md --exclude /CLAUDE.md \
  "$SRC"/ ./
I=public/assets/images
cp "$SRC/$I/companies/detail/x.svg" "$I/_common/x.svg"
cp "$SRC/$I/companies/table/square.svg" "$SRC/$I/companies/table/check-square.svg" "$SRC/$I/companies/table/minus-square.svg" "$I/_common/"
mkdir -p "$I/_common/nav"
cp "$SRC/$I/companies/sidebar/wallet.svg" "$I/_common/nav/register.svg"
cp "$SRC/$I/companies/sidebar/list.svg" "$I/_common/nav/products.svg"
cp "$SRC/$I/companies/sidebar/clipboard.svg" "$I/_common/nav/orders.svg"
cp "$SRC/$I/companies/sidebar/users.svg" "$I/_common/nav/customers.svg"
cp "$SRC/$I/companies/sidebar/bar-chart.svg" "$I/_common/nav/reports.svg"
cp "$SRC/$I/companies/sidebar/building.svg" "$I/_common/nav/store.svg"
sed -i '' 's#images/companies/detail/x.svg#images/_common/x.svg#' components/_ui/dialog.tsx
sed -i '' 's#images/companies/table/#images/_common/#' components/_ui/checkbox.tsx
npm pkg set name=pos version=0.1.0
grep -rn "companies\|@/data\|@/stores\|lib/seo" app components lib hooks || echo "no CRM references left"
```

Expected last line: `no CRM references left`. If any file is listed instead, repoint its import to a `_common` asset or delete the file if it is CRM-only.

- [ ] **Step 3: Add the two icons the CRM doesn't have**

`public/assets/images/_common/nav/settings.svg`:

```svg
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M1.75 4.08333H8.75M8.75 4.08333C8.75 5.04983 9.53350 5.83333 10.5 5.83333C11.4665 5.83333 12.25 5.04983 12.25 4.08333C12.25 3.11684 11.4665 2.33333 10.5 2.33333C9.53350 2.33333 8.75 3.11684 8.75 4.08333ZM5.25 9.91667H12.25M5.25 9.91667C5.25 10.8832 4.4665 11.6667 3.5 11.6667C2.5335 11.6667 1.75 10.8832 1.75 9.91667C1.75 8.95017 2.5335 8.16667 3.5 8.16667C4.4665 8.16667 5.25 8.95017 5.25 9.91667Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

`public/assets/images/_common/nav/log-out.svg`:

```svg
<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9.33333 9.91667L12.25 7M12.25 7L9.33333 4.08333M12.25 7H5.25M5.25 1.75H4.55C3.56991 1.75 3.07986 1.75 2.70552 1.94074C2.37623 2.10852 2.10852 2.37623 1.94074 2.70552C1.75 3.07986 1.75 3.56991 1.75 4.55V9.45C1.75 10.4301 1.75 10.9201 1.94074 11.2945C2.10852 11.6238 2.37623 11.8915 2.70552 12.0593C3.07986 12.25 3.56991 12.25 4.55 12.25H5.25" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 4: Write `CLAUDE.md`**

```markdown
@AGENTS.md

@CONVENTIONS.md

Read `CONVENTIONS.md` before writing any component or page. Before touching anything in `supabase/` or any query, load the `supabase` and `supabase-postgres-best-practices` skills. Use the `better-*` skills when designing or reviewing screens.
```

- [ ] **Step 5: Write `CONVENTIONS.md`**

```markdown
# Conventions

These rules apply to every component, page and query in this repo.

## 1. Type scale lives in `app/globals.css`

`h1`, `h2`, `h3` and `p` get their size, weight and leading from the `@layer base` scale. Never add font-size, font-weight or leading classes to them. For other elements use `.h1-style`, `.h2-style`, `.h3-style`, `.p-style`, `.lead-style`, `.caption-style` or `.eyebrow-style`. If a design needs different values, change the scale in `globals.css`, not the element.

## 2. Folder structure

- `components/_ui/` — primitives (Button, Input, Dialog, Select, Table…). No data access.
- `components/_common/` — app-wide pieces (sidebar, page header, command menu, empty state).
- `components/<feature>/` — one folder per feature (`auth`, `setup`, `settings`, later `register`, `products`…).
- `app/` — routes only: fetch data, check roles, render feature components.
- `lib/` — pure logic and data helpers. Pure modules must not import `next/*` so they stay unit-testable.
- `public/assets/images/<feature>/` — images and icons; shared icons in `_common/`.

## 3. Page structure

Each page renders one `<section id="<name>" className="flex min-h-0 min-w-0 flex-1 flex-col">` with a `PageHeader` first, then the page body.

## 4. Buttons

Every button or button-styled link is `Button` from `@/components/_ui/button`. Always pass `variant` and `size` explicitly. Pass `href` to render a link.

## 5. Max widths

Text max-widths use `em`: headings `max-w-[Nem]`; paragraphs convert the design's px width by dividing by the font size.

## 6. Tailwind only

No CSS modules, styled-components or inline `style` (except setting CSS variables). Use the tokens in `globals.css` (`text-subtle`, `bg-secondary`, `border-line-strong`…), not raw hex, unless matching an existing primitive.

## 7. Borders between items

Use `divide-y` / `divide-x` (or the outline pattern already used in `_ui/table.tsx`) for borders between stacked items, not per-item borders.

## 8. SVGs and icons

Icons are SVG files (14×14 viewBox, `currentColor` strokes) imported as components through SVGR: `import Icon from "@/public/assets/images/_common/nav/orders.svg"`. Decorative icons get `aria-hidden`. No icon libraries. Static illustrations that don't need CSS go through `<Image />` by path.

## 9. Motion

Use the shared power easings: `ease-power3-out` / `ease-power3-in` utilities in Tailwind and `ease` from `lib/easings.ts` in Motion.

## 10. No comments

Don't write code comments. Name things so they don't need them.

## 11. Media

Every image, video, Rive and Lottie goes through the `Asset` component in `components/_ui/asset`, typed by `type`, with `width`/`height` as the aspect ratio.

## 12. Scroll restoration

`ScrollToTop` owns scroll restoration. Don't add another.

## 13. Data access

- Server Components read with `createClient()` from `lib/supabase/server.ts`.
- Writes are Server Actions returning `ActionResult` from `lib/action-result.ts`, validated with zod schemas from `lib/`.
- Check access with `requireStaff()` / `requireRole()` from `lib/auth/staff.ts` at the top of every page and action. RLS enforces the same rules in the database; the checks in code exist for good error messages and 404s.
- The service-role client (`lib/supabase/admin.ts`) is only for setup and creating login accounts.

## 14. Money

Money is integer minor units everywhere. Format and parse only with `lib/money.ts`. Tax only with `lib/tax.ts`.

## 15. Touch

Screens used at the counter (Register) use at least 44px targets (`min-h-11`) and no hover-only actions.

## 16. Copy

Labels say what a thing does ("Add store", not "Submit"). Errors say what happened and what to do next. Run the `better-writing` skill on new screens.
```

- [ ] **Step 6: Write the root layout, temporary page and robots**

`app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import ScrollToTop from "@/components/_common/scroll-to-top";
import { SIDEBAR_WIDTH_SCRIPT } from "@/lib/sidebar";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: { default: "POS", template: "%s · POS" },
  description: "Open-source point of sale",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `history.scrollRestoration="manual";${SIDEBAR_WIDTH_SCRIPT}`,
          }}
        />
      </head>
      <body className="relative z-0 font-sans antialiased">
        <ScrollToTop />
        {children}
      </body>
    </html>
  );
}
```

`app/page.tsx` (replaced in Task 10):

```tsx
export default function Home() {
  return (
    <main className="flex h-dvh items-center justify-center">
      <h1>POS</h1>
    </main>
  );
}
```

`app/robots.ts`:

```ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
```

- [ ] **Step 7: Install and verify the build**

```bash
cd /Users/dyeyyyc/Documents/pos && npm install && npm run lint && npm run build
```

Expected: lint passes with no errors; build ends with the route table (`/`, `/robots.txt`). If lint flags unused files copied from the starter (for example `components/_common/filter-menu.tsx` importing something removed), delete that file rather than patching it.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold POS from the sales-crm starter

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Test tooling, money and tax math

**Files:**
- Modify: `package.json` (deps, scripts)
- Create: `vitest.config.ts`, `lib/money.ts`, `lib/money.test.ts`, `lib/tax.ts`, `lib/tax.test.ts`

**Interfaces:**
- Produces:
  - `currencyDigits(currency: string): number`
  - `formatMoney(minor: number, currency: string, locale?: string): string`
  - `parseMoney(input: string, currency: string): number | null`
  - `divRoundHalfEven(numerator: bigint, denominator: bigint): bigint`
  - `type LineInput = { unitPrice: number; quantity: number; discount: number; rateBps: number; pricesIncludeTax: boolean }`
  - `type LineTotals = { net: number; tax: number; gross: number }`
  - `calculateLine(input: LineInput): LineTotals`
  - `sumLines(lines: LineTotals[]): LineTotals`

- [ ] **Step 1: Install dependencies and add scripts**

```bash
cd /Users/dyeyyyc/Documents/pos
npm install @supabase/supabase-js @supabase/ssr zod server-only
npm install -D vitest @playwright/test supabase
npm pkg set scripts.test="vitest run" \
  scripts.test:db="supabase test db" \
  scripts.test:e2e="bash scripts/e2e.sh" \
  scripts.db:start="supabase start" \
  scripts.db:reset="supabase db reset" \
  scripts.db:types="supabase gen types typescript --local > lib/supabase/database.types.ts" \
  scripts.env:local="bash scripts/env-local.sh"
```

- [ ] **Step 2: Add `vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Write the failing money tests** — `lib/money.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { currencyDigits, formatMoney, parseMoney } from "./money";

describe("currencyDigits", () => {
  it("knows minor-unit digits per currency", () => {
    expect(currencyDigits("USD")).toBe(2);
    expect(currencyDigits("JPY")).toBe(0);
    expect(currencyDigits("KWD")).toBe(3);
  });
});

describe("formatMoney", () => {
  it("formats minor units in the store currency", () => {
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
    expect(formatMoney(1500, "JPY", "en-US")).toBe("¥1,500");
    expect(formatMoney(-250, "EUR", "de-DE")).toBe("-2,50 €");
  });
});

describe("parseMoney", () => {
  it("parses dot decimals", () => {
    expect(parseMoney("12.34", "USD")).toBe(1234);
    expect(parseMoney("12", "USD")).toBe(1200);
    expect(parseMoney("12.", "USD")).toBe(1200);
    expect(parseMoney("$1,234.50", "USD")).toBe(123450);
  });

  it("parses comma decimals and dot grouping", () => {
    expect(parseMoney("12,5", "EUR")).toBe(1250);
    expect(parseMoney("1.234,56", "EUR")).toBe(123456);
  });

  it("treats a 3-digit tail as grouping", () => {
    expect(parseMoney("1,234", "USD")).toBe(123400);
    expect(parseMoney("¥1,000", "JPY")).toBe(1000);
  });

  it("handles negatives", () => {
    expect(parseMoney("-3", "USD")).toBe(-300);
    expect(parseMoney("-0", "USD")).toBe(0);
  });

  it("rejects input that isn't an amount", () => {
    expect(parseMoney("", "USD")).toBeNull();
    expect(parseMoney("abc", "USD")).toBeNull();
    expect(parseMoney("1.2.3", "USD")).toBeNull();
    expect(parseMoney("0.001", "USD")).toBeNull();
    expect(parseMoney("12,34", "JPY")).toBeNull();
  });
});
```

- [ ] **Step 4: Run to see it fail**

Run: `npx vitest run lib/money.test.ts`
Expected: FAIL — `Failed to resolve import "./money"`.

- [ ] **Step 5: Implement `lib/money.ts`**

```ts
export function currencyDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2
  );
}

export function formatMoney(
  minor: number,
  currency: string,
  locale?: string,
): string {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 10 ** digits,
  );
}

function validGrouping(whole: string): boolean {
  const groups = whole.split(/[.,]/);
  if (groups.length === 1) return /^\d*$/.test(whole);
  const [first, ...rest] = groups;
  return (
    /^[1-9]\d{0,2}$/.test(first) && rest.every((group) => /^\d{3}$/.test(group))
  );
}

export function parseMoney(input: string, currency: string): number | null {
  const digits = currencyDigits(currency);
  const trimmed = input.trim();
  const negative = trimmed.startsWith("-");
  const body = trimmed.replace(/^-/, "").replace(/[^\d.,]/g, "");
  if (!/\d/.test(body)) return null;

  const lastSeparator = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
  const tail = lastSeparator === -1 ? "" : body.slice(lastSeparator + 1);
  const tailIsDecimal =
    lastSeparator !== -1 && digits > 0 && tail.length <= digits;

  const whole = tailIsDecimal ? body.slice(0, lastSeparator) : body;
  const fraction = tailIsDecimal ? tail : "";
  if (!validGrouping(whole)) return null;

  const value =
    Number(whole.replace(/[.,]/g, "") || "0") * 10 ** digits +
    Number(fraction.padEnd(digits, "0") || "0");
  return negative && value !== 0 ? -value : value;
}
```

- [ ] **Step 6: Run money tests**

Run: `npx vitest run lib/money.test.ts`
Expected: PASS (all). If `"12,34"` for JPY isn't rejected, check that `digits > 0` gates `tailIsDecimal` and that `validGrouping("12,34")` fails because `34` isn't 3 digits.

- [ ] **Step 7: Write the failing tax tests** — `lib/tax.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { calculateLine, divRoundHalfEven, sumLines } from "./tax";

describe("divRoundHalfEven", () => {
  it("rounds halves to even", () => {
    expect(divRoundHalfEven(5n, 2n)).toBe(2n);
    expect(divRoundHalfEven(7n, 2n)).toBe(4n);
  });
  it("rounds other fractions to nearest", () => {
    expect(divRoundHalfEven(1n, 3n)).toBe(0n);
    expect(divRoundHalfEven(2n, 3n)).toBe(1n);
  });
});

const base = { quantity: 1, discount: 0, pricesIncludeTax: false };

describe("calculateLine — tax added at checkout", () => {
  it("rounds a half cent to even", () => {
    expect(calculateLine({ ...base, unitPrice: 1000, rateBps: 825 })).toEqual({
      net: 1000,
      tax: 82,
      gross: 1082,
    });
  });
  it("rounds above half up", () => {
    expect(calculateLine({ ...base, unitPrice: 1100, rateBps: 825 })).toEqual({
      net: 1100,
      tax: 91,
      gross: 1191,
    });
  });
  it("applies quantity and discount before tax", () => {
    expect(
      calculateLine({ ...base, unitPrice: 500, quantity: 3, discount: 100, rateBps: 1000 }),
    ).toEqual({ net: 1400, tax: 140, gross: 1540 });
  });
  it("is zero for a zero rate", () => {
    expect(calculateLine({ ...base, unitPrice: 999, rateBps: 0 })).toEqual({
      net: 999,
      tax: 0,
      gross: 999,
    });
  });
});

describe("calculateLine — prices include tax", () => {
  const inclusive = { ...base, pricesIncludeTax: true };
  it("extracts tax from the price", () => {
    expect(calculateLine({ ...inclusive, unitPrice: 1120, rateBps: 1200 })).toEqual({
      net: 1000,
      tax: 120,
      gross: 1120,
    });
  });
  it("rounds the net amount", () => {
    expect(calculateLine({ ...inclusive, unitPrice: 1000, rateBps: 1200 })).toEqual({
      net: 893,
      tax: 107,
      gross: 1000,
    });
  });
});

describe("calculateLine — bad input", () => {
  it("rejects a discount larger than the line", () => {
    expect(() =>
      calculateLine({ ...base, unitPrice: 100, discount: 200, rateBps: 0 }),
    ).toThrow(RangeError);
  });
  it("rejects non-integer money", () => {
    expect(() => calculateLine({ ...base, unitPrice: 1.5, rateBps: 0 })).toThrow(
      RangeError,
    );
  });
  it("rejects zero quantity", () => {
    expect(() =>
      calculateLine({ ...base, unitPrice: 100, quantity: 0, rateBps: 0 }),
    ).toThrow(RangeError);
  });
});

describe("sumLines", () => {
  it("adds lines field by field", () => {
    expect(
      sumLines([
        { net: 1000, tax: 82, gross: 1082 },
        { net: 500, tax: 41, gross: 541 },
      ]),
    ).toEqual({ net: 1500, tax: 123, gross: 1623 });
  });
  it("is zero for no lines", () => {
    expect(sumLines([])).toEqual({ net: 0, tax: 0, gross: 0 });
  });
});
```

- [ ] **Step 8: Run to see it fail**

Run: `npx vitest run lib/tax.test.ts`
Expected: FAIL — `Failed to resolve import "./tax"`.

- [ ] **Step 9: Implement `lib/tax.ts`**

```ts
export type LineInput = {
  unitPrice: number;
  quantity: number;
  discount: number;
  rateBps: number;
  pricesIncludeTax: boolean;
};

export type LineTotals = { net: number; tax: number; gross: number };

const BPS = 10_000n;

export function divRoundHalfEven(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator - quotient * denominator;
  const twice = remainder * 2n;
  if (twice > denominator) return quotient + 1n;
  if (twice < denominator) return quotient;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

function assertInteger(name: string, value: number, min: number) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} must be an integer ≥ ${min}`);
  }
}

export function calculateLine(input: LineInput): LineTotals {
  assertInteger("unitPrice", input.unitPrice, 0);
  assertInteger("quantity", input.quantity, 1);
  assertInteger("discount", input.discount, 0);
  assertInteger("rateBps", input.rateBps, 0);

  const amount = input.unitPrice * input.quantity - input.discount;
  if (amount < 0) throw new RangeError("discount exceeds line amount");

  const rate = BigInt(input.rateBps);
  if (input.pricesIncludeTax) {
    const net = Number(divRoundHalfEven(BigInt(amount) * BPS, BPS + rate));
    return { net, tax: amount - net, gross: amount };
  }
  const tax = Number(divRoundHalfEven(BigInt(amount) * rate, BPS));
  return { net: amount, tax, gross: amount + tax };
}

export function sumLines(lines: LineTotals[]): LineTotals {
  return lines.reduce(
    (total, line) => ({
      net: total.net + line.net,
      tax: total.tax + line.tax,
      gross: total.gross + line.gross,
    }),
    { net: 0, tax: 0, gross: 0 },
  );
}
```

- [ ] **Step 10: Run all unit tests**

Run: `npm test`
Expected: PASS, 2 files.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "Add money and tax math with tests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Supabase project and schema

Load the `supabase` and `supabase-postgres-best-practices` skills before this task.

**Files:**
- Create: `supabase/config.toml` (from `supabase init`), `supabase/migrations/20261014000001_schema.sql`, `supabase/tests/schema.test.sql`

**Interfaces:**
- Produces: tables and enums below. Enum `public.staff_role` (`owner`,`manager`,`cashier`), `public.order_status`, `public.payment_method`. Schema `private` exists. `staff` has an `email` column (needed by Settings → Staff because `auth.users` isn't readable through RLS).

- [ ] **Step 1: Start Docker and initialise Supabase**

```bash
open -a Docker
until docker info >/dev/null 2>&1; do sleep 2; done
cd /Users/dyeyyyc/Documents/pos && npx supabase init
```

Answer `N` to the editor-settings prompts. Expected: `Finished supabase init.` and a `supabase/` folder.

- [ ] **Step 2: Write the schema migration** — `supabase/migrations/20261014000001_schema.sql`

```sql
create schema if not exists private;

create type public.staff_role as enum ('owner', 'manager', 'cashier');
create type public.order_status as enum ('completed', 'voided', 'refunded', 'partially_refunded');
create type public.payment_method as enum ('cash', 'card', 'other');

create table public.business (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  name text not null check (length(trim(name)) between 1 and 120),
  setup_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  address text check (length(address) <= 300),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  prices_include_tax boolean not null default false,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now()
);

create table public.registers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 60),
  next_receipt_number integer not null default 1 check (next_receipt_number > 0),
  created_at timestamptz not null default now(),
  unique (store_id, name)
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  email text not null,
  role public.staff_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff_stores (
  staff_id uuid not null references public.staff (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_id, store_id)
);
create index staff_stores_store_id_idx on public.staff_stores (store_id);

create table public.tax_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 60),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index tax_classes_one_default_idx on public.tax_classes (is_default) where is_default;

create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  tax_class_id uuid not null references public.tax_classes (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 60),
  rate_bps integer not null check (rate_bps between 0 and 100000),
  created_at timestamptz not null default now(),
  unique (store_id, tax_class_id)
);
create index tax_rates_tax_class_id_idx on public.tax_rates (tax_class_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  tax_class_id uuid not null references public.tax_classes (id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index products_category_id_idx on public.products (category_id);
create index products_tax_class_id_idx on public.products (tax_class_id);

create function private.products_default_tax_class()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tax_class_id is null then
    select id into new.tax_class_id from public.tax_classes where is_default;
  end if;
  return new;
end;
$$;

create trigger products_default_tax_class
before insert on public.products
for each row execute function private.products_default_tax_class();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name text not null default 'Default' check (length(trim(name)) between 1 and 60),
  sku text not null unique check (length(trim(sku)) between 1 and 64),
  barcode text unique check (length(barcode) between 1 and 64),
  price bigint not null check (price >= 0),
  cost bigint check (cost >= 0),
  created_at timestamptz not null default now()
);
create index product_variants_product_id_idx on public.product_variants (product_id);

create table public.stock_levels (
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  store_id uuid not null references public.stores (id) on delete cascade,
  quantity integer not null default 0,
  track boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (variant_id, store_id)
);
create index stock_levels_store_id_idx on public.stock_levels (store_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.register_sessions (
  id uuid primary key default gen_random_uuid(),
  register_id uuid not null references public.registers (id) on delete restrict,
  opened_by uuid not null references public.staff (id) on delete restrict,
  opened_at timestamptz not null default now(),
  opening_cash bigint not null default 0 check (opening_cash >= 0),
  closed_by uuid references public.staff (id) on delete restrict,
  closed_at timestamptz,
  counted_cash bigint check (counted_cash >= 0),
  created_at timestamptz not null default now(),
  check ((closed_at is null) = (closed_by is null))
);
create index register_sessions_register_id_idx on public.register_sessions (register_id);
create index register_sessions_opened_by_idx on public.register_sessions (opened_by);
create index register_sessions_closed_by_idx on public.register_sessions (closed_by);
create unique index register_sessions_one_open_idx on public.register_sessions (register_id) where closed_at is null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete restrict,
  register_id uuid not null references public.registers (id) on delete restrict,
  session_id uuid not null references public.register_sessions (id) on delete restrict,
  staff_id uuid not null references public.staff (id) on delete restrict,
  customer_id uuid references public.customers (id) on delete set null,
  receipt_number integer not null check (receipt_number > 0),
  status public.order_status not null default 'completed',
  subtotal bigint not null check (subtotal >= 0),
  discount_total bigint not null default 0 check (discount_total >= 0),
  tax_total bigint not null check (tax_total >= 0),
  total bigint not null check (total >= 0),
  created_at timestamptz not null default now(),
  unique (register_id, receipt_number)
);
create index orders_store_id_created_at_idx on public.orders (store_id, created_at desc);
create index orders_session_id_idx on public.orders (session_id);
create index orders_staff_id_idx on public.orders (staff_id);
create index orders_customer_id_idx on public.orders (customer_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  name text not null,
  sku text not null,
  unit_price bigint not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  discount bigint not null default 0 check (discount >= 0),
  tax_rate_bps integer not null check (tax_rate_bps >= 0),
  tax bigint not null check (tax >= 0),
  line_total bigint not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index order_items_order_id_idx on public.order_items (order_id);
create index order_items_variant_id_idx on public.order_items (variant_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method public.payment_method not null,
  amount bigint not null check (amount > 0),
  tendered bigint check (tendered >= 0),
  change bigint check (change >= 0),
  reference text,
  created_at timestamptz not null default now(),
  check (method = 'cash' or (tendered is null and change is null))
);
create index payments_order_id_idx on public.payments (order_id);

alter table public.business enable row level security;
alter table public.stores enable row level security;
alter table public.registers enable row level security;
alter table public.staff enable row level security;
alter table public.staff_stores enable row level security;
alter table public.tax_classes enable row level security;
alter table public.tax_rates enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.stock_levels enable row level security;
alter table public.customers enable row level security;
alter table public.register_sessions enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
```

- [ ] **Step 3: Write the failing schema test** — `supabase/tests/schema.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

select tables_are('public', array[
  'business', 'stores', 'registers', 'staff', 'staff_stores', 'tax_classes', 'tax_rates',
  'categories', 'products', 'product_variants', 'stock_levels', 'customers',
  'register_sessions', 'orders', 'order_items', 'payments'
], 'public has exactly the foundation tables');

select col_type_is('public', 'product_variants', 'price', 'bigint', 'variant price is bigint');
select col_type_is('public', 'product_variants', 'cost', 'bigint', 'variant cost is bigint');
select col_type_is('public', 'register_sessions', 'opening_cash', 'bigint', 'opening cash is bigint');
select col_type_is('public', 'register_sessions', 'counted_cash', 'bigint', 'counted cash is bigint');
select col_type_is('public', 'orders', 'subtotal', 'bigint', 'subtotal is bigint');
select col_type_is('public', 'orders', 'discount_total', 'bigint', 'discount total is bigint');
select col_type_is('public', 'orders', 'tax_total', 'bigint', 'tax total is bigint');
select col_type_is('public', 'orders', 'total', 'bigint', 'total is bigint');
select col_type_is('public', 'order_items', 'unit_price', 'bigint', 'unit price is bigint');
select col_type_is('public', 'order_items', 'discount', 'bigint', 'line discount is bigint');
select col_type_is('public', 'order_items', 'tax', 'bigint', 'line tax is bigint');
select col_type_is('public', 'order_items', 'line_total', 'bigint', 'line total is bigint');
select col_type_is('public', 'payments', 'amount', 'bigint', 'payment amount is bigint');
select col_type_is('public', 'payments', 'tendered', 'bigint', 'tendered is bigint');
select col_type_is('public', 'payments', 'change', 'bigint', 'change is bigint');

select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'),
  'RLS is enabled on every public table'
);

select ok(not has_table_privilege('anon', 'public.stores', 'select'), 'anon has no table privileges');

insert into public.business (name) values ('First');
select throws_ok(
  $$insert into public.business (name) values ('Second')$$,
  '23505', null, 'only one business row can exist'
);

insert into public.tax_classes (name, is_default) values ('Standard', true);
select throws_ok(
  $$insert into public.tax_classes (name, is_default) values ('Food', true)$$,
  '23505', null, 'only one default tax class can exist'
);

insert into public.products (name) values ('Tea');
select is(
  (select t.name from public.products p join public.tax_classes t on t.id = p.tax_class_id where p.name = 'Tea'),
  'Standard',
  'a new product gets the default tax class'
);

select throws_ok(
  $$insert into public.product_variants (product_id, sku, price) select id, 'NEG', -1 from public.products where name = 'Tea'$$,
  '23514', null, 'negative prices are rejected'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Start the stack and run the test**

```bash
cd /Users/dyeyyyc/Documents/pos && npx supabase start && npx supabase db reset && npm run test:db
```

Expected: `supabase/tests/schema.test.sql .. ok` and `All tests successful.` (The migration is already in place, so this first run should pass; if you want to see red first, run `npm run test:db` before writing the migration.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add Supabase project and POS schema

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Access rules (RLS)

**Files:**
- Create: `supabase/migrations/20261014000002_access.sql`, `supabase/tests/access.test.sql`

**Interfaces:**
- Consumes: Task 3 tables.
- Produces: `private.staff_id() → uuid`, `private.staff_role() → public.staff_role`, `private.can_access_store(uuid) → boolean`, `private.can_access_register(uuid) → boolean`, `private.can_access_order(uuid) → boolean`; policies per the spec's access table.

- [ ] **Step 1: Write the failing access test** — `supabase/tests/access.test.sql`

Fixed IDs: users `…a1` owner, `…a2` manager (Store A), `…a3` cashier (Store A), `…a4` cashier (Store B), `…a5` inactive, `…a6` signed-in with no staff row. Stores `…b1` A, `…b2` B.

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'acc-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a2', 'acc-manager@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a3', 'acc-cashier@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a4', 'acc-cashier-b@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a5', 'acc-inactive@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a6', 'acc-nostaff@test', 'authenticated', 'authenticated');

insert into public.business (name, setup_completed_at) values ('Test Shop', now());
insert into public.stores (id, name, currency) values
  ('00000000-0000-0000-0000-0000000000b1', 'Store A', 'USD'),
  ('00000000-0000-0000-0000-0000000000b2', 'Store B', 'USD');
insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Owner', 'acc-owner@test', 'owner', true),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', 'Manager', 'acc-manager@test', 'manager', true),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a3', 'Cashier', 'acc-cashier@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a4', 'Cashier B', 'acc-cashier-b@test', 'cashier', true),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000a5', 'Gone', 'acc-inactive@test', 'cashier', false);
insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b1');
insert into public.registers (id, store_id, name) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'R1'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', 'R1'),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b1', 'R2');
insert into public.tax_classes (id, name, is_default) values
  ('00000000-0000-0000-0000-0000000000e1', 'Standard', true);
insert into public.tax_rates (store_id, tax_class_id, name, rate_bps) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 'Tax', 825),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e1', 'Tax', 700);
insert into public.categories (id, name) values ('00000000-0000-0000-0000-0000000000f1', 'Drinks');
insert into public.products (id, category_id, name) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'Tea');
insert into public.product_variants (id, product_id, sku, price) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f2', 'TEA', 300);
insert into public.stock_levels (variant_id, store_id, quantity) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000b1', 10),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000b2', 5);
insert into public.register_sessions (id, register_id, opened_by) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c3'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c4');
insert into public.orders (id, store_id, register_id, session_id, staff_id, receipt_number, subtotal, tax_total, total) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c3', 1, 300, 25, 325),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000c4', 1, 300, 21, 321);
insert into public.order_items (order_id, variant_id, name, sku, unit_price, quantity, tax_rate_bps, tax, line_total) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 1, 825, 25, 325),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000f3', 'Tea', 'TEA', 300, 1, 700, 21, 321);
insert into public.payments (order_id, method, amount) values
  ('00000000-0000-0000-0000-000000000021', 'card', 325),
  ('00000000-0000-0000-0000-000000000022', 'card', 321);
insert into public.customers (id, name) values ('00000000-0000-0000-0000-000000000031', 'Ana');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is((select count(*) from public.stores), 1::bigint, 'cashier sees only their store');
select is((select count(*) from public.staff), 1::bigint, 'cashier sees only their own staff row');
select is((select count(*) from public.products), 1::bigint, 'cashier can read the catalog');
select is((select count(*) from public.business), 1::bigint, 'cashier can read the business');
select is((select count(*) from public.stock_levels), 1::bigint, 'cashier sees stock only for their store');
select is((select count(*) from public.orders), 1::bigint, 'cashier sees orders only for their store');
select is((select count(*) from public.order_items), 1::bigint, 'cashier sees order items only for their store');
select is((select count(*) from public.payments), 1::bigint, 'cashier sees payments only for their store');
select throws_ok($$insert into public.products (name) values ('Coffee')$$, '42501', null, 'cashier cannot add products');
select is((with u as (update public.product_variants set price = 1 returning 1) select count(*) from u), 0::bigint, 'cashier cannot change prices');
select is((with u as (update public.orders set status = 'voided' returning 1) select count(*) from u), 0::bigint, 'cashier cannot void orders');
select is((with u as (update public.stores set name = 'X' returning 1) select count(*) from u), 0::bigint, 'cashier cannot edit stores');
select throws_ok(
  $$insert into public.register_sessions (register_id, opened_by) values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c3')$$,
  '42501', null, 'cashier cannot open a register in another store'
);
select lives_ok(
  $$insert into public.register_sessions (register_id, opened_by) values ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c3')$$,
  'cashier can open a register in their store'
);
select lives_ok($$insert into public.customers (name) values ('Ben')$$, 'cashier can add customers');
select is((with d as (delete from public.customers returning 1) select count(*) from d), 0::bigint, 'cashier cannot delete customers');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is((select count(*) from public.staff), 3::bigint, 'manager sees staff in their store');
select lives_ok($$insert into public.products (name) values ('Coffee')$$, 'manager can add products');
select is((with u as (update public.orders set status = 'voided' where id = '00000000-0000-0000-0000-000000000021' returning 1) select count(*) from u), 1::bigint, 'manager can void an order in their store');
select is((with u as (update public.orders set status = 'voided' where id = '00000000-0000-0000-0000-000000000022' returning 1) select count(*) from u), 0::bigint, 'manager cannot void another store''s order');
select throws_ok(
  $$insert into public.staff (user_id, name, email, role) values ('00000000-0000-0000-0000-0000000000a6', 'X', 'x@test', 'cashier')$$,
  '42501', null, 'manager cannot add staff'
);
select is((with u as (update public.tax_rates set rate_bps = 1 returning 1) select count(*) from u), 0::bigint, 'manager cannot change tax rates');
select is((with u as (update public.stock_levels set quantity = 9 where store_id = '00000000-0000-0000-0000-0000000000b1' returning 1) select count(*) from u), 1::bigint, 'manager can adjust stock in their store');
select is((with u as (update public.stock_levels set quantity = 9 where store_id = '00000000-0000-0000-0000-0000000000b2' returning 1) select count(*) from u), 0::bigint, 'manager cannot adjust stock in another store');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is((select count(*) from public.stores), 2::bigint, 'owner sees every store');
select is((select count(*) from public.orders), 2::bigint, 'owner sees every order');
select lives_ok($$insert into public.stores (name, currency) values ('Store C', 'EUR')$$, 'owner can add stores');
select is((with u as (update public.staff set role = 'manager' where id = '00000000-0000-0000-0000-0000000000c3' returning 1) select count(*) from u), 1::bigint, 'owner can change staff roles');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a4","role":"authenticated"}';

select is((select count(*) from public.orders where id = '00000000-0000-0000-0000-000000000021'), 0::bigint, 'a cashier in store B cannot see store A orders');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a5","role":"authenticated"}';

select is((select count(*) from public.products), 0::bigint, 'inactive staff cannot read the catalog');
select is((select count(*) from public.stores), 0::bigint, 'inactive staff cannot read stores');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a6","role":"authenticated"}';

select is((select count(*) from public.products), 0::bigint, 'a login without a staff row cannot read the catalog');
select throws_ok($$insert into public.customers (name) values ('Eve')$$, '42501', null, 'a login without a staff row cannot add customers');

reset role;
set local role anon;
select throws_ok($$select * from public.products$$, '42501', null, 'anonymous visitors cannot read tables');

reset role;
select * from finish();
rollback;
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:db`
Expected: `access.test.sql` FAILS (with RLS on and no policies, every read returns 0 rows: "cashier sees only their store … have: 0, want: 1").

- [ ] **Step 3: Write the access migration** — `supabase/migrations/20261014000002_access.sql`

```sql
create function private.staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.staff s
  where s.user_id = (select auth.uid()) and s.active
$$;

create function private.staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from public.staff s
  where s.user_id = (select auth.uid()) and s.active
$$;

create function private.can_access_store(p_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = (select auth.uid())
      and s.active
      and (
        s.role = 'owner'
        or exists (
          select 1 from public.staff_stores ss
          where ss.staff_id = s.id and ss.store_id = p_store_id
        )
      )
  )
$$;

create function private.can_access_register(p_register_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.registers r
    where r.id = p_register_id and private.can_access_store(r.store_id)
  )
$$;

create function private.can_access_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and private.can_access_store(o.store_id)
  )
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

create policy "staff read business" on public.business
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "owner manages business" on public.business
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their stores" on public.stores
  for select to authenticated using (private.can_access_store(id));
create policy "owner manages stores" on public.stores
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their registers" on public.registers
  for select to authenticated using (private.can_access_store(store_id));
create policy "owner manages registers" on public.registers
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read visible staff" on public.staff
  for select to authenticated using (
    (user_id = (select auth.uid()) and active)
    or (select private.staff_role()) = 'owner'
    or (
      (select private.staff_role()) = 'manager'
      and exists (
        select 1 from public.staff_stores ss
        where ss.staff_id = staff.id and private.can_access_store(ss.store_id)
      )
    )
  );
create policy "owner manages staff" on public.staff
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read visible assignments" on public.staff_stores
  for select to authenticated using (
    staff_id = (select private.staff_id())
    or (select private.staff_role()) = 'owner'
    or ((select private.staff_role()) = 'manager' and private.can_access_store(store_id))
  );
create policy "owner manages assignments" on public.staff_stores
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read tax classes" on public.tax_classes
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "owner manages tax classes" on public.tax_classes
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their tax rates" on public.tax_rates
  for select to authenticated using (private.can_access_store(store_id));
create policy "owner manages tax rates" on public.tax_rates
  for all to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read categories" on public.categories
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage categories" on public.categories
  for all to authenticated using ((select private.staff_role()) in ('owner', 'manager'));

create policy "staff read products" on public.products
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage products" on public.products
  for all to authenticated using ((select private.staff_role()) in ('owner', 'manager'));

create policy "staff read variants" on public.product_variants
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "managers manage variants" on public.product_variants
  for all to authenticated using ((select private.staff_role()) in ('owner', 'manager'));

create policy "staff read their stock" on public.stock_levels
  for select to authenticated using (private.can_access_store(store_id));
create policy "managers manage their stock" on public.stock_levels
  for all to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id)
  );

create policy "staff read customers" on public.customers
  for select to authenticated using ((select private.staff_id()) is not null);
create policy "staff add customers" on public.customers
  for insert to authenticated with check ((select private.staff_id()) is not null);
create policy "staff edit customers" on public.customers
  for update to authenticated using ((select private.staff_id()) is not null);
create policy "managers delete customers" on public.customers
  for delete to authenticated using ((select private.staff_role()) in ('owner', 'manager'));

create policy "staff read their sessions" on public.register_sessions
  for select to authenticated using (private.can_access_register(register_id));
create policy "staff open sessions in their stores" on public.register_sessions
  for insert to authenticated with check (
    private.can_access_register(register_id) and opened_by = (select private.staff_id())
  );
create policy "managers edit sessions" on public.register_sessions
  for update to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_register(register_id)
  );
create policy "owner deletes sessions" on public.register_sessions
  for delete to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their orders" on public.orders
  for select to authenticated using (private.can_access_store(store_id));
create policy "staff create orders in their stores" on public.orders
  for insert to authenticated with check (
    private.can_access_store(store_id) and staff_id = (select private.staff_id())
  );
create policy "managers edit orders" on public.orders
  for update to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_store(store_id)
  );
create policy "owner deletes orders" on public.orders
  for delete to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their order items" on public.order_items
  for select to authenticated using (private.can_access_order(order_id));
create policy "staff add order items" on public.order_items
  for insert to authenticated with check (private.can_access_order(order_id));
create policy "managers edit order items" on public.order_items
  for update to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_order(order_id)
  );
create policy "owner deletes order items" on public.order_items
  for delete to authenticated using ((select private.staff_role()) = 'owner');

create policy "staff read their payments" on public.payments
  for select to authenticated using (private.can_access_order(order_id));
create policy "staff add payments" on public.payments
  for insert to authenticated with check (private.can_access_order(order_id));
create policy "managers edit payments" on public.payments
  for update to authenticated using (
    (select private.staff_role()) in ('owner', 'manager') and private.can_access_order(order_id)
  );
create policy "owner deletes payments" on public.payments
  for delete to authenticated using ((select private.staff_role()) = 'owner');
```

- [ ] **Step 4: Apply and run**

```bash
npx supabase db reset && npm run test:db
```

Expected: `access.test.sql .. ok`, `schema.test.sql .. ok`. Then run `npx supabase db advisors` (or `npx supabase db lint`) and fix any security warnings it raises.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add role-based access rules with tests

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Setup functions

**Files:**
- Create: `supabase/migrations/20261014000003_setup.sql`, `supabase/tests/setup.test.sql`

**Interfaces:**
- Produces:
  - `public.setup_status() → boolean` (callable by `anon`, `authenticated`, `service_role`)
  - `public.complete_setup(p_user_id uuid, p_owner_name text, p_owner_email text, p_business_name text, p_store_name text, p_currency text, p_prices_include_tax boolean, p_tax_rate_bps integer, p_timezone text) → uuid` (store id; `service_role` only; raises `P0001 'setup already completed'` on a second run)

- [ ] **Step 1: Write the failing test** — `supabase/tests/setup.test.sql`

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

truncate table public.business, public.stores, public.staff, public.tax_classes,
  public.categories, public.products, public.customers restart identity cascade;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000f1', 'setup-owner@test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000f2', 'setup-second@test', 'authenticated', 'authenticated');

set local role anon;
select is(public.setup_status(), false, 'setup is not complete on an empty database');
select throws_ok(
  $$select public.complete_setup('00000000-0000-0000-0000-0000000000f1', 'Owner', 'setup-owner@test', 'Shop', 'Main', 'USD', false, 825, 'UTC')$$,
  '42501', null, 'anonymous visitors cannot run setup'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select public.complete_setup('00000000-0000-0000-0000-0000000000f1', 'Owner', 'setup-owner@test', 'Shop', 'Main', 'USD', false, 825, 'UTC')$$,
  '42501', null, 'signed-in users cannot run setup'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.complete_setup('00000000-0000-0000-0000-0000000000f1', 'Owner', 'setup-owner@test', 'Shop', 'Main', 'USD', false, 825, 'UTC')$$,
  'the server can complete setup'
);
reset role;

select is((select role::text from public.staff where user_id = '00000000-0000-0000-0000-0000000000f1'), 'owner', 'the owner staff row exists');
select is((select rate_bps from public.tax_rates), 825, 'the store has the standard tax rate');
select is((select count(*) from public.registers), 1::bigint, 'the first register exists');

set local role service_role;
select throws_ok(
  $$select public.complete_setup('00000000-0000-0000-0000-0000000000f2', 'Other', 'setup-second@test', 'Shop 2', 'Second', 'USD', false, 0, 'UTC')$$,
  'P0001', 'setup already completed', 'setup cannot run twice'
);
reset role;

set local role anon;
select is(public.setup_status(), true, 'setup reports complete');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run test:db`
Expected: `setup.test.sql` FAILS with `function public.setup_status() does not exist`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/20261014000003_setup.sql`

```sql
create function public.setup_status()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.business where setup_completed_at is not null)
$$;

revoke execute on function public.setup_status() from public;
grant execute on function public.setup_status() to anon, authenticated, service_role;

create function public.complete_setup(
  p_user_id uuid,
  p_owner_name text,
  p_owner_email text,
  p_business_name text,
  p_store_name text,
  p_currency text,
  p_prices_include_tax boolean,
  p_tax_rate_bps integer,
  p_timezone text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid;
  v_tax_class_id uuid;
begin
  if exists (select 1 from public.business) then
    raise exception 'setup already completed' using errcode = 'P0001';
  end if;

  insert into public.business (name, setup_completed_at)
  values (p_business_name, now());

  insert into public.stores (name, currency, prices_include_tax, timezone)
  values (p_store_name, p_currency, p_prices_include_tax, p_timezone)
  returning id into v_store_id;

  insert into public.tax_classes (name, is_default)
  values ('Standard', true)
  returning id into v_tax_class_id;

  insert into public.tax_rates (store_id, tax_class_id, name, rate_bps)
  values (v_store_id, v_tax_class_id, 'Standard', p_tax_rate_bps);

  insert into public.registers (store_id, name)
  values (v_store_id, 'Register 1');

  insert into public.staff (user_id, name, email, role)
  values (p_user_id, p_owner_name, p_owner_email, 'owner');

  return v_store_id;
end;
$$;

revoke execute on function public.complete_setup(uuid, text, text, text, text, text, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.complete_setup(uuid, text, text, text, text, text, boolean, integer, text) to service_role;
```

- [ ] **Step 4: Apply and run**

```bash
npx supabase db reset && npm run test:db
```

Expected: all three test files `ok`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add one-time setup functions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Seed data and local env

**Files:**
- Create: `supabase/seed.sql`, `scripts/env-local.sh`, `.env.example`

**Interfaces:**
- Produces: demo data — business "Demo Shop" (setup complete); stores "Main Street" (`…0101`) and "Airport Kiosk" (`…0102`), both USD, tax added at checkout; tax classes Standard (8.25%) and Exempt (0%); registers; users per Global Constraints (manager assigned to both stores, cashier and inactive to Main Street); 6 categories, 30 products; stock; 10 customers. `.env.local` written by `npm run env:local`.

- [ ] **Step 1: Write `supabase/seed.sql`**

```sql
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('password', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(),
  '', '', '', ''
from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, 'owner@demo.test', 'Olivia Owner'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'manager@demo.test', 'Marco Manager'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'cashier@demo.test', 'Casey Cashier'),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'inactive@demo.test', 'Iris Inactive')
) as u (id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.email like '%@demo.test';

insert into public.business (name, setup_completed_at) values ('Demo Shop', now());

insert into public.stores (id, name, address, currency, prices_include_tax, timezone) values
  ('00000000-0000-0000-0000-000000000101', 'Main Street', '12 Main Street', 'USD', false, 'America/Chicago'),
  ('00000000-0000-0000-0000-000000000102', 'Airport Kiosk', 'Terminal B', 'USD', false, 'America/Chicago');

insert into public.registers (store_id, name) values
  ('00000000-0000-0000-0000-000000000101', 'Counter 1'),
  ('00000000-0000-0000-0000-000000000101', 'Counter 2'),
  ('00000000-0000-0000-0000-000000000102', 'Kiosk');

insert into public.staff (id, user_id, name, email, role, active) values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001', 'Olivia Owner', 'owner@demo.test', 'owner', true),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000002', 'Marco Manager', 'manager@demo.test', 'manager', true),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000003', 'Casey Cashier', 'cashier@demo.test', 'cashier', true),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000004', 'Iris Inactive', 'inactive@demo.test', 'cashier', false);

insert into public.staff_stores (staff_id, store_id) values
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000101');

insert into public.tax_classes (name, is_default) values ('Standard', true), ('Exempt', false);

insert into public.tax_rates (store_id, tax_class_id, name, rate_bps)
select s.id, t.id, case when t.name = 'Standard' then 'Sales tax' else 'Exempt' end,
  case when t.name = 'Standard' then 825 else 0 end
from public.stores s cross join public.tax_classes t;

with catalog (category, sort_order, product, variant, price, cost, tax_class) as (values
  ('Coffee', 1, 'Espresso', 'Default', 300, 80, 'Standard'),
  ('Coffee', 1, 'Americano', 'Default', 350, 90, 'Standard'),
  ('Coffee', 1, 'Latte', 'Small', 420, 110, 'Standard'),
  ('Coffee', 1, 'Latte', 'Large', 520, 140, 'Standard'),
  ('Coffee', 1, 'Cappuccino', 'Small', 420, 110, 'Standard'),
  ('Coffee', 1, 'Cappuccino', 'Large', 520, 140, 'Standard'),
  ('Coffee', 1, 'Cold Brew', 'Default', 480, 120, 'Standard'),
  ('Tea', 2, 'Green Tea', 'Default', 320, 60, 'Standard'),
  ('Tea', 2, 'Chai Latte', 'Small', 450, 120, 'Standard'),
  ('Tea', 2, 'Chai Latte', 'Large', 550, 150, 'Standard'),
  ('Tea', 2, 'Iced Tea', 'Default', 350, 70, 'Standard'),
  ('Tea', 2, 'Matcha Latte', 'Default', 520, 160, 'Standard'),
  ('Bakery', 3, 'Croissant', 'Default', 350, 120, 'Standard'),
  ('Bakery', 3, 'Pain au Chocolat', 'Default', 380, 130, 'Standard'),
  ('Bakery', 3, 'Blueberry Muffin', 'Default', 330, 110, 'Standard'),
  ('Bakery', 3, 'Banana Bread', 'Default', 360, 100, 'Standard'),
  ('Bakery', 3, 'Cinnamon Roll', 'Default', 400, 130, 'Standard'),
  ('Bakery', 3, 'Bagel', 'Default', 300, 90, 'Standard'),
  ('Snacks', 4, 'Granola Bar', 'Default', 250, 90, 'Standard'),
  ('Snacks', 4, 'Trail Mix', 'Default', 450, 180, 'Standard'),
  ('Snacks', 4, 'Dark Chocolate', 'Default', 300, 120, 'Standard'),
  ('Snacks', 4, 'Potato Chips', 'Default', 220, 80, 'Standard'),
  ('Snacks', 4, 'Cookies', 'Default', 280, 90, 'Standard'),
  ('Snacks', 4, 'Protein Bar', 'Default', 320, 140, 'Standard'),
  ('Merch', 5, 'T-Shirt', 'S', 2500, 900, 'Standard'),
  ('Merch', 5, 'T-Shirt', 'M', 2500, 900, 'Standard'),
  ('Merch', 5, 'T-Shirt', 'L', 2500, 900, 'Standard'),
  ('Merch', 5, 'Tote Bag', 'Default', 1800, 600, 'Standard'),
  ('Merch', 5, 'Mug', 'Default', 1500, 500, 'Standard'),
  ('Merch', 5, 'Reusable Cup', 'Default', 1200, 400, 'Standard'),
  ('Merch', 5, 'Cap', 'Default', 2200, 800, 'Standard'),
  ('Grocery', 6, 'Coffee Beans 250g', 'Whole bean', 1600, 700, 'Exempt'),
  ('Grocery', 6, 'Coffee Beans 250g', 'Ground', 1600, 700, 'Exempt'),
  ('Grocery', 6, 'Oat Milk 1L', 'Default', 450, 250, 'Exempt'),
  ('Grocery', 6, 'Honey Jar', 'Default', 900, 400, 'Exempt'),
  ('Grocery', 6, 'Loose Tea 100g', 'Default', 1100, 450, 'Exempt')
),
cats as (
  insert into public.categories (name, sort_order)
  select distinct category, sort_order from catalog
  returning id, name
),
prods as (
  insert into public.products (category_id, name, tax_class_id)
  select distinct c.id, k.product, t.id
  from catalog k
  join cats c on c.name = k.category
  join public.tax_classes t on t.name = k.tax_class
  returning id, name
)
insert into public.product_variants (product_id, name, sku, barcode, price, cost)
select p.id, k.variant,
  upper(regexp_replace(k.product || '-' || k.variant, '[^A-Za-z0-9]+', '-', 'g')),
  '2' || lpad((row_number() over (order by k.product, k.variant))::text, 12, '0'),
  k.price, k.cost
from catalog k
join prods p on p.name = k.product;

insert into public.stock_levels (variant_id, store_id, quantity)
select v.id, s.id, (abs(hashtext(v.sku || s.name)) % 40) + 3
from public.product_variants v cross join public.stores s;

insert into public.customers (name, email, phone) values
  ('Ana Reyes', 'ana@example.com', '+1 555 0101'),
  ('Ben Okafor', 'ben@example.com', '+1 555 0102'),
  ('Chloé Martin', 'chloe@example.com', null),
  ('Dev Patel', 'dev@example.com', '+1 555 0104'),
  ('Elif Kaya', null, '+1 555 0105'),
  ('Finn Larsen', 'finn@example.com', null),
  ('Grace Liu', 'grace@example.com', '+1 555 0107'),
  ('Hiro Tanaka', 'hiro@example.com', null),
  ('Isla Brown', 'isla@example.com', '+1 555 0109'),
  ('Jonas Weber', null, null);
```

- [ ] **Step 2: Write `scripts/env-local.sh` and `.env.example`**

`scripts/env-local.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
eval "$(npx supabase status -o env)"
cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY:-$ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SECRET_KEY:-$SERVICE_ROLE_KEY}
EOF
echo "Wrote .env.local for ${API_URL}"
```

`.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Add `!.env.example` under the `.env*` line in `.gitignore` so the example is committed.

- [ ] **Step 3: Reset with seed, write env, and verify a seeded login**

```bash
npx supabase db reset && npm run env:local && npm run test:db
source .env.local
curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"owner@demo.test","password":"password"}' | grep -o '"access_token"' 
docker exec supabase_db_pos psql -U postgres -tAc \
  "select (select count(*) from public.products), (select count(*) from public.product_variants), (select count(*) from public.stock_levels)"
```

Expected: tests still `ok` (they truncate inside a rolled-back transaction); `"access_token"`; `30|36|72`. (`supabase_db_pos` is the container name for project id `pos` in `supabase/config.toml`; check `docker ps` if it differs.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Add demo seed data and local env script

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Supabase clients, auth helpers and proxy

**Files:**
- Create: `lib/env.ts`, `lib/supabase/database.types.ts` (generated), `lib/supabase/server.ts`, `lib/supabase/browser.ts`, `lib/supabase/admin.ts`, `lib/auth/roles.ts`, `lib/auth/roles.test.ts`, `lib/auth/routes.ts`, `lib/auth/routes.test.ts`, `lib/auth/pick-store.ts`, `lib/auth/pick-store.test.ts`, `lib/auth/staff.ts`, `proxy.ts`

**Interfaces:**
- Produces:
  - `type StaffRole = "cashier" | "manager" | "owner"`; `STAFF_ROLES`; `roleAtLeast(role: StaffRole, min: StaffRole): boolean`
  - `PUBLIC_PATHS`; `type RouteDecision = { type: "next" } | { type: "redirect"; to: string }`; `decideRoute(input: { pathname: string; search: string; signedIn: boolean; setupComplete: boolean }): RouteDecision`; `safeNext(next: string | null | undefined): string`
  - `type StaffStore = { id: string; name: string; currency: string; pricesIncludeTax: boolean }`; `pickStore(stores: StaffStore[], preferredId: string | undefined): StaffStore | null`
  - `type CurrentStaff = { id: string; name: string; role: StaffRole; stores: StaffStore[] }`; `getCurrentStaff(): Promise<CurrentStaff | null>`; `requireStaff(): Promise<CurrentStaff>`; `requireRole(min: StaffRole): Promise<CurrentStaff>`; `getCurrentStore(staff: CurrentStaff): Promise<StaffStore | null>`; `STORE_COOKIE = "pos-store"`
  - `createClient()` (server, async), `createBrowserSupabase()`, `createAdminClient()`

- [ ] **Step 1: Write failing tests for roles, routes and store picking**

`lib/auth/roles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { roleAtLeast } from "./roles";

describe("roleAtLeast", () => {
  it("orders roles cashier < manager < owner", () => {
    expect(roleAtLeast("owner", "manager")).toBe(true);
    expect(roleAtLeast("manager", "manager")).toBe(true);
    expect(roleAtLeast("cashier", "manager")).toBe(false);
    expect(roleAtLeast("manager", "owner")).toBe(false);
  });
});
```

`lib/auth/routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideRoute, safeNext } from "./routes";

const ready = { search: "", signedIn: true, setupComplete: true };

describe("decideRoute", () => {
  it("sends everything to /setup until setup is complete", () => {
    expect(decideRoute({ ...ready, pathname: "/orders", setupComplete: false })).toEqual({ type: "redirect", to: "/setup" });
    expect(decideRoute({ ...ready, pathname: "/setup", setupComplete: false, signedIn: false })).toEqual({ type: "next" });
  });

  it("lets /setup through after setup so the page can 404", () => {
    expect(decideRoute({ ...ready, pathname: "/setup" })).toEqual({ type: "next" });
  });

  it("sends signed-out visitors to login with a return path", () => {
    expect(decideRoute({ ...ready, signedIn: false, pathname: "/orders", search: "?page=2" })).toEqual({
      type: "redirect",
      to: "/login?next=%2Forders%3Fpage%3D2",
    });
    expect(decideRoute({ ...ready, signedIn: false, pathname: "/" })).toEqual({ type: "redirect", to: "/login" });
  });

  it("lets signed-out visitors reach public pages", () => {
    for (const pathname of ["/login", "/forgot-password", "/reset-password", "/auth/confirm", "/auth/signout"]) {
      expect(decideRoute({ ...ready, signedIn: false, pathname })).toEqual({ type: "next" });
    }
  });

  it("sends signed-in staff away from the login page", () => {
    expect(decideRoute({ ...ready, pathname: "/login" })).toEqual({ type: "redirect", to: "/register" });
  });

  it("does not treat lookalike paths as public", () => {
    expect(decideRoute({ ...ready, signedIn: false, pathname: "/login-help" })).toEqual({
      type: "redirect",
      to: "/login?next=%2Flogin-help",
    });
  });
});

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/orders?page=2")).toBe("/orders?page=2");
  });
  it("rejects anything that could leave the site", () => {
    expect(safeNext("//evil.test")).toBe("/register");
    expect(safeNext("/\\evil.test")).toBe("/register");
    expect(safeNext("https://evil.test")).toBe("/register");
    expect(safeNext("orders")).toBe("/register");
    expect(safeNext(null)).toBe("/register");
    expect(safeNext(undefined)).toBe("/register");
  });
});
```

`lib/auth/pick-store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickStore } from "./pick-store";

const main = { id: "a", name: "Main", currency: "USD", pricesIncludeTax: false };
const kiosk = { id: "b", name: "Kiosk", currency: "USD", pricesIncludeTax: false };

describe("pickStore", () => {
  it("uses the preferred store when the staff member can access it", () => {
    expect(pickStore([main, kiosk], "b")).toBe(kiosk);
  });
  it("falls back to the first store when the preference is no longer allowed", () => {
    expect(pickStore([main, kiosk], "gone")).toBe(main);
  });
  it("falls back to the first store with no preference", () => {
    expect(pickStore([main, kiosk], undefined)).toBe(main);
  });
  it("returns null when the staff member has no stores", () => {
    expect(pickStore([], "a")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./roles`, `./routes`, `./pick-store`.

- [ ] **Step 3: Implement the pure modules**

`lib/auth/roles.ts`:

```ts
export const STAFF_ROLES = ["cashier", "manager", "owner"] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export function roleAtLeast(role: StaffRole, min: StaffRole): boolean {
  return STAFF_ROLES.indexOf(role) >= STAFF_ROLES.indexOf(min);
}
```

`lib/auth/routes.ts`:

```ts
export const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/auth"] as const;

export const HOME_PATH = "/register";

export type RouteDecision = { type: "next" } | { type: "redirect"; to: string };

type RouteInput = {
  pathname: string;
  search: string;
  signedIn: boolean;
  setupComplete: boolean;
};

function matches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function decideRoute({ pathname, search, signedIn, setupComplete }: RouteInput): RouteDecision {
  if (!setupComplete) {
    return matches(pathname, "/setup") ? { type: "next" } : { type: "redirect", to: "/setup" };
  }
  if (matches(pathname, "/setup")) return { type: "next" };

  const isPublic = PUBLIC_PATHS.some((base) => matches(pathname, base));
  if (!signedIn) {
    if (isPublic) return { type: "next" };
    if (pathname === "/") return { type: "redirect", to: "/login" };
    return { type: "redirect", to: `/login?next=${encodeURIComponent(pathname + search)}` };
  }
  if (matches(pathname, "/login")) return { type: "redirect", to: HOME_PATH };
  return { type: "next" };
}

export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return HOME_PATH;
  }
  return next;
}
```

`lib/auth/pick-store.ts`:

```ts
export type StaffStore = {
  id: string;
  name: string;
  currency: string;
  pricesIncludeTax: boolean;
};

export function pickStore(stores: StaffStore[], preferredId: string | undefined): StaffStore | null {
  return stores.find((store) => store.id === preferredId) ?? stores[0] ?? null;
}
```

- [ ] **Step 4: Run unit tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Generate database types**

```bash
npm run db:types && head -5 lib/supabase/database.types.ts
```

Expected: file begins with `export type Json =`.

- [ ] **Step 6: Write env and Supabase clients**

`lib/env.ts`:

```ts
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}. Run \`npm run env:local\` or copy .env.example to .env.local.`);
  return value;
}

export const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
```

`lib/supabase/server.ts`:

```ts
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });
}
```

`lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import type { Database } from "./database.types";

export function createBrowserSupabase() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}
```

`lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";
import type { Database } from "./database.types";

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient<Database>(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 7: Write the staff/session helpers** — `lib/auth/staff.ts`

```ts
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleAtLeast, type StaffRole } from "./roles";
import { pickStore, type StaffStore } from "./pick-store";

export const STORE_COOKIE = "pos-store";

export type CurrentStaff = {
  id: string;
  name: string;
  role: StaffRole;
  stores: StaffStore[];
};

export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: staff } = await supabase
    .from("staff")
    .select("id, name, role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!staff) return null;

  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, currency, prices_include_tax")
    .order("name");

  return {
    id: staff.id,
    name: staff.name,
    role: staff.role,
    stores: (stores ?? []).map((store) => ({
      id: store.id,
      name: store.name,
      currency: store.currency,
      pricesIncludeTax: store.prices_include_tax,
    })),
  };
});

export async function requireStaff(): Promise<CurrentStaff> {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/auth/signout?error=no-access");
  return staff;
}

export async function requireRole(min: StaffRole): Promise<CurrentStaff> {
  const staff = await requireStaff();
  if (!roleAtLeast(staff.role, min)) notFound();
  return staff;
}

export async function getCurrentStore(staff: CurrentStaff): Promise<StaffStore | null> {
  const cookieStore = await cookies();
  return pickStore(staff.stores, cookieStore.get(STORE_COOKIE)?.value);
}
```

- [ ] **Step 8: Write `proxy.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { decideRoute } from "@/lib/auth/routes";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

const SETUP_COOKIE = "pos-setup-complete";
const NO_STORE_HEADERS = ["cache-control", "expires", "pragma"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  let setupComplete = request.cookies.get(SETUP_COOKIE)?.value === "1";
  if (!setupComplete) {
    const { data: status } = await supabase.rpc("setup_status");
    setupComplete = status === true;
  }

  const decision = decideRoute({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    signedIn,
    setupComplete,
  });

  let result = response;
  if (decision.type === "redirect") {
    result = NextResponse.redirect(new URL(decision.to, request.url));
    response.cookies.getAll().forEach((cookie) => result.cookies.set(cookie));
    NO_STORE_HEADERS.forEach((header) => {
      const value = response.headers.get(header);
      if (value) result.headers.set(header, value);
    });
  }

  if (setupComplete) {
    result.cookies.set(SETUP_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return result;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|woff2)$).*)",
  ],
};
```

- [ ] **Step 9: Verify routing against the running stack**

```bash
npm run build
npx next start -p 3100 & SERVER=$!
sleep 5
curl -sI http://localhost:3100/orders | grep -i '^location'
curl -sI http://localhost:3100/ | grep -i '^location'
kill $SERVER
```

Expected: `location: /login?next=%2Forders` and `location: /login` (setup is complete in the seed, nobody is signed in).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Add Supabase clients, staff helpers and auth proxy

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Login, password reset and sign-out

**Files:**
- Create: `lib/action-result.ts`, `lib/action-result.test.ts`, `lib/auth/schemas.ts`, `lib/auth/actions.ts`, `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx`, `app/auth/confirm/route.ts`, `app/auth/signout/route.ts`, `components/auth/auth-card.tsx`, `components/auth/login-form.tsx`, `components/auth/forgot-password-form.tsx`, `components/auth/reset-password-form.tsx`, `components/_common/form-message.tsx`

**Interfaces:**
- Consumes: `createClient`, `safeNext`, `HOME_PATH`.
- Produces:
  - `type ActionResult = { ok: true; message?: string } | { ok: false; error?: string; fieldErrors?: Record<string, string> } | null`
  - `fieldErrorsFrom(error: z.ZodError): Record<string, string>`
  - Server actions `signIn`, `requestPasswordReset`, `updatePassword` (all `(prev: ActionResult, formData: FormData) => Promise<ActionResult>`), and `signOut(): Promise<void>`
  - `FormMessage({ result })` component
  - `LOGIN_ERRORS: Record<string, string>` for `?error=` codes `no-access`, `link-expired`

- [ ] **Step 1: Write the failing test** — `lib/action-result.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrorsFrom } from "./action-result";

describe("fieldErrorsFrom", () => {
  it("keeps the first message per field", () => {
    const schema = z.object({
      email: z.email("Enter a valid email"),
      password: z.string().min(8, "Use at least 8 characters"),
    });
    const result = schema.safeParse({ email: "nope", password: "short" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(fieldErrorsFrom(result.error)).toEqual({
      email: "Enter a valid email",
      password: "Use at least 8 characters",
    });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/action-result.test.ts`
Expected: FAIL — cannot resolve `./action-result`.

- [ ] **Step 3: Implement `lib/action-result.ts`**

```ts
import { z } from "zod";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> }
  | null;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const { fieldErrors } = z.flattenError(error);
  return Object.fromEntries(
    Object.entries(fieldErrors as Record<string, string[] | undefined>)
      .filter(([, messages]) => messages && messages.length > 0)
      .map(([field, messages]) => [field, messages![0]]),
  );
}
```

Run: `npx vitest run lib/action-result.test.ts` → PASS.

- [ ] **Step 4: Write schemas and actions**

`lib/auth/schemas.ts`:

```ts
import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export const resetRequestSchema = z.object({
  email: z.email("Enter a valid email"),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

export const LOGIN_ERRORS: Record<string, string> = {
  "no-access": "This account doesn't have access. Ask the owner to reactivate it.",
  "link-expired": "That link has expired. Request a new one.",
};
```

`lib/auth/actions.ts`:

```ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { HOME_PATH, safeNext } from "./routes";
import { newPasswordSchema, resetRequestSchema, signInSchema } from "./schemas";

export async function signIn(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) return { ok: false, error: "Email or password is incorrect." };
  redirect(safeNext(parsed.data.next));
}

export async function requestPasswordReset(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = resetRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });
  return { ok: true, message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: "Couldn't update your password. Request a new reset link." };
  redirect(HOME_PATH);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 5: Write the route handlers**

`app/auth/confirm/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/routes";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing token") };

  const target = error ? "/login?error=link-expired" : next;
  return NextResponse.redirect(new URL(target, request.url));
}
```

`app/auth/signout/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_ERRORS } from "@/lib/auth/schemas";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const error = request.nextUrl.searchParams.get("error");
  const target = error && error in LOGIN_ERRORS ? `/login?error=${error}` : "/login";
  return NextResponse.redirect(new URL(target, request.url));
}
```

- [ ] **Step 6: Write the shared UI pieces**

`components/_common/form-message.tsx`:

```tsx
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

export default function FormMessage({ result }: { result: ActionResult }) {
  if (!result) return null;
  const text = result.ok ? result.message : result.error;
  if (!text) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={cn("caption-style rounded-lg px-3 py-2", result.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}
    >
      {text}
    </p>
  );
}
```

`components/auth/auth-card.tsx`:

```tsx
import type { ReactNode } from "react";

type AuthCardProps = { title: string; description: string; children: ReactNode };

export default function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <section id="auth" className="border-line-strong bg-card flex w-full max-w-[400px] flex-col gap-6 rounded-xl border p-6">
      <div className="flex flex-col gap-2">
        <h1>{title}</h1>
        <p className="text-subtle">{description}</p>
      </div>
      {children}
    </section>
  );
}
```

`app/(auth)/layout.tsx`:

```tsx
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-4">{children}</main>;
}
```

- [ ] **Step 7: Write the login page and form**

`components/auth/login-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { signIn } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/action-result";

type LoginFormProps = { next?: string; notice?: string };

export default function LoginForm({ next, notice }: LoginFormProps) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(signIn, notice ? { ok: false, error: notice } : null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <FormMessage result={state} />
      <Field label="Email" htmlFor="email" error={fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(fieldErrors?.email)} />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={fieldErrors?.password}
        trailing={
          <Button href="/forgot-password" variant="link" size="none" className="caption-style">
            Forgot password?
          </Button>
        }
      >
        <Input id="password" name="password" type="password" autoComplete="current-password" required aria-invalid={Boolean(fieldErrors?.password)} />
      </Field>
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

`app/(auth)/login/page.tsx`:

```tsx
import type { Metadata } from "next";
import AuthCard from "@/components/auth/auth-card";
import LoginForm from "@/components/auth/login-form";
import { LOGIN_ERRORS } from "@/lib/auth/schemas";

export const metadata: Metadata = { title: "Sign in" };

type LoginPageProps = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;
  return (
    <AuthCard title="Sign in" description="Use the email and password your manager set up for you.">
      <LoginForm next={next} notice={error ? LOGIN_ERRORS[error] : undefined} />
    </AuthCard>
  );
}
```

- [ ] **Step 8: Write the forgot/reset password pages and forms**

`components/auth/forgot-password-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { requestPasswordReset } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/action-result";

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(requestPasswordReset, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage result={state} />
      <Field label="Email" htmlFor="email" error={fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Button href="/login" variant="link" size="none" className="caption-style self-center">
        Back to sign in
      </Button>
    </form>
  );
}
```

`app/(auth)/forgot-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import AuthCard from "@/components/auth/auth-card";
import ForgotPasswordForm from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Reset your password" description="We'll email you a link to choose a new one.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
```

`components/auth/reset-password-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { updatePassword } from "@/lib/auth/actions";
import type { ActionResult } from "@/lib/action-result";

export default function ResetPasswordForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(updatePassword, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage result={state} />
      <Field label="New password" htmlFor="password" hint="At least 8 characters" error={fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="primary" size="md" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
```

`app/(auth)/reset-password/page.tsx`:

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AuthCard from "@/components/auth/auth-card";
import ResetPasswordForm from "@/components/auth/reset-password-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/login?error=link-expired");
  return (
    <AuthCard title="Choose a new password" description="You'll stay signed in after saving.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
```

- [ ] **Step 9: Verify by hand**

```bash
npm run lint && npm test && npm run dev
```

In the browser: open `http://localhost:3000/login`. Wrong password → "Email or password is incorrect." `cashier@demo.test` / `password` → lands on `/register` (a 404 until Task 10 — that's expected). `/login?error=no-access` shows the no-access message. Stop the dev server.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Add sign-in, password reset and sign-out

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: First-run setup wizard

**Files:**
- Create: `lib/percent.ts`, `lib/percent.test.ts`, `lib/validation.ts`, `lib/setup/schema.ts`, `lib/setup/schema.test.ts`, `lib/setup/actions.ts`, `app/setup/page.tsx`, `components/setup/setup-wizard.tsx`

**Interfaces:**
- Consumes: `createAdminClient`, `createClient`, `fieldErrorsFrom`, `ActionResult`, `FormMessage`, `AuthCard`.
- Produces:
  - `parsePercentToBps(input: string): number | null` (`lib/percent.ts`)
  - `isCurrencyCode(code: string): boolean`, `isTimeZone(zone: string): boolean` (`lib/validation.ts`)
  - `setupSchema` (output: `{ businessName, storeName, currency, pricing: "inclusive" | "exclusive", taxRateBps: number, timezone, ownerName, email, password }`)
  - `SETUP_STEPS: { title: string; fields: string[] }[]`
  - `completeSetup(prev: ActionResult, formData: FormData): Promise<ActionResult>`

- [ ] **Step 1: Write failing tests**

`lib/percent.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePercentToBps } from "./percent";

describe("parsePercentToBps", () => {
  it("parses whole and decimal percentages", () => {
    expect(parsePercentToBps("12")).toBe(1200);
    expect(parsePercentToBps("8.25")).toBe(825);
    expect(parsePercentToBps("8,25")).toBe(825);
    expect(parsePercentToBps(" 7.5 % ")).toBe(750);
    expect(parsePercentToBps("0")).toBe(0);
  });
  it("rejects values that aren't valid rates", () => {
    expect(parsePercentToBps("")).toBeNull();
    expect(parsePercentToBps("abc")).toBeNull();
    expect(parsePercentToBps("-5")).toBeNull();
    expect(parsePercentToBps("8.255")).toBeNull();
    expect(parsePercentToBps("1001")).toBeNull();
    expect(parsePercentToBps("1.000,5")).toBeNull();
  });
});
```

`lib/setup/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { setupSchema } from "./schema";

const valid = {
  businessName: "Corner Shop",
  storeName: "Main Street",
  currency: "eur",
  pricing: "inclusive",
  taxRate: "21",
  timezone: "Europe/Amsterdam",
  ownerName: "Sam",
  email: "sam@corner.test",
  password: "correct-horse",
};

describe("setupSchema", () => {
  it("normalises valid input", () => {
    const result = setupSchema.parse(valid);
    expect(result.currency).toBe("EUR");
    expect(result.taxRateBps).toBe(2100);
    expect(result.pricing).toBe("inclusive");
  });
  it("rejects an unknown currency", () => {
    expect(setupSchema.safeParse({ ...valid, currency: "XYZ" }).success).toBe(false);
  });
  it("rejects an unknown time zone", () => {
    expect(setupSchema.safeParse({ ...valid, timezone: "Mars/Base" }).success).toBe(false);
  });
  it("rejects a bad tax rate", () => {
    expect(setupSchema.safeParse({ ...valid, taxRate: "abc" }).success).toBe(false);
  });
  it("rejects a short password", () => {
    expect(setupSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./percent` and `./schema`.

- [ ] **Step 3: Implement**

`lib/percent.ts`:

```ts
export function parsePercentToBps(input: string): number | null {
  const cleaned = input.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bps <= 100_000 ? bps : null;
}
```

`lib/validation.ts`:

```ts
const currencies = new Set(Intl.supportedValuesOf("currency"));
const timeZones = new Set(Intl.supportedValuesOf("timeZone"));

export function isCurrencyCode(code: string): boolean {
  return currencies.has(code);
}

export function isTimeZone(zone: string): boolean {
  return zone === "UTC" || timeZones.has(zone);
}
```

`lib/setup/schema.ts`:

```ts
import { z } from "zod";
import { parsePercentToBps } from "@/lib/percent";
import { isCurrencyCode, isTimeZone } from "@/lib/validation";

export const setupSchema = z
  .object({
    businessName: z.string().trim().min(1, "Enter your business name").max(120),
    storeName: z.string().trim().min(1, "Enter a store name").max(120),
    currency: z.string().trim().toUpperCase().refine(isCurrencyCode, "Use a 3-letter currency code like USD or EUR"),
    pricing: z.enum(["inclusive", "exclusive"]),
    taxRate: z.string(),
    timezone: z.string().refine(isTimeZone, "Pick a valid time zone"),
    ownerName: z.string().trim().min(1, "Enter your name").max(120),
    email: z.email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters"),
  })
  .transform((value, ctx) => {
    const taxRateBps = parsePercentToBps(value.taxRate);
    if (taxRateBps === null) {
      ctx.addIssue({ code: "custom", path: ["taxRate"], message: "Enter a rate like 8.25 (0–1000)" });
      return z.NEVER;
    }
    const { taxRate, ...rest } = value;
    return { ...rest, taxRateBps };
  });

export const SETUP_STEPS = [
  { title: "Your business", fields: ["businessName"] },
  { title: "Your first store", fields: ["storeName", "currency", "pricing", "taxRate", "timezone"] },
  { title: "Your account", fields: ["ownerName", "email", "password"] },
];
```

Run: `npm test` → PASS.

- [ ] **Step 4: Write the setup action** — `lib/setup/actions.ts`

```ts
"use server";

import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { setupSchema } from "./schema";

export async function completeSetup(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const input = parsed.data;

  const admin = createAdminClient();
  const { data: done } = await admin.rpc("setup_status");
  if (done) notFound();

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.ownerName },
  });
  if (userError || !created.user) {
    return { ok: false, fieldErrors: { email: userError?.message ?? "Couldn't create this account." } };
  }

  const { error } = await admin.rpc("complete_setup", {
    p_user_id: created.user.id,
    p_owner_name: input.ownerName,
    p_owner_email: input.email,
    p_business_name: input.businessName,
    p_store_name: input.storeName,
    p_currency: input.currency,
    p_prices_include_tax: input.pricing === "inclusive",
    p_tax_rate_bps: input.taxRateBps,
    p_timezone: input.timezone,
  });
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: "Setup couldn't finish, so nothing was saved. Try again." };
  }

  const supabase = await createClient();
  await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
  redirect("/register");
}
```

- [ ] **Step 5: Write the wizard** — `components/setup/setup-wizard.tsx`

All three steps live in one form. Inactive steps are `hidden` so their values still submit. "Continue" validates the visible step with the browser's constraint validation. If the server returns a field error, the wizard jumps to that field's step.

```tsx
"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { completeSetup } from "@/lib/setup/actions";
import { SETUP_STEPS } from "@/lib/setup/schema";
import type { ActionResult } from "@/lib/action-result";

export default function SetupWizard() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(completeSetup, null);
  const [step, setStep] = useState(0);
  const [timezone, setTimezone] = useState("UTC");
  const steps = useRef<(HTMLFieldSetElement | null)[]>([]);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  }, []);

  useEffect(() => {
    if (!fieldErrors) return;
    const firstBad = SETUP_STEPS.findIndex((s) => s.fields.some((field) => field in fieldErrors));
    if (firstBad !== -1) setStep(firstBad);
  }, [fieldErrors]);

  function next() {
    const inputs = steps.current[step]?.querySelectorAll("input") ?? [];
    for (const input of inputs) {
      if (!input.reportValidity()) return;
    }
    setStep((current) => current + 1);
  }

  const last = step === SETUP_STEPS.length - 1;

  return (
    <form action={action} className="flex flex-col gap-6">
      <p className="caption-style text-subtle">
        Step {step + 1} of {SETUP_STEPS.length} · {SETUP_STEPS[step].title}
      </p>
      <FormMessage result={state} />

      <fieldset ref={(el) => { steps.current[0] = el; }} hidden={step !== 0} className="flex flex-col gap-4">
        <Field label="Business name" htmlFor="businessName" error={fieldErrors?.businessName}>
          <Input id="businessName" name="businessName" required maxLength={120} autoFocus />
        </Field>
      </fieldset>

      <fieldset ref={(el) => { steps.current[1] = el; }} hidden={step !== 1} className="flex flex-col gap-4">
        <Field label="Store name" htmlFor="storeName" error={fieldErrors?.storeName}>
          <Input id="storeName" name="storeName" required maxLength={120} />
        </Field>
        <Field label="Currency" htmlFor="currency" hint="3-letter code, like USD, EUR or PHP" error={fieldErrors?.currency}>
          <Input id="currency" name="currency" required minLength={3} maxLength={3} className="uppercase" />
        </Field>
        <Field label="Prices on your menu or shelf" htmlFor="pricing">
          <Select name="pricing" defaultValue="exclusive">
            <SelectTrigger id="pricing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exclusive">Tax is added at checkout</SelectItem>
              <SelectItem value="inclusive">Prices already include tax</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Standard tax rate (%)" htmlFor="taxRate" hint="Use 0 if you don't charge tax" error={fieldErrors?.taxRate}>
          <Input id="taxRate" name="taxRate" inputMode="decimal" required defaultValue="0" />
        </Field>
        <input type="hidden" name="timezone" value={timezone} />
      </fieldset>

      <fieldset ref={(el) => { steps.current[2] = el; }} hidden={step !== 2} className="flex flex-col gap-4">
        <Field label="Your name" htmlFor="ownerName" error={fieldErrors?.ownerName}>
          <Input id="ownerName" name="ownerName" required maxLength={120} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="email" error={fieldErrors?.email}>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters" error={fieldErrors?.password}>
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
      </fieldset>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="md" onClick={() => setStep((current) => current - 1)} disabled={step === 0} className={step === 0 ? "invisible" : undefined}>
          Back
        </Button>
        {last ? (
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? "Setting up…" : "Finish setup"}
          </Button>
        ) : (
          <Button variant="primary" size="md" onClick={next}>
            Continue
          </Button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Write the page** — `app/setup/page.tsx`

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AuthCard from "@/components/auth/auth-card";
import SetupWizard from "@/components/setup/setup-wizard";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set up your shop" };

export default async function SetupPage() {
  const supabase = await createClient();
  const { data: done } = await supabase.rpc("setup_status");
  if (done) notFound();
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AuthCard title="Set up your shop" description="Three quick steps. You can change all of this later in Settings.">
        <SetupWizard />
      </AuthCard>
    </main>
  );
}
```

- [ ] **Step 7: Verify by hand on an empty database**

```bash
npx supabase db reset --no-seed && npm run dev
```

In a private window: `http://localhost:3000/orders` redirects to `/setup`. Fill the three steps (try `abc` as the tax rate first — the server error sends you back to step 2). Finish → lands on `/register` (404 until Task 10). Reload `/setup` → 404. Then restore demo data: `npx supabase db reset`. Clear the browser's cookies for localhost afterwards (the setup cookie is still set).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add first-run setup wizard

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: App shell

**Files:**
- Create: `lib/nav.ts`, `lib/nav.test.ts`, `stores/ui-store.ts`, `hooks/use-online.ts`, `lib/auth/store-actions.ts`, `components/_common/sidebar/sidebar.tsx`, `components/_common/sidebar/sidebar-content.tsx`, `components/_common/sidebar/nav-icons.ts`, `components/_common/sidebar/store-switcher.tsx`, `components/_common/page-header.tsx`, `components/_common/empty-state.tsx`, `components/_common/offline-banner.tsx`, `components/_common/command-menu.tsx`, `app/(app)/layout.tsx`, `app/(app)/register/page.tsx`, `app/(app)/products/page.tsx`, `app/(app)/orders/page.tsx`, `app/(app)/customers/page.tsx`, `app/(app)/reports/page.tsx`
- Modify: `components/_common/sidebar/sidebar-nav-item.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: `requireStaff`, `requireRole`, `getCurrentStore`, `STORE_COOKIE`, `signOut`, `roleAtLeast`.
- Produces:
  - `type NavKey = "register" | "products" | "orders" | "customers" | "reports" | "settings"`; `NAV_ITEMS`; `navItemsFor(role: StaffRole): NavItem[]`
  - `useUiStore` with `sidebarOpen`, `setSidebarOpen(open: boolean)`, `commandOpen`, `setCommandOpen(open: boolean)`
  - `useOnline(): boolean`
  - `selectStore(storeId: string): Promise<void>`
  - `PageHeader({ title, actions? })`, `EmptyState({ title, description })`

- [ ] **Step 1: Write the failing nav test** — `lib/nav.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { navItemsFor } from "./nav";

const keys = (role: Parameters<typeof navItemsFor>[0]) => navItemsFor(role).map((item) => item.key);

describe("navItemsFor", () => {
  it("gives cashiers the selling sections", () => {
    expect(keys("cashier")).toEqual(["register", "orders", "customers"]);
  });
  it("adds products and reports for managers", () => {
    expect(keys("manager")).toEqual(["register", "products", "orders", "customers", "reports"]);
  });
  it("adds settings for owners", () => {
    expect(keys("owner")).toEqual(["register", "products", "orders", "customers", "reports", "settings"]);
  });
});
```

Run: `npx vitest run lib/nav.test.ts` → FAIL (cannot resolve `./nav`).

- [ ] **Step 2: Implement `lib/nav.ts`**

```ts
import { roleAtLeast, type StaffRole } from "@/lib/auth/roles";

export type NavKey = "register" | "products" | "orders" | "customers" | "reports" | "settings";

export type NavItem = { key: NavKey; label: string; href: string; minRole: StaffRole };

export const NAV_ITEMS: NavItem[] = [
  { key: "register", label: "Register", href: "/register", minRole: "cashier" },
  { key: "products", label: "Products", href: "/products", minRole: "manager" },
  { key: "orders", label: "Orders", href: "/orders", minRole: "cashier" },
  { key: "customers", label: "Customers", href: "/customers", minRole: "cashier" },
  { key: "reports", label: "Reports", href: "/reports", minRole: "manager" },
  { key: "settings", label: "Settings", href: "/settings", minRole: "owner" },
];

export function navItemsFor(role: StaffRole): NavItem[] {
  return NAV_ITEMS.filter((item) => roleAtLeast(role, item.minRole));
}
```

Run: `npx vitest run lib/nav.test.ts` → PASS.

- [ ] **Step 3: Write the UI store, online hook and store action**

`stores/ui-store.ts`:

```ts
import { create } from "zustand";

type UiState = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));
```

`hooks/use-online.ts`:

```ts
"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
```

`lib/auth/store-actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaff, STORE_COOKIE } from "./staff";

export async function selectStore(storeId: string): Promise<void> {
  const staff = await requireStaff();
  if (!staff.stores.some((store) => store.id === storeId)) return;
  const cookieStore = await cookies();
  cookieStore.set(STORE_COOKIE, storeId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
```

- [ ] **Step 4: Update `SidebarNavItem` to link**

In `components/_common/sidebar/sidebar-nav-item.tsx`, add `href?: string;` to `SidebarNavItemProps`, add `href,` to the destructured props, and pass `href={href}` to the `Button`.

- [ ] **Step 5: Write the sidebar**

`components/_common/sidebar/nav-icons.ts`:

```ts
import type { ComponentType, SVGProps } from "react";
import type { NavKey } from "@/lib/nav";
import RegisterIcon from "@/public/assets/images/_common/nav/register.svg";
import ProductsIcon from "@/public/assets/images/_common/nav/products.svg";
import OrdersIcon from "@/public/assets/images/_common/nav/orders.svg";
import CustomersIcon from "@/public/assets/images/_common/nav/customers.svg";
import ReportsIcon from "@/public/assets/images/_common/nav/reports.svg";
import SettingsIcon from "@/public/assets/images/_common/nav/settings.svg";

export const NAV_ICONS: Record<NavKey, ComponentType<SVGProps<SVGSVGElement>>> = {
  register: RegisterIcon,
  products: ProductsIcon,
  orders: OrdersIcon,
  customers: CustomersIcon,
  reports: ReportsIcon,
  settings: SettingsIcon,
};
```

`components/_common/sidebar/store-switcher.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import { selectStore } from "@/lib/auth/store-actions";
import type { StaffStore } from "@/lib/auth/pick-store";

type StoreSwitcherProps = { stores: StaffStore[]; currentStoreId: string | null };

export default function StoreSwitcher({ stores, currentStoreId }: StoreSwitcherProps) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="border-sidebar-border shrink-0 border-b p-3">
      <Select
        value={currentStoreId ?? undefined}
        onValueChange={(storeId) => startTransition(() => selectStore(storeId))}
        disabled={pending}
      >
        <SelectTrigger aria-label="Current store">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {stores.map((store) => (
            <SelectItem key={store.id} value={store.id}>
              {store.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

`components/_common/sidebar/sidebar-content.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import Button from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import SidebarNavItem from "./sidebar-nav-item";
import SidebarSection from "./sidebar-section";
import StoreSwitcher from "./store-switcher";
import { NAV_ICONS } from "./nav-icons";
import { navItemsFor } from "@/lib/nav";
import { signOut } from "@/lib/auth/actions";
import type { StaffRole } from "@/lib/auth/roles";
import type { StaffStore } from "@/lib/auth/pick-store";
import Logo from "@/public/assets/images/_common/logo.svg";
import LogOutIcon from "@/public/assets/images/_common/nav/log-out.svg";

export type SidebarProps = {
  businessName: string;
  staffName: string;
  role: StaffRole;
  stores: StaffStore[];
  currentStoreId: string | null;
};

export default function SidebarContent({ businessName, staffName, role, stores, currentStoreId }: SidebarProps) {
  const pathname = usePathname();
  const currentStore = stores.find((store) => store.id === currentStoreId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center gap-2 border-b p-3">
        <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="lead-style block truncate font-medium tracking-[-0.01em]">{businessName}</span>
          <span className="caption-style text-subtle block truncate">{currentStore?.name ?? "No store"}</span>
        </div>
      </div>

      {stores.length > 1 && <StoreSwitcher stores={stores} currentStoreId={currentStoreId} />}

      <ScrollArea className="min-h-0 flex-1">
        <nav aria-label="Primary">
          <SidebarSection>
            {navItemsFor(role).map((item) => (
              <SidebarNavItem
                key={item.key}
                icon={NAV_ICONS[item.key]}
                label={item.label}
                href={item.href}
                active={pathname === item.href || pathname.startsWith(`${item.href}/`)}
              />
            ))}
          </SidebarSection>
        </nav>
      </ScrollArea>

      <div className="border-sidebar-border bg-sidebar-accent flex shrink-0 items-center justify-between gap-2 border-t p-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="lead-style block truncate font-medium tracking-[-0.01em]">{staffName}</span>
          <span className="caption-style text-subtle block capitalize">{role}</span>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="muted" size="md">
            <LogOutIcon aria-hidden className="size-3.5" />
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
```

`components/_common/sidebar/sidebar.tsx`:

```tsx
"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/_ui/sheet";
import SidebarContent, { type SidebarProps } from "./sidebar-content";
import SidebarResizer from "./sidebar-resizer";
import { useUiStore } from "@/stores/ui-store";

export default function Sidebar(props: SidebarProps) {
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);

  return (
    <>
      <aside className="border-sidebar-border bg-sidebar relative hidden w-(--sidebar-width) shrink-0 border-r lg:flex lg:flex-col">
        <SidebarContent {...props} />
        <SidebarResizer />
      </aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="border-sidebar-border bg-sidebar w-[254px] max-w-[85vw]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">POS sections</SheetDescription>
          <SidebarContent {...props} />
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 6: Write header, empty state, offline banner and command menu**

`components/_common/page-header.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import Button from "@/components/_ui/button";
import { useUiStore } from "@/stores/ui-store";
import MenuIcon from "@/public/assets/images/_common/menu.svg";
import SearchIcon from "@/public/assets/images/_common/search.svg";

type PageHeaderProps = { title: string; actions?: ReactNode };

export default function PageHeader({ title, actions }: PageHeaderProps) {
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const setCommandOpen = useUiStore((state) => state.setCommandOpen);

  return (
    <header className="border-line-strong flex shrink-0 items-center justify-between gap-2 border-b px-4 py-[14px]">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="secondary" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}>
          <MenuIcon aria-hidden className="size-3.5" />
        </Button>
        <h1 className="truncate">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <Button variant="secondary" size="icon" aria-label="Go to page" aria-keyshortcuts="Meta+K Control+K" onClick={() => setCommandOpen(true)}>
          <SearchIcon aria-hidden className="size-3.5" />
        </Button>
      </div>
    </header>
  );
}
```

`components/_common/empty-state.tsx`:

```tsx
type EmptyStateProps = { title: string; description: string };

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h2>{title}</h2>
      <p className="text-subtle max-w-[28.5em]">{description}</p>
    </div>
  );
}
```

`components/_common/offline-banner.tsx`:

```tsx
"use client";

import { useOnline } from "@/hooks/use-online";

export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="caption-style bg-warning/15 text-warning shrink-0 px-4 py-2">
      You're offline. Sales are paused until the connection comes back.
    </div>
  );
}
```

`components/_common/command-menu.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Kbd } from "@/components/_ui/command";
import { NAV_ICONS } from "@/components/_common/sidebar/nav-icons";
import { navItemsFor } from "@/lib/nav";
import type { StaffRole } from "@/lib/auth/roles";
import { useUiStore } from "@/stores/ui-store";

export default function CommandMenu({ role }: { role: StaffRole }) {
  const open = useUiStore((state) => state.commandOpen);
  const setOpen = useUiStore((state) => state.setCommandOpen);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      event.preventDefault();
      const { commandOpen, setCommandOpen } = useUiStore.getState();
      setCommandOpen(!commandOpen);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Go to" description="Jump to a section of the POS">
      <Command>
        <CommandInput placeholder="Go to…" trailing={<Kbd>Esc</Kbd>} />
        <CommandList>
          <CommandEmpty>No sections match.</CommandEmpty>
          <CommandGroup heading="Sections">
            {navItemsFor(role).map((item) => {
              const Icon = NAV_ICONS[item.key];
              return (
                <CommandItem
                  key={item.key}
                  value={item.label}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <Icon aria-hidden className="text-subtle size-3.5" />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
```

- [ ] **Step 7: Write the layout, root redirect and section pages**

`app/(app)/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import Sidebar from "@/components/_common/sidebar/sidebar";
import OfflineBanner from "@/components/_common/offline-banner";
import CommandMenu from "@/components/_common/command-menu";
import { getCurrentStore, requireStaff } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const staff = await requireStaff();
  const store = await getCurrentStore(staff);
  const supabase = await createClient();
  const { data: business } = await supabase.from("business").select("name").maybeSingle();

  return (
    <main className="flex h-dvh max-w-full overflow-hidden">
      <Sidebar
        businessName={business?.name ?? "POS"}
        staffName={staff.name}
        role={staff.role}
        stores={staff.stores}
        currentStoreId={store?.id ?? null}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <OfflineBanner />
        {children}
      </div>
      <CommandMenu role={staff.role} />
    </main>
  );
}
```

`app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/register");
}
```

`app/(app)/register/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Register" };

export default async function RegisterPage() {
  await requireRole("cashier");
  return (
    <section id="register" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Register" />
      <EmptyState title="Checkout is coming next" description="You'll ring up sales here: scan or search products, take cash or card, and print receipts." />
    </section>
  );
}
```

`app/(app)/products/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireRole("manager");
  return (
    <section id="products" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Products" />
      <EmptyState title="Product editing is coming next" description="You'll add products, variants, barcodes and stock here. The demo catalog is already in the database." />
    </section>
  );
}
```

`app/(app)/orders/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  await requireRole("cashier");
  return (
    <section id="orders" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Orders" />
      <EmptyState title="No orders yet" description="Sales from the register will show up here, with receipts, refunds and voids." />
    </section>
  );
}
```

`app/(app)/customers/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireRole("cashier");
  return (
    <section id="customers" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Customers" />
      <EmptyState title="Customer profiles are coming soon" description="You'll look up customers, see what they've bought and attach them to sales here." />
    </section>
  );
}
```

`app/(app)/reports/page.tsx`:

```tsx
import type { Metadata } from "next";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import { requireRole } from "@/lib/auth/staff";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireRole("manager");
  return (
    <section id="reports" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Reports" />
      <EmptyState title="Reports are coming soon" description="Daily sales, best sellers, staff totals and end-of-day cash-up will live here." />
    </section>
  );
}
```

- [ ] **Step 8: Verify**

```bash
npm run lint && npm test && npm run build && npm run dev
```

Sign in as `owner@demo.test` → six nav items, store switcher shows Main Street / Airport Kiosk, switching updates the name under the business. ⌘K opens "Go to". As `cashier@demo.test` → three nav items, no switcher; `/products` shows the 404. As `inactive@demo.test` → back on `/login` with the no-access message. In DevTools → Network → Offline, the banner appears.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add role-aware app shell

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Settings — stores and registers

**Files:**
- Create: `lib/db-error.ts`, `lib/db-error.test.ts`, `lib/settings/schemas.ts`, `lib/settings/schemas.test.ts`, `lib/settings/store-actions.ts`, `app/(app)/settings/layout.tsx`, `app/(app)/settings/page.tsx`, `app/(app)/settings/stores/page.tsx`, `components/settings/settings-nav.tsx`, `components/settings/stores-table.tsx`, `components/settings/store-dialog.tsx`, `components/settings/register-dialog.tsx`

**Interfaces:**
- Consumes: `requireRole`, `createClient`, `ActionResult`, `fieldErrorsFrom`, `FormMessage`, `isCurrencyCode`, `isTimeZone`, `parsePercentToBps`.
- Produces:
  - `friendlyDbError(error: { code?: string } | null): string`
  - `formToObject(formData: FormData, multi?: string[]): Record<string, unknown>` (`lib/settings/schemas.ts`)
  - `storeSchema`, `registerSchema`, `taxClassSchema`, `taxRateSchema`, `staffCreateSchema`, `staffUpdateSchema` (all in `lib/settings/schemas.ts`; tax/staff ones used in Tasks 12–13)
  - Actions `saveStore`, `createRegister`: `(prev: ActionResult, formData: FormData) => Promise<ActionResult>`
  - `type StoreWithRegisters = { id: string; name: string; address: string | null; currency: string; timezone: string; prices_include_tax: boolean; registers: { id: string; name: string }[] }`

- [ ] **Step 1: Write failing tests**

`lib/db-error.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { friendlyDbError } from "./db-error";

describe("friendlyDbError", () => {
  it("explains duplicates", () => {
    expect(friendlyDbError({ code: "23505" })).toBe("That name is already in use. Pick another.");
  });
  it("explains permission denials", () => {
    expect(friendlyDbError({ code: "42501" })).toBe("You don't have access to this.");
  });
  it("falls back to a generic message", () => {
    expect(friendlyDbError({ code: "XX000" })).toBe("Something went wrong. Try again.");
    expect(friendlyDbError(null)).toBe("Something went wrong. Try again.");
  });
});
```

`lib/settings/schemas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formToObject, registerSchema, staffCreateSchema, staffUpdateSchema, storeSchema, taxRateSchema } from "./schemas";

const ID = "00000000-0000-4000-8000-000000000001";

describe("formToObject", () => {
  it("collects repeated fields into arrays", () => {
    const form = new FormData();
    form.append("name", "A");
    form.append("storeIds", "1");
    form.append("storeIds", "2");
    expect(formToObject(form, ["storeIds"])).toEqual({ name: "A", storeIds: ["1", "2"] });
  });
  it("gives an empty array for a missing repeated field", () => {
    expect(formToObject(new FormData(), ["storeIds"])).toEqual({ storeIds: [] });
  });
});

describe("storeSchema", () => {
  it("normalises a new store", () => {
    const store = storeSchema.parse({ id: "", name: " Kiosk ", address: "", currency: "php", timezone: "Asia/Manila", pricing: "inclusive" });
    expect(store).toEqual({ id: undefined, name: "Kiosk", address: null, currency: "PHP", timezone: "Asia/Manila", pricing: "inclusive" });
  });
  it("rejects a bad currency", () => {
    expect(storeSchema.safeParse({ name: "A", currency: "ZZZ", timezone: "UTC", pricing: "exclusive" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("requires a name and store", () => {
    expect(registerSchema.safeParse({ storeId: ID, name: "" }).success).toBe(false);
    expect(registerSchema.parse({ storeId: ID, name: "Counter 3" }).name).toBe("Counter 3");
  });
});

describe("taxRateSchema", () => {
  it("converts the percentage to basis points", () => {
    expect(taxRateSchema.parse({ storeId: ID, taxClassId: ID, name: "VAT", rate: "12" }).rateBps).toBe(1200);
  });
  it("rejects a bad percentage", () => {
    expect(taxRateSchema.safeParse({ storeId: ID, taxClassId: ID, name: "VAT", rate: "12.345" }).success).toBe(false);
  });
});

describe("staffCreateSchema", () => {
  const base = { name: "Pat", email: "pat@shop.test", password: "temporary1", role: "cashier", storeIds: [ID] };
  it("accepts a cashier with a store", () => {
    expect(staffCreateSchema.safeParse(base).success).toBe(true);
  });
  it("requires a store for cashiers and managers", () => {
    expect(staffCreateSchema.safeParse({ ...base, storeIds: [] }).success).toBe(false);
  });
  it("lets owners have no stores", () => {
    expect(staffCreateSchema.safeParse({ ...base, role: "owner", storeIds: [] }).success).toBe(true);
  });
});

describe("staffUpdateSchema", () => {
  it("reads the active checkbox", () => {
    expect(staffUpdateSchema.parse({ id: ID, role: "manager", storeIds: [ID], active: "on" }).active).toBe(true);
    expect(staffUpdateSchema.parse({ id: ID, role: "manager", storeIds: [ID] }).active).toBe(false);
  });
});
```

Run: `npm test` → FAIL (cannot resolve `./db-error`, `./schemas`).

- [ ] **Step 2: Implement**

`lib/db-error.ts`:

```ts
const MESSAGES: Record<string, string> = {
  "23505": "That name is already in use. Pick another.",
  "42501": "You don't have access to this.",
  "23503": "This is still in use, so it can't be removed.",
};

export function friendlyDbError(error: { code?: string } | null): string {
  return (error?.code && MESSAGES[error.code]) || "Something went wrong. Try again.";
}
```

`lib/settings/schemas.ts`:

```ts
import { z } from "zod";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { parsePercentToBps } from "@/lib/percent";
import { isCurrencyCode, isTimeZone } from "@/lib/validation";

export function formToObject(formData: FormData, multi: string[] = []): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (!multi.includes(key)) result[key] = value;
  }
  for (const key of multi) result[key] = formData.getAll(key);
  return result;
}

const optionalId = z.preprocess((value) => (value === "" ? undefined : value), z.guid().optional());
const name = (label: string, max: number) => z.string().trim().min(1, `Enter a ${label}`).max(max);

export const storeSchema = z.object({
  id: optionalId,
  name: name("store name", 120),
  address: z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : null), z.string().max(300).nullable()),
  currency: z.string().trim().toUpperCase().refine(isCurrencyCode, "Use a 3-letter currency code like USD or EUR"),
  timezone: z.string().refine(isTimeZone, "Pick a valid time zone"),
  pricing: z.enum(["inclusive", "exclusive"]),
});

export const registerSchema = z.object({
  storeId: z.guid(),
  name: name("register name", 60),
});

export const taxClassSchema = z.object({
  id: optionalId,
  name: name("tax class name", 60),
});

export const taxRateSchema = z
  .object({
    storeId: z.guid(),
    taxClassId: z.guid(),
    name: name("label", 60),
    rate: z.string(),
  })
  .transform((value, ctx) => {
    const rateBps = parsePercentToBps(value.rate);
    if (rateBps === null) {
      ctx.addIssue({ code: "custom", path: ["rate"], message: "Enter a rate like 8.25 (0–1000)" });
      return z.NEVER;
    }
    return { storeId: value.storeId, taxClassId: value.taxClassId, name: value.name, rateBps };
  });

const storeIds = z.array(z.guid());
const needsStore = (value: { role: string; storeIds: string[] }) => value.role === "owner" || value.storeIds.length > 0;
const needsStoreIssue = { path: ["storeIds"], message: "Pick at least one store" };

export const staffCreateSchema = z
  .object({
    name: name("name", 120),
    email: z.email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters"),
    role: z.enum(STAFF_ROLES),
    storeIds,
  })
  .refine(needsStore, needsStoreIssue);

export const staffUpdateSchema = z
  .object({
    id: z.guid(),
    role: z.enum(STAFF_ROLES),
    storeIds,
    active: z.preprocess((value) => value === "on", z.boolean()),
  })
  .refine(needsStore, needsStoreIssue);
```

Run: `npm test` → PASS.

- [ ] **Step 3: Write the store actions** — `lib/settings/store-actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-error";
import { formToObject, registerSchema, storeSchema } from "./schemas";

export async function saveStore(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = storeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { id, pricing, ...fields } = parsed.data;
  const row = { ...fields, prices_include_tax: pricing === "inclusive" };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("stores").update(row).eq("id", id);
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { data: store, error } = await supabase.from("stores").insert(row).select("id").single();
    if (error || !store) return { ok: false, error: friendlyDbError(error) };
    await supabase.from("registers").insert({ store_id: store.id, name: "Register 1" });
  }
  revalidatePath("/", "layout");
  return { ok: true, message: id ? "Store saved." : "Store added." };
}

export async function createRegister(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = registerSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("registers").insert({ store_id: parsed.data.storeId, name: parsed.data.name });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/settings/stores");
  return { ok: true, message: "Register added." };
}
```

- [ ] **Step 4: Write the settings layout and nav**

`components/settings/settings-nav.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import Button from "@/components/_ui/button";

const LINKS = [
  { href: "/settings/stores", label: "Stores" },
  { href: "/settings/tax", label: "Tax" },
  { href: "/settings/staff", label: "Staff" },
];

export default function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Settings" className="border-line-strong flex shrink-0 gap-1 border-b px-4 py-2">
      {LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Button
            key={link.href}
            href={link.href}
            variant="ghost"
            size="md"
            aria-current={active ? "page" : undefined}
            className="aria-[current=page]:bg-white/6 aria-[current=page]:text-foreground"
          >
            {link.label}
          </Button>
        );
      })}
    </nav>
  );
}
```

`app/(app)/settings/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import PageHeader from "@/components/_common/page-header";
import SettingsNav from "@/components/settings/settings-nav";
import { ScrollArea } from "@/components/_ui/scroll-area";
import { requireRole } from "@/lib/auth/staff";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requireRole("owner");
  return (
    <section id="settings" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader title="Settings" />
      <SettingsNav />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-6 p-4">{children}</div>
      </ScrollArea>
    </section>
  );
}
```

`app/(app)/settings/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/stores");
}
```

- [ ] **Step 5: Write the store dialog, register dialog and table**

`components/settings/store-dialog.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { saveStore } from "@/lib/settings/store-actions";
import type { ActionResult } from "@/lib/action-result";
import type { StoreWithRegisters } from "./stores-table";

type StoreDialogProps = { store?: StoreWithRegisters; trigger: ReactNode };

export default function StoreDialog({ store, trigger }: StoreDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveStore, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const defaultZone = store?.timezone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form action={action} className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>{store ? "Edit store" : "Add store"}</DialogTitle>
            <DialogDescription>Currency and tax pricing apply to every sale in this store.</DialogDescription>
          </DialogHeader>
          <FormMessage result={state && !state.ok ? state : null} />
          <input type="hidden" name="id" value={store?.id ?? ""} />
          <Field label="Name" htmlFor="store-name" error={fieldErrors?.name}>
            <Input id="store-name" name="name" required maxLength={120} defaultValue={store?.name} />
          </Field>
          <Field label="Address" htmlFor="store-address" error={fieldErrors?.address}>
            <Input id="store-address" name="address" maxLength={300} defaultValue={store?.address ?? ""} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" htmlFor="store-currency" error={fieldErrors?.currency}>
              <Input id="store-currency" name="currency" required minLength={3} maxLength={3} className="uppercase" defaultValue={store?.currency} />
            </Field>
            <Field label="Time zone" htmlFor="store-timezone" error={fieldErrors?.timezone}>
              <Input id="store-timezone" name="timezone" required defaultValue={defaultZone} />
            </Field>
          </div>
          <Field label="Prices" htmlFor="store-pricing">
            <Select name="pricing" defaultValue={store?.prices_include_tax ? "inclusive" : "exclusive"}>
              <SelectTrigger id="store-pricing">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exclusive">Tax is added at checkout</SelectItem>
                <SelectItem value="inclusive">Prices already include tax</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Saving…" : store ? "Save store" : "Add store"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`components/settings/register-dialog.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import FormMessage from "@/components/_common/form-message";
import { createRegister } from "@/lib/settings/store-actions";
import type { ActionResult } from "@/lib/action-result";

export default function RegisterDialog({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionResult, FormData>(createRegister, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Add register</Button>
      </DialogTrigger>
      <DialogContent>
        <form action={action} className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>Add register</DialogTitle>
            <DialogDescription>A register is one checkout counter or device in {storeName}.</DialogDescription>
          </DialogHeader>
          <FormMessage result={state && !state.ok ? state : null} />
          <input type="hidden" name="storeId" value={storeId} />
          <Field label="Name" htmlFor="register-name" error={fieldErrors?.name}>
            <Input id="register-name" name="name" required maxLength={60} placeholder="Counter 2" />
          </Field>
          <DialogFooter>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Adding…" : "Add register"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`components/settings/stores-table.tsx`:

```tsx
"use client";

import Button from "@/components/_ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import StoreDialog from "./store-dialog";
import RegisterDialog from "./register-dialog";

export type StoreWithRegisters = {
  id: string;
  name: string;
  address: string | null;
  currency: string;
  timezone: string;
  prices_include_tax: boolean;
  registers: { id: string; name: string }[];
};

export default function StoresTable({ stores }: { stores: StoreWithRegisters[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2>Stores</h2>
        <StoreDialog trigger={<Button variant="primary" size="md">Add store</Button>} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Store</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Prices</TableHead>
            <TableHead>Registers</TableHead>
            <TableHead className="sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stores.map((store) => (
            <TableRow key={store.id}>
              <TableCell>
                <span className="block">{store.name}</span>
                {store.address && <span className="caption-style text-subtle block">{store.address}</span>}
              </TableCell>
              <TableCell>{store.currency}</TableCell>
              <TableCell>{store.prices_include_tax ? "Include tax" : "Tax added"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-2">
                  <span>{store.registers.map((register) => register.name).join(", ")}</span>
                  <RegisterDialog storeId={store.id} storeName={store.name} />
                </div>
              </TableCell>
              <TableCell className="text-right">
                <StoreDialog store={store} trigger={<Button variant="secondary" size="sm">Edit</Button>} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

`app/(app)/settings/stores/page.tsx`:

```tsx
import type { Metadata } from "next";
import StoresTable from "@/components/settings/stores-table";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stores" };

export default async function StoresSettingsPage() {
  await requireRole("owner");
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, name, address, currency, timezone, prices_include_tax, registers(id, name)")
    .order("name");
  return <StoresTable stores={stores ?? []} />;
}
```

- [ ] **Step 6: Verify**

```bash
npm run lint && npm test && npm run dev
```

As owner: Settings → Stores lists Main Street and Airport Kiosk. Add "Harbour" with currency `php` → appears with PHP and "Register 1". Add "Counter 3" to Main Street. Adding a second "Counter 3" shows "That name is already in use. Pick another." The new store appears in the sidebar store switcher.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add store and register settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Settings — tax

**Files:**
- Create: `lib/settings/tax-actions.ts`, `app/(app)/settings/tax/page.tsx`, `components/settings/tax-classes.tsx`, `components/settings/tax-rate-row.tsx`

**Interfaces:**
- Consumes: `taxClassSchema`, `taxRateSchema`, `formToObject`, `friendlyDbError`, `getCurrentStore`, `formatPercent` (defined below).
- Produces: actions `saveTaxClass`, `setDefaultTaxClass`, `saveTaxRate` (`(prev: ActionResult, formData: FormData) => Promise<ActionResult>`); `formatBpsAsPercent(bps: number): string` in `lib/percent.ts`.

- [ ] **Step 1: Add a failing test for `formatBpsAsPercent`** — append to `lib/percent.test.ts`

```ts
import { formatBpsAsPercent } from "./percent";

describe("formatBpsAsPercent", () => {
  it("shows basis points as a plain percentage", () => {
    expect(formatBpsAsPercent(825)).toBe("8.25");
    expect(formatBpsAsPercent(1200)).toBe("12");
    expect(formatBpsAsPercent(750)).toBe("7.5");
    expect(formatBpsAsPercent(0)).toBe("0");
  });
});
```

Run: `npx vitest run lib/percent.test.ts` → FAIL (`formatBpsAsPercent` is not exported).

- [ ] **Step 2: Implement** — append to `lib/percent.ts`

```ts
export function formatBpsAsPercent(bps: number): string {
  return (bps / 100).toFixed(2).replace(/\.?0+$/, "");
}
```

Run: `npx vitest run lib/percent.test.ts` → PASS.

- [ ] **Step 3: Write the tax actions** — `lib/settings/tax-actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-error";
import { formToObject, taxClassSchema, taxRateSchema } from "./schemas";

export async function saveTaxClass(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = taxClassSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { id, name } = parsed.data;
  const { error } = id
    ? await supabase.from("tax_classes").update({ name }).eq("id", id)
    : await supabase.from("tax_classes").insert({ name });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/settings/tax");
  return { ok: true, message: id ? "Tax class renamed." : "Tax class added." };
}

export async function setDefaultTaxClass(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = z.object({ id: z.guid() }).safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, error: "Pick a tax class." };

  const supabase = await createClient();
  const { error: clearError } = await supabase.from("tax_classes").update({ is_default: false }).eq("is_default", true);
  if (clearError) return { ok: false, error: friendlyDbError(clearError) };
  const { error } = await supabase.from("tax_classes").update({ is_default: true }).eq("id", parsed.data.id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/settings/tax");
  return { ok: true, message: "Default tax class updated." };
}

export async function saveTaxRate(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = taxRateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { storeId, taxClassId, name, rateBps } = parsed.data;
  const { error } = await supabase
    .from("tax_rates")
    .upsert({ store_id: storeId, tax_class_id: taxClassId, name, rate_bps: rateBps }, { onConflict: "store_id,tax_class_id" });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/settings/tax");
  return { ok: true, message: "Rate saved." };
}
```

- [ ] **Step 4: Write the tax UI**

`components/settings/tax-rate-row.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { TableCell, TableRow } from "@/components/_ui/table";
import { saveTaxRate } from "@/lib/settings/tax-actions";
import type { ActionResult } from "@/lib/action-result";

type TaxRateRowProps = {
  storeId: string;
  taxClass: { id: string; name: string; is_default: boolean };
  rate: { name: string; rate: string } | null;
};

export default function TaxRateRow({ storeId, taxClass, rate }: TaxRateRowProps) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTaxRate, null);
  const formId = `rate-${taxClass.id}`;
  const error = state && !state.ok ? (state.fieldErrors?.rate ?? state.fieldErrors?.name ?? state.error) : undefined;

  return (
    <TableRow>
      <TableCell>
        {taxClass.name}
        {taxClass.is_default && <span className="caption-style text-subtle"> · default</span>}
        <form id={formId} action={action}>
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="taxClassId" value={taxClass.id} />
        </form>
      </TableCell>
      <TableCell>
        <Input form={formId} name="name" aria-label={`${taxClass.name} label on receipts`} defaultValue={rate?.name ?? taxClass.name} required maxLength={60} />
      </TableCell>
      <TableCell>
        <Input form={formId} name="rate" aria-label={`${taxClass.name} rate in percent`} inputMode="decimal" defaultValue={rate?.rate ?? "0"} required className="w-24" />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {error && <span role="alert" className="caption-style text-danger">{error}</span>}
          {state?.ok && <span role="status" className="caption-style text-success">Saved</span>}
          <Button form={formId} type="submit" variant="secondary" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
```

`components/settings/tax-classes.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import FormMessage from "@/components/_common/form-message";
import { saveTaxClass, setDefaultTaxClass } from "@/lib/settings/tax-actions";
import type { ActionResult } from "@/lib/action-result";

type TaxClass = { id: string; name: string; is_default: boolean };

function MakeDefault({ taxClass }: { taxClass: TaxClass }) {
  const [, action, pending] = useActionState<ActionResult, FormData>(setDefaultTaxClass, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={taxClass.id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>Make default</Button>
    </form>
  );
}

export default function TaxClasses({ classes }: { classes: TaxClass[] }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(saveTaxClass, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2>Tax classes</h2>
        <p className="text-subtle max-w-[40em]">Each product belongs to one class. New products use the default class. Each store sets its own rate per class below.</p>
      </div>
      <ul className="divide-line-strong border-line-strong divide-y rounded-lg border">
        {classes.map((taxClass) => (
          <li key={taxClass.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span>
              {taxClass.name}
              {taxClass.is_default && <span className="caption-style text-subtle"> · default</span>}
            </span>
            {!taxClass.is_default && <MakeDefault taxClass={taxClass} />}
          </li>
        ))}
      </ul>
      <form action={action} className="flex items-end gap-2">
        <Field label="New tax class" htmlFor="tax-class-name" error={fieldErrors?.name} className="flex-1">
          <Input id="tax-class-name" name="name" required maxLength={60} placeholder="Food" />
        </Field>
        <Button type="submit" variant="secondary" size="md" disabled={pending}>Add class</Button>
      </form>
      <FormMessage result={state && !state.ok && state.error ? state : null} />
    </div>
  );
}
```

`app/(app)/settings/tax/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import TaxClasses from "@/components/settings/tax-classes";
import TaxRateRow from "@/components/settings/tax-rate-row";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatBpsAsPercent } from "@/lib/percent";

export const metadata: Metadata = { title: "Tax" };

export default async function TaxSettingsPage() {
  const staff = await requireRole("owner");
  const store = await getCurrentStore(staff);
  const supabase = await createClient();
  const { data: classes } = await supabase.from("tax_classes").select("id, name, is_default").order("name");
  const { data: rates } = store
    ? await supabase.from("tax_rates").select("tax_class_id, name, rate_bps").eq("store_id", store.id)
    : { data: [] };

  return (
    <>
      <TaxClasses classes={classes ?? []} />
      {store && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2>Rates for {store.name}</h2>
            <p className="text-subtle">Switch stores in the sidebar to edit another store's rates. A class with no rate is charged 0%.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Class</TableHead>
                <TableHead>Label on receipts</TableHead>
                <TableHead>Rate (%)</TableHead>
                <TableHead className="sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(classes ?? []).map((taxClass) => {
                const rate = rates?.find((row) => row.tax_class_id === taxClass.id);
                return (
                  <TaxRateRow
                    key={taxClass.id}
                    storeId={store.id}
                    taxClass={taxClass}
                    rate={rate ? { name: rate.name, rate: formatBpsAsPercent(rate.rate_bps) } : null}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify**

```bash
npm run lint && npm test && npm run dev
```

As owner: Settings → Tax shows Standard (default) and Exempt; rates for Main Street show 8.25 and 0. Change Standard to `8,5` → Saved, reload shows 8.5. Enter `abc` → inline error. Add class "Food", make it default → "default" moves. Switch the store in the sidebar → the rates table follows.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add tax class and rate settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Settings — staff

**Files:**
- Create: `lib/settings/staff-rules.ts`, `lib/settings/staff-rules.test.ts`, `lib/settings/staff-actions.ts`, `app/(app)/settings/staff/page.tsx`, `components/settings/staff-table.tsx`, `components/settings/staff-dialog.tsx`

**Interfaces:**
- Consumes: `staffCreateSchema`, `staffUpdateSchema`, `formToObject`, `createAdminClient`, `friendlyDbError`, `requireRole`.
- Produces:
  - `staffChangeError(input: { actorStaffId: string; targetStaffId: string; nextRole: StaffRole; nextActive: boolean }): string | null`
  - Actions `createStaff`, `updateStaff`: `(prev: ActionResult, formData: FormData) => Promise<ActionResult>`
  - `type StaffRow = { id: string; name: string; email: string; role: StaffRole; active: boolean; storeIds: string[] }`

- [ ] **Step 1: Write the failing test** — `lib/settings/staff-rules.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { staffChangeError } from "./staff-rules";

describe("staffChangeError", () => {
  it("allows changes to other staff", () => {
    expect(staffChangeError({ actorStaffId: "a", targetStaffId: "b", nextRole: "cashier", nextActive: false })).toBeNull();
  });
  it("stops owners deactivating themselves", () => {
    expect(staffChangeError({ actorStaffId: "a", targetStaffId: "a", nextRole: "owner", nextActive: false })).toBe(
      "You can't deactivate your own account.",
    );
  });
  it("stops owners demoting themselves", () => {
    expect(staffChangeError({ actorStaffId: "a", targetStaffId: "a", nextRole: "manager", nextActive: true })).toBe(
      "You can't change your own role. Ask another owner.",
    );
  });
  it("allows owners to save their own row unchanged", () => {
    expect(staffChangeError({ actorStaffId: "a", targetStaffId: "a", nextRole: "owner", nextActive: true })).toBeNull();
  });
});
```

Run: `npx vitest run lib/settings/staff-rules.test.ts` → FAIL (cannot resolve).

- [ ] **Step 2: Implement** — `lib/settings/staff-rules.ts`

```ts
import type { StaffRole } from "@/lib/auth/roles";

type StaffChange = {
  actorStaffId: string;
  targetStaffId: string;
  nextRole: StaffRole;
  nextActive: boolean;
};

export function staffChangeError({ actorStaffId, targetStaffId, nextRole, nextActive }: StaffChange): string | null {
  if (actorStaffId !== targetStaffId) return null;
  if (!nextActive) return "You can't deactivate your own account.";
  if (nextRole !== "owner") return "You can't change your own role. Ask another owner.";
  return null;
}
```

Run: `npx vitest run lib/settings/staff-rules.test.ts` → PASS.

- [ ] **Step 3: Write the staff actions** — `lib/settings/staff-actions.ts`

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { friendlyDbError } from "@/lib/db-error";
import { formToObject, staffCreateSchema, staffUpdateSchema } from "./schemas";
import { staffChangeError } from "./staff-rules";

export async function createStaff(_: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireRole("owner");
  const parsed = staffCreateSchema.safeParse(formToObject(formData, ["storeIds"]));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const input = parsed.data;

  const admin = createAdminClient();
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
  });
  if (userError || !created.user) {
    return { ok: false, fieldErrors: { email: userError?.message ?? "Couldn't create this login." } };
  }

  const supabase = await createClient();
  const { data: staff, error } = await supabase
    .from("staff")
    .insert({ user_id: created.user.id, name: input.name, email: input.email, role: input.role })
    .select("id")
    .single();
  if (error || !staff) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: friendlyDbError(error) };
  }

  if (input.storeIds.length > 0) {
    const { error: storesError } = await supabase
      .from("staff_stores")
      .insert(input.storeIds.map((storeId) => ({ staff_id: staff.id, store_id: storeId })));
    if (storesError) return { ok: false, error: friendlyDbError(storesError) };
  }

  revalidatePath("/settings/staff");
  return { ok: true, message: `${input.name} can now sign in with the temporary password.` };
}

export async function updateStaff(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const actor = await requireRole("owner");
  const parsed = staffUpdateSchema.safeParse(formToObject(formData, ["storeIds"]));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const input = parsed.data;

  const blocked = staffChangeError({
    actorStaffId: actor.id,
    targetStaffId: input.id,
    nextRole: input.role,
    nextActive: input.active,
  });
  if (blocked) return { ok: false, error: blocked };

  const supabase = await createClient();
  const { error } = await supabase.from("staff").update({ role: input.role, active: input.active }).eq("id", input.id);
  if (error) return { ok: false, error: friendlyDbError(error) };

  const { error: clearError } = await supabase.from("staff_stores").delete().eq("staff_id", input.id);
  if (clearError) return { ok: false, error: friendlyDbError(clearError) };
  if (input.storeIds.length > 0) {
    const { error: storesError } = await supabase
      .from("staff_stores")
      .insert(input.storeIds.map((storeId) => ({ staff_id: input.id, store_id: storeId })));
    if (storesError) return { ok: false, error: friendlyDbError(storesError) };
  }

  revalidatePath("/settings/staff");
  return { ok: true, message: "Staff member saved." };
}
```

- [ ] **Step 4: Write the staff UI**

`components/settings/staff-dialog.tsx`:

```tsx
"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import { Checkbox } from "@/components/_ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/_ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/_ui/select";
import FormMessage from "@/components/_common/form-message";
import { createStaff, updateStaff } from "@/lib/settings/staff-actions";
import type { ActionResult } from "@/lib/action-result";
import type { StaffRow } from "./staff-table";

type StaffDialogProps = {
  member?: StaffRow;
  stores: { id: string; name: string }[];
  trigger: ReactNode;
};

const ROLE_HINTS = {
  cashier: "Sells and looks up orders and customers.",
  manager: "Also manages products, stock, refunds and reports.",
  owner: "Full access to every store and to Settings.",
};

export default function StaffDialog({ member, stores, trigger }: StaffDialogProps) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<keyof typeof ROLE_HINTS>(member?.role ?? "cashier");
  const [state, action, pending] = useActionState<ActionResult, FormData>(member ? updateStaff : createStaff, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form action={action} className="flex flex-col gap-4 p-6">
          <DialogHeader>
            <DialogTitle>{member ? `Edit ${member.name}` : "Add staff member"}</DialogTitle>
            <DialogDescription>
              {member ? member.email : "Share the temporary password with them. They can change it from the sign-in page."}
            </DialogDescription>
          </DialogHeader>
          <FormMessage result={state && !state.ok ? state : null} />
          {member ? (
            <input type="hidden" name="id" value={member.id} />
          ) : (
            <>
              <Field label="Name" htmlFor="staff-name" error={fieldErrors?.name}>
                <Input id="staff-name" name="name" required maxLength={120} />
              </Field>
              <Field label="Email" htmlFor="staff-email" error={fieldErrors?.email}>
                <Input id="staff-email" name="email" type="email" required />
              </Field>
              <Field label="Temporary password" htmlFor="staff-password" hint="At least 8 characters" error={fieldErrors?.password}>
                <Input id="staff-password" name="password" type="text" required minLength={8} autoComplete="off" />
              </Field>
            </>
          )}
          <Field label="Role" htmlFor="staff-role" hint={ROLE_HINTS[role]}>
            <Select name="role" value={role} onValueChange={(value) => setRole(value as keyof typeof ROLE_HINTS)}>
              <SelectTrigger id="staff-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cashier">Cashier</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {role !== "owner" && (
            <fieldset className="flex flex-col gap-2">
              <legend className="caption-style text-soft mb-2">Stores they work in</legend>
              {stores.map((store) => (
                <div key={store.id} className="flex items-center gap-2">
                  <Checkbox id={`store-${store.id}`} name="storeIds" value={store.id} defaultChecked={member?.storeIds.includes(store.id)} />
                  <Label htmlFor={`store-${store.id}`}>{store.name}</Label>
                </div>
              ))}
              {fieldErrors?.storeIds && <span role="alert" className="caption-style text-danger">{fieldErrors.storeIds}</span>}
            </fieldset>
          )}
          {member && (
            <div className="flex items-center gap-2">
              <Checkbox id="staff-active" name="active" defaultChecked={member.active} />
              <Label htmlFor="staff-active">Can sign in</Label>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? "Saving…" : member ? "Save changes" : "Add staff member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`components/settings/staff-table.tsx`:

```tsx
"use client";

import Button from "@/components/_ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/_ui/table";
import StaffDialog from "./staff-dialog";
import type { StaffRole } from "@/lib/auth/roles";

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  storeIds: string[];
};

type StaffTableProps = { staff: StaffRow[]; stores: { id: string; name: string }[] };

export default function StaffTable({ staff, stores }: StaffTableProps) {
  const storeName = (id: string) => stores.find((store) => store.id === id)?.name ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2>Staff</h2>
        <StaffDialog stores={stores} trigger={<Button variant="primary" size="md">Add staff member</Button>} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Stores</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <span className="block">{member.name}</span>
                <span className="caption-style text-subtle block">{member.email}</span>
              </TableCell>
              <TableCell className="capitalize">{member.role}</TableCell>
              <TableCell>{member.role === "owner" ? "All stores" : member.storeIds.map(storeName).join(", ")}</TableCell>
              <TableCell>{member.active ? "Active" : "Deactivated"}</TableCell>
              <TableCell className="text-right">
                <StaffDialog member={member} stores={stores} trigger={<Button variant="secondary" size="sm">Edit</Button>} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

`app/(app)/settings/staff/page.tsx`:

```tsx
import type { Metadata } from "next";
import StaffTable from "@/components/settings/staff-table";
import { requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffSettingsPage() {
  await requireRole("owner");
  const supabase = await createClient();
  const [{ data: staff }, { data: stores }] = await Promise.all([
    supabase.from("staff").select("id, name, email, role, active, staff_stores(store_id)").order("name"),
    supabase.from("stores").select("id, name").order("name"),
  ]);

  const rows = (staff ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    role: member.role,
    active: member.active,
    storeIds: member.staff_stores.map((assignment) => assignment.store_id),
  }));

  return <StaffTable staff={rows} stores={stores ?? []} />;
}
```

- [ ] **Step 5: Verify**

```bash
npm run lint && npm test && npm run dev
```

As owner: Settings → Staff lists four people. Add "Pat" (cashier, Airport Kiosk, password `temporary1`) → sign out, sign in as Pat → only Airport Kiosk data and three nav items. As owner, edit Olivia Owner and untick "Can sign in" → "You can't deactivate your own account." Deactivate Pat → Pat's next sign-in shows the no-access message.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add staff management settings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Error pages, end-to-end tests and README

**Files:**
- Create: `app/not-found.tsx`, `app/error.tsx`, `playwright.config.ts`, `scripts/e2e.sh`, `e2e/helpers.ts`, `e2e/setup.spec.ts`, `e2e/roles.spec.ts`, `README.md`
- Modify: `.gitignore` (Playwright output)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the error pages**

`app/not-found.tsx`:

```tsx
import Button from "@/components/_ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1>Page not found</h1>
      <p className="text-subtle max-w-[24em]">This page doesn't exist, or your role doesn't have access to it.</p>
      <Button href="/register" variant="secondary" size="md">Go to the register</Button>
    </main>
  );
}
```

`app/error.tsx`:

```tsx
"use client";

import Button from "@/components/_ui/button";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1>Something went wrong</h1>
      <p className="text-subtle max-w-[24em]">Try again. If it keeps happening, check that the database is running.</p>
      <Button variant="secondary" size="md" onClick={reset}>Try again</Button>
    </main>
  );
}
```

- [ ] **Step 2: Configure Playwright**

```bash
npx playwright install chromium
printf '\n# playwright\n/test-results/\n/playwright-report/\n' >> .gitignore
```

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
```

`scripts/e2e.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
npx supabase db reset --no-seed
npx playwright test --grep @fresh
npx supabase db reset
npx playwright test --grep-invert @fresh
```

`e2e/helpers.ts`:

```ts
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
```

- [ ] **Step 3: Write the end-to-end tests**

`e2e/setup.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("first run sets up the shop and signs the owner in @fresh", async ({ page }) => {
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByLabel("Business name").fill("Corner Shop");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Store name").fill("Main Street");
  await page.getByLabel("Currency").fill("eur");
  await page.getByLabel("Standard tax rate (%)").fill("21");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill("Sam Owner");
  await page.getByLabel("Email").fill("sam@corner.test");
  await page.getByLabel("Password").fill("correct-horse");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("link", { name: "Settings" }).first()).toBeVisible();

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
```

`e2e/roles.spec.ts`:

```ts
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
  await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
});

test("a deactivated account is turned away", async ({ page }) => {
  await signIn(page, "inactive@demo.test");
  await expect(page).toHaveURL(/\/login\?error=no-access$/);
  await expect(page.getByRole("alert")).toContainText("doesn't have access");
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
  await page.goto("/settings/staff");
  await page.getByRole("row", { name: /Olivia Owner/ }).getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Can sign in").click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toHaveText("You can't deactivate your own account.");
});
```

- [ ] **Step 4: Run every test suite**

```bash
npm run lint && npm test && npm run test:db && npm run test:e2e && npm run build
```

Expected: lint clean; Vitest all pass; pgTAP `All tests successful.`; Playwright `1 passed` (fresh) then `8 passed`; build succeeds. Leave the database seeded (the script ends with a seeded reset).

- [ ] **Step 5: Review the screens**

Run the `better-interface` skill over `/login`, `/setup`, the app shell, and the three Settings pages. Fix what it flags within these files, rerun `npm run test:e2e`, and note anything deferred in the commit message.

- [ ] **Step 6: Write `README.md`**

````markdown
# POS

A free, open-source point of sale for shops, cafés and restaurants. Self-host it with your own Supabase database: your sales data stays yours.

> Status: foundation. Staff sign-in, setup, roles, stores, tax and staff settings work today. Checkout, products, orders and reports are being built next.

## Quick start

You need Node 20+, Docker Desktop, and npm.

```bash
npm install
npm run db:start      # starts Supabase locally in Docker
npm run env:local     # writes .env.local from the local stack
npm run dev
```

Open http://localhost:3000 and sign in with a demo account (password `password`):

| Email | Role |
| --- | --- |
| owner@demo.test | Owner — everything, every store |
| manager@demo.test | Manager — products, stock, refunds, reports |
| cashier@demo.test | Cashier — sell, orders, customers |

To try the first-run setup instead, run `npx supabase db reset --no-seed` and open the app in a private window.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the app |
| `npm test` | Unit tests (money, tax, routing, validation) |
| `npm run test:db` | Database tests: schema and access rules (pgTAP) |
| `npm run test:e2e` | End-to-end tests (resets the local database) |
| `npm run db:reset` | Rebuild the local database with demo data |
| `npm run db:types` | Regenerate TypeScript types from the schema |

## Deploying

1. Create a Supabase project. Run `npx supabase link --project-ref <ref>` then `npx supabase db push` (this does not load demo data).
2. Deploy the Next.js app anywhere that runs Node (Vercel works out of the box). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Open the site. You'll be taken to setup to create your business, first store and owner account.

## How it's built

Next.js 16, React 19, Tailwind 4 and Supabase (Postgres, Auth, row-level security). Roles are enforced in the database, not just the UI. Money is stored as whole cents. Read `CONVENTIONS.md` before contributing; `docs/superpowers/specs/` has the design docs.

## License

MIT
````

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add error pages, end-to-end tests and README

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Publish (ask first)

**Files:** none.

- [ ] **Step 1: Ask the user before anything leaves the machine**

Ask: "Ready to publish? I'll create the public GitHub repo `JohnCarl-30/pos`, push `main` (the spec commit), push `foundation-7c2e`, open a PR and merge it." Stop until they say yes.

- [ ] **Step 2: On approval, create the repo and push**

```bash
cd /Users/dyeyyyc/Documents/pos
git ls-remote --heads https://github.com/JohnCarl-30/pos.git 2>/dev/null || true
gh repo create JohnCarl-30/pos --public --description "Open-source point of sale for shops, cafés and restaurants" --source . --remote origin
git push -u origin main
git ls-remote --heads origin foundation-7c2e
git push -u origin foundation-7c2e
```

Expected: the `ls-remote` for `foundation-7c2e` prints nothing before its push. If a push is declined or blocked, stop and ask the user.

- [ ] **Step 3: Open and merge the PR**

```bash
gh pr create --base main --head foundation-7c2e --title "POS foundation: schema, auth, setup, app shell, settings" --body "$(cat <<'EOF'
Implements sub-project 1 from docs/superpowers/specs/2026-10-14-foundation-design.md.

- Supabase schema with row-level security per role (pgTAP-tested)
- Staff sign-in, password reset, one-time setup wizard
- Role-aware app shell with store switcher and ⌘K
- Settings for stores, registers, tax classes/rates and staff
- Unit, database and end-to-end tests

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --merge --delete-branch
```
