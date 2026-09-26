import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { buildSeed, DEFAULT_CSVS } from "./seed";
import { parseCsv, ammanLocalToIso } from "./csv";
import { scoreAttempt, computeDeadline, SUBMIT_GRACE_MS } from "./scoring";
import * as svc from "./quiz.service";
import type { DB, Quiz } from "./types";

const hash = async (u: string, p: string) => createHash("sha256").update(u + p).digest("hex");
const baseQuiz = (neg = 0): Quiz => ({
  id: "t",
  title: "T",
  teacherId: "t.khaled",
  className: "10A",
  durationMinutes: 20,
  opensAt: "2026-01-01T00:00:00.000Z",
  closesAt: "2026-12-31T00:00:00.000Z",
  negativeMarking: neg,
  questions: [
    { id: "1", text: "a", options: ["1", "2", "3", "4"], correct: "A", points: 2 },
    { id: "2", text: "b", options: ["1", "2", "3", "4"], correct: "B", points: 3 },
    { id: "3", text: "c", options: ["1", "2", "3", "4"], correct: "C", points: 1 },
  ],
});

describe("scoring", () => {
  it("sums per-question points without negative marking", () => {
    const r = scoreAttempt(baseQuiz(0), { "1": "A", "2": "A" });
    expect(r).toMatchObject({ score: 2, maxScore: 6, correctCount: 1, wrongCount: 1, unansweredCount: 1 });
  });
  it("deducts a fraction of the question's points for wrong answers", () => {
    expect(scoreAttempt(baseQuiz(0.25), { "1": "A", "2": "A" }).score).toBe(1.25);
    expect(scoreAttempt(baseQuiz(1), { "1": "A", "2": "A", "3": "C" }).score).toBe(0);
  });
  it("never deducts for unanswered questions", () => {
    expect(scoreAttempt(baseQuiz(1), {}).score).toBe(0);
  });
  it("floors the total at zero", () => {
    expect(scoreAttempt(baseQuiz(1), { "1": "B", "2": "A" }).score).toBe(0);
  });
  it("caps the deadline at the closing time", () => {
    const q = { durationMinutes: 20, closesAt: "2026-05-01T10:05:00.000Z" };
    expect(computeDeadline(q, new Date("2026-05-01T10:00:00Z")).toISOString()).toBe(q.closesAt);
  });
});

describe("csv", () => {
  it("parses quotes, commas and Arabic text", () => {
    const rows = parseCsv('\uFEFFa,b\n"x, y","قال ""مرحبا"""\n');
    expect(rows).toEqual([{ a: "x, y", b: 'قال "مرحبا"' }]);
  });
  it("treats seed times as Amman time (UTC+3)", () => {
    expect(ammanLocalToIso("2026-09-20T08:00")).toBe("2026-09-20T05:00:00.000Z");
  });
});

describe("seed data", async () => {
  const db = await buildSeed(hash, DEFAULT_CSVS);
  it("has 60 students in three classes and 4 teachers", () => {
    const s = db.users.filter((u) => u.role === "student");
    expect(s).toHaveLength(60);
    for (const c of ["10A", "10B", "11A"]) expect(s.filter((u) => u.className === c)).toHaveLength(20);
    expect(db.users.filter((u) => u.role === "teacher")).toHaveLength(4);
  });
  it("every quiz has 15 questions with 4 options", () => {
    for (const q of db.quizzes) {
      expect(q.questions).toHaveLength(15);
      for (const x of q.questions) expect(x.options.every(Boolean)).toBe(true);
    }
  });
});

