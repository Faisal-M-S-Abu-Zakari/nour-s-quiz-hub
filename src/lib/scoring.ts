import type { Attempt, Letter, Quiz } from "./types";

export interface QuestionResult {
  questionId: string;
  answer: Letter | null;
  correct: boolean;
  delta: number;
}

export interface ScoreResult {
  score: number;
  maxScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  perQuestion: QuestionResult[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function maxScore(quiz: Pick<Quiz, "questions">): number {
  return quiz.questions.reduce((s, q) => s + q.points, 0);
}

/**
 * Correct: +points. Wrong: -(points * negativeMarking). Unanswered: 0.
 * The total is floored at 0 so a student never ends with a negative score.
 */
export function scoreAttempt(
  quiz: Pick<Quiz, "questions" | "negativeMarking">,
  answers: Record<string, Letter | undefined>,
): ScoreResult {
  let raw = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const perQuestion: QuestionResult[] = quiz.questions.map((q) => {
    const a = answers[q.id] ?? null;
    if (!a) {
      unansweredCount++;
      return { questionId: q.id, answer: null, correct: false, delta: 0 };
    }
    if (a === q.correct) {
      correctCount++;
      raw += q.points;
      return { questionId: q.id, answer: a, correct: true, delta: q.points };
    }
    wrongCount++;
    const penalty = q.points * quiz.negativeMarking;
    raw -= penalty;
    return { questionId: q.id, answer: a, correct: false, delta: -penalty };
  });
  return {
    score: round2(Math.max(0, raw)),
    maxScore: maxScore(quiz),
    correctCount,
    wrongCount,
    unansweredCount,
    perQuestion,
  };
}

export type QuizStatus = "upcoming" | "open" | "closed";
export function quizStatus(quiz: Pick<Quiz, "opensAt" | "closesAt">, now: Date): QuizStatus {
  if (now < new Date(quiz.opensAt)) return "upcoming";
  if (now > new Date(quiz.closesAt)) return "closed";
  return "open";
}

/** Grace period for network latency on submit. */
export const SUBMIT_GRACE_MS = 30_000;

/** Deadline = start + duration, but never beyond the quiz's closing time. */
export function computeDeadline(quiz: Pick<Quiz, "durationMinutes" | "closesAt">, start: Date): Date {
  const byDuration = start.getTime() + quiz.durationMinutes * 60_000;
  return new Date(Math.min(byDuration, new Date(quiz.closesAt).getTime()));
}

export function isExpired(attempt: Pick<Attempt, "deadline">, now: Date): boolean {
  return now.getTime() > new Date(attempt.deadline).getTime() + SUBMIT_GRACE_MS;
}
