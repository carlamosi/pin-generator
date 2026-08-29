# Supabase schema notes

This app talks to an external Supabase project (see `src/lib/supabase.ts`).
Lovable can't run DDL against it, so schema changes must be applied by the
project owner in the Supabase SQL editor.

## Pending migration — add `month` column

The `pins` table is currently missing the `month` column, which makes every
`upsert` from the app fail with `PGRST204 Could not find the 'month' column
of 'pins' in the schema cache`. The client now retries once without `month`
so toggles still persist, but "Mes" edits can't be saved until you run:

```sql
alter table public.pins
  add column if not exists month smallint
  check (month is null or (month between 1 and 12));
```

After running it, reload the app and edit any pin's month — it should
persist across a full page reload.
