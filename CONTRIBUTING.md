# Contributing

Thanks for helping. This is a free POS for real shops, cafés and restaurants, so correctness with money matters more than speed.

## Ways to help

- **Try it and report what's confusing or broken.** Use the bug report template; say which device and browser you used.
- **Suggest features** with the feature request template. Describe the situation in your business first.
- **Fix something.** Issues labelled `good first issue` are a good start. For anything bigger, open an issue first so we can agree on the approach.

## Running it locally

You need Node 20.9 or newer, Docker Desktop, and npm.

```bash
npm install
npm run db:start      # Supabase in Docker, with demo data
npm run env:local     # writes .env.local
npm run dev           # http://localhost:3000
```

Demo accounts all use the password `password`: `owner@demo.test`, `manager@demo.test`, `cashier@demo.test`.

## Before you open a pull request

Run what applies to your change:

```bash
npx tsc --noEmit && npm run lint
npm test              # unit tests
npm run test:db       # database tests (pgTAP) — if you touched supabase/
npm run test:e2e      # browser tests — if you changed a screen or flow
```

CI runs typecheck, lint, unit and database tests on every pull request.

## How the code is organised

- `supabase/migrations/` — the schema, row-level security and every function that writes a sale. **Prices, totals, tax, refunds and stock are decided here, never in the browser.**
- `supabase/tests/` — pgTAP tests for the database. Every new database function needs one.
- `lib/` — shared TypeScript: money, tax and checkout maths (mirrored from SQL and tested against the same vectors), schemas and server actions.
- `components/` and `app/` — the screens (Next.js App Router).
- `docs/superpowers/specs/` and `plans/` — the design doc and build plan for each feature. Read the spec before changing a feature.

## Ground rules

- **Money is integer cents.** Never use floats for money.
- **Sales can't be edited.** Corrections are refunds or voids, written by database functions.
- **Every role check happens in the database** (RLS or a `security definer` function), not only in the UI.
- **Write the failing test first** for bug fixes and new behaviour.
- Follow `CONVENTIONS.md` for UI code: Tailwind only, no code comments, explicit `Button` variants, and screens that work at 375px.
- Add a migration for schema changes. Don't edit migrations that are already on `main`.
- Keep pull requests focused on one change.

By contributing, you agree that your work is released under the [MIT License](LICENSE).
