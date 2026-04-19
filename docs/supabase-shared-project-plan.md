# TaskOrbit Shared Supabase Plan

## Goal

TaskOrbit is a standalone app outside the monorepo, but it reuses the shared Supabase project `xmybavjiuvmsvplsfvwo`.

Rules for this integration:

- Shared platform tables stay in `public.*`
- TaskOrbit business tables live only in `task_orbit.*`
- Do not create app business tables in `public`
- Register the app in `public.products` first
- Keep app profiles in `task_orbit.profiles`

## Schema Boundary

Shared platform schema:

- `public.users`
- `public.products`
- `public.product_users`

TaskOrbit app schema:

- `task_orbit.profiles`
- `task_orbit.projects`
- `task_orbit.tasks`
- `task_orbit.ensure_current_user_setup()`
- `task_orbit.handle_new_user()`

## Environment Variables

Add these to `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SUPABASE_DB_SCHEMA=task_orbit
SUPABASE_DB_SCHEMA=task_orbit
```

Notes:

- `NEXT_PUBLIC_SUPABASE_DB_SCHEMA` keeps browser queries on `task_orbit`
- `SUPABASE_DB_SCHEMA` keeps server queries and route handlers on `task_orbit`
- Service role is not required for this MVP

## SQL Rollout

Run `/Users/yanyikuo/Desktop/project/taskOrbit/supabase/schema.sql` in the shared project's SQL Editor.

What it does:

1. Upserts `TaskOrbit` into `public.products` with slug `taskorbit`
2. Creates `task_orbit` schema
3. Creates `task_orbit.profiles`, `task_orbit.projects`, `task_orbit.tasks`
4. Adds indexes and `updated_at` triggers
5. Adds auth trigger `task_orbit.handle_new_user()`
6. Adds idempotent login RPC `task_orbit.ensure_current_user_setup()`
7. Enables RLS and own-row policies

## Login Flow

On auth callback:

1. Exchange magic-link code for session
2. Call `task_orbit.ensure_current_user_setup()`

The RPC is `security definer` and does two things safely:

- Upserts `task_orbit.profiles` for the current auth user
- Ensures a `public.product_users` membership exists for `taskorbit`

This is required because:

- New users are covered by the trigger
- Existing platform users will not re-fire an auth insert trigger
- The callback must therefore perform an idempotent setup step

## RLS Design

`task_orbit.profiles`

- `select`: own row only
- `insert`: own row only
- `update`: own row only

`task_orbit.projects`

- `for all`: `auth.uid() = user_id`

`task_orbit.tasks`

- `for all`: `auth.uid() = user_id`

Why this design:

- It keeps TaskOrbit isolated at the app schema level
- It does not weaken existing platform RLS in `public`
- It avoids making every app read path depend on a join to `public.product_users`
- Product membership is still recorded in `public.product_users` for platform-level ownership and future billing

## Required Manual Dashboard Step

In Supabase Dashboard:

`Project Settings -> API -> Exposed schemas`

Add:

- `task_orbit`

Without this, PostgREST and RPC calls from the app will fail even if the tables exist.

## Notes on Shared Project Safety

- No TaskOrbit business table is created in `public`
- Existing `public.users`, `public.products`, `public.product_users` behavior is preserved
- The only `public` write added by TaskOrbit is:
  - one idempotent product upsert into `public.products`
  - one idempotent membership insert into `public.product_users`

## Dashboard Inspection

I attempted to inspect the shared Supabase dashboard directly, but Computer Use access to the browser was blocked by approval denial in this session. The plan and SQL are therefore based on:

- the monorepo platform migrations
- the standalone app guide
- the existing `unified-demo` shared-project pattern
