-- =========================================================
-- Interview Portal — Supabase schema
-- Custom authentication in interview.users.
-- Does NOT use Supabase Auth / auth.users.
-- =========================================================

create extension if not exists pgcrypto;

create schema if not exists interview;

-- ---------------------------------------------------------
-- users
-- Passwords are stored only as bcrypt hashes.
-- The frontend never selects the password column.
-- ---------------------------------------------------------
create table if not exists interview.users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password      text not null,
  stream        text,
  location      text,
  usertype      text not null default 'user'
                check (usertype in ('admin', 'user')),
  created_date  timestamptz not null default now()
);

-- ---------------------------------------------------------
-- company_info
-- ---------------------------------------------------------
create table if not exists interview.company_info (
  id            int primary key default 1,
  about         text not null default '',
  instructions  text not null default '',
  constraint single_row check (id = 1)
);

insert into interview.company_info (id, about, instructions)
values (
  1,
  'Tell users about your company here.',
  'Explain how the assessment works here.'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- questions
-- ---------------------------------------------------------
create table if not exists interview.questions (
  id               uuid primary key default gen_random_uuid(),
  assessment_type  text not null default 'general',
  question_text    text not null,
  option_a         text not null,
  option_b         text not null,
  option_c         text not null,
  option_d         text not null,
  correct_option   text not null
                   check (correct_option in ('A','B','C','D')),
  marks             numeric not null default 1,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------
-- assessment_attempts
-- ---------------------------------------------------------
create table if not exists interview.assessment_attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references interview.users(id) on delete cascade,
  assessment_type  text not null default 'general',
  total_questions  int not null default 0,
  correct_count    int not null default 0,
  score             numeric not null default 0,
  max_score         numeric not null default 0,
  percentage        numeric not null default 0,
  status            text not null default 'in_progress'
                    check (status in ('in_progress','submitted')),
  started_at        timestamptz not null default now(),
  submitted_at      timestamptz
);

create unique index if not exists one_active_attempt
  on interview.assessment_attempts (user_id, assessment_type)
  where status = 'in_progress';

-- ---------------------------------------------------------
-- user_answers
-- ---------------------------------------------------------
create table if not exists interview.user_answers (
  id              uuid primary key default gen_random_uuid(),
  attempt_id      uuid not null references interview.assessment_attempts(id) on delete cascade,
  question_id     uuid not null references interview.questions(id) on delete cascade,
  selected_option text check (selected_option in ('A','B','C','D')),
  is_correct      boolean,
  answered_at     timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ---------------------------------------------------------
-- Custom authentication RPCs
-- ---------------------------------------------------------

create or replace function interview.register_user(
  p_name text,
  p_email text,
  p_password text,
  p_stream text,
  p_location text
)
returns table (
  id uuid,
  name text,
  email text,
  stream text,
  location text,
  usertype text,
  created_date timestamptz
)
language plpgsql
security definer
set search_path = interview, public
as $$
declare
  new_id uuid;
begin
  if exists (
    select 1 from interview.users u where lower(u.email) = lower(trim(p_email))
  ) then
    raise exception 'An account with this email already exists.';
  end if;

  insert into interview.users (
    name, email, password, stream, location, usertype
  )
  values (
    trim(p_name),
    lower(trim(p_email)),
    crypt(p_password, gen_salt('bf')),
    p_stream,
    p_location,
    'user'
  )
  returning interview.users.id into new_id;

  return query
    select
      u.id,
      u.name,
      u.email,
      u.stream,
      u.location,
      u.usertype,
      u.created_date
    from interview.users u
    where u.id = new_id;
end;
$$;

create or replace function interview.login_user(
  p_email text,
  p_password text
)
returns table (
  id uuid,
  name text,
  email text,
  stream text,
  location text,
  usertype text,
  created_date timestamptz
)
language plpgsql
security definer
set search_path = interview, public
as $$
begin
  return query
    select
      u.id,
      u.name,
      u.email,
      u.stream,
      u.location,
      u.usertype,
      u.created_date
    from interview.users u
    where lower(u.email) = lower(trim(p_email))
      and u.password = crypt(p_password, u.password);
end;
$$;

-- ---------------------------------------------------------
-- RLS
-- This application uses its own localStorage session rather
-- than Supabase Auth, so database-level user identity is not
-- available through auth.uid(). The app therefore scopes its
-- normal reads/writes by the returned profile/user id.
-- ---------------------------------------------------------

alter table interview.users enable row level security;
alter table interview.company_info enable row level security;
alter table interview.questions enable row level security;
alter table interview.assessment_attempts enable row level security;
alter table interview.user_answers enable row level security;

drop policy if exists "users read all" on interview.users;
drop policy if exists "users update all" on interview.users;
create policy "users read all"
  on interview.users for select using (true);
create policy "users update all"
  on interview.users for update using (true);

drop policy if exists "company_info read" on interview.company_info;
drop policy if exists "company_info write" on interview.company_info;
create policy "company_info read"
  on interview.company_info for select using (true);
create policy "company_info write"
  on interview.company_info for update using (true);

drop policy if exists "questions read" on interview.questions;
drop policy if exists "questions write" on interview.questions;
create policy "questions read"
  on interview.questions for select using (true);
create policy "questions write"
  on interview.questions for all using (true) with check (true);

drop policy if exists "attempts read" on interview.assessment_attempts;
drop policy if exists "attempts insert" on interview.assessment_attempts;
drop policy if exists "attempts update" on interview.assessment_attempts;
create policy "attempts read"
  on interview.assessment_attempts for select using (true);
create policy "attempts insert"
  on interview.assessment_attempts for insert with check (true);
create policy "attempts update"
  on interview.assessment_attempts for update using (true);

drop policy if exists "answers read" on interview.user_answers;
drop policy if exists "answers insert" on interview.user_answers;
drop policy if exists "answers update" on interview.user_answers;
create policy "answers read"
  on interview.user_answers for select using (true);
create policy "answers insert"
  on interview.user_answers for insert with check (true);
create policy "answers update"
  on interview.user_answers for update using (true);

-- ---------------------------------------------------------
-- Data API grants
-- IMPORTANT: interview must also be added to:
-- Supabase Dashboard → Settings → API → Exposed schemas.
-- ---------------------------------------------------------

grant usage on schema interview to anon, authenticated, service_role;
grant select, insert, update, delete
  on all tables in schema interview
  to anon, authenticated, service_role;
grant execute on all functions in schema interview
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema interview
  grant select, insert, update, delete on tables
  to anon, authenticated, service_role;

alter default privileges for role postgres in schema interview
  grant execute on functions
  to anon, authenticated, service_role;

-- ---------------------------------------------------------
-- Default admin account
-- Login:
--   email: admin@interview.com
--   password: Admin@123
-- Change the password after first login.
-- ---------------------------------------------------------

insert into interview.users (name, email, password, usertype)
values (
  'Admin',
  'admin@interview.com',
  crypt('Admin@123', gen_salt('bf')),
  'admin'
)
on conflict (email) do update
set usertype = 'admin';

notify pgrst, 'reload schema';
