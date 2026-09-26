import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { teacherQuizzes } from "@/lib/api.functions";
import { useFormat, useI18n } from "@/lib/i18n";
import { AppShell, guard, StatusBadge } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const teacherQuizzesQuery = queryOptions({ queryKey: ["teacher-quizzes"], queryFn: () => teacherQuizzes() });

export const Route = createFileRoute("/teacher/")({
  head: () => ({ meta: [{ title: "Teacher portal — Thursday Quizzes" }, { name: "description", content: "Create quizzes and review results." }, { property: "og:title", content: "Teacher portal" }, { property: "og:description", content: "Create quizzes and review results." }] }),
  ssr: false,
  beforeLoad: () => guard("teacher", "admin"),
  loader: ({ context }) => context.queryClient.ensureQueryData(teacherQuizzesQuery),
  component: TeacherHome,
});

function TeacherHome() {
  const { user } = Route.useRouteContext();
  const { t } = useI18n();
  const f = useFormat();
  const { data } = useSuspenseQuery(teacherQuizzesQuery);
  return (
    <AppShell user={user} nav={user.role === "admin" ? <Link to="/admin" className="px-2 text-muted-foreground">{t.overview}</Link> : null}>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-bold">{t.teacherPortal}</h1>
        <Button asChild><Link to="/teacher/quiz/$quizId" params={{ quizId: "new" }}><Plus className="size-4" />{t.newQuiz}</Link></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((q) => (
          <div key={q.id} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="mb-1 flex items-start justify-between gap-2">
              <h2 dir="auto" className="font-semibold">{q.title}</h2>
              <StatusBadge status={q.status} />
            </div>
            <p className="mb-2 text-sm text-muted-foreground">{q.className} · {q.teacherNameEn} · {q.questionCount} {t.questions} · {q.durationMinutes} {t.minutes}</p>
            <p className="text-xs text-muted-foreground">{f.dateTime(q.opensAt)} → {f.dateTime(q.closesAt)}</p>
            <p className="mt-2 text-sm">{q.submissions}/{q.classSize} {t.submissions}{q.averagePct !== null && ` · ${t.average} ${q.averagePct}%`} · {q.negativeMarking ? `-${q.negativeMarking * 100}%` : t.noNeg}</p>
            <div className="mt-3 flex gap-2">
              <Button asChild variant="outline" size="sm"><Link to="/teacher/quiz/$quizId" params={{ quizId: q.id }}>{t.edit}</Link></Button>
              <Button asChild size="sm"><Link to="/teacher/results/$quizId" params={{ quizId: q.id }}>{t.results}</Link></Button>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
