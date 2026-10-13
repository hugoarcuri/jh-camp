-- Esquema para el sistema de gestión de campamento cristiano
-- Ejecutar en Supabase: SQL Editor -> New query -> Run

create table if not exists public.campers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_name text not null,
  first_name text not null,
  phone text,
  email text,
  church text,
  birth_date date,
  dni text
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  camper_id uuid not null references public.campers(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_mode text not null default 'efectivo',
  payment_date date not null default current_date,
  note text
);

create index if not exists payments_camper_id_idx on public.payments(camper_id);

-- RLS
alter table public.campers enable row level security;
alter table public.payments enable row level security;

-- Políticas permisivas para anon (app sin login). Ajustar si se agrega auth.
drop policy if exists "anon all campers" on public.campers;
create policy "anon all campers" on public.campers for all to anon using (true) with check (true);

drop policy if exists "anon all payments" on public.payments;
create policy "anon all payments" on public.payments for all to anon using (true) with check (true);

-- Permitir también a authenticated por si se agrega login luego
drop policy if exists "auth all campers" on public.campers;
create policy "auth all campers" on public.campers for all to authenticated using (true) with check (true);

drop policy if exists "auth all payments" on public.payments;
create policy "auth all payments" on public.payments for all to authenticated using (true) with check (true);
