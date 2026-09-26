import studentsCsv from "../../seed/students.csv?raw";
import teachersCsv from "../../seed/teachers.csv?raw";
import quizzesCsv from "../../seed/quizzes.csv?raw";
import questionsCsv from "../../seed/questions.csv?raw";
import { ammanLocalToIso, parseCsv } from "./csv";
import { computeDeadline, maxScore, scoreAttempt } from "./scoring";
import { LETTERS, type Attempt, type DB, type Letter, type Quiz, type User } from "./types";

export type HashFn = (username: string, password: string) => Promise<string>;

export interface SeedCsvs {
  students: string;
  teachers: string;
  quizzes: string;
  questions: string;
}

export const DEFAULT_CSVS: SeedCsvs = {
  students: studentsCsv,
  teachers: teachersCsv,
  quizzes: quizzesCsv,
  questions: questionsCsv,
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildQuizzes(quizzesText: string, questionsText: string): Quiz[] {
  const questions = parseCsv(questionsText);
  return parseCsv(quizzesText).map((r) => {
    const qs = questions
      .filter((q) => q.quiz_id === r.quiz_id)
      .sort((a, b) => Number(a.number) - Number(b.number))
      .map((q) => {
        const correct = q.correct.toUpperCase() as Letter;
        if (!LETTERS.includes(correct)) throw new Error(`Bad correct answer in ${r.quiz_id} #${q.number}`);
        return {
          id: `${r.quiz_id}-${q.number}`,
          text: q.text,
          options: [q.option_a, q.option_b, q.option_c, q.option_d] as [string, string, string, string],
          correct,
          points: Number(q.points) || 1,
        };
      });
    return {
      id: r.quiz_id,
      title: r.title,
      teacherId: r.teacher,
      className: r.class,
      durationMinutes: Number(r.duration_minutes) || 20,
      opensAt: ammanLocalToIso(r.opens_at),
      closesAt: ammanLocalToIso(r.closes_at),
      negativeMarking: Number(r.negative_marking) || 0,
      questions: qs,
    };
  });
}

export async function buildSeed(hash: HashFn, csvs: SeedCsvs = DEFAULT_CSVS): Promise<DB> {
  const users: User[] = [];
  for (const r of parseCsv(csvs.students)) {
    users.push({
      id: r.username.toLowerCase(),
      role: "student",
      nameAr: r.name_ar,
      nameEn: r.name_en,
      className: r.class,
      passwordHash: await hash(r.username.toLowerCase(), r.password),
    });
  }
  for (const r of parseCsv(csvs.teachers)) {
    users.push({
      id: r.username.toLowerCase(),
      role: r.role === "admin" ? "admin" : "teacher",
      nameAr: r.name_ar,
      nameEn: r.name_en,
      subject: r.subject,
      passwordHash: await hash(r.username.toLowerCase(), r.password),
    });
  }
  const quizzes = buildQuizzes(csvs.quizzes, csvs.questions);

  // Historical results for already-closed quizzes so the dashboard has data.
  const rand = mulberry32(42);
  const attempts: Attempt[] = [];
  const now = Date.now();
  for (const quiz of quizzes.filter((q) => new Date(q.closesAt).getTime() < now)) {
    const students = users.filter((u) => u.role === "student" && u.className === quiz.className);
    for (const s of students) {
      if (rand() < 0.1) continue; // some students were absent
      const skill = 0.45 + rand() * 0.5;
      const answers: Record<string, Letter> = {};
      for (const q of quiz.questions) {
        const r = rand();
        if (r < 0.06) continue;
        answers[q.id] = r < skill ? q.correct : LETTERS[Math.floor(rand() * 4)]!;
      }
      const start = new Date(new Date(quiz.opensAt).getTime() + Math.floor(rand() * 3) * 86400_000 + 9 * 3600_000);
      const res = scoreAttempt(quiz, answers);
      attempts.push({
        id: `seed-${quiz.id}-${s.id}`,
        quizId: quiz.id,
        studentId: s.id,
        startedAt: start.toISOString(),
        deadline: computeDeadline(quiz, start).toISOString(),
        submittedAt: new Date(start.getTime() + (8 + rand() * 11) * 60_000).toISOString(),
        answers,
        score: res.score,
        maxScore: maxScore(quiz),
        autoSubmitted: false,
      });
    }
  }
  return { users, quizzes, attempts };
}
