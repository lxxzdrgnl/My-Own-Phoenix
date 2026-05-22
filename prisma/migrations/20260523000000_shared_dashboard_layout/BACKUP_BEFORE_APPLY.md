# Read before applying

This migration **deletes rows** from `DashboardLayout`. Per-user layouts collapse
to a single per-project row. The chosen row is:

- For the project named `dexter`: Sean Lee's (`yihsean@gmail.com`) layout.
- For every other project: the owner's layout.
- If neither qualifies, any member's layout (deterministic by id).

Take a backup first:

```bash
mkdir -p backups
pg_dump --table=public."DashboardLayout" "$DATABASE_URL" \
  > backups/dashboard-layout-pre-shared-$(date -u +%Y%m%d-%H%M%S).sql
```

Apply with:

- `npx prisma migrate deploy` (production, mini-PC)
- `npx prisma migrate dev` (local development)

To verify the selection logic without touching the DB, run the unit test:

```bash
npx tsx scripts/test-dashboard-migration.ts
```
