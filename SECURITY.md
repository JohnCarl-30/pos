# Security

This POS stores sales, cash and staff accounts, so security reports are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue.** Report it privately instead:

1. Go to [Security → Report a vulnerability](https://github.com/JohnCarl-30/pos/security/advisories/new).
2. Describe what an attacker could do, the steps to reproduce it, and the version or commit you tested.

You'll get a reply within 7 days. Once a fix is released, the advisory is published with credit to you, unless you'd rather stay anonymous.

## What's in scope

- Getting around roles or store access: a cashier doing a manager's job, or anyone reading another store's data.
- Changing prices, totals, refunds or cash records from the browser.
- Anything that exposes the service-role key, staff passwords or customer data.

Bugs that need an already compromised Supabase project or server are out of scope.

## Supported versions

Only the latest `main` gets security fixes. Self-hosters should update regularly.
