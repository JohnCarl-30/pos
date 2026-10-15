# POS — Sub-project 6a: Counter service (modifiers, tips, kitchen tickets)

Date: 2026-10-15
Status: Draft for review
Builds on: foundation (#1), catalog & inventory (#2), register (#3), orders & customers (#4), reports (#5)

## Purpose

Make the till work for cafés and takeaway counters:
- drinks and dishes can be customised with priced choices ("oat milk +$0.50", "no onions");
- the cashier can add a tip at payment;
- the kitchen gets a printed ticket of what to make.

Everything stays exact to the cent, choices are priced by the database, and tips never count as sales. Table service (tables, open tabs, split bills, kitchen screen) is sub-project 6b.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Order | Counter service first; table service is 6b | Works for every café now, and doesn't change the sale model |
| Modifiers | Reusable groups (min/max choices, options with price changes) attached to products | Set "oat milk" once and use it on every drink |
| How modifiers price | They change the line's unit price; each line stores a snapshot of its choices | Discounts, tax, refunds and the shared pricing rules keep working unchanged |
| Tips | At payment: No tip, 10%, 15%, 20% or Custom; kept separate from sales; split across payments; cash tips count in the drawer | Never taxed, discounted or reported as sales; the drawer still adds up |
| Kitchen tickets | A per-category "Goes to the kitchen" switch; an 80mm ticket of kitchen items only; a button after each sale, plus a per-device auto-print switch | Works with any printer; the kitchen only sees what it makes |

## A. Database (migration `20261015000012_counter_service.sql`)

### Catalog
- **`modifier_groups`:**
  - `id`, `name` (1–60 characters, unique among active groups);
  - `min_choices int ≥ 0`, `max_choices int ≥ 1`, with the check `max_choices ≥ min_choices`;
  - `sort_order int`, `active bool default true`, `created_at`.
- **`modifier_options`:**
  - `id`, `group_id` (cascade), `name` (1–60 characters, unique within the group);
  - `price_delta bigint` between −1,000,000 and 1,000,000 (in cents);
  - `sort_order`, `active`, `created_at`.
- **`product_modifier_groups`:** `product_id` (cascade), `group_id` (restrict), `sort_order`; primary key `(product_id, group_id)`.
- **`categories.kitchen boolean not null default false`.**
- **RLS:** active staff read all three tables; managers and owners insert, update and delete, the same as products. Anon has no access.

### Sales
- `order_items.unit_price` is the price per unit actually charged: variant price + the sum of the chosen options' price changes.
- **`order_item_modifiers`:** `id`, `order_item_id` (cascade), `option_id` (FK, `on delete set null`), `group_name`, `option_name`, `price_delta`, `sort_order`.
  - It is read through `can_access_order` of the parent item, the same as order items.
  - Only the definer functions write it.
- **`orders.tip bigint not null default 0 check (tip >= 0)`**, and **`orders.order_name text check (length between 1 and 40)`**, which is nullable.
- **`payments.tip bigint not null default 0 check (tip >= 0 and tip <= amount)`.** It is the tip part of each payment.
- The new sales tables get the same lockdown as other sales: no direct insert, update or delete for `authenticated`.

### `public.create_order` (dropped and recreated)
`create_order(p_session_id, p_lines, p_order_discount, p_approval_id, p_customer_id, p_payments, p_tip bigint default 0, p_order_name text default null)`.

**Lines.** Each line in `p_lines` gains `option_ids uuid[]`, which can be empty or missing.
- Options are distinct and active, and each belongs to an active group attached to the line's product. Otherwise: 22023 `'{option} isn''t available for {item} any more'`.
- For every active group attached to the product, the number of chosen options is between min and max:
  - below min: 22023 `'pick {group} for {item}'`;
  - above max: 22023 `'pick up to {max} {group} for {item}'`.
- The unit price is the variant price plus the sum of the chosen options' price changes, read from the catalog.
  - If it is below 0: 22023 `'modifiers can''t make {item} cost less than 0'`.
  - It is passed to `private.price_cart` as the line's `price`. `price_cart` itself is unchanged.
- After the order item is inserted, one `order_item_modifiers` row is inserted per chosen option, ordered by group then option sort order.

**Tip.**
- `p_tip` is null or 0 or more, and at most 1,000,000,000. Otherwise: 22023 `'the tip must be 0 or more'`.
- Payments must sum to `total + tip`. Otherwise: 22023 `'payments must add up to the total plus tip'`.
- The tip is split across the payments in proportion to their amounts by largest remainder, with ties going to earlier payments, using a new `private.allocate(amount bigint, bases bigint[]) returns bigint[]`. The result is stored in `payments.tip`.
- Change, tendered amounts and method checks are unchanged.

**Order name.** It is trimmed. Empty becomes null. Over 40 characters: 22023 `'keep the order name under 40 characters'`.

### Cash and reports
- **`private.session_cash`:**
  - returns `(opening_cash, cash_sales, cash_tips, cash_refunds, expected_cash)`;
  - `cash_sales` = cash `amount − tip` on the session's non-voided orders;
  - `cash_tips` = cash `tip` on the same orders;
  - expected = opening + cash_sales + cash_tips − cash_refunds.

  `close_register` returns `cash_tips` as well, and `report_cashups` returns a `cash_tips` column.
- **`report_summary`:**
  - adds `tips` (`sum(orders.tip)` of the sales in range);
  - the method split now uses `payments.amount − payments.tip`, so the methods still add up to net sales.
- **`report_staff`:** adds `tips` per `orders.staff_id`.
- **Unchanged:** `report_products`, `report_trend`, and refunds. Refunds already work from line totals, so tips are never refunded; voided sales are already left out.

## B. TypeScript

- **`lib/modifiers.ts`:**
  - `ModifierGroup`, `ModifierOption`, `Selection` (`Record<groupId, optionId[]>`);
  - `checkSelection(groups, selection): string | null`, which runs the database's rules and messages, without the trailing full stop handled by the caller;
  - `selectionDelta(groups, selection): number`;
  - `selectionKey(optionIds): string`, the sorted ids joined;
  - `selectionLabel(groups, selection): string`, for example "Oat · Extra shot".
- **`lib/tips.ts`:**
  - `TIP_PRESETS = [0, 1000, 1500, 2000]` (basis points);
  - `tipFor(total, bps)`, half-even;
  - `allocateTip(tip, amounts): number[]`, mirroring `private.allocate`.
- **`lib/register/cart.ts`:**
  - `CartLine` gains `optionIds: string[]`, `modifierLabel: string` and `basePrice`;
  - the line key is `variantId + selectionKey`;
  - `addToCart` takes a selection, and the line price is base + delta;
  - `cartInputs` passes the effective price.
- **`saleSchema`:** lines gain `optionIds`; the sale gains `tip` and `orderName`.
- **`completeSale`:** sends `option_ids`, `p_tip` and `p_order_name`.
- **Database error mapping:** new messages, capitalised and with a full stop.
- **`lib/checkout.ts`:** `summarisePayments` takes a `due` value (total + tip). The shared pricing vectors are unchanged.

## C. Screens

### Products (managers and owners)
- **`/products/modifiers`:** a table of groups with name, rule ("Pick 1", "Pick 1–2", "Up to 3", "Optional"), number of options, number of products, and status.
  - **New group** and **Edit** open a dialog:
    - name, min, max;
    - option rows with name, price change (accepts −), active, ↑ and ↓, and Remove;
    - **Add option**.
  - **Archive / Restore** for a group.
  - **Validation:** "Max must be at least min", "Add at least one option", "Option names must be different", and a min that is no larger than the number of active options.
- **Product page:** a "Modifier groups" section with a checkbox per active group and ↑/↓ for the attached ones. It saves with the product form through the existing `save_product(p_store_id, p_product, p_variants)`: `p_product` gains a `modifier_group_ids` array (in order), which replaces that product's attachments. When the key is absent, the attachments are left as they are.
- **Categories dialog:** a "Goes to the kitchen" switch per category.

### Register
- **Choosing modifiers:**
  - Picking a product that has active groups (by tile, scan or the variant dialog) opens the **Modifier dialog**.
  - Each group is a fieldset of large (44px) toggle buttons: radio-like when max is 1, multi-select otherwise. Required groups are marked.
  - A live "{price} each" line updates as choices change.
  - **Add** is disabled with the `checkSelection` message shown until the choices are valid.
- **Cart lines:**
  - show the modifier label under the name, and the unit price includes the modifiers;
  - **Edit choices** reopens the dialog, and a changed selection becomes a different line, merged into an existing one if it matches.
- **Order name:** an optional "Name for the order" field (up to 40 characters) above the totals.
- **Pay dialog:**
  - a tip row at the top: No tip, 10%, 15%, 20% and Custom (a money input);
  - the summary shows Total, Tip and "Due {total + tip}", and payments fill the amount due;
  - **Complete sale** sends the tip.
- **Sale done:**
  - shows the tip;
  - **Print kitchen ticket** appears when any line's category is a kitchen category;
  - an **Auto-print kitchen tickets** switch on the register (in `localStorage`, guarded with try/catch) loads `/receipts/{id}/kitchen?print=1` in a hidden iframe after a kitchen sale.
- **Close till:** a "Cash tips" line.

### Kitchen ticket (`/receipts/[orderId]/kitchen`)
- **Layout:** 80mm.
- **Contents:**
  - the receipt number in very large type, the time in the store's timezone, and the order name;
  - each kitchen line as `{qty} × {name}`, with its choices in bold below;
  - no prices and no customer.
- **Which items:** a line is a kitchen line when its variant's product's category has `kitchen = true`. Lines whose variant was deleted print too.
- **Voids:** a voided sale shows "VOID" across the ticket.
- **Access:** the same as receipts (404 outside your stores). `?print=1` prints on load.

### Receipts, orders and reports
- Receipts and a sale's page list each line's choices under it, and show a "Tip" line after the total plus a "Paid" line (total + tip).
- Reports: Summary has a Tips figure; Staff has a Tips column; Cash-ups and close till have a Cash tips column or line.
- Each report's CSV gains these columns: Summary `tips`; Staff `tips`; Cash-ups `cash_tips`.

## D. Errors shown to people

| Database | Screen |
|---|---|
| 'pick {group} for {item}' | Pick {group} for {item}. |
| 'pick up to {n} {group} for {item}' | Pick up to {n} {group} for {item}. |
| '{option} isn''t available for {item} any more' | {option} isn't available for {item} any more. |
| 'modifiers can''t make {item} cost less than 0' | Modifiers can't make {item} cost less than 0. |
| 'the tip must be 0 or more' | The tip must be 0 or more. |
| 'payments must add up to the total plus tip' | Payments must add up to the total plus tip. |

## E. Testing

- **Vitest:**
  - `checkSelection` (required, max, unattached, empty optional); `selectionDelta`; `selectionKey` stability;
  - the cart key (the same choices stack, different choices split) and the effective price;
  - `tipFor` and `allocateTip` (exact, ties to earlier payments);
  - `summarisePayments` with a tip;
  - the modifier group form schema; the new error messages.
- **pgTAP (`counter_service.test.sql`):**
  - a sale with modifiers: the price comes from the catalog, and the snapshot rows are stored;
  - a required group missing; too many choices; an option from an unattached group; an archived option or group; a negative unit price;
  - a tip with card + cash payments: the `payments.tip` split and the payments check;
  - `close_register` and `report_cashups`: cash_tips and expected cash;
  - `report_summary`: tips, and methods net of tips; `report_staff`: tips;
  - a refund never includes the tip;
  - access: cashiers read groups but can't write them; managers write; anon has no access;
  - direct inserts into `order_item_modifiers` fail.
- **Playwright (`e2e/zz-counter.spec.ts`):**
  - a manager creates the group "Milk" (pick 1: Whole $0, Oat +$0.50) and attaches it to Latte;
  - a cashier taps Latte, picks the Small variant, must pick a milk, picks Oat, sees $4.70 each, adds a 15% tip and pays cash;
  - the receipt shows "Oat" and "Tip";
  - the kitchen ticket shows the order name and "Oat" with no "$";
  - closing the till shows "Cash tips";
  - the Reports summary shows Tips.

## Done when

A manager can set up modifier groups and attach them to products, and mark kitchen categories. A cashier must make the required choices, sees the right price, can add a tip, and can print a kitchen ticket. Tips show up in the drawer, close till and reports but never in sales. All tests above pass with the existing suites.

## Out of scope (6b or later)

- tables, open tabs, split bills and a kitchen display screen;
- per-store tip settings and tip-out reports;
- modifiers in the CSV import/export;
- "half and half" options;
- stock tracking for modifiers;
- modifier popularity reports.
