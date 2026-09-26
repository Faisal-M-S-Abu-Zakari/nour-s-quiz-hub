import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const letter = z.enum(["A", "B", "C", "D"]);

async function ctx() {
  const [{ getDb, mutate }, auth, svc] = await Promise.all([
    import("./db.server"),
    import("./auth.server"),
    import("./quiz.service"),
  ]);
  return { getDb, mutate, auth, svc };
}

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const { auth, svc } = await ctx();
  const u = await auth.currentUser();
  return u ? svc.publicUser(u) : null;
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(128) }).parse(d))
  .handler(async ({ data }) => {
    const { getDb, auth, svc } = await ctx();
    const { hashPassword } = await import("./db.server");
    const db = await getDb();
    const username = data.username.toLowerCase();
    const u = db.users.find((x) => x.id === username);
    const hash = await hashPassword(username, data.password);
    if (!u || u.passwordHash !== hash) return { ok: false as const, error: "invalid" };
    auth.startSession(u.id);
    return { ok: true as const, user: svc.publicUser(u) };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { auth } = await ctx();
  auth.endSession();
  return { ok: true };
});

// ---- Student ----

export const studentQuizzes = createServerFn({ method: "GET" }).handler(async () => {
  const { auth, mutate, svc } = await ctx();
  const me = await auth.requireRole("student");
  return mutate((db) => {
    svc.finalizeExpired(db, new Date());
    return svc.listStudentQuizzes(db, me, new Date());
  });
});

export const startQuiz = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ quizId: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { auth, mutate, svc } = await ctx();
    const me = await auth.requireRole("student");
    return mutate((db) => {
      const a = svc.startAttempt(db, me, data.quizId, new Date());
      return { attemptId: a.id };
    });
  });

export const getAttempt = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ attemptId: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { auth, mutate, svc } = await ctx();
    const me = await auth.requireRole("student");
    return mutate((db) => {
      svc.finalizeExpired(db, new Date());
      return svc.attemptView(db, me, data.attemptId, new Date());
    });
  });

export const saveAnswer = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ attemptId: z.string().max(80), questionId: z.string().max(80), answer: letter.nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { auth, mutate, svc } = await ctx();
    const me = await auth.requireRole("student");
    return mutate((db) => {
      svc.saveAnswer(db, me, data.attemptId, data.questionId, data.answer, new Date());
      return { ok: true };
    });
  });

export const submitQuiz = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ attemptId: z.string().max(80), answers: z.record(z.string(), letter) }).parse(d))
  .handler(async ({ data }) => {
    const { auth, mutate, svc } = await ctx();
    const me = await auth.requireRole("student");
    return mutate((db) => {
      svc.submitAttempt(db, me, data.attemptId, data.answers, new Date());
      return svc.attemptView(db, me, data.attemptId, new Date());
    });
  });

// ---- Teacher / Admin ----

export const teacherQuizzes = createServerFn({ method: "GET" }).handler(async () => {
  const { auth, mutate, svc } = await ctx();
  const me = await auth.requireRole("teacher", "admin");
  return mutate((db) => {
    svc.finalizeExpired(db, new Date());
    return svc.listTeacherQuizzes(db, me, new Date());
  });
});

export const getQuizForEdit = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ quizId: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { auth, getDb, svc } = await ctx();
    const me = await auth.requireRole("teacher", "admin");
    return svc.getQuizForEdit(await getDb(), me, data.quizId);
  });

const quizInput = z.object({
  id: z.string().max(80).optional(),
  title: z.string().max(200),
  className: z.string().max(10),
  durationMinutes: z.number().int(),
  opensAt: z.string().max(40),
  closesAt: z.string().max(40),
  negativeMarking: z.number(),
  questions: z
    .array(
      z.object({
        id: z.string().max(80).optional(),
        text: z.string().max(2000),
        options: z.tuple([z.string().max(500), z.string().max(500), z.string().max(500), z.string().max(500)]),
        correct: letter,
        points: z.number(),
      }),
    )
    .max(200),
});

export const saveQuiz = createServerFn({ method: "POST" })
  .inputValidator((d) => quizInput.parse(d))
  .handler(async ({ data }) => {
    const { auth, mutate, svc } = await ctx();
    const me = await auth.requireRole("teacher", "admin");
    try {
      return await mutate((db) => ({ ok: true as const, id: svc.saveQuiz(db, me, data).id }));
    } catch (e) {
      if (e instanceof svc.RuleError) return { ok: false as const, error: e.message };
      throw e;
    }
  });

export const deleteQuiz = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ quizId: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { auth, mutate, svc } = await ctx();
    const me = await auth.requireRole("teacher", "admin");
    return mutate((db) => {
      svc.deleteQuiz(db, me, data.quizId);
      return { ok: true };
    });
  });

export const quizResults = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ quizId: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { auth, mutate, svc } = await ctx();
    const me = await auth.requireRole("teacher", "admin");
    return mutate((db) => {
      svc.finalizeExpired(db, new Date());
      return svc.quizResults(db, me, data.quizId);
    });
  });

export const adminOverview = createServerFn({ method: "GET" }).handler(async () => {
  const { auth, mutate, svc } = await ctx();
  await auth.requireRole("admin");
  return mutate((db) => {
    svc.finalizeExpired(db, new Date());
    return svc.adminOverview(db, new Date());
  });
});

export const resetDemoData = createServerFn({ method: "POST" }).handler(async () => {
  const { auth } = await ctx();
  await auth.requireRole("admin");
  const { resetDb } = await import("./db.server");
  await resetDb();
  return { ok: true };
});
