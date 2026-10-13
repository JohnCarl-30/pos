# POS — Sub-project 1: Foundation

Date: 2026-10-14
Status: Draft for review

## Purpose

An open-source, MIT-licensed point-of-sale app that any small business — shop, café, restaurant, service counter — can self-host for free. It must look as polished as the `sales-crm` dashboard and actually work: real data, real logins, real sales.

This spec covers only the foundation. Later sub-projects each get their own spec → plan → build cycle:

| # | Sub-project | Scope |
|---|---|---|
| 1 | **Foundation** (this spec) | Repo, schema, auth, first-run setup, app shell |
| 2 | Catalog & inventory | Products, categories, variants, barcodes, stock, CSV import/export |
| 3 | Register | Product grid, search/scan, cart, discounts, tax, split payments, receipts |
| 4 | Orders & customers | History, refunds/voids, customer profiles |
| 5 | Reports | Sales by day/product/staff, end-of-day cash-up, dashboard |
| 6 | Food-service add-ons | Modifiers, tables & tabs, kitchen view — toggleable |

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Deployment model | Self-hosted, one business per install; many stores and registers inside it | Fits open source; avoids cross-tenant leakage bugs; `store_id` on every table keeps a path to multi-tenant open |
| Connectivity | Online-only in v1 | Simpler; an offline banner blocks checkout until the connection returns |
| Payments | Record-only (cash with change calculation, card, other) | No processor lock-in; works in every country |
| Tax & currency | Per-store currency, per-store tax rates, per-store tax-inclusive or tax-exclusive pricing | Covers VAT, GST and US sales tax |
| Receipt numbers | Sequential per register | Standard and auditable |
| Design | Reuse `sales-crm` look and `_ui`; the Register is touch-optimised | No separate design exists; consistent with the CRM |
| Repo | Fresh `JohnCarl-30/pos`, starter files copied from `sales-crm` | Clean history and name; CRM untouched |

## A. Repo setup

Copy from `/Users/dyeyyyc/Documents/sales-crm`:

- Config: `package.json` (renamed `pos`), `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.prettierrc`, `components.json`, `.gitignore`, `.vscode/`
- Agent setup: `.claude/skills/`, `.agents/skills/`, `skills-lock.json`, `AGENTS.md`, `CLAUDE.md`
- Code: `components/_ui/`, `components/_common/` (sidebar, filter-menu, segment-bar, scroll-to-top; `sparkline` is skipped because it imports CRM data, and it returns with Reports), `components/motion-primitives/`, `lib/utils.ts`, `lib/easings.ts`, `lib/inline-asset.ts`, `lib/sidebar.ts`, `hooks/`, `fonts/`, `scripts/`, `app/globals.css`, `app/layout.tsx`, icons
- `LICENSE` (MIT, with the copyright line kept)

Do not copy: `components/companies/`, `data/`, `stores/companies-store.ts`, `lib/companies.ts`, `lib/csv.ts` (comes back in sub-project 2), `app/sitemap.ts`, `app/llms.txt`, `lib/seo.ts`, `.builderrules`, `.mcp.json`.

New:

