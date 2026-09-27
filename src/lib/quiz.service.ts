/**
 * Business rules. Pure functions over a DB object + an injected "now",
 * so they can be unit tested without HTTP, cookies or clocks.
 */
import { computeDeadline, isExpired, maxScore, quizStatus, scoreAttempt } from "./scoring";
import { CLASSES, LETTERS, type Attempt, type DB, type Letter, type Quiz, type User } from "./types";

export class RuleError extends Error {}

export function publicUser(u: User) {
  return { id: u.id, role: u.role, nameAr: u.nameAr, nameEn: u.nameEn, className: u.className, subject: u.subject };
}
export type PublicUser = ReturnType<typeof publicUser>;

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Grade any attempt whose time ran out without a submit (tab closed, phone died...). */
export function finalizeExpired(db: DB, now: Date): number {
  let n = 0;
  for (const a of db.attempts) {
    if (!a.submittedAt && isExpired(a, now)) {
      const quiz = db.quizzes.find((q) => q.id === a.quizId);
      if (!quiz) continue;
      a.score = scoreAttempt(quiz, a.answers).score;
      a.submittedAt = a.deadline;
      a.autoSubmitted = true;
      n++;
    }
  }
  return n;
}

// ---------- Student ----------

export function listStudentQuizzes(db: DB, student: User, now: Date) {
  return db.quizzes
    .filter((q) => q.className === student.className)
    .map((q) => {
      const a = db.attempts.find((x) => x.quizId === q.id && x.studentId === student.id);
      const teacher = db.users.find((u) => u.id === q.teacherId);
      return {
        id: q.id,
        title: q.title,
        teacherNameEn: teacher?.nameEn ?? q.teacherId,
        teacherNameAr: teacher?.nameAr ?? q.teacherId,
        durationMinutes: q.durationMinutes,
        opensAt: q.opensAt,
        closesAt: q.closesAt,
        questionCount: q.questions.length,
        maxScore: maxScore(q),
        negativeMarking: q.negativeMarking,
        status: quizStatus(q, now),
        attempt: a
          ? { id: a.id, submitted: !!a.submittedAt, score: a.score, maxScore: a.maxScore }
          : null,
      };
    })
    .sort((a, b) => b.opensAt.localeCompare(a.opensAt));
}

export function startAttempt(db: DB, student: User, quizId: string, now: Date): Attempt {
  const quiz = db.quizzes.find((q) => q.id === quizId);
  if (!quiz || quiz.className !== student.className) throw new RuleError("Quiz not found.");
  const existing = db.attempts.find((a) => a.quizId === quizId && a.studentId === student.id);
  if (existing) {
    if (!existing.submittedAt && isExpired(existing, now)) finalizeExpired(db, now);
    if (existing.submittedAt) throw new RuleError("You have already taken this quiz.");
    return existing; // resume after refresh / reconnect — the clock keeps running
  }
  const status = quizStatus(quiz, now);
  if (status === "upcoming") throw new RuleError("This quiz is not open yet.");
  if (status === "closed") throw new RuleError("This quiz is closed.");
  if (!quiz.questions.length) throw new RuleError("This quiz has no questions.");
  const attempt: Attempt = {
    id: newId("att"),
    quizId,
    studentId: student.id,
    startedAt: now.toISOString(),
    deadline: computeDeadline(quiz, now).toISOString(),
    submittedAt: null,
    answers: {},
    score: null,
    maxScore: maxScore(quiz),
    autoSubmitted: false,
  };
  db.attempts.push(attempt);
  return attempt;
}

function ownAttempt(db: DB, student: User, attemptId: string) {
  const a = db.attempts.find((x) => x.id === attemptId && x.studentId === student.id);
  if (!a) throw new RuleError("Attempt not found.");
  const quiz = db.quizzes.find((q) => q.id === a.quizId)!;
  return { a, quiz };
}

export function saveAnswer(db: DB, student: User, attemptId: string, questionId: string, answer: Letter | null, now: Date) {
  const { a, quiz } = ownAttempt(db, student, attemptId);
  if (a.submittedAt) throw new RuleError("This quiz has already been submitted.");
  if (isExpired(a, now)) {
    finalizeExpired(db, now);
    throw new RuleError("Time is up.");
  }
  if (!quiz.questions.some((q) => q.id === questionId)) throw new RuleError("Unknown question.");
  if (answer === null) delete a.answers[questionId];
  else if (LETTERS.includes(answer)) a.answers[questionId] = answer;
  else throw new RuleError("Invalid answer.");
}

