export type AdminAttempt = {
  user_id: string;
  prova_id: string | null;
  prova_nome: string;
  completed_at: string;
  correct_count: number;
  total_questions: number;
  error_count: number;
};

export function getAttemptsForUser(attempts: AdminAttempt[], userId: string) {
  return attempts
    .filter((attempt) => attempt.user_id === userId)
    .sort((first, second) => {
      return new Date(second.completed_at).getTime() - new Date(first.completed_at).getTime();
    });
}

export function getAttemptPercentage(attempt: Pick<AdminAttempt, "correct_count" | "total_questions">) {
  return Math.round((attempt.correct_count / attempt.total_questions) * 100);
}
