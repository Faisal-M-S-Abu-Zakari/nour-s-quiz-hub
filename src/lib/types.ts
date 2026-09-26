export type Role = "student" | "teacher" | "admin";
export type Letter = "A" | "B" | "C" | "D";
export const LETTERS: Letter[] = ["A", "B", "C", "D"];
export const CLASSES = ["10A", "10B", "11A"] as const;

export interface User {
  id: string; // username, unique
  role: Role;
  nameAr: string;
  nameEn: string;
  className?: string; // students only
  subject?: string; // teachers only
  passwordHash: string;
}

export interface Question {
  id: string;
  text: string;
  options: [string, string, string, string];
  correct: Letter;
  points: number;
}

export interface Quiz {
  id: string;
  title: string;
  teacherId: string;
  className: string;
  durationMinutes: number;
  opensAt: string; // ISO UTC
  closesAt: string; // ISO UTC
  /** Fraction of the question's points deducted for a wrong answer. 0 = no negative marking. */
  negativeMarking: number;
  questions: Question[];
}

export interface Attempt {
  id: string;
  quizId: string;
  studentId: string;
  startedAt: string;
  deadline: string;
  submittedAt: string | null;
  answers: Record<string, Letter>;
  score: number | null;
  maxScore: number;
  autoSubmitted: boolean;
}

export interface DB {
  users: User[];
  quizzes: Quiz[];
  attempts: Attempt[];
}
