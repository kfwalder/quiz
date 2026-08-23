create extension if not exists "pgcrypto";

create table public.provas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  emoji text not null default '📝' check (char_length(emoji) between 1 and 16),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  constraint provas_owner_or_system check ((is_system and owner_id is null) or (not is_system and owner_id is not null))
);
create table public.questoes (
  id uuid primary key default gen_random_uuid(),
  prova_id uuid not null references public.provas(id) on delete cascade,
  position integer not null check (position >= 0),
  pergunta text not null check (char_length(trim(pergunta)) > 0),
  alternativas jsonb not null check (jsonb_typeof(alternativas) = 'array' and jsonb_array_length(alternativas) = 4),
  resposta_correta integer not null check (resposta_correta between 0 and 3),
  dica text not null check (char_length(trim(dica)) > 0),
  unique(prova_id, position)
);
create table public.simulados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prova_id uuid references public.provas(id) on delete set null,
  prova_nome text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_questions integer not null check (total_questions > 0),
  correct_count integer not null default 0 check (correct_count >= 0),
  error_count integer not null default 0 check (error_count >= 0)
);
create table public.respostas_simulado (
  id uuid primary key default gen_random_uuid(),
  simulado_id uuid not null references public.simulados(id) on delete cascade,
  position integer not null,
  question_text text not null,
  options jsonb not null,
  correct_index integer not null check (correct_index between 0 and 3),
  selected_index integer not null check (selected_index between 0 and 3),
  is_correct boolean not null,
  hint text not null,
  unique(simulado_id, position)
);

alter table public.provas enable row level security;
alter table public.questoes enable row level security;
alter table public.simulados enable row level security;
alter table public.respostas_simulado enable row level security;
create policy "read public and own exams" on public.provas for select using (is_system or owner_id = auth.uid());
create policy "manage own exams" on public.provas for all using (owner_id = auth.uid() and not is_system) with check (owner_id = auth.uid() and not is_system);
create policy "read allowed questions" on public.questoes for select using (exists (select 1 from public.provas p where p.id = prova_id and (p.is_system or p.owner_id = auth.uid())));
create policy "manage questions of own exams" on public.questoes for all using (exists (select 1 from public.provas p where p.id = prova_id and p.owner_id = auth.uid() and not p.is_system)) with check (exists (select 1 from public.provas p where p.id = prova_id and p.owner_id = auth.uid() and not p.is_system));
create policy "read own attempts" on public.simulados for select using (user_id = auth.uid());
create policy "write own attempts" on public.simulados for insert with check (user_id = auth.uid());
create policy "read own attempt answers" on public.respostas_simulado for select using (exists (select 1 from public.simulados s where s.id = simulado_id and s.user_id = auth.uid()));
create policy "write own attempt answers" on public.respostas_simulado for insert with check (exists (select 1 from public.simulados s where s.id = simulado_id and s.user_id = auth.uid()));

create or replace function public.validate_questions(payload jsonb) returns void language plpgsql as $$
declare item jsonb; idx int := 0;
begin
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then raise exception 'O arquivo precisa conter ao menos uma pergunta'; end if;
  for item in select value from jsonb_array_elements(payload) loop
    if coalesce(trim(item->>'q'), '') = '' or coalesce(trim(item->>'hint'), '') = '' then raise exception 'Pergunta e dica são obrigatórias'; end if;
    if jsonb_typeof(item->'a') <> 'array' or jsonb_array_length(item->'a') <> 4 then raise exception 'Cada pergunta deve ter quatro alternativas'; end if;
    if exists (select 1 from jsonb_array_elements(item->'a') option where jsonb_typeof(option) <> 'string' or coalesce(trim(option #>> '{}'), '') = '') then raise exception 'Todas as alternativas precisam ter texto'; end if;
    if jsonb_typeof(item->'correct') <> 'number' or (item->>'correct')::int not between 0 and 3 then raise exception 'Índice da resposta correta inválido'; end if;
    idx := idx + 1;
  end loop;
end $$;

create or replace function public.save_exam(exam_name text, payload jsonb, existing_id uuid default null, exam_emoji text default '📝') returns uuid language plpgsql security invoker as $$
declare exam_id uuid;
begin
  perform public.validate_questions(payload);
  if existing_id is null then
    insert into public.provas (owner_id, name, emoji) values (auth.uid(), trim(exam_name), exam_emoji) returning id into exam_id;
  else
    update public.provas set name = trim(exam_name), emoji = exam_emoji where id = existing_id and owner_id = auth.uid() and not is_system returning id into exam_id;
    if exam_id is null then raise exception 'Prova não encontrada ou sem permissão'; end if;
    delete from public.questoes where prova_id = exam_id;
  end if;
  insert into public.questoes (prova_id, position, pergunta, alternativas, resposta_correta, dica)
  select exam_id, ordinality - 1, value->>'q', value->'a', (value->>'correct')::int, value->>'hint'
  from jsonb_array_elements(payload) with ordinality;
  return exam_id;
end $$;

insert into public.provas (name, emoji, is_system) values ('Prova de Geografia', '🌍', true);
