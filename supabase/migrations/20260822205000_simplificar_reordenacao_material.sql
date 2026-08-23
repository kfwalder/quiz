drop function if exists public.reorder_material_pages(uuid, uuid[]);

create function public.reorder_material_pages(
  page_id_input uuid,
  page_position_input integer
) returns void language plpgsql security invoker set search_path = public as $$
begin
  if page_position_input < 1 then
    raise exception 'O número da página deve ser maior que zero';
  end if;

  update public.material_paginas page
  set position = page_position_input
  where page.id = page_id_input
    and exists (
      select 1 from public.materiais material
      where material.id = page.material_id and material.owner_id = auth.uid()
    );

  if not found then
    raise exception 'Página não encontrada ou sem permissão';
  end if;
end;
$$;

revoke all on function public.reorder_material_pages(uuid, integer) from public;
grant execute on function public.reorder_material_pages(uuid, integer) to authenticated;
