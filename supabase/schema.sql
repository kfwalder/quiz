


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."admin_save_system_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text" DEFAULT '📝'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_save_system_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."copy_exam_to_user"("source_exam_id" "uuid", "recipient_email_input" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  source_exam public.provas%rowtype;
  recipient_id uuid;
  recipient_email text := lower(trim(recipient_email_input));
  new_exam_id uuid;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;

  select * into source_exam
  from public.provas
  where id = source_exam_id and owner_id = auth.uid() and not is_system;
  if source_exam.id is null then
    raise exception 'Apenas provas privadas próprias podem ser enviadas';
  end if;

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


ALTER FUNCTION "public"."copy_exam_to_user"("source_exam_id" "uuid", "recipient_email_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_profile_for_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.perfis (id, email) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."create_profile_for_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.perfis where id = auth.uid() and role = 'admin');
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_material_pages"("page_id_input" "uuid", "page_position_input" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."reorder_material_pages"("page_id_input" "uuid", "page_position_input" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid" DEFAULT NULL::"uuid", "exam_emoji" "text" DEFAULT '📝'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."save_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_questions"("payload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "public"."validate_questions"("payload" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."amigos" (
    "owner_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_shared_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "amigos_email_check" CHECK (("email" = "lower"(TRIM(BOTH FROM "email"))))
);


ALTER TABLE "public"."amigos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."materiais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "materiais_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 1) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120)))
);


ALTER TABLE "public"."materiais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."material_paginas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "image_name" "text" NOT NULL,
    "position" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rotation" integer DEFAULT 0 NOT NULL,
    "corrected" boolean DEFAULT false NOT NULL,
    CONSTRAINT "material_paginas_position_check" CHECK (("position" > 0)),
    CONSTRAINT "material_paginas_rotation_check" CHECK (("rotation" = ANY (ARRAY[0, 90, 180, 270])))
);


ALTER TABLE "public"."material_paginas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."perfis" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "perfis_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."perfis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."provas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid",
    "name" "text" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "emoji" "text" DEFAULT '📝'::"text" NOT NULL,
    CONSTRAINT "provas_emoji_check" CHECK ((("char_length"("emoji") >= 1) AND ("char_length"("emoji") <= 16))),
    CONSTRAINT "provas_name_check" CHECK ((("char_length"(TRIM(BOTH FROM "name")) >= 1) AND ("char_length"(TRIM(BOTH FROM "name")) <= 120))),
    CONSTRAINT "provas_owner_or_system" CHECK ((("is_system" AND ("owner_id" IS NULL)) OR ((NOT "is_system") AND ("owner_id" IS NOT NULL))))
);


ALTER TABLE "public"."provas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."questoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prova_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "pergunta" "text" NOT NULL,
    "alternativas" "jsonb" NOT NULL,
    "resposta_correta" integer NOT NULL,
    "dica" "text" NOT NULL,
    CONSTRAINT "questoes_alternativas_check" CHECK ((("jsonb_typeof"("alternativas") = 'array'::"text") AND ("jsonb_array_length"("alternativas") = 4))),
    CONSTRAINT "questoes_dica_check" CHECK (("char_length"(TRIM(BOTH FROM "dica")) > 0)),
    CONSTRAINT "questoes_pergunta_check" CHECK (("char_length"(TRIM(BOTH FROM "pergunta")) > 0)),
    CONSTRAINT "questoes_position_check" CHECK (("position" >= 0)),
    CONSTRAINT "questoes_resposta_correta_check" CHECK ((("resposta_correta" >= 0) AND ("resposta_correta" <= 3)))
);


ALTER TABLE "public"."questoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."respostas_simulado" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "simulado_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "question_text" "text" NOT NULL,
    "options" "jsonb" NOT NULL,
    "correct_index" integer NOT NULL,
    "selected_index" integer NOT NULL,
    "is_correct" boolean NOT NULL,
    "hint" "text" NOT NULL,
    CONSTRAINT "respostas_simulado_correct_index_check" CHECK ((("correct_index" >= 0) AND ("correct_index" <= 3))),
    CONSTRAINT "respostas_simulado_selected_index_check" CHECK ((("selected_index" >= 0) AND ("selected_index" <= 3)))
);


