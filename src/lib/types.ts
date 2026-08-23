import type { ImportedQuestion } from "./quiz-schema";

export type Exam = { id: string; name: string; created_at: string; owner_id: string | null; is_system: boolean; questions?: QuizQuestion[] };
export type QuizQuestion = ImportedQuestion & { id: string; position: number };
export type Attempt = { id: string; exam_id: string; exam_name: string; started_at: string; completed_at: string; total_questions: number; correct_count: number; error_count: number };
export type AttemptAnswer = { id: string; position: number; question_text: string; options: string[]; correct_index: number; selected_index: number; is_correct: boolean; hint: string };
