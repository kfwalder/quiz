alter table public.material_paginas
  add column rotation integer not null default 0
  check (rotation in (0, 90, 180, 270));
