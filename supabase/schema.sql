-- ==============================================================================
-- 1. Tabel Trades
-- ==============================================================================
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  traded_at date not null,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  entry_price numeric not null,
  exit_price numeric not null,
  quantity numeric not null check (quantity > 0),
  fees numeric not null default 0,
  stop_loss numeric,
  take_profit numeric,
  pip_size numeric,
  pip_value numeric,
  setup text,
  notes text,
  screenshot_path text,
  created_at timestamptz not null default now()
);

create index if not exists trades_user_date_idx on public.trades (user_id, traded_at);

-- RLS Trades
alter table public.trades enable row level security;

create policy "trades_select_own" on public.trades for select using (auth.uid() = user_id);
create policy "trades_insert_own" on public.trades for insert with check (auth.uid() = user_id);
create policy "trades_update_own" on public.trades for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trades_delete_own" on public.trades for delete using (auth.uid() = user_id);

-- ==============================================================================
-- 2. Tabel Jurnal Harian (Daily Reflection & Psychology)
-- ==============================================================================
create table if not exists public.daily_journals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  mood text check (mood in ('great', 'good', 'neutral', 'bad', 'terrible')),
  market_notes text,
  lessons text,
  plan_tomorrow text,
  created_at timestamptz not null default now(),
  unique(user_id, entry_date)
);

create index if not exists daily_journals_user_date_idx on public.daily_journals (user_id, entry_date);

alter table public.daily_journals enable row level security;

create policy "daily_journals_select_own" on public.daily_journals for select using (auth.uid() = user_id);
create policy "daily_journals_insert_own" on public.daily_journals for insert with check (auth.uid() = user_id);
create policy "daily_journals_update_own" on public.daily_journals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "daily_journals_delete_own" on public.daily_journals for delete using (auth.uid() = user_id);

-- ==============================================================================
-- 3. Tabel Weekly Review (Evaluasi Mingguan)
-- ==============================================================================
create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start date not null,
  what_went_well text,
  mistakes text,
  rule_discipline integer check (rule_discipline between 1 and 5),
  focus_next_week text,
  created_at timestamptz not null default now(),
  unique(user_id, week_start)
);

create index if not exists weekly_reviews_user_week_idx on public.weekly_reviews (user_id, week_start);

alter table public.weekly_reviews enable row level security;

create policy "weekly_reviews_select_own" on public.weekly_reviews for select using (auth.uid() = user_id);
create policy "weekly_reviews_insert_own" on public.weekly_reviews for insert with check (auth.uid() = user_id);
create policy "weekly_reviews_update_own" on public.weekly_reviews for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weekly_reviews_delete_own" on public.weekly_reviews for delete using (auth.uid() = user_id);
