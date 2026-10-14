# POS — Sub-project 4: Orders & customers

Date: 2026-10-14
Status: Draft for review
Builds on: foundation (PR #1), catalog & inventory (PR #2), register (PR #3)

## Purpose

Let staff look up past sales and undo mistakes properly. Partial refunds by item and quantity, voids of a sale while its till is still open, and a customer list with purchase history. After this sub-project, a recorded sale can never be quietly edited or deleted. Every correction is a refund or a void, with who did it and who approved it.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Refund model | Partial, by line and quantity; each refund is its own record linked to the sale | Shops take back one item from a big sale; stock and tax stay exact |
| Who refunds | Managers and owners freely; cashiers with manager approval on the till (email + password, like discounts) | Control without calling a manager to a back-office screen |
| Voids | Cancel a whole sale, only while its till session is open, no refunds yet; cashiers may void their own sales | For mistakes caught straight away; after close it's a refund |
| Refund payout | Defaults to the original methods, card first (capped at what was paid by card, net of earlier card refunds), then cash; editable | Matches what the customer expects; keeps the drawer right |
| Till needed | A refund needs an open till session on this device (any register in the store); cash refunds lower that session's expected cash | End-of-day cash adds up |
| Entry points | Orders → a sale → Refund, and Register → Return (scan or type a receipt number). Both open the same refund panel | One refund engine, two doors |
| Customers | List, search, add, edit, delete when the customer has no sales, and a page with their sales and refunds | Basics only; export, merge and consent come later |
| Locking down sales | No direct update or delete on orders, order items, payments or register sessions for any role | History can't be rewritten |

## A. Database (migration `20261014000010_orders.sql`)

### Changes to existing tables
- `orders`: add `voided_at timestamptz`, `voided_by uuid` (FK to staff, restrict), and `void_reason text check (length between 1 and 300)`. A check enforces that all three are null or all are set, and that they're set exactly when `status = 'voided'`.
- Stock: restocked refund lines and voids record `returned` movements (already in the `stock_reason` enum).
- `orders.customer_id` becomes `on delete restrict` instead of `set null`.

### New tables
**`refunds`**
| Column | Type |
|---|---|
| `id` | uuid pk |
| `order_id` | uuid → orders, restrict |
| `store_id` | uuid → stores, restrict |
| `register_id` | uuid → registers, restrict (the till it was paid from) |
| `session_id` | uuid → register_sessions, restrict |
| `receipt_number` | integer > 0, from the register's `next_receipt_number`; unique with `register_id` |
| `staff_id` | uuid → staff (who did it) |
| `approval_id` | uuid → refund_approvals, nullable |
| `approved_by` | uuid → staff, nullable (the approver, or the staff member themselves when manager or owner) |
| `reason` | text, one of `changed_mind`, `damaged`, `wrong_item`, `other` |
| `note` | text, ≤ 300, required when `reason = 'other'` |
| `subtotal`, `tax_total`, `total` | bigint ≥ 0; `total` > 0 |
| `created_at` | timestamptz |

**`refund_items`**: `id`, `refund_id` (cascade), `order_item_id` (→ order_items, restrict), `quantity` (> 0), `restock` (boolean), `amount` (bigint ≥ 0, includes tax), `tax` (bigint ≥ 0).

**`refund_payments`**: `id`, `refund_id` (cascade), `method` (`payment_method`), `amount` (> 0), `reference` (≤ 100, card and other only).

**`refund_approvals`**: same shape as `discount_approvals`: `store_id`, `approved_by`, `requested_by`, `order_id`, `max_amount` (bigint > 0), `expires_at` (now + 10 min), `used_at`, `created_at`.

**Access:**
- RLS on all four tables.
- Staff read rows for their stores. For approvals, only the cashier who asked, plus managers and owners.
- No insert, update or delete for `authenticated`. Approvals are inserted by the server action with the service-role client after it verifies the approver, exactly like discount approvals.

### Refund amounts (the same in SQL and TypeScript)
For an order line with `quantity q`, `line_total T` and `tax X`, the amount refunded for the first `c` units in total is `share(c) = half_even(T × c ÷ q)`, and the tax is `half_even(X × c ÷ q)`. A refund of `k` more units, after `r` already refunded, is `share(r + k) − share(r)`. Refunding a line in any number of steps therefore adds up exactly to `T` (and to `X`). The refund subtotal is the total minus the tax.

The TypeScript version lives in `lib/refunds.ts`. Shared vectors in `lib/refund-vectors.json` are checked by Vitest and by pgTAP, the same way as the checkout vectors.

### Functions (security definer, `search_path = ''`, execute revoked from `public` and `anon`, granted to `authenticated`)

**`public.create_refund(p_order_id uuid, p_session_id uuid, p_lines jsonb, p_payments jsonb, p_approval_id uuid, p_reason text, p_note text) returns jsonb`**
- `p_lines` is an array of `{ order_item_id, quantity, restock }`, and `p_payments` an array of `{ method, amount, reference? }`.
- **Steps:**
  1. The caller is active staff with access to the order's store. The session is open (row locked), and its register belongs to the same store as the order.
  2. The order is locked. It must not be `voided`.
  3. Every line belongs to this order, appears once, and has `1 ≤ quantity ≤` sold minus already refunded.
  4. It computes the amounts with the rule above.
  5. **Payments:**
     - each amount is > 0, and they sum exactly to the refund total;
     - per method, the amount is at most what the order paid by that method minus earlier refunds by that method. Cash is the exception: cash may also take what's left over from card and other, so a customer can always be refunded in cash;
     - `reference` is allowed on card and other only.
  6. **Authority:** a cashier needs a valid approval: same store, same order, `requested_by` = the caller, not expired, not used, and `max_amount ≥` the refund total. The approval is then marked used. Managers and owners need none.
  7. The receipt number is the register's `next_receipt_number`, read under `for update` and then incremented.
  8. It inserts the refund, its items and its payments.
  9. Each restocked line of a tracked variant in the store gets a `returned` movement of `+quantity` (`staff_id` = caller, note "Refund #N for receipt #M").
  10. It sets the order status to `refunded` when every line is fully refunded, otherwise to `partially_refunded`.
- **Returns** `{ refund_id, receipt_number, total }`.
- **Errors:**
  - 42501 not allowed;
  - P0002 'sale not found';
  - P0001 'till is closed';
  - P0001 'sale is voided';
  - 22023 'only {n} left to refund on {name}';
  - 22023 '{method} refunds can''t be more than {amount}';
  - 22023 'payments must add up to the refund';
  - P0001 'refund needs approval'.

**`public.void_order(p_order_id uuid, p_reason text) returns void`**
- The caller is active staff with access to the store. The order is locked and `completed`, with no refunds.
- Its session is still open. Otherwise: P0001 'till is closed — refund it instead'.
- A cashier may void only orders where `staff_id` = the caller. Otherwise: 42501 'you can only void your own sales'.
- It sets `status = 'voided'`, `voided_at`, `voided_by` and `void_reason`.
- Each line of a tracked variant gets a `returned` movement of `+quantity` (note "Void of receipt #N").

**`public.close_register`** (replaced): `cash_sales` counts cash payments on the session's orders that aren't `voided`. It gains `cash_refunds`, the cash refund payments whose refund `session_id` is this session. Expected cash = opening + cash_sales − cash_refunds. The returned JSON gains `cash_refunds` and `voided_count`.

**`public.find_order_by_receipt(p_store_id uuid, p_receipt_number integer) returns uuid`** (security invoker): matches orders in the store with that receipt number. If two registers share a number, it returns the newest; the screen shows the register name so the cashier can check.

### Locking down sales
- `revoke update, delete on orders, order_items, payments, register_sessions from authenticated`.
- Drop the foundation policies "managers edit sessions", "owner deletes sessions", "managers edit orders", "owner deletes orders", "managers edit order items", "owner deletes order items", "managers edit payments" and "owner deletes payments", plus the now-unused insert policies on orders, order_items and payments.
- Session closes and voids go only through the definer functions.

### Customers
- "managers delete customers" becomes "staff delete customers without sales". Any staff member may delete a customer, but the FK restrict stops it when the customer has sales or refunds through their orders. The screen maps 23503 to "This customer has sales and can't be deleted."
- Insert and update stay as they are (any active staff).
- Total spent = sum of non-voided order totals − refund totals, and last visit = the latest non-voided order date. Computed in `lib/customers/queries.ts` from `orders` and `refunds`, with paging via `fetchAll`.

## B. Orders (`/orders`, all roles, the stores they work in)

- **The list:**
  - columns: receipt #, date and time (store timezone), register, cashier, customer, total, and a status badge (Completed, Partially refunded, Refunded, Voided);
  - filters in the URL: `q` (receipt number or customer name), `from`/`to` dates, `status`, `register`, `cashier`;
  - 50 per page, newest first, with an empty state.
- **A sale (`/orders/[id]`):**
  - the header has the receipt number, status badge and date;
  - the lines show quantity, refunded quantity, discount, tax and line total;
  - totals, payments with tendered and change, and the customer (linked);
  - who gave the discount and who approved it;
  - a void notice (who, when and why);
  - a refunds list, each with its number, who did it and who approved it, the reason, the amount, the methods and "Print slip".
  - **Actions:**
    - **Refund**: shown when something is left to refund and the sale isn't voided. It's disabled with "Open a till to give refunds" when this device has no open till in this store.
    - **Void**: shown when the sale is `completed` with no refunds and its till session is open. For cashiers, only on their own sales.
    - **Reprint receipt**.
- Any id that isn't a GUID, or an order outside the caller's stores, gives a 404.

## C. Refund panel (`components/refunds/refund-panel.tsx`, used by the sale's page and by the register)

- **Lines:** one row per sale line with refundable units left, showing the name, unit price paid (line total ÷ quantity) and "{k} of {n} left". A −/+ quantity stepper runs from 0 to what's left. A switch picks **Back to stock** (the default) or **Damaged**.
- **Reason:** Changed mind / Damaged / Wrong item / Other. Other requires a note.
- **Totals:** the refund total, computed live by `lib/refunds.ts`.
- **Payout:**
  - prefilled card-first: card up to the card amount left, then other, then cash;
  - each row has the method, an amount and an optional reference (card and other);
  - rows can be added or removed;
  - the button is disabled until the rows add up to the total.
- **Authority:** for cashiers the button reads **Get approval** and opens the manager approval dialog for this order and amount. It then reads **Refund {amount}**. Changing the quantities after approval to a bigger total needs approval again.
- **Done:** "Refund #N recorded", with **Print refund slip** and **Done**.
- **Errors:** messages from the database are mapped to plain sentences (see F). If a server action throws, the panel shows "Couldn't reach the server. Check the connection and try again." and stays usable.

## D. Register additions

- **Return** button in the header:
  1. It opens a small dialog: "Scan or type the receipt number".
  2. It calls `find_order_by_receipt` for the current store.
  3. It shows the sale (receipt #, register, date, total), then opens the refund panel with this till's session.
  4. If nothing matches: "No sale with that receipt number in this store."
- **Void last sale:** after a sale, the done panel gets **Void sale**, which opens the void dialog for that order.
- **Close till summary:** shows "Cash refunds" and "Voided sales" lines.

## E. Refund slip (`/receipts/refunds/[refundId]`)

- **Layout:** 80mm, same as receipts.
- **Contents:**
  - REFUND at the top, the refund number, "for receipt #M", and the date and time in the store's timezone;
  - the register, who did it and who approved it, and the customer name;
  - the items with quantity and amount, plus "returned to stock" or "damaged";
  - the tax, the total, and how the money went back;
  - the store footer.
- Prints with `?print=1`. Staff of other stores get a 404.

## F. Customers (`/customers`, all roles)

- **The list:** name, email, phone, total spent, last visit; search (name, email or phone); **New customer**; 50 per page.
- **A customer (`/customers/[id]`):**
  - a details form (name, email, phone, notes) with **Save**;
  - their sales (receipt #, date, store, total, status, with a link to the sale) and refunds;
  - **Delete**, which confirms first. With sales it refuses: "This customer has sales and can't be deleted."
- **Validation (zod):** the name is required and at most 120 characters; the email is valid or empty; the phone is at most 40 characters; the notes are at most 1,000 characters.

## G. Errors shown to people

| Database | Screen |
|---|---|
| 'only {n} left to refund on {name}' | Only {n} left to refund on {name}. |
| '{method} refunds can''t be more than {amount}' | Card refunds can't be more than {amount}. Use cash for the rest. |
| 'refund needs approval' | This refund needs a manager's approval. |
| 'till is closed' | Open a till to give refunds. |
| 'till is closed — refund it instead' | This sale can't be voided: its till has been closed. Refund it instead. |
| 'sale has refunds' | This sale has refunds and can't be voided. |
| 'you can only void your own sales' | You can only void your own sales. |
| 23503 on customers | This customer has sales and can't be deleted. |

## H. Testing

- **Vitest:**
  - `lib/refunds.ts`: share maths (stepwise refunds add up exactly), the refundable quantity left, the card-first payout split, and payout validation;
  - the order list filter parsing;
  - the customer schema;
  - the refund error mapping.
- **Shared vectors** (`lib/refund-vectors.json`) are checked by Vitest and pgTAP.
- **pgTAP:**
  - partial then full refunds, with statuses `partially_refunded` then `refunded`;
  - over-refunding, including across refunds;
  - per-method payout limits and the cash fallback;
  - restock vs damaged stock movements;
  - cashier approval: valid; reused, expired, for another cashier, for another order, or too small;
  - refunds on a voided sale, from a closed session, or from another store's session;
  - void: a cashier's own sale only, open session only, no refunds, stock returned;
  - close_register: expected cash with cash refunds and voids;
  - direct update or delete on orders, order_items, payments and register_sessions fails for owner, manager and cashier;
  - direct insert into the refund tables fails;
  - deleting a customer with sales fails, and without sales succeeds;
  - anon has no access; inactive staff are refused.
- **Playwright:**
  - a cashier refunds 1 of 2 items with manager approval, and the stock goes back up;
  - a return from the register by receipt number, paid out in cash;
  - a cashier voids their own sale, and closing the till shows the right expected cash;
  - the order list filters by status and receipt number, and the sale's page shows the refunds;
  - customers: add, edit, see history, and the refused delete;
  - a refund slip for another store's staff gives a 404.

## Done when

Staff can find any sale in their stores, refund some or all of it (cashiers with approval) to the right methods, void a sale while its till is open, print refund slips, and see the cash at close account for refunds and voids. Customers have a list and a page with their history. No role can edit or delete a recorded sale directly. All the tests above pass along with the existing suites.

## Out of scope

- exchanges in one step;
- store credit and gift cards;
- refunds without a receipt;
- emailed receipts;
- customer CSV export;
- merging duplicates;
- marketing consent;
- refunds across stores;
- reversing a refund.
