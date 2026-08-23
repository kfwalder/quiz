create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.perfis enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and role = 'admin');
$$;

create or replace function public.create_profile_for_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.create_profile_for_user();

insert into public.perfis (id, email)
  select id, coalesce(email, '') from auth.users
  on conflict (id) do nothing;

create policy "read own profile or all as admin" on public.perfis
  for select using (id = auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.perfis
  for all using (public.is_admin()) with check (public.is_admin());

create policy "admins read all exams" on public.provas for select using (public.is_admin());
create policy "admins manage all exams" on public.provas for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read all questions" on public.questoes for select using (public.is_admin());
create policy "admins manage all questions" on public.questoes for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read all attempts" on public.simulados for select using (public.is_admin());
create policy "admins delete all attempts" on public.simulados for delete using (public.is_admin());
create policy "admins read all attempt answers" on public.respostas_simulado for select using (public.is_admin());

-- Execute once after signing up: update public.perfis set role = 'admin' where email = 'seu-email@exemplo.com';
