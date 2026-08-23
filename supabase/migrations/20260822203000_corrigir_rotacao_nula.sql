update public.material_paginas
set rotation = 0
where rotation is null;

alter table public.material_paginas
  alter column rotation set default 0,
  alter column rotation set not null;
