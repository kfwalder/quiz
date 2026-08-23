create or replace function public.reorder_material_pages(
  material_id_input uuid,
  page_ids uuid[]
) returns void language plpgsql security invoker set search_path = public as $$
declare
  expected_count integer;
  matched_count integer;
begin
  if not exists (
    select 1 from public.materiais
    where id = material_id_input and owner_id = auth.uid()
  ) then
    raise exception 'Material não encontrado ou sem permissão';
  end if;

  select count(*) into expected_count
  from public.material_paginas
  where material_id = material_id_input;

  select count(*) into matched_count
  from public.material_paginas
  where material_id = material_id_input and id = any(page_ids);

  if coalesce(array_length(page_ids, 1), 0) <> expected_count or matched_count <> expected_count then
    raise exception 'A lista de páginas do material é inválida';
  end if;

  update public.material_paginas page
  set position = ordered.position::integer
  from unnest(page_ids) with ordinality as ordered(id, position)
  where page.id = ordered.id and page.material_id = material_id_input;
end;
$$;

revoke all on function public.reorder_material_pages(uuid, uuid[]) from public;
grant execute on function public.reorder_material_pages(uuid, uuid[]) to authenticated;
