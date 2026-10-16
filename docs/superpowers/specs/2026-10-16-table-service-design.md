# POS — Sub-project 6b: Table service (tables, open tabs, split bills, kitchen display)

Date: 2026-10-16
Status: Draft for review
Builds on: foundation (#1), catalog & inventory (#2), register (#3), orders & customers (#4), reports (#5), counter service (#6)

## Purpose

Make the POS work for sit-down restaurants and bars:
- servers carry their own phones or tablets, open a tab for a table (or a named bar tab), add items over the meal and send them to the kitchen in batches;
- the kitchen works from a live screen of tickets;
- the bill can be paid by item, evenly, or by any amount, at an open till.

The sales model doesn't change. A tab is a list of what was ordered; each payment turns part of it into an ordinary sale through `create_order`, so pricing, discounts, tax, tips, stock, receipts, refunds, voids, reports and cash-ups keep working as they are.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Who takes orders | Servers on their own devices; several devices work on tabs at once; the register can open and pay tabs too | How table service actually runs |
| Where tabs are paid | Only at an open till | Cash lands in a counted drawer; close till still adds up |
| Splitting | Evenly by N people, by item, any amount | Covers almost every table; seats and fractions come later |
| Shared items | No fractions of an item; guests pay their own items, then the rest is split evenly | Quantities stay whole, so stock and refunds stay simple |
| Sending to the kitchen | A Send button sends the batch; sent lines are locked; removing one needs a void with a reason, which the kitchen sees | Mistakes don't reach the kitchen; the kitchen hears about changes |
| Table layout | A grid of tiles grouped by area | Works on phones; no drawing tool |
| Storage | Tabs in their own tables until paid (not open orders) | Every existing report, refund and drawer calculation assumes an order is finished |
| Prices on a tab | Not stored; the tab shows current catalog prices and the price is fixed at payment | `create_order` stays the only place a price is decided |
| Kitchen screen | Tickets from tabs and from counter sales with kitchen items | A place that does both has one kitchen screen |
| Live updates | Supabase Realtime, with a 30-second refresh as a fallback | Several devices see the same floor and tickets |
| Ownership | Any staff in the store can work any tab; no new kitchen role | Simple; the kitchen tablet signs in as any staff member |
| Tills | Tabs aren't tied to a till and stay open when a till closes | A meal can outlast a shift |

## A. Database (migration `20261016000013_table_service.sql`)

### Setup
- **`dining_areas`:** `id`, `store_id` (cascade), `name` (1–40 characters, unique per store among active areas), `sort_order int`, `active bool default true`, `created_at`.
- **`dining_tables`:** `id`, `store_id` (cascade), `area_id` (restrict), `name` (1–20 characters, unique per store among active tables), `seats int` between 1 and 50, `sort_order int`, `active bool default true`, `created_at`.
  - The area must belong to the same store (trigger check).
- **RLS:** active staff with access to the store read both; managers and owners insert and update, the same as products. No delete for anyone (archive instead). Anon has no access.
- Archiving a table with an open tab fails: 22023 `'{table} has an open tab'` (trigger on `active` going false).

### Tabs
- **`tab_status` enum:** `open`, `paid`, `cancelled`.
- **`tabs`:**
  - `id`, `store_id`, `table_id` (nullable, restrict), `name` (nullable, 1–40 characters);
  - check: `table_id is not null or name is not null`;
  - `guests int` between 1 and 99, nullable for bar tabs;
  - `opened_by` (staff), `opened_at`, `bill_printed_at` (nullable);
  - `status tab_status default 'open'`, `closed_at` (nullable);
  - a partial unique index on `table_id where status = 'open'`.
- **`tab_items`:**
  - `id`, `tab_id` (cascade), `variant_id` (set null), `option_ids uuid[] not null default '{}'`;
  - `name` (snapshot of the product and variant name, for display after catalog edits);
  - `quantity int` between 1 and 999, `paid_quantity int default 0`, check `paid_quantity <= quantity`;
  - `note text` (1–100 characters, nullable);
  - `added_by` (staff), `added_at`, `sent_at` (nullable);
  - `voided_at`, `voided_by`, `void_reason` (1–200 characters), all nullable; a voided line must have been sent and have `paid_quantity = 0`.
- **`orders.tab_id uuid`** (nullable, FK to `tabs`), indexed.
- **RLS:** staff with access to the store read tabs and their items. No direct insert, update or delete for `authenticated`; only the functions below write them.

### Kitchen
- **`kitchen_tickets`:**
  - `id`, `store_id`, `number int` (per store, from a counter row locked when a ticket is created);
  - `tab_id` (nullable) or `order_id` (nullable), exactly one set;
  - `label text`: the table name, bar tab name, or the counter order's name or receipt number;
  - `sent_by` (staff), `sent_at`, `done_at` (nullable), `done_by` (nullable).
- **`kitchen_ticket_items`:** `id`, `ticket_id` (cascade), `tab_item_id` (nullable, set null), `quantity`, `name`, `choices text` (for example "Oat · Extra shot"), `note`, `voided bool default false`, `sort_order`.
- These are copies taken when the ticket is made, so catalog edits never change a ticket in progress.
- **RLS:** staff read tickets for their stores; only the functions write them.

### Functions
All are `security definer`, `search_path = ''`. Each checks that the caller is active staff with access to the store and locks the tab (`for update`) before changing it. Every function that changes a tab fails with 22023 `'this tab is closed'` when the tab isn't open.

- **`open_tab(p_store_id, p_table_id, p_name, p_guests) returns uuid`.**
  - Table tabs need an active table in the store; a second open tab on the table fails: 22023 `'{table} already has an open tab'`.
  - Bar tabs need a name (trimmed, 1–40 characters).
- **`move_tab(p_tab_id, p_table_id)`:** to a free, active table in the same store. A bar tab can move to a table and keeps its name.
- **`update_tab(p_tab_id, p_name, p_guests)`:** rename and change the guest count.
- **`cancel_tab(p_tab_id)`:** only when no line has been sent or paid: otherwise 22023 `'a tab with sent items can''t be cancelled'`. Sets `cancelled`.
- **`add_tab_items(p_tab_id, p_items jsonb)`:** each item is `{ variant_id, option_ids, quantity, note }`.
  - The variant must be active in the store's catalog.
  - The modifier choices are checked with the same rules and messages as `create_order`. That check moves into `private.check_options(product_id, option_ids, item_name) returns bigint` (the options' price change), used by both functions.
- **`change_tab_item(p_item_id, p_quantity)`:** for unsent lines; 0 deletes the line. A sent line fails: 22023 `'{item} has already been sent; void it instead'`.
- **`void_tab_item(p_item_id, p_reason)`:**
  - the line must be sent and unpaid, and the reason non-empty: 22023 `'give a reason for voiding {item}'`;
  - marks its `kitchen_ticket_items` rows `voided`, which the kitchen screen shows.
- **`send_tab(p_tab_id) returns uuid`:**
  - sets `sent_at` on every unsent line;
  - the lines whose variant's product is in a kitchen category go on a new ticket, which is returned;
  - no kitchen lines means no ticket (returns null).
- **`print_bill(p_tab_id)`:** sets `bill_printed_at`.
- **`pay_tab(p_tab_id, p_session_id, p_parts jsonb, p_order_discount, p_approval_id, p_customer_id, p_payments, p_tip) returns jsonb`:**
  - `p_parts` is `[{ tab_item_id, quantity }]`, non-empty: otherwise 22023 `'pick at least one item to pay'`;
  - each quantity is at most what's left on that line (`quantity − paid_quantity`, not voided): otherwise 22023 `'only {n} of {item} are left to pay'`;
  - unsent lines in the part are sent first, exactly as `send_tab` does;
  - it builds `p_lines` from the lines' variants, options and quantities and calls `public.create_order(..., p_kitchen => false)`;
  - it adds to `paid_quantity`, sets `orders.tab_id`, and when every line is paid or voided sets the tab to `paid` with `closed_at`;
  - it returns what `create_order` returns, plus `tab_paid boolean`.
- **`public.create_order`** is dropped and recreated with `p_kitchen boolean default true` at the end. When it's true and any line is in a kitchen category, it creates a ticket for those lines, labelled with the order name or the receipt number. Everything else is unchanged.
- **`finish_ticket(p_ticket_id)`:** sets `done_at`, `done_by`; a done ticket fails: 22023 `'this ticket is already done'`.
- **`recall_ticket(p_store_id) returns uuid`:** clears `done_at` on the store's most recently finished ticket from the last 12 hours.

### Live updates
`tabs`, `tab_items`, `kitchen_tickets` and `kitchen_ticket_items` are added to the `supabase_realtime` publication. RLS applies to Realtime, so people only receive their own stores' changes.

### Reports and cash
Unchanged. Unpaid tabs aren't orders, so they never appear in sales, reports or the drawer; each payment is an ordinary sale.

## B. TypeScript

- **`lib/tabs.ts`:**
  - `TabLine` type; `leftToPay(line)`;
  - `partsFrom(selection)`: the selected lines and quantities as `pay_tab` parts;
  - `tabTotals(lines, catalog, store)`: the unpaid total using the shared pricing in `lib/checkout.ts`, the same maths the register uses.
- **`lib/kitchen.ts`:** `ticketAge(sentAt, now)` and `ticketTone(minutes)`: normal below 10, amber from 10, red from 20.
- **`lib/checkout.ts`:** `splitEvenly(due, people)` uses `allocateTip`'s largest-remainder maths, so the payments add up exactly.
- **Schemas:** area form, table form, open-tab form (guests or name), void reason.
- **Server actions** wrap each function and map the new errors.
- **Realtime:** `hooks/use-live-table.ts` subscribes to a table's changes for a store and calls `router.refresh()`, debounced, with a 30-second interval fallback. It unsubscribes on unmount.

## C. Screens

### Navigation
- **Tables** and **Kitchen** in the sidebar for all staff (`minRole: "cashier"`), and in the command menu.
- **Settings → Tables** for managers and owners.

### Settings → Tables (`/settings/tables`)
- Areas in order, each with its tables (name, seats).
- **New area**, **New table**, **Edit**, **Archive / Restore**, and ↑/↓ for areas and tables.
- Archiving a table with an open tab shows the error.

### Floor (`/tables`)
- Area chips across the top; a grid of table tiles below:
  - **free:** name and seats;
  - **open:** guests, running total, time since seated, and who opened it;
  - **bill printed:** accent outline and a "Bill" badge.
- A **Bar tabs** group for tabs without a table, with **New bar tab** (asks for a name).
- Tapping a free table asks for guests and opens the tab; tapping an open one goes to `/tabs/[id]`.
- Live, through `useLiveTable`.
- Phone first: two tiles per row at 375px.

### Tab (`/tabs/[id]`)
- The left side reuses the register's product grid, search/scan and modifier dialog. The add step has an optional **Kitchen note**.
- The right side lists the lines:
  - **Not sent yet:** quantity −/+ and Remove;
  - **Sent {time}:** each line with **Void…** (asks for a reason); voided lines are struck through; paid quantities show as "1 of 3 paid".
- The footer shows the unpaid total and **Send ({n})** (primary), **Print bill**, and **Pay**.
- A menu has **Move table**, **Guests**, **Rename**, and **Cancel tab** (only when nothing's been sent).
- On a phone, the product grid fills the screen and a bottom bar ("Tab · 4 items · $38.20") opens the lines in a sheet.
- A paid or cancelled tab is read-only with a link to its sales.
- Live, through `useLiveTable`.

### Paying (`/register?tab={id}`)
- Uses the device's register (the existing register cookie) and its open session. With no open till, the register shows the usual Open till step first.
- The cart is replaced by the tab's unpaid lines with checkboxes and quantity steppers, plus **Select all**.
- **Pay selected** opens the existing pay dialog: discount, tip, customer and payments work as today, and the sale goes through `pay_tab`.
- The pay dialog gains **Split evenly**: 2–20 people, which fills that many equal payments; each can be switched between cash and card.
- After each payment the receipt prints as today. When the tab is fully paid the register shows "Tab paid" with a link back to `/tables`.

### Bill (`/tabs/[id]/bill`)
- 80mm, like the receipt: the store name, the table or tab name, guests, unpaid lines with choices and current prices, subtotal, tax, total, and "Already paid {amount}" when part has been paid.
- `?print=1` prints on load. Same access rule as receipts (404 outside your stores).

### Kitchen (`/kitchen`)
- A landscape tablet layout, dark, with the sidebar collapsed.
- Ticket cards oldest first, wrapping across the screen. Each card shows:
  - the ticket number and label;
  - the time sent and a running timer, coloured by `ticketTone`;
  - `qty × name`, choices in bold, the note in italics; voided lines struck through with a VOID badge.
- A large **Done** button on each card; **Recall** in the header.
- A **Chime on new ticket** switch, saved in `localStorage` (guarded with try/catch).
- Live, through `useLiveTable`, with the 30-second fallback.

### Counter sales
Unchanged, except a sale with kitchen items now appears on `/kitchen`. The printed kitchen ticket from 6a still works.

## D. Errors shown to people

| Database | Screen |
|---|---|
| '{table} already has an open tab' | {table} already has an open tab. |
| 'this tab is closed' | This tab is closed. |
| '{item} has already been sent; void it instead' | {item} has already been sent. Void it instead. |
| 'give a reason for voiding {item}' | Give a reason for voiding {item}. |
| 'only {n} of {item} are left to pay' | Only {n} of {item} are left to pay. |
| 'pick at least one item to pay' | Pick at least one item to pay. |
| 'a tab with sent items can''t be cancelled' | A tab with sent items can't be cancelled. |
| '{table} has an open tab' | {table} has an open tab. |
| 'this ticket is already done' | This ticket is already done. |

Modifier errors reuse 6a's messages. A live update never closes an open dialog; its action re-checks on the server when submitted.

## E. Testing

- **Vitest:**
  - `partsFrom`, `leftToPay` and `tabTotals` against the shared pricing vectors;
  - `splitEvenly` adds up exactly, with the extra cents on the earlier payments;
  - `ticketTone` thresholds;
  - the area, table, open-tab and void schemas; the new error messages.
- **pgTAP (`table_service.test.sql`):**
  - one open tab per table; bar tabs need a name;
  - `add_tab_items` checks modifier choices;
  - unsent lines can change; sent lines can't; voiding needs a reason and marks the ticket line;
  - `send_tab` makes a ticket only for kitchen lines;
  - `pay_tab`: a partial quantity; more than is left fails; two parts whose sales add up to the whole tab; unsent lines are sent when paid; the tab becomes paid once everything is paid or voided; the sales carry `tab_id`;
  - `create_order`: a counter sale with kitchen items makes a ticket; `p_kitchen = false` doesn't;
  - `finish_ticket` and `recall_ticket`;
  - archiving a table with an open tab fails;
  - access: a cashier at store A can't read store B's tabs or tickets; direct writes to tabs, tab items and tickets fail; managers write areas and tables, cashiers can't;
  - reports and `session_cash` ignore unpaid tabs.
- **Playwright (`e2e/zz-tables.spec.ts`):**
  - a manager adds the area Patio with tables P1 and P2;
  - a server at 375px opens P1 for 3 guests, adds two Lattes with Oat (one noted "extra hot") and a Croissant, and sends;
  - `/kitchen` shows the ticket with "Oat" and "extra hot"; the server voids the Croissant with a reason and the kitchen shows VOID;
  - the server prints the bill and P1 shows "Bill";
  - at the till, one Latte is paid by card, then the rest is split evenly between 2 in cash;
  - P1 is free again;
  - the kitchen marks the ticket Done, then recalls it;
  - a counter sale with a kitchen item appears on `/kitchen`.

## Done when

Managers set up areas and tables. Servers on phones open tabs, add and send items, void with a reason, and print the bill. Tabs are paid by item, evenly or by any amount at an open till, and each payment is an ordinary sale. The kitchen screen shows tickets from tabs and counter sales live. All tests above pass with the existing suites.

## Out of scope (later)

- a drag-and-drop floor plan;
- courses and firing them later;
- seat numbers;
- splitting one item into fractions;
- merging tabs and moving single lines between tabs;
- reservations;
- server banking, tip-outs and per-server table reports;
- more than one kitchen station;
- offline mode.
