# POS

A free, open-source point of sale for shops, cafés and restaurants. Self-host it with your own Supabase database: your sales data stays yours.

> Status: foundation. Staff sign-in, setup, roles, stores, tax and staff settings work today. Checkout, products, orders and reports are being built next.

## Quick start

You need Node 20.9 or newer, Docker Desktop, and npm.

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
| inactive@demo.test | Deactivated — shows the no-access message |

To try the first-run setup instead, run `npx supabase db reset --no-seed` and open the app in a private window.

## Catalog & stock

- **Products** (managers and owners): add products with named variants, each with its own SKU, barcode, price and cost. Archive instead of deleting, so past sales stay intact.
- **Stock** is kept per store as a history: received, counted, damaged, corrected or transferred. Counts always match the history. Set a low-stock level per item to use the "Low stock" filter.
- **CSV import/export:** export, edit in a spreadsheet, import back. Imports are matched by SKU, previewed before anything is saved, and applied all-or-nothing. Comma or semicolon files both work.
- **One currency for now:** prices are shared by every store, so all stores should use the same currency until multi-currency support arrives.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the app |
| `npm run lint` | Lint the code with ESLint |
| `npm test` | Unit tests (money, tax, routing, validation) |
| `npm run test:db` | Database tests: schema and access rules (pgTAP) |
| `npm run test:e2e` | End-to-end tests (resets the local database; run `npx playwright install chromium` once first) |
| `npm run db:reset` | Rebuild the local database with demo data |
| `npm run db:types` | Regenerate TypeScript types from the schema |

## Deploying

1. Create a Supabase project. Run `npx supabase link --project-ref <ref>` then `npx supabase db push` (this does not load demo data).
2. In Supabase Auth settings, turn off "Allow new users to sign up". Staff accounts are created from Settings, never by public sign-up.
3. Deploy the Next.js app anywhere that runs Node (Vercel works out of the box). Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Open the site. You'll be taken to setup to create your business, first store and owner account.

> The first person to open a fresh deployment completes setup and becomes owner — finish setup immediately after deploying.

## How it's built

Next.js 16, React 19, Tailwind 4 and Supabase (Postgres, Auth, row-level security). Roles are enforced in the database, not just the UI. Money is stored as whole cents. Read `CONVENTIONS.md` before contributing; `docs/superpowers/specs/` has the design docs.

## Notes

- After `npx supabase db reset`, clear the `pos-setup-complete` cookie in your browser (or use a private window). It remembers that setup was already done, so a reset database can otherwise redirect you straight past the setup wizard.
- For production, set the Site URL in your hosted Supabase project's Auth settings, and upload `supabase/templates/recovery.html` as the password-recovery email template. Without both, password reset links won't work.

## License

MIT. The starter UI is © Kargul Studio, also MIT.
