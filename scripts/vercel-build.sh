#!/bin/sh
# Vercel's build command (see vercel.json). Production deploys apply pending Prisma
# migrations to Neon (over DIRECT_URL) before building; preview builds never touch
# the production schema.
set -e
npx prisma generate
if [ "$VERCEL_ENV" = "production" ]; then
  npx prisma migrate deploy
fi
npx next build
