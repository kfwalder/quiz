import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente antes do seed.");

const source = await readFile(new URL("../src/data/quiz-geografia.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function("module", "exports", js)(module, module.exports);
const questions = module.exports.quizData;
const db = createClient(url, key, { auth: { persistSession: false } });
const { data: existing, error: lookupError } = await db.from("provas").select("id").eq("name", "Prova de Geografia").eq("is_system", true).maybeSingle();
if (lookupError) throw lookupError;
let examId = existing?.id;
if (!examId) {
  const { data, error } = await db.from("provas").insert({ name: "Prova de Geografia", is_system: true }).select("id").single();
  if (error) throw error;
  examId = data.id;
} else {
  const { error } = await db.from("questoes").delete().eq("prova_id", examId);
  if (error) throw error;
}
const { error } = await db.from("questoes").insert(questions.map((q, position) => ({ prova_id: examId, position, pergunta: q.q, alternativas: q.a, resposta_correta: q.correct, dica: q.hint })));
if (error) throw error;
console.log(`Prova de Geografia cadastrada com ${questions.length} questões.`);
