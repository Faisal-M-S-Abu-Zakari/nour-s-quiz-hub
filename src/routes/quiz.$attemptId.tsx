import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getAttempt, saveAnswer, submitQuiz } from "@/lib/api.functions";
import { useI18n } from "@/lib/i18n";
import { AppShell, guard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LETTERS, type Letter } from "@/lib/types";

export const Route = createFileRoute("/quiz/$attemptId")({
  head: () => ({ meta: [{ title: "Quiz — Thursday Quizzes" }, { name: "description", content: "Timed multiple choice quiz." }, { property: "og:title", content: "Quiz" }, { property: "og:description", content: "Timed multiple choice quiz." }] }),
  ssr: false,
  beforeLoad: () => guard("student"),
  loader: ({ params }) => getAttempt({ data: { attemptId: params.attemptId } }),
  gcTime: 0,
  shouldReload: true,
  component: QuizPage,
});

type View = Awaited<ReturnType<typeof getAttempt>>;

function QuizPage() {
  const { user } = Route.useRouteContext();
  const initial = Route.useLoaderData();
  const [view, setView] = useState<View>(initial);
  return (
    <AppShell user={user}>
      {view.submitted ? <Result view={view} /> : <Taker view={view} onDone={setView} />}
    </AppShell>
  );
}

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Taker({ view, onDone }: { view: View; onDone: (v: View) => void }) {
  const { t } = useI18n();
  const save = useServerFn(saveAnswer);
  const submit = useServerFn(submitQuiz);
  const [answers, setAnswers] = useState<Record<string, Letter>>(view.answers);
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  // Server clock is the authority; correct for a phone whose clock is off.
  const offset = useRef(new Date(view.serverNow).getTime() - Date.now());
  const deadline = new Date(view.deadline).getTime();
  const [remaining, setRemaining] = useState(deadline - (Date.now() + offset.current));
  const submittedRef = useRef(false);

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        const v = await submit({ data: { attemptId: view.attemptId, answers: answersRef.current } });
        if (auto) toast.info(t.timeUp);
        onDone(v);
        window.scrollTo(0, 0);
      } catch (e) {
        submittedRef.current = false;
        setSubmitting(false);
        toast.error((e as Error).message);
      }
    },
    [submit, view.attemptId, onDone, t.timeUp],
  );

  useEffect(() => {
    const id = setInterval(() => {
      const r = deadline - (Date.now() + offset.current);
      setRemaining(r);
      if (r <= 0) doSubmit(true);
    }, 500);
    return () => clearInterval(id);
  }, [deadline, doSubmit]);

  const q = view.questions[idx]!;
  const answeredCount = Object.keys(answers).length;
  const unanswered = view.questions.length - answeredCount;

  function choose(letter: Letter) {
    const prev = answers[q.id];
    const next = prev === letter ? null : letter; // tap again to clear
    setAnswers((a) => {
      const c = { ...a };
      if (next) c[q.id] = next;
      else delete c[q.id];
      return c;
    });
    save({ data: { attemptId: view.attemptId, questionId: q.id, answer: next } }).catch(() => {
      /* final submit resends everything; saving is a safety net */
    });
  }

  const low = remaining < 60_000;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="sticky top-[57px] z-10 -mx-4 mb-4 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 dir="auto" className="truncate text-sm font-semibold">{view.quiz.title}</h1>
          <div
            className={cn("num flex items-center gap-1.5 rounded-full px-3 py-1 text-base font-bold", low ? "animate-pulse bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground")}
            role="timer"
            aria-label={t.timeLeft}
          >
            <Clock className="size-4" />
            {fmt(remaining)}
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(answeredCount / view.questions.length) * 100}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>{t.question} {q.number} {t.of} {view.questions.length}</span>
          <span className="num">{q.points} {t.pts}</span>
        </div>
        <p dir="auto" className="mb-5 text-lg font-medium leading-relaxed">{q.text}</p>
        <div className="space-y-2.5">
          {q.options.map((opt, i) => {
            const L = LETTERS[i]!;
            const selected = answers[q.id] === L;
            return (
              <button
                key={L}
                type="button"
                onClick={() => choose(L)}
                disabled={submitting}
                aria-pressed={selected}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-start text-base transition-colors",
                  selected ? "border-primary bg-accent" : "border-border hover:border-primary/40",
                )}
              >
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold", selected ? "bg-primary text-primary-foreground" : "bg-muted")}>{L}</span>
                <span dir="auto" className="flex-1">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" className="h-12 flex-1" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          <ChevronLeft className="size-4 rtl:rotate-180" />{t.previous}
        </Button>
        {idx < view.questions.length - 1 ? (
          <Button className="h-12 flex-1" onClick={() => setIdx(idx + 1)}>
            {t.next}<ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        ) : (
          <Button className="h-12 flex-1" disabled={submitting} onClick={() => confirm(t.submitConfirm(unanswered)) && doSubmit(false)}>{t.submit}</Button>
        )}
      </div>

      <div className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-8">
        {view.questions.map((x, i) => (
          <button
            key={x.id}
            onClick={() => setIdx(i)}
            className={cn(
              "num h-11 rounded-lg border text-sm font-medium",
              i === idx && "ring-2 ring-ring",
              answers[x.id] ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {x.number}
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-sm text-muted-foreground">{answeredCount} / {view.questions.length} {t.answered}</p>
      <Button variant="secondary" className="mt-4 h-12 w-full" disabled={submitting} onClick={() => confirm(t.submitConfirm(unanswered)) && doSubmit(false)}>{t.submit}</Button>
    </div>
  );
}

function Result({ view }: { view: View }) {
  const { t } = useI18n();
  const pct = view.maxScore ? Math.round(((view.score ?? 0) / view.maxScore) * 100) : 0;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <p dir="auto" className="mb-1 text-sm text-muted-foreground">{view.quiz.title}</p>
        <p className="text-sm font-medium">{t.yourScore}</p>
        <p className="num my-2 text-5xl font-bold text-primary">{view.score}<span className="text-2xl text-muted-foreground"> / {view.maxScore}</span></p>
        <p className="num text-lg font-semibold">{pct}%</p>
        {view.autoSubmitted && <p className="mt-2 text-sm text-warning-foreground">{t.timeUp}</p>}
        {view.summary && (
          <div className="mt-5 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-xl bg-success/10 p-2"><p className="num text-xl font-bold text-success">{view.summary.correct}</p>{t.correct}</div>
            <div className="rounded-xl bg-destructive/10 p-2"><p className="num text-xl font-bold text-destructive">{view.summary.wrong}</p>{t.wrong}</div>
            <div className="rounded-xl bg-muted p-2"><p className="num text-xl font-bold">{view.summary.unanswered}</p>{t.unanswered}</div>
          </div>
        )}
        {view.quiz.negativeMarking > 0 && <p className="mt-3 text-xs text-muted-foreground">{t.negDesc(view.quiz.negativeMarking)}</p>}
      </div>
      <Button asChild className="mb-6 h-12 w-full"><Link to="/student">{t.backToQuizzes}</Link></Button>
      {!view.reveal ? (
        <p className="text-center text-sm text-muted-foreground">{t.reviewLater}</p>
      ) : (
        <div className="space-y-3">
          {view.questions.map((q) => {
            const mine = view.answers[q.id];
            const ok = mine === q.correct;
            return (
              <div key={q.id} className="rounded-xl border bg-card p-4">
                <div className="mb-2 flex items-start gap-2">
                  {ok ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />}
                  <p dir="auto" className="font-medium">{q.number}. {q.text}</p>
                </div>
                <p className="text-sm text-muted-foreground">{t.yourAnswer}: <span dir="auto">{mine ? `${mine}. ${q.options[LETTERS.indexOf(mine)]}` : "—"}</span></p>
                {!ok && q.correct && <p className="text-sm text-success">{t.correctAnswer}: <span dir="auto">{q.correct}. {q.options[LETTERS.indexOf(q.correct)]}</span></p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
