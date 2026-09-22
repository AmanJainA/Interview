-- =========================================================
-- Interview Portal — Supabase schema
-- Run this whole file once in the Supabase SQL editor.
-- =========================================================

create schema if not exists interview;

-- ---------------------------------------------------------
-- users: profile row for every person who registers.
-- id references auth.users(id) — Supabase Auth handles the
-- password itself (hashed, secure). We never store a raw
-- password column here on purpose.
-- ---------------------------------------------------------
create table if not exists interview.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null unique,
  stream        text,
  location      text,
  usertype      text not null default 'user' check (usertype in ('admin', 'user')),
  created_date  timestamptz not null default now()
);

-- ---------------------------------------------------------
-- company_info: the About + Instructions shown on the
-- dashboard (col-md-6 / col-md-6). Single-row table.
-- ---------------------------------------------------------
create table if not exists interview.company_info (
  id            int primary key default 1,
  about         text not null default '',
  instructions  text not null default '',
  constraint single_row check (id = 1)
);
insert into interview.company_info (id, about, instructions)
values (1, 'Tell users about your company here.', 'Explain how the assessment works here.')
on conflict (id) do nothing;

-- ---------------------------------------------------------
-- questions: MCQ bank. assessment_type lets you run more
-- than one kind of assessment from the same table.
-- ---------------------------------------------------------
create table if not exists interview.questions (
  id               uuid primary key default gen_random_uuid(),
  assessment_type  text not null default 'general',
  question_text    text not null,
  option_a         text not null,
  option_b         text not null,
  option_c         text not null,
  option_d         text not null,
  correct_option   text not null check (correct_option in ('A','B','C','D')),
  marks            numeric not null default 1,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------
-- assessment_attempts: one row per user per attempt.
-- Created the moment the user opens the assessment, so a
-- browser crash never loses progress.
-- ---------------------------------------------------------
create table if not exists interview.assessment_attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references interview.users(id) on delete cascade,
  assessment_type  text not null default 'general',
  total_questions  int not null default 0,
  correct_count    int not null default 0,
  score            numeric not null default 0,
  max_score        numeric not null default 0,
  percentage       numeric not null default 0,
  status           text not null default 'in_progress' check (status in ('in_progress','submitted')),
  started_at       timestamptz not null default now(),
  submitted_at     timestamptz
);

-- Only one *active* (in_progress) attempt per user per assessment_type
create unique index if not exists one_active_attempt
  on interview.assessment_attempts (user_id, assessment_type)
  where status = 'in_progress';

-- ---------------------------------------------------------
-- user_answers: one row per question per attempt. Upserted
-- the instant the user submits that single question, so
-- nothing is lost if the tab closes.
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
-- Helper: is the current user an admin?
-- ---------------------------------------------------------
create or replace function interview.is_admin()
returns boolean
language sql
security definer
set search_path = interview, public
as $$
  select exists (
    select 1 from interview.users
    where id = auth.uid() and usertype = 'admin'
  );
$$;

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------
alter table interview.users enable row level security;
alter table interview.company_info enable row level security;
alter table interview.questions enable row level security;
alter table interview.assessment_attempts enable row level security;
alter table interview.user_answers enable row level security;

-- users: everyone can read their own row; admins read/update all
create policy "users read own" on interview.users
  for select using (id = auth.uid() or interview.is_admin());
create policy "users insert own" on interview.users
  for insert with check (id = auth.uid());
create policy "users update own or admin" on interview.users
  for update using (id = auth.uid() or interview.is_admin());

-- company_info: any signed-in user can read; only admin can write
create policy "company_info read" on interview.company_info
  for select using (auth.uid() is not null);
create policy "company_info admin write" on interview.company_info
  for update using (interview.is_admin());

-- questions: any signed-in user can read; only admin can write
create policy "questions read" on interview.questions
  for select using (auth.uid() is not null);
create policy "questions admin all" on interview.questions
  for all using (interview.is_admin()) with check (interview.is_admin());

-- assessment_attempts: user sees/creates/updates their own; admin sees all
create policy "attempts read own or admin" on interview.assessment_attempts
  for select using (user_id = auth.uid() or interview.is_admin());
create policy "attempts insert own" on interview.assessment_attempts
  for insert with check (user_id = auth.uid());
create policy "attempts update own or admin" on interview.assessment_attempts
  for update using (user_id = auth.uid() or interview.is_admin());

-- user_answers: user reads/writes answers that belong to their own attempt
create policy "answers read own or admin" on interview.user_answers
  for select using (
    interview.is_admin() or
    exists (select 1 from interview.assessment_attempts a
            where a.id = attempt_id and a.user_id = auth.uid())
  );
create policy "answers upsert own" on interview.user_answers
  for insert with check (
    exists (select 1 from interview.assessment_attempts a
            where a.id = attempt_id and a.user_id = auth.uid() and a.status = 'in_progress')
  );
create policy "answers update own" on interview.user_answers
  for update using (
    exists (select 1 from interview.assessment_attempts a
            where a.id = attempt_id and a.user_id = auth.uid() and a.status = 'in_progress')
  );

-- ---------------------------------------------------------
-- Make a user an admin manually after they register, e.g.:
-- update interview.users set usertype = 'admin' where email = 'you@company.com';
-- ---------------------------------------------------------