- `CONVENTIONS.md`: `sales-crm` references this file, but it was never committed. Write it from `.builderrules` plus the rule summary in `sales-crm/CLAUDE.md`, dropping marketing-site rules (hero inlining, SEO layer, `llms.txt`). If the original file turns up, use that instead.
- `app/robots.ts` disallows all. `metadata.robots` is set to `noindex`.
- The `x`, `square`, `check-square` and `minus-square` icons that `_ui/dialog` and `_ui/checkbox` import from `companies/` folders move to `_common/`, and their imports are updated.
- `README.md`: what it is, screenshot, quickstart (`npm i`, `supabase start`, `npm run dev`), env vars, deploy notes, contributing.
- `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase's current name for the public key), `SUPABASE_SERVICE_ROLE_KEY` (server-only, used only by setup).
- `.mcp.json` pointing to the user's own Supabase project ref (the user supplies it; it is not the CRM's).
- `supabase/` from `supabase init`: `config.toml`, `migrations/`, `seed.sql`, `tests/`.

New dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, and dev-only `vitest`, `@playwright/test`, `supabase` (CLI).

## B. Database

All money is stored as `bigint` minor units (cents). All tables have `id uuid default gen_random_uuid()`, `created_at timestamptz default now()`, and RLS enabled.

| Table | Key columns |
|---|---|
| `business` | single row: `name`, `setup_completed_at` |
| `stores` | `name`, `address`, `currency` (ISO 4217), `prices_include_tax bool`, `timezone` |
| `registers` | `store_id`, `name`, `next_receipt_number int` |
| `staff` | `user_id → auth.users` (unique), `name`, `email` (copied at creation so Settings can list it; `auth.users` isn't readable through RLS), `role` enum(`owner`,`manager`,`cashier`), `active bool` |
| `staff_stores` | `staff_id`, `store_id` (which stores a staff member can work in; owners implicitly all) |
| `tax_classes` | business-wide: `name` (e.g. "Standard", "Food", "Exempt"), `is_default bool` (exactly one) |
| `tax_rates` | `store_id`, `tax_class_id`, `name` (e.g. "VAT 12%"), `rate_bps int` (basis points); unique (`store_id`, `tax_class_id`) |
| `categories` | `name`, `sort_order` |
| `products` | `category_id`, `name`, `description`, `tax_class_id` (defaults to the default class), `active bool` |
| `product_variants` | `product_id`, `name`, `sku` unique, `barcode` unique nullable, `price bigint`, `cost bigint` nullable |
| `stock_levels` | `variant_id`, `store_id`, `quantity int`, `track bool`; PK (`variant_id`, `store_id`) |
| `customers` | `name`, `email`, `phone`, `notes` |
| `register_sessions` | `register_id`, `opened_by`, `opened_at`, `opening_cash bigint`, `closed_by`, `closed_at`, `counted_cash bigint` |
| `orders` | `store_id`, `register_id`, `session_id`, `staff_id`, `customer_id` nullable, `receipt_number`, `status` enum(`completed`,`voided`,`refunded`,`partially_refunded`), `subtotal`, `discount_total`, `tax_total`, `total` |
| `order_items` | `order_id`, `variant_id`, snapshot `name`, `sku`, `unit_price`, `quantity`, `discount`, `tax_rate_bps`, `tax`, `line_total` |
| `payments` | `order_id`, `method` enum(`cash`,`card`,`other`), `amount`, `tendered` nullable, `change` nullable, `reference` nullable |

Catalog (categories, products, variants, customers) and tax classes are business-wide. Stock, tax rates, registers and orders are per store. A product's tax at a store is the rate for its tax class at that store; a missing rate means 0%.

Order items keep a copy of the name, price and tax at the time of sale, so later catalog edits never change past receipts.

### Access control (RLS)

Helper SQL functions live in a non-exposed `private` schema (`security definer`, `stable`, `search_path = ''`): `private.staff_id()`, `private.staff_role()`, `private.can_access_store(store_id)`. (`current_role` is a reserved Postgres keyword, so that name is avoided.) The `anon` role gets no table access at all.

| Table group | cashier | manager | owner |
|---|---|---|---|
| business, stores, registers | read (assigned stores) | read (assigned stores) | full |
| staff, staff_stores | read self | read (assigned stores) | full |
| tax_classes, tax_rates | read | read | full |
| categories, products, variants | read | full | full |
| stock_levels | read | full (assigned stores) | full |
| customers | read, insert, update | full | full |
| register_sessions, orders, order_items, payments | insert/read in assigned stores | + update (void/refund) | full |

Inactive staff get no access. Order writes in sub-project 3 go through one `create_order` Postgres function so that receipt numbers, stock and totals stay consistent in a single transaction. This sub-project only defines the tables and policies.

### Seed

`seed.sql` sets up a demo business ("Demo Shop"), two stores ("Main Street" and "Airport Kiosk", both USD, prices exclude tax, so the store switcher can be tried), tax classes Standard (8.25%) and Exempt (0%), three registers, four users (`owner@demo.test`, `manager@demo.test` on both stores, `cashier@demo.test`, and a deactivated `inactive@demo.test`; password `password`), 6 categories, about 30 products with variants and stock, and 10 customers. Seed data is for local development only and is never applied to production.

## C. Auth and first run

- Supabase email and password auth through `@supabase/ssr` (server client, browser client, cookie refresh in `proxy.ts`, which is Next 16's renamed middleware; confirm against `node_modules/next/dist/docs/` before writing it).
- `proxy.ts`: unauthenticated users go to `/login`. If `business.setup_completed_at` is null, every route goes to `/setup`. Once setup is complete, `/setup` returns 404.
- `/login`: email and password form, plus a "forgot password" link that uses Supabase reset.
- `/setup` (one-time wizard, 3 steps): business name → first store (name, currency, tax-inclusive toggle, standard tax rate; creates the default "Standard" tax class) → owner account (name, email, password). A server action uses the service-role key to create the auth user and all rows in one go, then signs the owner in.
- Staff management (Settings → Staff): the owner invites by email with a role and stores, and can deactivate staff. Only the list is built here. The invite flow can be a plain "create with temp password" in v1.
- Signing out is in the sidebar footer.

## D. App shell

- Routes (App Router, group `(app)` with shared layout): `/register`, `/products`, `/orders`, `/customers`, `/reports`, `/settings`. `/` redirects to `/register`.
- The layout reuses the CRM `Sidebar` (resizable, with the width script in `<head>`). Nav items are filtered by role: cashiers see Register, Orders and Customers; managers also see Products and Reports; owners also see Settings.
- Store switcher sits at the top of the sidebar, only when the staff member has more than one store. The selected store is held in a cookie so server components can read it.
- A ⌘K command menu (the existing `command.tsx`) navigates between pages. Products and customers are added to it in later sub-projects.
- Every page shows a header and an empty state that names what's coming. Settings has working Stores, Tax (classes plus each store's rates) and Staff lists (read plus basic create and edit, owner only), because later sub-projects depend on them.
- The Register route uses touch sizing: minimum 44px targets, and no hover-only actions.
- An offline banner appears across the app when `navigator.onLine` is false. On `/register` it also disables checkout (the hook is built here and used in sub-project 3).

## E. Error handling

- Server actions validate input with zod and return `{ ok: false, error }`. Forms show field errors inline through `field.tsx`.
- RLS denials surface as "You don't have access to this" and are never shown as raw Postgres errors.
- `app/error.tsx` and `app/not-found.tsx` are styled to match the app.

## F. Testing

- **pgTAP** (`supabase test db`): for every role, assert allowed and denied reads and writes on each table, deny inactive staff, and deny access to unassigned stores.
- **Vitest**: `lib/money.ts` (format in store currency, cents math) and `lib/tax.ts` (inclusive and exclusive calculation, rounding half-even per line).
- **Playwright** (one smoke spec): empty database → setup wizard → owner lands on `/register` → sign out → cashier login → Settings and Products are hidden from the nav and return 404 by direct URL.
- `npm run lint` and `npm run build` are clean.

## Done when

A stranger can clone the repo, run `npm i && supabase start && npm run dev`, complete setup (or use the seeded logins), and see each role get the correct pages, with every test above passing.

## Out of scope for this sub-project

Product editing UI, checkout, receipts, refunds, reports, offline sales, payment processors, multi-tenant hosting, food-service features.
