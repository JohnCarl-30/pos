# POS — Sub-project 3: Register (checkout)

Date: 2026-10-14
Status: Draft for review
Builds on: foundation (PR #1) and catalog & inventory (PR #2)

## Purpose

Give cashiers a fast, touch-friendly till that sells from the catalog, applies discounts within limits, takes cash, card and split payments, prints receipts, and reconciles the cash drawer at the end of a shift. Every price and total is decided by the database, never trusted from the browser.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Till sessions | Required: open with a starting float, close with a counted cash amount | Makes end-of-day cash-up (sub-project 5) possible; standard POS practice |
| Discounts | Per line or whole sale, % or fixed amount; cashiers capped per store (default 20%); above the cap needs a manager or owner to approve on the till | Speed for normal sales, control over large discounts |
| Receipts | Printed from the browser, 80mm layout, reprintable | Works with any printer the device already supports; no email service to configure |
| Extras in v1 | Attach a customer (search or quick-add); out-of-stock warnings (sale still allowed) | Cheap and useful daily; holding sales and price overrides come later |
| Totals | Calculated in one database function from current catalog prices; the screen mirrors the same maths for the live total | A tampered browser can't change prices or totals |

## A. Database (migration `20261014000009_register.sql`)

### Changes to existing tables
- `stores`:
  - add `max_cashier_discount_bps integer not null default 2000 check (between 0 and 10000)`;
  - add `receipt_footer text check (length <= 300)`.
- `orders`:
  - add `discount_approval_id uuid` (FK to `discount_approvals`, nullable);
  - add `discount_by uuid` (FK to `staff`, nullable). This records who gave the discount: the approver if there was one, otherwise the cashier.
- `register_sessions`: add `close_note text check (length <= 300)`.
- `order_items`:
  - add `line_discount_bps integer` (nullable) and `line_discount_amount bigint` (nullable). These keep what the cashier entered.
  - The existing `discount` column holds the final allocated discount in minor units, including the line's share of any whole-sale discount.

### New table `discount_approvals`
| Column | Type |
|---|---|
| `id` | uuid pk |
| `store_id` | uuid → stores |
| `approved_by` | uuid → staff (manager or owner) |
| `requested_by` | uuid → staff (the cashier) |
| `max_bps` | integer, 0–10000 — the largest discount this approval covers, as a share of the sale's subtotal |
| `expires_at` | timestamptz, created + 10 minutes |
| `used_at` | timestamptz, nullable |
| `created_at` | timestamptz |

**Access:**
- RLS on; no direct insert, update or delete for `authenticated`.
- Staff may read rows for their stores.
- Rows are created only by the server action that verifies the approver's credentials, using the service-role client. This is the third, narrowly scoped use of that client, after setup and creating staff.

### Discount rules (the same in SQL and TypeScript)
- A line discount is either a percentage (`bps`) or an amount, never both, and it can't exceed the line's gross (`unit_price × quantity`).
- The whole-sale discount is a percentage or an amount applied to the subtotal after line discounts, and it can't exceed that subtotal.
- The whole-sale discount is spread across lines in proportion to each line's post-line-discount amount. The largest-remainder method keeps the split exact to the minor unit, with ties going to earlier lines.
- **Effective discount share** = total discount ÷ gross subtotal, compared in basis points.
- If the share is above the store's `max_cashier_discount_bps` and the seller is a cashier, a valid approval is required. Valid means:
  - same store;
  - not expired;
  - not used;
  - `max_bps` ≥ the share.
- Managers and owners need no approval.

### Tax
Per line, after the discount, using the variant's product tax class and the store's rate for that class (0 if none). It uses the store's `prices_include_tax` and half-even rounding, exactly as `lib/tax.ts`.

### Functions
- **`public.open_register(p_register_id uuid, p_opening_cash bigint) returns uuid`**
  - Security invoker.
  - Inserts a session with `opened_by` = the caller's staff id.
  - The existing unique index stops a second open session on the same register: 23505, mapped to "This till is already open".
- **`public.close_register(p_session_id uuid, p_counted_cash bigint, p_note text default null) returns jsonb`**
  - Security definer.
  - The caller must be active staff with access to the session's store, and the session must be open.
  - Locks the session and sets `closed_by`, `closed_at` and `counted_cash`. A note is saved in `close_note`.
  - Returns `{ opening_cash, cash_sales, expected_cash, counted_cash, difference }`. `cash_sales` is the sum of cash payment amounts on completed orders in the session; the amount already excludes change.
- **`public.create_order(p_session_id uuid, p_lines jsonb, p_order_discount jsonb, p_approval_id uuid, p_customer_id uuid, p_payments jsonb) returns jsonb`**
  - Security definer, `search_path = ''`.
  - **Input shapes:**
    - `p_lines` is an array of `{ variant_id, quantity, discount_bps?, discount_amount? }`;
    - `p_order_discount` is `{ bps? , amount? }` or null;
    - `p_payments` is an array of `{ method, amount, tendered?, reference? }`.
  - **Steps:**
    1. The caller is an active staff member with access to the session's store, and the session is open (row locked).
    2. Every line's variant is active, its product is active, and its quantity is between 1 and 9,999. The function reads the price, SKU, name and tax class from the catalog.
    3. It computes the discounts, allocation, tax and totals using the rules above.
    4. Discount authority: a cashier above the cap needs a valid approval, which is then marked used. `discount_by` is set.
    5. Payments:
       - each payment amount is greater than 0, and they sum exactly to the total;
       - only cash may have `tendered`, which must be ≥ the amount, and `change = tendered − amount`;
       - card and other may carry a `reference` of up to 100 characters.
    6. The receipt number is `registers.next_receipt_number`, read under `for update` and then incremented.
    7. It inserts the order (`status = 'completed'`), the items (snapshot name, SKU, unit price, quantity, entered discount, allocated discount, tax rate, tax, line total) and the payments.
    8. For each tracked variant in the store, it inserts a `sold` movement (−quantity, `staff_id` = caller, note = "Receipt #N").
  - **Returns** `{ order_id, receipt_number, total, change }`.
  - **Errors:**
    - 42501: not allowed;
    - P0002: unknown or inactive item;
    - 22023: invalid input or payments don't match;
    - P0001 `'discount needs approval'`;
    - P0001 `'till is closed'`.
- **Execute grants:** revoked from `public` and `anon` on all three functions, granted to `authenticated`.

### Existing policies
The foundation's policies still let staff insert `orders`, `order_items` and `payments` rows directly, which would let a tampered client record a sale with made-up totals. This migration revokes `insert` on those three tables from `authenticated`, so `create_order` (security definer) becomes the only way to record a sale. The pgTAP tests assert that a direct insert fails. The read and manager-update policies are unchanged.

## B. Register screen (`/register`, all roles)

- **Register choice:**
  - The device remembers its register in a cookie, `pos-register`.
  - If none is chosen, or the chosen register is in another store, the screen shows a picker of the current store's registers.
- **Till closed:** an "Open till" form with the starting cash, entered with `parseMoney` in the store currency.
- **Selling layout** (two columns on desktop and tablet landscape; on narrow screens the cart is a bottom sheet):
  - **Left side:**
    - a search box that also takes barcode scans. Enter with an exact barcode or SKU match adds the item immediately; otherwise the grid filters by name.
    - category tabs, with "All" first.
    - a grid of large tiles (category colour, name, variant and price). Products with several variants open a small variant picker.
    - tracked items at 0 or below show an "Out of stock" badge; a sale is still allowed.
    - archived items are hidden.
  - **Right side, the cart:**
    - each line has quantity −/+, a discount control (% or amount) and remove;
    - then a whole-sale discount, "+ Customer", and subtotal, discounts, tax and total, computed live by `lib/checkout.ts` (the same rules as the database);
    - lines for tracked items whose cart quantity is more than the stock on hand show a warning.
  - **Touch:** every control is at least 44px.
- **Pay dialog:**
  - Cash: tendered amount, quick buttons for exact and common notes, and the change shown live.
  - Card and Other: an optional reference.
  - Split: add several payments until the remaining amount is 0.
  - "Complete sale" is disabled until the payments match the total, and while offline.
- **Manager approval:**
  - If the cart's discount share goes over the cap for a cashier, "Complete sale" becomes "Get approval".
  - A manager or owner types their email and password.
  - The server checks their role and store access, then creates a single-use approval for the current share. The cashier stays signed in. The approval is attached to the sale.
- **Sale done:** a done panel with the receipt number and change due, "Print receipt" and "New sale".
- **Header actions:** register name, "Close till" (counted cash, then expected vs counted and the difference), "Reprint last receipt".

## C. Receipt page (`/register/receipts/[orderId]`)

- **Layout:** 80mm-wide print layout. App chrome is hidden in print. It opens in a new tab and triggers the print dialog.
- **Contents:**
  - business name, store name and address;
  - receipt number, register, date and time in the store's timezone, cashier and customer name;
  - each line with quantity × price, discount and total;
  - subtotal, discount total, tax by rate, total;
  - payments, tendered and change;
  - the store's footer text.
- **Access:** staff with access to that store; anyone else gets a 404.

## D. Customers in the cart

- **Search:** by name, email or phone. Up to 10 matches appear as you type, after a 250 ms pause.
- **Quick add:** a name (required), plus an optional email and phone. This uses the existing customer insert policy.
- **On the receipt:** the customer's name only.

## E. Settings addition

Settings → Stores gains two fields: "Cashier discount limit (%)" and "Receipt footer".

## F. Testing

- **Vitest (`lib/checkout.ts`):**
  - line and whole-sale discounts;
  - largest-remainder allocation;
  - tax-included and tax-added totals;
  - the discount share;
  - payment validation and change.
- **Shared test vectors:** a set of cart cases in one JSON file is checked by Vitest and by pgTAP (loaded into the test), so the screen and the database agree to the minor unit.
- **pgTAP:**
  - sales: totals, receipt numbers going up by one, stock going down (tracked only), and payment checks;
  - discount authority: the cashier cap, a valid approval, a reused or expired approval, and another store's approval;
  - tills: a closed or foreign session, a register in another store, opening and closing, and expected cash;
  - access: inactive staff and anon.
- **Playwright:**
  - a cashier opens the till, scans a barcode, adds a second item from the grid, gives a 10% line discount, pays cash with change, sees the receipt, and the stock went down;
  - a 50% discount by a cashier needs approval, and the manager's credentials let it through;
  - a split card + cash payment;
  - closing the till shows the expected cash;
  - the receipt page returns 404 for staff of another store.

## Done when

A cashier can open a till, sell with discounts within their limit (or with approval), take cash, card or split payments, attach a customer, print and reprint receipts, and close the till with expected vs counted cash. All totals come from the database, and every test above passes along with the existing suites.

## Out of scope

- holding or parking sales;
- price overrides;
- refunds and voids (sub-project 4);
- emailed receipts;
- cash rounding to 0.05;
- tips;
- payment-terminal integration;
- offline selling;
- multiple cash drawers per register.
