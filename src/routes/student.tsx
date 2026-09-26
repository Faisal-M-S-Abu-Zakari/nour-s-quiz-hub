import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Clock, ListChecks, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { startQuiz, studentQuizzes } from "@/lib/api.functions";
import { useFormat, useI18n } from "@/lib/i18n";
import { AppShell, guard, StatusBadge } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const quizzesQuery = queryOptions({ queryKey: ["student-quizzes"], queryFn: () => studentQuizzes() });

export const Route = createFileRoute("/student")({
  head: () => ({ meta: [{ title: "My quizzes — Thursday Quizzes" }, { name: "description", content: "Your open and past quizzes." }, { property: "og:title", content: "My quizzes" }, { property: "og:description", content: "Your open and past quizzes." }] }),
  ssr: false,
  beforeLoad: () => guard("student"),
  loader: ({ context }) => context.queryClient.ensureQueryData(quizzesQuery),
  component: StudentHome,
});

function StudentHome() {
  const { user } = Route.useRouteContext();
  const { t } = useI18n();
  const f = useFormat();
  const { data } = useSuspenseQuery(quizzesQuery);
  const navigate = useNavigate();
  const start = useServerFn(startQuiz);
  const [confirm, setConfirm] = useState<(typeof data)[number] | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin(quizId: string) {
    setBusy(true);
    try {
      const r = await start({ data: { quizId } });
      navigate({ to: "/quiz/$attemptId", params: { attemptId: r.attemptId } });
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-xl font-bold">{t.myQuizzes}</h1>
      <p className="mb-5 text-sm text-muted-foreground">{f.name(user)} · {user.className}</p>
      {data.length === 0 && <p className="text-muted-foreground">{t.noQuizzes}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((q) => {
          const done = q.attempt?.submitted;
          const inProgress = q.attempt && !q.attempt.submitted;
          return (
            <div key={q.id} className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 dir="auto" className="text-base font-semibold leading-snug">{q.title}</h2>
                <StatusBadge status={q.status} />
              </div>
              <p className="mb-3 text-sm text-muted-foreground">{f.name({ nameEn: q.teacherNameEn, nameAr: q.teacherNameAr })}</p>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="size-4" />{q.durationMinutes} {t.minutes}</span>
                <span className="flex items-center gap-1"><ListChecks className="size-4" />{q.questionCount} {t.questions} · {q.maxScore} {t.pts}</span>
                <span className="flex items-center gap-1"><MinusCircle className="size-4" />{q.negativeMarking ? t.negDesc(q.negativeMarking) : t.noNeg}</span>
              </div>
              <p className="mb-4 text-xs text-muted-foreground">
                {q.status === "upcoming" ? `${t.opens}: ${f.dateTime(q.opensAt)}` : `${t.closes}: ${f.dateTime(q.closesAt)}`}
              </p>
              <div className="mt-auto">
                {done ? (
                  <Button variant="secondary" className="h-11 w-full justify-between" onClick={() => navigate({ to: "/quiz/$attemptId", params: { attemptId: q.attempt!.id } })}>
                    <span>{t.viewResult}</span>
                    <span className="num font-bold">{q.attempt!.score} / {q.attempt!.maxScore}</span>
                  </Button>
                ) : inProgress ? (
                  <Button className="h-11 w-full" disabled={busy} onClick={() => begin(q.id)}>{t.resume}</Button>
                ) : q.status === "open" ? (
                  <Button className="h-11 w-full" disabled={busy} onClick={() => setConfirm(q)}>{t.start}</Button>
                ) : q.status === "closed" ? (
                  <p className="text-center text-sm text-muted-foreground">{t.missed}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle dir="auto">{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && t.startConfirmBody(confirm.durationMinutes)}
              {confirm?.negativeMarking ? <><br /><br />{t.negDesc(confirm.negativeMarking)}</> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={() => confirm && begin(confirm.id)}>{t.start}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
