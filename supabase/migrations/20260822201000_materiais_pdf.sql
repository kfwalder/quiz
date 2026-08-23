create table public.materiais (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.material_paginas (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materiais(id) on delete cascade,
  storage_path text not null unique,
  image_name text not null,
  position integer not null check (position > 0),
  created_at timestamptz not null default now()
);

alter table public.materiais enable row level security;
alter table public.material_paginas enable row level security;

create policy "users manage own materials" on public.materiais
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "users manage pages of own materials" on public.material_paginas
  for all using (
    exists (
      select 1 from public.materiais m
      where m.id = material_id and m.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.materiais m
      where m.id = material_id and m.owner_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values ('materiais', 'materiais', false)
on conflict (id) do nothing;

create policy "users manage own material files" on storage.objects
  for all using (
    bucket_id = 'materiais'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'materiais'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
