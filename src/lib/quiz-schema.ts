import { z } from "zod";

export const importedQuestionSchema = z.object({
  q: z.string().trim().min(1, "A pergunta não pode ficar vazia."),
  a: z
    .array(z.string().trim().min(1, "Todas as alternativas precisam ter texto."))
    .length(4, "Cada pergunta deve ter exatamente quatro alternativas."),
  correct: z.number().int().min(0).max(3),
  hint: z.string().trim().min(1, "A dica não pode ficar vazia."),
});

export const importedQuizSchema = z
  .array(importedQuestionSchema)
  .min(1, "O arquivo precisa conter ao menos uma pergunta.");

export type ImportedQuestion = z.infer<typeof importedQuestionSchema>;

export function parseQuizJson(content: string): ImportedQuestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("O arquivo não contém um JSON válido.");
  }
  const result = importedQuizSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    if (!issue) throw new Error("O formato do arquivo é inválido.");
    const questionNumber = typeof issue.path[0] === "number" ? issue.path[0] + 1 : null;
    const field = typeof issue.path[1] === "string" ? issue.path[1] : null;
    const location = questionNumber ? `Pergunta ${questionNumber}${field ? `, campo "${field}"` : ""}` : "Arquivo";
    const message = issue.message === "Required" && field ? "é obrigatório." : issue.message;
    throw new Error(`${location}: ${message}`);
  }
  return result.data;
}
