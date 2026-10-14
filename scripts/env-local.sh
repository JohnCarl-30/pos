#!/usr/bin/env bash
set -euo pipefail
eval "$(npx supabase status -o env)"
cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY:-$ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SECRET_KEY:-$SERVICE_ROLE_KEY}
EOF
echo "Wrote .env.local for ${API_URL}"
