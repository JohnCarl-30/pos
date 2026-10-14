# POS — Sub-project 5: Reports

Date: 2026-10-14
Status: Draft for review
Builds on: foundation (#1), catalog & inventory (#2), register (#3), orders & customers (#4)

## Purpose

Let owners and managers answer "how did we do?" for any day or date range in a store:
- what was sold and for how much, after refunds;
- how customers paid;
- what each staff member rang up, refunded and voided, with unusual voids and refunds flagged;
- whether every till's cash added up when it was closed.

Every figure matches the receipts to the cent and is reported in the store's timezone.

## Decisions already made

| Decision | Choice | Why |
|---|---|---|
| Reports in v1 | Summary, Products, Staff, Cash-ups, CSV export of each | Covers daily trading, stock decisions, staff oversight and cash-up |
| Stores | One store at a time (the sidebar store) | Avoids mixing currencies; "all stores" comes later |
| Staff flags | Fixed rules: voids > 3% of their sales (and ≥ 2 voids), refunds > 5% of their sales value (and ≥ 2 refunds), or any voided cash sale | Catches "take cash, void the sale" without nagging small shops; no settings to explain |
| Refund timing | A refund counts on the day it happens | Matches the drawer and the cash-ups; past reports never change |
| Where numbers are computed | Read-only SQL report functions, security invoker (RLS applies), returning aggregates | Fast for long ranges, exact, testable to the cent in pgTAP |

## A. Definitions

These apply to a store `S` and a range `[from, to)`, where both bounds are instants computed from the store's local midnights.

- **Sales:** orders in `S` with `created_at` in the range and `status <> 'voided'`. A sale voided later disappears from its day.
  - `sales_count`: the number of these sales.
  - `gross`: `sum(subtotal)`, before discounts.
  - `discounts`: `sum(discount_total)`.
  - `tax`: `sum(tax_total)`.
  - `sales_total`: `sum(total)`.
- **Refunds:** refunds in `S` with `created_at` in the range.
  - `refund_count`, `refunds_total`: `sum(total)`.
  - `refund_tax`: `sum(tax_total)`.
- **Net sales** = `sales_total − refunds_total`. **Net tax** = `tax − refund_tax`.
- **Average sale** = `sales_total ÷ sales_count`, rounded half-even to a minor unit, or 0 when there are no sales.
- **Voids:** orders in `S` with `voided_at` in the range.
  - `void_count`, `void_total`: `sum(total)`.
- **Payment methods:** for each of cash, card and other, take the payments of the sales above, minus the refund payments of the refunds above, by method.

## B. Database (migration `20261014000011_reports.sql`)

### Shared helper
`private.session_cash(p_session_id uuid) returns table (opening_cash bigint, cash_sales bigint, cash_refunds bigint, expected_cash bigint)`. It runs the same queries `close_register` uses today:
- `cash_sales`: cash payments on the session's non-voided orders;
- `cash_refunds`: cash refund payments paid from the session.

`public.close_register` is replaced to call it, so the till and the report can never disagree. Execute on the helper is revoked from `public` and `anon` and granted to `authenticated`, because the invoker report functions call it.

### Report functions
All are `language sql` or `plpgsql`, `stable`, `security invoker`, `set search_path = ''`. Execute is revoked from `public` and `anon` and granted to `authenticated`.

**Guard (shared, `private.report_guard(p_store_id uuid, p_from timestamptz, p_to timestamptz)`):**
- the caller must be active staff whose role is manager or owner, with `private.can_access_store(p_store_id)`; otherwise 42501 'not allowed';
- `p_from < p_to`, and the range is no longer than 367 days (366 plus slack for daylight saving); otherwise 22023 'pick a range of up to 366 days'.

| Function | Returns |
|---|---|
| `report_summary(p_store_id, p_from, p_to)` | `jsonb`: `{ sales_count, gross, discounts, tax, sales_total, refund_count, refunds_total, refund_tax, net_sales, net_tax, average_sale, void_count, void_total, methods: { cash, card, other } }` |
| `report_trend(p_store_id, p_from, p_to, p_bucket text)` | table `(bucket text, sales_count int, sales_total bigint, refunds_total bigint, net_sales bigint)`. `p_bucket` is `'hour'` or `'day'`. `bucket` is the local label, `'YYYY-MM-DD'` or `'YYYY-MM-DD HH24:00'`, built from `created_at at time zone stores.timezone`. Every bucket in the range is returned, including empty ones, by a `generate_series` over local times. |
| `report_products(p_store_id, p_from, p_to)` | table `(variant_id uuid, name text, category text, units_sold int, units_refunded int, net_units int, revenue bigint, refunded bigint, net_revenue bigint)`. Built from `order_items` of the sales above, plus `refund_items` of the refunds above. Grouped by `variant_id`, falling back to `name` when the variant was deleted. The name and category come from the current catalog, with the snapshot name as a fallback. |
| `report_staff(p_store_id, p_from, p_to)` | table `(staff_id uuid, name text, sales_count int, sales_total bigint, refund_count int, refunds_total bigint, void_count int, void_total bigint, cash_void_count int, discounts bigint)`. Sales and discounts by `orders.staff_id`; refunds by `refunds.staff_id` (who processed them); voids by the voided order's `staff_id` (who rang it up). A cash void is a voided order with any cash payment. |
| `report_cashups(p_store_id, p_from, p_to)` | table `(session_id uuid, register text, opened_at timestamptz, closed_at timestamptz, opened_by text, closed_by text, opening_cash bigint, cash_sales bigint, cash_refunds bigint, expected_cash bigint, counted_cash bigint, difference bigint, close_note text)`. Sessions of the store's registers with `closed_at` in the range, newest first. The cash figures come from `private.session_cash`. |

### Index
`create index orders_store_id_voided_at_idx on public.orders (store_id, voided_at) where voided_at is not null;`. The existing indexes already cover sales by `(store_id, created_at)` and refunds by `(store_id, created_at)`.

## C. Range handling (`lib/reports/range.ts`)

- **Presets:** `today`, `yesterday`, `7d` (today and the 6 days before), `30d`, `this-month`, `last-month`, and `custom` with `from`/`to` local dates (inclusive).
- `resolveRange(params, timeZone, now)` returns `{ preset, fromDate, toDate, from: Date, to: Date, bucket: 'hour' | 'day', label }`:
  - `from` is `zonedDayStart(fromDate)` and `to` is `zonedDayStart(nextDay(toDate))`, reusing `lib/orders/list.ts`;
  - a single day uses the `'hour'` bucket; anything longer uses `'day'`;
  - "today" is worked out in the store's timezone from `now`.
- **Invalid or missing input** falls back to `today`. A custom range over 366 days, or with `from` after `to`, returns an error string for the page to show.

## D. Staff flags (`lib/reports/flags.ts`)

`staffFlags(row)` returns a list of `{ rule, label }`:
- `voids`: `void_count ≥ 2` and `void_count / (sales_count + void_count) > 0.03`. Label: "Voids {n} ({p}%)".
- `refunds`: `refund_count ≥ 2` and `refunds_total / sales_total > 0.05`. A positive refund total with zero sales counts as over. Label: "Refunds {p}% of sales".
- `cash-void`: `cash_void_count ≥ 1`. Label: "Voided a cash sale" (or "{n} cash sales").

## E. Screens (`/reports`, managers and owners)

- **Header:**
  - the title "Reports · {store}";
  - the range control: a preset Select, plus From/To date inputs when "Custom" is chosen;
  - **Export CSV**.

  State lives in the URL: `?tab=summary|products|staff|cashups&range=…&from=…&to=…`.
- **Tabs:** Summary (the default), Products, Staff, Cash-ups. They are links that keep the range.
- **Summary:**
  - large figures (`Stat`): Net sales, Sales, Average sale, Refunds, Discounts, Tax;
  - a trend bar chart of net sales per bucket. It is built from divs, each bar labelled with its value in a tooltip on hover or focus, and there is a visually hidden table with the same numbers. Negative net sales draw below the baseline;
  - payment methods: a row for each with its net amount and a `SegmentBar` share;
  - voids: "{n} voided sales · {total}", linking to `/orders?status=voided&from=&to=`.
- **Products:**
  - a table of item, category, sold, refunded, net units and net revenue;
  - sort with `?sort=revenue|units` (revenue is the default), 50 per page using the existing `Pagination`;
  - a "By category" section with each category's share of net revenue as bars.
- **Staff:**
  - a table of name, sales, sales value, refunds, voids (with "· {n} cash"), discounts, and flags (amber `Tag`s);
  - each row has "See voids" (`/orders?status=voided&cashier=&from=&to=`) and "See refunds" (`/orders?cashier=&from=&to=`) links.
- **Cash-ups:**
  - a table of register, closed at, closed by, float, cash sales, cash refunds, expected, counted and difference;
  - the difference shows as "Short $x" in danger, "Over $x" in warning, or "Balanced";
  - a `?only=off` toggle, "Short or over only";
  - the close note under the row.
- **Empty:** "No sales in this range", with a link to Today. A range error shows the message, with a link to Today.
- **Phones:** the large figures wrap; the tables hide the secondary columns (`hidden md:table-cell`).
- **Design:** the `sales-crm` language already used in sub-project 4 (`DetailSection`, `Stat`, `Card`, tabular right-aligned amounts).

## F. CSV export (`app/reports/export/route.ts`)

`GET /reports/export?tab=…&range=…`:
- **Access:** manager or owner, otherwise 404.
- **Data:** it resolves the range and calls the same report function as the screen.
- **Output:** a CSV via the existing `lib/csv.ts`, named `{tab}-{fromDate}-to-{toDate}.csv`.
  - Amounts are decimals in major units (like the products export).
  - The headers are fixed per tab, and Summary is exported as `metric,value` rows.

## G. Testing

- **pgTAP (`supabase/tests/reports.test.sql`):**
  - **Fixtures:**
    - a store in `Asia/Manila`, prices tax-added at 10%;
    - sales across two local days, including one at 23:30 local;
    - a discount, a split card + cash sale, a partial refund on the next day, a voided cash sale, two closed sessions and one open session.
  - **Assertions:**
    - summary totals and methods, to the cent;
    - trend buckets for day and hour, with the empty buckets present;
    - product net units and revenue after refunds, with voided items left out;
    - staff attribution, including cash voids;
    - cash-ups equal to `close_register`'s result for the same session;
    - access: a cashier, another store's manager, inactive staff and anon all get 42501;
    - the range guard: over 366 days, and from ≥ to;
    - `close_register` still returns the same keys.
- **Vitest:**
  - `resolveRange`: every preset, including "last month" in January and today at UTC+8 near midnight; custom ranges, inclusive end, the 366-day limit and invalid input;
  - `staffFlags`: the edges at 3% and 5%, the minimum of 2, zero sales;
  - the category roll-up; CSV row builders; tab and sort parsing.
- **Playwright (`e2e/zz-reports.spec.ts`, which sorts after `sales-history.spec.ts`):**
  - a manager switches to Main Street with the sidebar store picker (their default is Airport Kiosk), then sees today's net sales and the "Voided a cash sale" flag on Casey Cashier;
  - switching to Last 7 days updates the URL;
  - Products lists Espresso;
  - Cash-ups shows a closed till as Balanced;
  - the CSV downloads with its header row;
  - a cashier gets a 404 on `/reports`.

## Done when

A manager or owner can pick a range for their store and see the summary, the trend and the payment methods; best sellers and categories; staff totals with flags; and every till's cash-up. They can export each as CSV. All figures match the receipts and close-till. All tests above pass along with the existing suites.

## Out of scope

- all stores combined;
- comparison with the previous period;
- profit and margin (needs cost history);
- scheduled or emailed reports;
- PDF export;
- tax reports by rate;
- per-register filters.