ALTER TABLE "public"."respostas_simulado" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."simulados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "prova_id" "uuid",
    "prova_nome" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "total_questions" integer NOT NULL,
    "correct_count" integer DEFAULT 0 NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "simulados_correct_count_check" CHECK (("correct_count" >= 0)),
    CONSTRAINT "simulados_error_count_check" CHECK (("error_count" >= 0)),
    CONSTRAINT "simulados_total_questions_check" CHECK (("total_questions" > 0))
);


ALTER TABLE "public"."simulados" OWNER TO "postgres";


ALTER TABLE ONLY "public"."amigos"
    ADD CONSTRAINT "amigos_pkey" PRIMARY KEY ("owner_id", "email");



ALTER TABLE ONLY "public"."materiais"
    ADD CONSTRAINT "materiais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_paginas"
    ADD CONSTRAINT "material_paginas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."material_paginas"
    ADD CONSTRAINT "material_paginas_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."provas"
    ADD CONSTRAINT "provas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questoes"
    ADD CONSTRAINT "questoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."questoes"
    ADD CONSTRAINT "questoes_prova_id_position_key" UNIQUE ("prova_id", "position");



ALTER TABLE ONLY "public"."respostas_simulado"
    ADD CONSTRAINT "respostas_simulado_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."respostas_simulado"
    ADD CONSTRAINT "respostas_simulado_simulado_id_position_key" UNIQUE ("simulado_id", "position");



ALTER TABLE ONLY "public"."simulados"
    ADD CONSTRAINT "simulados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."amigos"
    ADD CONSTRAINT "amigos_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."materiais"
    ADD CONSTRAINT "materiais_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."material_paginas"
    ADD CONSTRAINT "material_paginas_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materiais"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfis"
    ADD CONSTRAINT "perfis_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."provas"
    ADD CONSTRAINT "provas_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."questoes"
    ADD CONSTRAINT "questoes_prova_id_fkey" FOREIGN KEY ("prova_id") REFERENCES "public"."provas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."respostas_simulado"
    ADD CONSTRAINT "respostas_simulado_simulado_id_fkey" FOREIGN KEY ("simulado_id") REFERENCES "public"."simulados"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."simulados"
    ADD CONSTRAINT "simulados_prova_id_fkey" FOREIGN KEY ("prova_id") REFERENCES "public"."provas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."simulados"
    ADD CONSTRAINT "simulados_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "admins delete all attempts" ON "public"."simulados" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "admins manage all exams" ON "public"."provas" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admins manage all questions" ON "public"."questoes" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admins manage profiles" ON "public"."perfis" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admins read all attempt answers" ON "public"."respostas_simulado" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "admins read all attempts" ON "public"."simulados" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "admins read all exams" ON "public"."provas" FOR SELECT USING ("public"."is_admin"());



CREATE POLICY "admins read all questions" ON "public"."questoes" FOR SELECT USING ("public"."is_admin"());



ALTER TABLE "public"."amigos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete own attempts" ON "public"."simulados" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "manage own exams" ON "public"."provas" USING ((("owner_id" = "auth"."uid"()) AND (NOT "is_system"))) WITH CHECK ((("owner_id" = "auth"."uid"()) AND (NOT "is_system")));



