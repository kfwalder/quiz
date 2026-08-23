create table public.amigos (
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  created_at timestamptz not null default now(),
  last_shared_at timestamptz not null default now(),
  primary key (owner_id, email)
);

alter table public.amigos enable row level security;

create policy "users read own friends" on public.amigos
  for select using (owner_id = auth.uid());

create or replace function public.copy_exam_to_user(
  source_exam_id uuid,
  recipient_email_input text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  source_exam public.provas%rowtype;
  recipient_id uuid;
  recipient_email text := lower(trim(recipient_email_input));
  new_exam_id uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;

  select * into source_exam
  from public.provas
  where id = source_exam_id and (owner_id = auth.uid() or is_system);
  if source_exam.id is null then raise exception 'Prova não encontrada ou sem permissão para enviar'; end if;

  select id into recipient_id
  from public.perfis
  where lower(email) = recipient_email;
  if recipient_id is null then raise exception 'Nenhum usuário cadastrado com este e-mail'; end if;
  if recipient_id = auth.uid() then raise exception 'Você não pode enviar uma prova para si mesmo'; end if;

  insert into public.provas (owner_id, name, emoji)
  values (recipient_id, source_exam.name, source_exam.emoji)
  returning id into new_exam_id;

  insert into public.questoes (prova_id, position, pergunta, alternativas, resposta_correta, dica)
  select new_exam_id, position, pergunta, alternativas, resposta_correta, dica
  from public.questoes
  where prova_id = source_exam_id
  order by position;

  insert into public.amigos (owner_id, email)
  values (auth.uid(), recipient_email)
  on conflict (owner_id, email) do update
    set last_shared_at = now();

  return new_exam_id;
end;
$$;

revoke all on function public.copy_exam_to_user(uuid, text) from public;
grant execute on function public.copy_exam_to_user(uuid, text) to authenticated;
