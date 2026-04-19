create extension if not exists pgcrypto;

insert into public.products (name, slug)
values ('TaskOrbit', 'taskorbit')
on conflict (slug) do update
set name = excluded.name;

create schema if not exists task_orbit;

grant usage on schema task_orbit to authenticated, service_role;
grant all on all tables in schema task_orbit to service_role;
grant all on all routines in schema task_orbit to service_role;
grant all on all sequences in schema task_orbit to service_role;

create table if not exists task_orbit.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text,
  avatar_url text,
  locale text not null default 'en',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists task_orbit.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#31cc74',
  icon text not null default 'orbit',
  status text not null default 'active' check (status in ('active', 'paused')),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists task_orbit.task_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references task_orbit.projects(id) on delete cascade,
  title text not null,
  note text,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  repeat_type text not null check (repeat_type in ('daily', 'weekdays')),
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists task_orbit.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references task_orbit.projects(id) on delete cascade,
  title text not null,
  note text,
  state text not null default 'active' check (state in ('active', 'done')),
  planned_date date,
  completed_at timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table task_orbit.tasks
  add column if not exists template_id uuid references task_orbit.task_templates(id) on delete set null;

alter table task_orbit.tasks
  add column if not exists task_date date;

alter table task_orbit.tasks
  add column if not exists is_skipped boolean not null default false;

create index if not exists idx_task_orbit_profiles_email
  on task_orbit.profiles(email);

create index if not exists idx_task_orbit_projects_user_sort
  on task_orbit.projects(user_id, sort_order);

create index if not exists idx_task_orbit_templates_user_project
  on task_orbit.task_templates(user_id, project_id);

create index if not exists idx_task_orbit_templates_user_active
  on task_orbit.task_templates(user_id, active, repeat_type);

create index if not exists idx_task_orbit_tasks_user_created
  on task_orbit.tasks(user_id, created_at desc);

create index if not exists idx_task_orbit_tasks_project
  on task_orbit.tasks(project_id);

create index if not exists idx_task_orbit_tasks_user_planned
  on task_orbit.tasks(user_id, planned_date);

create index if not exists idx_task_orbit_tasks_user_sort
  on task_orbit.tasks(user_id, sort_order);

create index if not exists idx_task_orbit_tasks_template_date
  on task_orbit.tasks(template_id, task_date);

create unique index if not exists idx_task_orbit_tasks_template_date_unique
  on task_orbit.tasks(template_id, task_date)
  where template_id is not null and task_date is not null;

drop trigger if exists profiles_set_updated_at on task_orbit.profiles;
create trigger profiles_set_updated_at
before update on task_orbit.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on task_orbit.projects;
create trigger projects_set_updated_at
before update on task_orbit.projects
for each row
execute function public.set_updated_at();

drop trigger if exists task_templates_set_updated_at on task_orbit.task_templates;
create trigger task_templates_set_updated_at
before update on task_orbit.task_templates
for each row
execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on task_orbit.tasks;
create trigger tasks_set_updated_at
before update on task_orbit.tasks
for each row
execute function public.set_updated_at();

create or replace function task_orbit.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = task_orbit, public
as $$
begin
  insert into task_orbit.profiles (id, email, display_name, avatar_url, locale)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'avatar_url', ''), ''),
    case
      when coalesce(new.raw_user_meta_data ->> 'locale', '') in ('en', 'zh') then new.raw_user_meta_data ->> 'locale'
      else 'en'
    end
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, task_orbit.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, task_orbit.profiles.avatar_url),
    locale = excluded.locale;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_task_orbit on auth.users;
create trigger on_auth_user_created_task_orbit
after insert on auth.users
for each row
execute function task_orbit.handle_new_user();

create or replace function task_orbit.ensure_current_user_setup()
returns void
language plpgsql
security definer
set search_path = task_orbit, public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth.uid() is null';
  end if;

  insert into task_orbit.profiles (id, email, display_name, avatar_url, locale)
  select
    u.id,
    coalesce(u.email, ''),
    nullif(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''), ''),
    nullif(coalesce(u.raw_user_meta_data ->> 'avatar_url', ''), ''),
    case
      when coalesce(u.raw_user_meta_data ->> 'locale', '') in ('en', 'zh') then u.raw_user_meta_data ->> 'locale'
      else 'en'
    end
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, task_orbit.profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, task_orbit.profiles.avatar_url),
    locale = excluded.locale;

  if not exists (
    select 1
    from auth.users
    where id = auth.uid()
  ) then
    raise exception 'auth user not found';
  end if;

  if not exists (
    select 1
    from public.users
    where auth_user_id = auth.uid()
  ) then
    raise exception 'platform user missing for auth user %', auth.uid();
  end if;

  if not exists (
    select 1
    from public.products
    where slug = 'taskorbit'
  ) then
    raise exception 'public.products row missing for slug taskorbit';
  end if;

  insert into public.product_users (user_id, product_id, role)
  select
    pu.id,
    p.id,
    'member'
  from public.users pu
  cross join public.products p
  where pu.auth_user_id = auth.uid()
    and p.slug = 'taskorbit'
  on conflict (user_id, product_id) do nothing;
end;
$$;

grant execute on function task_orbit.ensure_current_user_setup() to authenticated;

grant select, insert, update on task_orbit.profiles to authenticated;
grant select, insert, update, delete on task_orbit.projects to authenticated;
grant select, insert, update, delete on task_orbit.task_templates to authenticated;
grant select, insert, update, delete on task_orbit.tasks to authenticated;

alter table task_orbit.profiles enable row level security;
alter table task_orbit.projects enable row level security;
alter table task_orbit.task_templates enable row level security;
alter table task_orbit.tasks enable row level security;

drop policy if exists "profiles read own" on task_orbit.profiles;
create policy "profiles read own"
on task_orbit.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles insert own" on task_orbit.profiles;
create policy "profiles insert own"
on task_orbit.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles update own" on task_orbit.profiles;
create policy "profiles update own"
on task_orbit.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "projects manage own" on task_orbit.projects;
create policy "projects manage own"
on task_orbit.projects
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "task templates manage own" on task_orbit.task_templates;
create policy "task templates manage own"
on task_orbit.task_templates
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "tasks manage own" on task_orbit.tasks;
create policy "tasks manage own"
on task_orbit.tasks
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
