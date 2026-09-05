#!/usr/bin/env bash
set -euo pipefail

# Reconcile dependencies from the merged package manifest and lockfile.
npm install --no-audit --no-fund

# Keep the development database aligned with the checked-in Drizzle schema.
npm run db:push

# Catch merged TypeScript or bundling failures before workflows restart.
npm run build