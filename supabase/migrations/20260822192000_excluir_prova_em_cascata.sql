alter table public.simulados
  drop constraint if exists simulados_prova_id_fkey;

alter table public.simulados
  add constraint simulados_prova_id_fkey
  foreign key (prova_id) references public.provas(id) on delete cascade;
