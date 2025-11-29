# MV Intelligence Platform — Combined Bundle

This bundle contains:
- **mv-intel-web/**: Next.js app (Portfolio, Deals, Network, Admin, APIs)
- **supabase/functions/**: Edge Functions (deck capture helpers; memo drafting; Affinity sync; hygiene; signals)
- **supabase/migrations/**: SQL migrations (metrics, signals, actions, RLS/RBAC, audit)
- **docs/**: Design System & Updated Build Plan

## Quick Start
1. Set env vars for the web and functions (see prior messages inside APIs and function files).
2. Run migrations in `supabase/migrations/` against your database.
3. Deploy functions under `supabase/functions/`.
4. Start the web app in `mv-intel-web/`.

See `docs/MV_Intelligence_Design_and_Build_Plan_2025-08-29.md` for design & roadmap.


## One-Click Deploy

1) Copy `.env.example` to `.env` and export the values:
```bash
cp .env.example .env
export $(grep -v '^#' .env | xargs)
```

2) Verify prerequisites:
```bash
./scripts/verify_env.sh
```

3) Apply migrations + deploy all functions:
```bash
./scripts/deploy_all.sh
# or
make deploy
```

Notes:
- `DATABASE_URL` should be the **Postgres** connection string for your Supabase project.
- `SUPABASE_PROJECT_REF` is the short ref (e.g., `uqptiychukuwixubrbat`).
- Scripts are idempotent; migrations use `ON_ERROR_STOP=1` to fail fast.