export function submitAttempt(db: DB, student: User, attemptId: string, answers: Record<string, Letter>, now: Date) {
  const { a, quiz } = ownAttempt(db, student, attemptId);
  if (a.submittedAt) return a; // idempotent: double-tap or auto+manual submit
  if (isExpired(a, now)) {
    // Too late to accept new answers; grade what was saved during the quiz.
    finalizeExpired(db, now);
    return a;
  }
  const valid = new Set(quiz.questions.map((q) => q.id));
  for (const [qid, ans] of Object.entries(answers)) {
    if (valid.has(qid) && LETTERS.includes(ans)) a.answers[qid] = ans;
  }
  a.score = scoreAttempt(quiz, a.answers).score;
  a.submittedAt = now.toISOString();
  a.autoSubmitted = now.getTime() >= new Date(a.deadline).getTime();
  return a;
}

/** What a student sees. Correct answers are only revealed after the quiz window closes,
 *  so early finishers can't pass answers to classmates who haven't taken it yet. */
export function attemptView(db: DB, student: User, attemptId: string, now: Date) {
  const { a, quiz } = ownAttempt(db, student, attemptId);
  const submitted = !!a.submittedAt;
  const reveal = submitted && quizStatus(quiz, now) === "closed";
  const result = submitted ? scoreAttempt(quiz, a.answers) : null;
  return {
    attemptId: a.id,
    quiz: { id: quiz.id, title: quiz.title, negativeMarking: quiz.negativeMarking, durationMinutes: quiz.durationMinutes, closesAt: quiz.closesAt },
    deadline: a.deadline,
    serverNow: now.toISOString(),
    submitted,
    autoSubmitted: a.autoSubmitted,
    score: a.score,
    maxScore: a.maxScore,
    summary: result ? { correct: result.correctCount, wrong: result.wrongCount, unanswered: result.unansweredCount } : null,
    reveal,
    answers: a.answers,
    questions: quiz.questions.map((q, i) => ({
      id: q.id,
      number: i + 1,
      text: q.text,
      options: q.options,
      points: q.points,
      correct: reveal ? q.correct : null,
    })),
  };
}

// ---------- Teacher ----------

export function listTeacherQuizzes(db: DB, viewer: User, now: Date) {
  return db.quizzes
    .filter((q) => viewer.role === "admin" || q.teacherId === viewer.id)
    .map((q) => {
      const atts = db.attempts.filter((a) => a.quizId === q.id && a.submittedAt);
      const avg = atts.length ? atts.reduce((s, a) => s + (a.score ?? 0), 0) / atts.length : null;
      const teacher = db.users.find((u) => u.id === q.teacherId);
      return {
        id: q.id,
        title: q.title,
        className: q.className,
        teacherNameEn: teacher?.nameEn ?? q.teacherId,
        opensAt: q.opensAt,
        closesAt: q.closesAt,
        durationMinutes: q.durationMinutes,
        negativeMarking: q.negativeMarking,
        questionCount: q.questions.length,
        maxScore: maxScore(q),
        status: quizStatus(q, now),
        submissions: atts.length,
        classSize: db.users.filter((u) => u.role === "student" && u.className === q.className).length,
        averagePct: avg === null || !maxScore(q) ? null : Math.round((avg / maxScore(q)) * 100),
      };
    })
    .sort((a, b) => b.opensAt.localeCompare(a.opensAt));
}

export function canView(viewer: User, quiz: Quiz) {
  return viewer.role === "admin" || quiz.teacherId === viewer.id;
}

export function getQuizForEdit(db: DB, viewer: User, quizId: string) {
  const quiz = db.quizzes.find((q) => q.id === quizId);
  if (!quiz || !canView(viewer, quiz)) throw new RuleError("Quiz not found.");
  return { quiz, hasAttempts: db.attempts.some((a) => a.quizId === quizId) };
}

export interface QuizInput {
  id?: string | undefined;
  title: string;
  className: string;
  durationMinutes: number;
  opensAt: string;
  closesAt: string;
  negativeMarking: number;
  questions: { id?: string | undefined; text: string; options: [string, string, string, string]; correct: Letter; points: number }[];
}

/** Classes come from the student roster, so imported classes appear automatically. */
export function classesOf(db: DB): string[] {
  const set = new Set<string>(db.users.filter((u) => u.role === "student" && u.className).map((u) => u.className!));
  return set.size ? [...set].sort() : [...CLASSES];
}

