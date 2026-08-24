import { describe, expect, it } from "vitest";
import { getAttemptPercentage, getAttemptsForUser, type AdminAttempt } from "./admin-attempts";

const attempts: AdminAttempt[] = [
  {
    user_id: "user-1",
    prova_id: "exam-1",
    prova_nome: "Prova A",
    completed_at: "2026-08-20T10:00:00.000Z",
    correct_count: 8,
    total_questions: 10,
    error_count: 2,
  },
  {
    user_id: "user-2",
    prova_id: "exam-2",
    prova_nome: "Prova B",
    completed_at: "2026-08-22T10:00:00.000Z",
    correct_count: 5,
    total_questions: 10,
    error_count: 5,
  },
  {
    user_id: "user-1",
    prova_id: "exam-3",
    prova_nome: "Prova C",
    completed_at: "2026-08-23T10:00:00.000Z",
    correct_count: 7,
    total_questions: 8,
    error_count: 1,
  },
];

describe("admin attempt helpers", () => {
  it("lista apenas os simulados do usuário em ordem decrescente", () => {
    expect(getAttemptsForUser(attempts, "user-1").map((attempt) => attempt.prova_nome)).toEqual([
      "Prova C",
      "Prova A",
    ]);
  });

  it("retorna lista vazia para usuário sem simulados", () => {
    expect(getAttemptsForUser(attempts, "user-3")).toEqual([]);
  });

  it("calcula o percentual arredondado corretamente", () => {
    expect(getAttemptPercentage(attempts[2])).toBe(88);
  });
});