CREATE POLICY "manage questions of own exams" ON "public"."questoes" USING ((EXISTS ( SELECT 1
   FROM "public"."provas" "p"
  WHERE (("p"."id" = "questoes"."prova_id") AND ("p"."owner_id" = "auth"."uid"()) AND (NOT "p"."is_system"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."provas" "p"
  WHERE (("p"."id" = "questoes"."prova_id") AND ("p"."owner_id" = "auth"."uid"()) AND (NOT "p"."is_system")))));



ALTER TABLE "public"."materiais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."material_paginas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfis" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."provas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."questoes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read allowed questions" ON "public"."questoes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."provas" "p"
  WHERE (("p"."id" = "questoes"."prova_id") AND ("p"."is_system" OR ("p"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "read own attempt answers" ON "public"."respostas_simulado" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."simulados" "s"
  WHERE (("s"."id" = "respostas_simulado"."simulado_id") AND ("s"."user_id" = "auth"."uid"())))));



CREATE POLICY "read own attempts" ON "public"."simulados" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "read own profile or all as admin" ON "public"."perfis" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "read public and own exams" ON "public"."provas" FOR SELECT USING (("is_system" OR ("owner_id" = "auth"."uid"())));



ALTER TABLE "public"."respostas_simulado" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."simulados" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users manage own materials" ON "public"."materiais" USING (("owner_id" = "auth"."uid"())) WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "users manage pages of own materials" ON "public"."material_paginas" USING ((EXISTS ( SELECT 1
   FROM "public"."materiais" "m"
  WHERE (("m"."id" = "material_paginas"."material_id") AND ("m"."owner_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."materiais" "m"
  WHERE (("m"."id" = "material_paginas"."material_id") AND ("m"."owner_id" = "auth"."uid"())))));



CREATE POLICY "users read own friends" ON "public"."amigos" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "write own attempt answers" ON "public"."respostas_simulado" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."simulados" "s"
  WHERE (("s"."id" = "respostas_simulado"."simulado_id") AND ("s"."user_id" = "auth"."uid"())))));



CREATE POLICY "write own attempts" ON "public"."simulados" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."admin_save_system_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_save_system_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_save_system_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_save_system_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."copy_exam_to_user"("source_exam_id" "uuid", "recipient_email_input" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."copy_exam_to_user"("source_exam_id" "uuid", "recipient_email_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."copy_exam_to_user"("source_exam_id" "uuid", "recipient_email_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."copy_exam_to_user"("source_exam_id" "uuid", "recipient_email_input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_profile_for_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_profile_for_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_profile_for_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_material_pages"("page_id_input" "uuid", "page_position_input" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_material_pages"("page_id_input" "uuid", "page_position_input" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_material_pages"("page_id_input" "uuid", "page_position_input" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_material_pages"("page_id_input" "uuid", "page_position_input" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."save_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."save_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_exam"("exam_name" "text", "payload" "jsonb", "existing_id" "uuid", "exam_emoji" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_questions"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_questions"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_questions"("payload" "jsonb") TO "service_role";


















GRANT ALL ON TABLE "public"."amigos" TO "anon";
GRANT ALL ON TABLE "public"."amigos" TO "authenticated";
GRANT ALL ON TABLE "public"."amigos" TO "service_role";



GRANT ALL ON TABLE "public"."materiais" TO "anon";
GRANT ALL ON TABLE "public"."materiais" TO "authenticated";
GRANT ALL ON TABLE "public"."materiais" TO "service_role";



GRANT ALL ON TABLE "public"."material_paginas" TO "anon";
GRANT ALL ON TABLE "public"."material_paginas" TO "authenticated";
GRANT ALL ON TABLE "public"."material_paginas" TO "service_role";



GRANT ALL ON TABLE "public"."perfis" TO "anon";
GRANT ALL ON TABLE "public"."perfis" TO "authenticated";
GRANT ALL ON TABLE "public"."perfis" TO "service_role";



GRANT ALL ON TABLE "public"."provas" TO "anon";
GRANT ALL ON TABLE "public"."provas" TO "authenticated";
GRANT ALL ON TABLE "public"."provas" TO "service_role";



GRANT ALL ON TABLE "public"."questoes" TO "anon";
GRANT ALL ON TABLE "public"."questoes" TO "authenticated";
GRANT ALL ON TABLE "public"."questoes" TO "service_role";



GRANT ALL ON TABLE "public"."respostas_simulado" TO "anon";
GRANT ALL ON TABLE "public"."respostas_simulado" TO "authenticated";
GRANT ALL ON TABLE "public"."respostas_simulado" TO "service_role";



GRANT ALL ON TABLE "public"."simulados" TO "anon";
GRANT ALL ON TABLE "public"."simulados" TO "authenticated";
GRANT ALL ON TABLE "public"."simulados" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































