create or replace function public.admin_save_system_exam(
  exam_name text,
  payload jsonb,
  existing_id uuid,
  exam_emoji text default '📝'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  exam_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem editar provas globais';
  end if;

  perform public.validate_questions(payload);

  update public.provas
  set name = trim(exam_name), emoji = exam_emoji
  where id = existing_id and is_system
  returning id into exam_id;

  if exam_id is null then
    raise exception 'Prova global não encontrada';
  end if;

  delete from public.questoes where prova_id = exam_id;

  insert into public.questoes (prova_id, position, pergunta, alternativas, resposta_correta, dica)
  select exam_id, ordinality - 1, value->>'q', value->'a', (value->>'correct')::int, value->>'hint'
  from jsonb_array_elements(payload) with ordinality;

  return exam_id;
end;
$$;

revoke all on function public.admin_save_system_exam(text, jsonb, uuid, text) from public;
grant execute on function public.admin_save_system_exam(text, jsonb, uuid, text) to authenticated;
