import { describe, expect, it } from "vitest";
import { parseQuizJson } from "./quiz-schema";

const valid = JSON.stringify([{ q: "Pergunta", a: ["A", "B", "C", "D"], correct: 0, hint: "Dica" }]);

describe("parseQuizJson", () => {
  it("aceita o formato de importação", () => expect(parseQuizJson(valid)).toHaveLength(1));
  it("rejeita JSON inválido", () => expect(() => parseQuizJson("{")).toThrow("JSON válido"));
  it("identifica o campo obrigatório ausente", () =>
    expect(() => parseQuizJson("[{}]")).toThrow('Pergunta 1, campo "q": é obrigatório.'));
  it("rejeita número diferente de quatro alternativas", () => expect(() => parseQuizJson(JSON.stringify([{ q: "P", a: ["A"], correct: 0, hint: "D" }]))).toThrow("quatro"));
  it("rejeita índice de resposta inválido", () => expect(() => parseQuizJson(JSON.stringify([{ q: "P", a: ["A", "B", "C", "D"], correct: 4, hint: "D" }]))).toThrow());
});
