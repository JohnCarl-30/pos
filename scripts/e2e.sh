#!/usr/bin/env bash
set -euo pipefail
npx supabase db reset --no-seed
npx playwright test --grep @fresh
npx supabase db reset
npx playwright test --grep-invert @fresh
