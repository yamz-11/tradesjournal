create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  traded_at date not null,
  symbol text not null,
  side text not null check (side in ('long', 'short')),
  entry_price numeric not null,
  exit_price numeric not null,
  quantity numeric not null check (quantity > 0),
  fees numeric not null default 0,
  setup text,
  notes text,
  created_at timestamptz not null default now()
);

create index trades_user_date_idx on public.trades (user_id, traded_at);

-- Keamanan: setiap pengguna hanya bisa melihat dan mengubah datanya sendiri
alter table public.trades enable row level security;

create policy "trades_select_own" on public.trades
  for select using (auth.uid() = user_id);
create policy "trades_insert_own" on public.trades
  for insert with check (auth.uid() = user_id);
create policy "trades_update_own" on public.trades
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "trades_delete_own" on public.trades
  for delete using (auth.uid() = user_id);
