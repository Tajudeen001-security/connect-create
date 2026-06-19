-- Push notification delivery log. Admin-only.
-- Apply via Supabase SQL editor.
create table if not exists public.push_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sender_id uuid references auth.users(id) on delete set null,
  recipient_user_id uuid references auth.users(id) on delete set null,
  token text,
  topic text,
  title text,
  body text,
  url text,
  target_kind text not null check (target_kind in ('self','user','token','broadcast','topic','condition')),
  success boolean not null,
  status_code int,
  error text
);

create index if not exists push_logs_created_at_idx on public.push_logs (created_at desc);
create index if not exists push_logs_recipient_idx on public.push_logs (recipient_user_id);
create index if not exists push_logs_success_idx on public.push_logs (success);

grant select on public.push_logs to authenticated;
grant all on public.push_logs to service_role;

alter table public.push_logs enable row level security;

drop policy if exists "Admins read push logs" on public.push_logs;
create policy "Admins read push logs"
  on public.push_logs for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
