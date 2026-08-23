create or replace function public.copy_exam_to_user(
  source_exam_id uuid,
  recipient_email_input text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  source_exam public.provas%rowtype;
  recipient_id uuid;
  new_exam_id uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;

  select * into source_exam
  from public.provas
  where id = source_exam_id and (owner_id = auth.uid() or is_system);
  if source_exam.id is null then raise exception 'Prova não encontrada ou sem permissão para enviar'; end if;

  select id into recipient_id
  from public.perfis
  where lower(email) = lower(trim(recipient_email_input));
  if recipient_id is null then raise exception 'Nenhum usuário cadastrado com este e-mail'; end if;

  insert into public.provas (owner_id, name, emoji)
  values (recipient_id, source_exam.name, source_exam.emoji)
  returning id into new_exam_id;

  insert into public.questoes (prova_id, position, pergunta, alternativas, resposta_correta, dica)
  select new_exam_id, position, pergunta, alternativas, resposta_correta, dica
  from public.questoes
  where prova_id = source_exam_id
  order by position;

  return new_exam_id;
end;
$$;

revoke all on function public.copy_exam_to_user(uuid, text) from public;
grant execute on function public.copy_exam_to_user(uuid, text) to authenticated;
