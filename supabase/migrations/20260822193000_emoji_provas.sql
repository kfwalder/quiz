alter table public.provas
  add column if not exists emoji text not null default '📝'
  check (char_length(emoji) between 1 and 16);

update public.provas
  set emoji = '🌍'
  where name = 'Prova de Geografia' and is_system;

drop function if exists public.save_exam(text, jsonb, uuid);

create function public.save_exam(
  exam_name text,
  payload jsonb,
  existing_id uuid default null,
  exam_emoji text default '📝'
) returns uuid language plpgsql security invoker as $$
declare exam_id uuid;
begin
  perform public.validate_questions(payload);
  if existing_id is null then
    insert into public.provas (owner_id, name, emoji)
    values (auth.uid(), trim(exam_name), exam_emoji)
    returning id into exam_id;
  else
    update public.provas
      set name = trim(exam_name), emoji = exam_emoji
      where id = existing_id and owner_id = auth.uid() and not is_system
      returning id into exam_id;
    if exam_id is null then raise exception 'Prova não encontrada ou sem permissão'; end if;
    delete from public.questoes where prova_id = exam_id;
  end if;
  insert into public.questoes (prova_id, position, pergunta, alternativas, resposta_correta, dica)
  select exam_id, ordinality - 1, value->>'q', value->'a', (value->>'correct')::int, value->>'hint'
  from jsonb_array_elements(payload) with ordinality;
  return exam_id;
end $$;