export function validateQuizInput(input: QuizInput, classes: readonly string[] = CLASSES): string[] {
  const errs: string[] = [];
  if (!input.title.trim()) errs.push("Title is required.");
  if (!classes.includes(input.className)) errs.push("Choose a class.");
  if (!(input.durationMinutes >= 1 && input.durationMinutes <= 180)) errs.push("Duration must be 1–180 minutes.");
  const o = new Date(input.opensAt), c = new Date(input.closesAt);
  if (isNaN(o.getTime()) || isNaN(c.getTime())) errs.push("Opening and closing times are required.");
  else if (c <= o) errs.push("Closing time must be after opening time.");
  if (!(input.negativeMarking >= 0 && input.negativeMarking <= 1)) errs.push("Negative marking must be between 0 and 1.");
  if (!input.questions.length) errs.push("Add at least one question.");
  input.questions.forEach((q, i) => {
    if (!q.text.trim()) errs.push(`Question ${i + 1}: text is required.`);
    if (q.options.some((x) => !x.trim())) errs.push(`Question ${i + 1}: all four options are required.`);
    if (!LETTERS.includes(q.correct)) errs.push(`Question ${i + 1}: choose the correct answer.`);
    if (!(q.points > 0 && q.points <= 100)) errs.push(`Question ${i + 1}: points must be between 0 and 100.`);
  });
  return errs;
}

export function saveQuiz(db: DB, viewer: User, input: QuizInput): Quiz {
  const errs = validateQuizInput(input, classesOf(db));
  if (errs.length) throw new RuleError(errs.join(" "));
  const existing = input.id ? db.quizzes.find((q) => q.id === input.id) : undefined;
  if (input.id && (!existing || !canView(viewer, existing))) throw new RuleError("Quiz not found.");
  const questions = input.questions.map((q) => ({
    id: q.id && existing?.questions.some((x) => x.id === q.id) ? q.id : newId("q"),
    text: q.text.trim(),
    options: q.options.map((x) => x.trim()) as [string, string, string, string],
    correct: q.correct,
    points: Math.round(q.points * 100) / 100,
  }));
  if (existing) {
    const locked = db.attempts.some((a) => a.quizId === existing.id);
    if (locked) {
      // Students already sat it: changing questions/marking/class would make scores unfair.
      const changedContent =
        JSON.stringify(existing.questions.map(({ text, options, correct, points }) => ({ text, options, correct, points }))) !==
          JSON.stringify(questions.map(({ text, options, correct, points }) => ({ text, options, correct, points }))) ||
        existing.negativeMarking !== input.negativeMarking ||
        existing.className !== input.className ||
        existing.durationMinutes !== input.durationMinutes;
      if (changedContent)
        throw new RuleError("Students have already taken this quiz. Only the title and dates can be changed.");
    }
    Object.assign(existing, {
      title: input.title.trim(),
      className: input.className,
      durationMinutes: input.durationMinutes,
      opensAt: new Date(input.opensAt).toISOString(),
      closesAt: new Date(input.closesAt).toISOString(),
      negativeMarking: input.negativeMarking,
      questions: locked ? existing.questions : questions,
    });
    return existing;
  }
  const quiz: Quiz = {
    id: newId("quiz"),
    title: input.title.trim(),
    teacherId: viewer.role === "teacher" ? viewer.id : viewer.id,
    className: input.className,
    durationMinutes: input.durationMinutes,
    opensAt: new Date(input.opensAt).toISOString(),
    closesAt: new Date(input.closesAt).toISOString(),
    negativeMarking: input.negativeMarking,
    questions,
  };
  db.quizzes.push(quiz);
  return quiz;
}

export function deleteQuiz(db: DB, viewer: User, quizId: string) {
  const { hasAttempts } = getQuizForEdit(db, viewer, quizId);
  if (hasAttempts) throw new RuleError("This quiz has submissions and cannot be deleted.");
  db.quizzes = db.quizzes.filter((q) => q.id !== quizId);
}

// ---------- Results ----------

