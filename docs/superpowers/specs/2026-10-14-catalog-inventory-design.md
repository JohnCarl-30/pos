# POS — Sub-project 2: Catalog & inventory

Date: 2026-10-14
Status: Draft for review
Builds on: `2026-10-14-foundation-design.md` (merged in PR #1)

## Purpose

Let managers and owners build and maintain the catalog — by hand or by CSV — and keep exact stock per store, with a history that explains every change. It must suit a café (one-variant items, many untracked), a grocery (barcodes, tax-exempt goods) and a clothing shop (several variants per product) alike.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Stock model | Append-only stock history; a trigger keeps `stock_levels.quantity` in step | Count and history can never disagree; checkout (sub-project 3) just appends `sold` entries; reports (5) get "why" for free |
| Variants | Free-text named variants (existing model) | Covers most shops; no option-matrix complexity |
| CSV import | Add + update matched by SKU, preview first, all-or-nothing apply; never deletes | Bulk price updates without risk of wiping the catalog |
| Photos | Not in this sub-project | Coloured name tiles at the register are enough for v1; photos later as their own piece |
| Deleting | Archive (`active = false`) instead of delete for products and variants | Past sales must keep their references |

## A. Database (migration `20261014000006_inventory.sql`)

### Changes to existing tables
- `product_variants`: add `active boolean not null default true`, `sort_order integer not null default 0`.
- `stock_levels`: add `low_stock_at integer` (nullable, `>= 0`).
- Every variant has one `stock_levels` row per store, created automatically:
  - trigger on `product_variants` insert → rows for every store;
  - trigger on `stores` insert → rows for every existing variant.
  - Both trigger functions live in `private`, `security definer`, `search_path = ''`.

### New table `stock_movements`
| Column | Type |
|---|---|
| `id` | uuid pk |
| `store_id` | uuid → stores, not null |
| `variant_id` | uuid → product_variants, not null |
| `quantity_change` | integer, not null, `<> 0` |
| `reason` | enum `stock_reason`: `received`, `counted`, `damaged`, `transfer_in`, `transfer_out`, `sold`, `returned`, `correction` |
| `staff_id` | uuid → staff, not null |
| `note` | text, ≤ 300 chars |
| `transfer_id` | uuid, nullable — pairs the two halves of a transfer |
| `created_at` | timestamptz default now() |

Indexes: `(store_id, created_at desc)`, `(variant_id, store_id, created_at desc)`, `staff_id`, `transfer_id`.

### Keeping the count exact
- `after insert` trigger on `stock_movements` (`private`, `security definer`) adds `quantity_change` to the matching `stock_levels.quantity`.
- `stock_movements` is append-only: no update or delete policy for anyone; `update`/`delete` privileges revoked from `authenticated`.
- Direct writes to `stock_levels.quantity` are blocked: revoke `insert`, `update` on `stock_levels` from `authenticated`, then grant `update (track, low_stock_at)` only. RLS keeps limiting which rows managers may update.
- **Backfill:** the migration inserts one opening `counted` movement for every existing `stock_levels` row with a non-zero quantity *before* creating the movement trigger, so history sums equal current counts from day one. `staff_id` for these opening rows is the oldest owner. If no staff exist yet (fresh install), there is nothing to backfill.
- **Seed:** `supabase/seed.sql` creates opening stock by inserting `received` movements (the trigger fills `stock_levels`) instead of writing quantities directly.
- Negative stock is allowed (a shop may sell before receiving paperwork); the UI shows it in red.

### Access rules (RLS)
| Action | cashier | manager | owner |
|---|---|---|---|
| Read movements | own stores | own stores | all |
| Insert `received`, `counted`, `damaged`, `correction` | — | own stores, `staff_id` = self | all stores, `staff_id` = self |
| Insert `sold`, `returned`, `transfer_*` | — (only via functions) | — (only via functions) | — (only via functions) |
| Update `track`, `low_stock_at` | — | own stores | all |

Managers and owners keep full catalog writes (categories, products, variants) from the foundation policies.

### Functions
- `public.record_stock_count(p_store_id uuid, p_variant_id uuid, p_counted integer, p_note text)` — security invoker. Locks the `stock_levels` row (`for update`), inserts a `counted` movement of `p_counted - current` (skips if zero). Returns the new quantity.
- `public.transfer_stock(p_from uuid, p_to uuid, p_variant_id uuid, p_quantity integer, p_note text)` — `security definer`, `search_path = ''`. Checks `auth.uid()` maps to an active manager/owner with `private.can_access_store` on **both** stores, `p_from <> p_to`, `p_quantity > 0`. Inserts `transfer_out` (−q) and `transfer_in` (+q) with a shared `transfer_id` in one transaction. `execute` revoked from `public, anon`, granted to `authenticated`.
- `public.import_catalog(p_store_id uuid, p_rows jsonb)` — security invoker (RLS applies). Applies a validated import in one transaction (see D). Raises on any row error so nothing is half-applied.

## B. Products page (`/products`, managers and owners)

- Table modelled on the CRM companies table: name, category, variants count, price (single or range in store currency), stock at the current store (sum of tracked variants; "—" if none tracked), status.
- Toolbar:
  - search across product name, SKU and barcode (a USB barcode scanner typing into the box works);
  - category filter;
  - "Low stock" filter (any tracked variant at or below its `low_stock_at`);
  - "Archived" toggle;
  - CSV export and import;
  - "New product".
- **Product editor** (dialog or side sheet, following existing `_ui` patterns):
  - product name, category, tax class, description, active;
  - variants list, each row: name, SKU, barcode, price, cost, track stock; add, reorder, archive/restore;
  - a new product starts with one variant named "Default";
  - SKU and barcode uniqueness errors appear on the right row;
  - prices and costs are entered and shown with `lib/money.ts` in the current store's currency.
- **Categories dialog:** add, rename, reorder, remove (products become uncategorised).
- Archiving a product archives it everywhere; it disappears from the register (sub-project 3) and from default lists.

## C. Stock

- On each product, a "Stock" tab for the current store. Per variant it shows:
  - quantity, low-stock level and track toggle;
  - actions: **Receive** (+n, note), **Count** (set to n), **Damaged** (−n, note), **Correction** (±n, note required);
  - **Transfer** (to another store the user can access; shown only when they have more than one).
- Recent history per variant: date, reason, change, resulting quantity, who, note.
- **Stock history page** (`/products/stock`): the store's movements with filters for product search, reason and date range, newest first, paginated (50 per page).

## D. CSV import and export

- **Columns** (header row, case-insensitive): `product`, `category`, `variant`, `sku`, `barcode`, `price`, `cost`, `tax_class`, `track`, `stock`. Required: `product`, `sku`, `price`. `variant` defaults to "Default"; `tax_class` defaults to the default class; `track` accepts yes/no/true/false/1/0; `stock` is optional.
- **Parsing:** RFC 4180 (quotes, embedded commas and newlines, `""` escapes), UTF-8 with or without BOM, comma or semicolon delimiter (auto-detected from the header). Money uses `parseMoney` with the current store's currency. Max 5,000 rows / 2 MB.
- **Preview (server action, nothing saved):** each row is classified as `new`, `update` (SKU exists), `unchanged`, or `error` with a reason. Error reasons include:
  - a duplicate SKU in the file;
  - a barcode already used by another SKU;
  - a bad price;
  - an unknown tax class;
  - a product name that matches only an archived product;
  - rows of one product that disagree on category or tax class.

  Categories that don't exist yet are listed as "will be created".
- **Matching rules:**
  - A row whose SKU exists updates that variant (name, barcode, price, cost, track). Its `product`, `category` and `tax_class` values update the variant's parent product; a different `product` value renames it.
  - A row with a new SKU joins the existing active product with the same name (case-insensitive), or else creates a new product. Rows in the file sharing a `product` value become variants of one product.
  - A new SKU whose product name matches only an archived product is an error: "Product X is archived — restore it first".
  - Rows of the same product that disagree on `category` or `tax_class` are all errors: "Rows for X disagree on category".
- **Apply:** enabled only when there are zero error rows. Calls `import_catalog` with the validated rows; on any failure nothing changes. A `stock` value becomes a `counted` movement for the current store (via the same logic as `record_stock_count`).
- **Export:** same columns, current filters applied, one row per variant, using the `toCsv` escaping from the CRM starter (formula-injection safe), stock for the current store.

## E. Error handling

- All writes are Server Actions returning `ActionResult`, guarded by `requireRole("manager")` plus RLS.
- Unique-violation messages are specific: "SKU already used by …", "Barcode already used by …".
- Every update checks that a row actually changed, and an empty result shows "no longer exists — reload".
- Dialog forms follow the established patterns:
  - controlled fields;
  - the form remounts on each open;
  - compare by value, not object identity;
  - no `setState` inside effects.

## F. Testing

- **pgTAP:**
  - after any sequence of movements, `stock_levels.quantity = sum(quantity_change)` for every row;
  - direct `update stock_levels set quantity` is denied;
  - movements cannot be updated or deleted;
  - cashiers cannot insert movements;
  - managers cannot insert in other stores or with another `staff_id`;
  - `sold`/`transfer_*` cannot be inserted directly;
  - `transfer_stock` requires access to both stores and writes a balanced pair;
  - `record_stock_count` writes the right difference;
  - new variants and new stores get stock rows;
  - `import_catalog` is all-or-nothing;
  - the backfill makes history sums equal counts.
- **Vitest:**
  - CSV parser (quotes, embedded newlines, semicolons, BOM, empty lines);
  - import validation (each error reason, product grouping, defaults);
  - export round-trip (export → parse → identical rows).
- **Playwright:**
  - manager creates a product with 2 variants;
  - receives 10 and sees 10, then counts 7 and sees 7 plus history;
  - imports a CSV with one bad row, sees the error, fixes it, and applies;
  - export downloads a file;
  - cashier gets 404 on `/products`.

## Done when

A manager can create, edit, archive and categorise products and variants; receive, count, adjust and transfer stock with a complete history; and import or export the catalog by CSV with a safe preview — with every test above passing and the foundation suites still green.

## Out of scope

Product photos, option-matrix variant generation, purchase orders and suppliers, cost averaging/valuation reports, stock reservations, multi-currency catalogs, checkout (sub-project 3).
