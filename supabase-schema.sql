-- Run this in Supabase SQL Editor

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  emoji text not null default '✨',
  stake integer not null default 500, -- in cents
  deadline text not null default '11:59 PM',
  streak integer not null default 0,
  saved integer not null default 0, -- in cents
  lost integer not null default 0,  -- in cents
  history integer[] not null default '{}',
  created_at timestamptz default now()
);

create table habit_entries (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references habits on delete cascade not null,
  user_id uuid references auth.users not null,
  date date not null default current_date,
  completed boolean not null default false,
  created_at timestamptz default now(),
  unique(habit_id, date)
);

-- Row Level Security
alter table habits enable row level security;
alter table habit_entries enable row level security;

create policy "Users manage own habits" on habits
  for all using (auth.uid() = user_id);

create policy "Users manage own entries" on habit_entries
  for all using (auth.uid() = user_id);