describe("attempt rules", () => {
  const setup = async (): Promise<DB> => {
    const db = await buildSeed(hash, DEFAULT_CSVS);
    db.attempts = [];
    db.quizzes = [baseQuiz(0.25)];
    return db;
  };
  const now = new Date("2026-06-01T10:00:00Z");

  it("prevents taking a quiz twice", async () => {
    const db = await setup();
    const me = db.users.find((u) => u.id === "s10a01")!;
    const a = svc.startAttempt(db, me, "t", now);
    svc.submitAttempt(db, me, a.id, { "1": "A" }, new Date(now.getTime() + 60_000));
    expect(() => svc.startAttempt(db, me, "t", now)).toThrow(/already taken/);
    expect(db.attempts).toHaveLength(1);
  });

  it("resumes an in-progress attempt instead of restarting the clock", async () => {
    const db = await setup();
    const me = db.users.find((u) => u.id === "s10a01")!;
    const a1 = svc.startAttempt(db, me, "t", now);
    const a2 = svc.startAttempt(db, me, "t", new Date(now.getTime() + 5 * 60_000));
    expect(a2.id).toBe(a1.id);
    expect(a2.deadline).toBe(a1.deadline);
  });

  it("blocks students from other classes and closed/upcoming quizzes", async () => {
    const db = await setup();
    const other = db.users.find((u) => u.id === "s10b01")!;
    const me = db.users.find((u) => u.id === "s10a01")!;
    expect(() => svc.startAttempt(db, other, "t", now)).toThrow(/not found/);
    expect(() => svc.startAttempt(db, me, "t", new Date("2027-01-02"))).toThrow(/closed/);
    expect(() => svc.startAttempt(db, me, "t", new Date("2025-01-02"))).toThrow(/not open/);
  });

  it("ignores late submissions and grades saved answers after the deadline", async () => {
    const db = await setup();
    const me = db.users.find((u) => u.id === "s10a01")!;
    const a = svc.startAttempt(db, me, "t", now);
    svc.saveAnswer(db, me, a.id, "1", "A", new Date(now.getTime() + 60_000));
    const late = new Date(now.getTime() + 20 * 60_000 + SUBMIT_GRACE_MS + 1000);
    svc.submitAttempt(db, me, a.id, { "1": "A", "2": "B", "3": "C" }, late);
    expect(a.score).toBe(2);
    expect(a.autoSubmitted).toBe(true);
    expect(() => svc.saveAnswer(db, me, a.id, "2", "B", late)).toThrow();
  });

  it("finalizes abandoned attempts", async () => {
    const db = await setup();
    const me = db.users.find((u) => u.id === "s10a01")!;
    const a = svc.startAttempt(db, me, "t", now);
    svc.saveAnswer(db, me, a.id, "2", "B", now);
    svc.finalizeExpired(db, new Date(now.getTime() + 25 * 60_000));
    expect(a.submittedAt).not.toBeNull();
    expect(a.score).toBe(3);
  });

  it("does not let a student read another student's attempt", async () => {
    const db = await setup();
    const me = db.users.find((u) => u.id === "s10a01")!;
    const other = db.users.find((u) => u.id === "s10a02")!;
    const a = svc.startAttempt(db, me, "t", now);
    expect(() => svc.attemptView(db, other, a.id, now)).toThrow(/not found/);
  });

  it("hides correct answers until the quiz closes", async () => {
    const db = await setup();
    const me = db.users.find((u) => u.id === "s10a01")!;
    const a = svc.startAttempt(db, me, "t", now);
    svc.submitAttempt(db, me, a.id, {}, now);
    expect(svc.attemptView(db, me, a.id, now).questions[0].correct).toBeNull();
    expect(svc.attemptView(db, me, a.id, new Date("2027-01-01")).questions[0].correct).toBe("A");
  });

  it("locks quiz content once students have attempted it", async () => {
    const db = await setup();
    const me = db.users.find((u) => u.id === "s10a01")!;
    const teacher = db.users.find((u) => u.id === "t.khaled")!;
    svc.startAttempt(db, me, "t", now);
    const q = baseQuiz(0.25);
    expect(() => svc.saveQuiz(db, teacher, { ...q, negativeMarking: 1 })).toThrow(/already taken/);
    expect(svc.saveQuiz(db, teacher, { ...q, title: "Renamed" }).title).toBe("Renamed");
  });

  it("stops teachers editing other teachers' quizzes", async () => {
    const db = await setup();
    const rania = db.users.find((u) => u.id === "t.rania")!;
    expect(() => svc.getQuizForEdit(db, rania, "t")).toThrow(/not found/);
  });
});