export function quizResults(db: DB, viewer: User, quizId: string) {
  const { quiz } = getQuizForEdit(db, viewer, quizId);
  const max = maxScore(quiz);
  const students = db.users.filter((u) => u.role === "student" && u.className === quiz.className);
  const rows = students.map((s) => {
    const a = db.attempts.find((x) => x.quizId === quiz.id && x.studentId === s.id);
    const r = a?.submittedAt ? scoreAttempt(quiz, a.answers) : null;
    return {
      studentId: s.id,
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      status: !a ? "not_started" : a.submittedAt ? "submitted" : "in_progress",
      score: a?.score ?? null,
      pct: a?.score != null && max ? Math.round((a.score / max) * 100) : null,
      correct: r?.correctCount ?? null,
      wrong: r?.wrongCount ?? null,
      unanswered: r?.unansweredCount ?? null,
      submittedAt: a?.submittedAt ?? null,
      autoSubmitted: a?.autoSubmitted ?? false,
    };
  });
  const done = db.attempts.filter((a) => a.quizId === quiz.id && a.submittedAt);
  const breakdown = quiz.questions.map((q, i) => {
    const counts = { A: 0, B: 0, C: 0, D: 0 } as Record<Letter, number>;
    let blank = 0;
    for (const a of done) {
      const ans = a.answers[q.id];
      if (ans) counts[ans]++;
      else blank++;
    }
    return {
      number: i + 1,
      text: q.text,
      correct: q.correct,
      points: q.points,
      counts,
      blank,
      pctCorrect: done.length ? Math.round((counts[q.correct] / done.length) * 100) : null,
    };
  });
  const scores = done.map((a) => a.score ?? 0);
  return {
    quiz: { id: quiz.id, title: quiz.title, className: quiz.className, negativeMarking: quiz.negativeMarking, maxScore: max, opensAt: quiz.opensAt, closesAt: quiz.closesAt },
    rows: rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    breakdown,
    stats: {
      submitted: done.length,
      classSize: students.length,
      averagePct: scores.length && max ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length / max) * 100) : null,
      highest: scores.length ? Math.max(...scores) : null,
      lowest: scores.length ? Math.min(...scores) : null,
    },
  };
}

export function adminOverview(db: DB, now: Date) {
  const classes = classesOf(db).map((c) => {
    const quizzes = db.quizzes.filter((q) => q.className === c);
    const students = db.users.filter((u) => u.role === "student" && u.className === c);
    const pcts: number[] = [];
    for (const q of quizzes) {
      const max = maxScore(q);
      for (const a of db.attempts.filter((x) => x.quizId === q.id && x.submittedAt))
        if (max) pcts.push(((a.score ?? 0) / max) * 100);
    }
    const possible = quizzes.filter((q) => quizStatus(q, now) !== "upcoming").length * students.length;
    const submitted = db.attempts.filter((a) => a.submittedAt && quizzes.some((q) => q.id === a.quizId)).length;
    return {
      className: c,
      students: students.length,
      quizzes: quizzes.length,
      averagePct: pcts.length ? Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length) : null,
      participationPct: possible ? Math.round((submitted / possible) * 100) : null,
    };
  });
  const studentRows = db.users
    .filter((u) => u.role === "student")
    .map((s) => {
      const quizzes = db.quizzes.filter((q) => q.className === s.className);
      const pcts: number[] = [];
      for (const q of quizzes) {
        const a = db.attempts.find((x) => x.quizId === q.id && x.studentId === s.id && x.submittedAt);
        if (a && maxScore(q)) pcts.push(((a.score ?? 0) / maxScore(q)) * 100);
      }
      return {
        id: s.id,
        nameEn: s.nameEn,
        nameAr: s.nameAr,
        className: s.className!,
        taken: pcts.length,
        averagePct: pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) : null,
      };
    });
  return { classes, students: studentRows, teachers: db.users.filter((u) => u.role === "teacher").length };
}

/** Data needed to explain a mistake. Only after answers are revealed, and only for the student's own wrong answer. */
export function mistakeForExplanation(db: DB, student: User, attemptId: string, questionId: string, now: Date) {
  const { a, quiz } = ownAttempt(db, student, attemptId);
  if (!a.submittedAt || quizStatus(quiz, now) !== "closed") throw new RuleError("Explanations are available after the quiz closes.");
  const q = quiz.questions.find((x) => x.id === questionId);
  if (!q) throw new RuleError("Unknown question.");
  const selected = a.answers[q.id];
  if (!selected || selected === q.correct) throw new RuleError("Explanations are only for questions you answered incorrectly.");
  const i = (l: Letter) => LETTERS.indexOf(l);
  return {
    question: q.text,
    options: q.options,
    selected: `${selected}. ${q.options[i(selected)]}`,
    correct: `${q.correct}. ${q.options[i(q.correct)]}`,
  };
}
