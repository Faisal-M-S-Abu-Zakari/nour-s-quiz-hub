import { createFileRoute, Link } from "@tanstack/react-router";
import { quizResults } from "@/lib/api.functions";
import { useFormat, useI18n } from "@/lib/i18n";
import { AppShell, guard } from "@/components/AppShell";

export const Route = createFileRoute("/teacher/results/$quizId")({
  head: () => ({ meta: [{ title: "Quiz results — Thursday Quizzes" }, { name: "description", content: "Student scores and question breakdown." }, { property: "og:title", content: "Quiz results" }, { property: "og:description", content: "Student scores and question breakdown." }] }),
  ssr: false,
  beforeLoad: () => guard("teacher", "admin"),
  loader: ({ params }) => quizResults({ data: { quizId: params.quizId } }),
  component: Results,
});

function Results() {
  const { user } = Route.useRouteContext();
  const r = Route.useLoaderData();
  const { t } = useI18n();
  const f = useFormat();
  const st = (s: string) => (s === "submitted" ? t.submitted : s === "in_progress" ? t.inProgress : t.notStarted);
  return (
    <AppShell user={user} nav={<Link to={user.role === "admin" ? "/admin" : "/teacher"} className="px-2 text-muted-foreground">{t.back}</Link>}>
      <h1 dir="auto" className="text-xl font-bold">{r.quiz.title}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{r.quiz.className} · {r.quiz.maxScore} {t.pts} · {r.quiz.negativeMarking ? `-${r.quiz.negativeMarking * 100}%` : t.noNeg}</p>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[[t.submissions, `${r.stats.submitted}/${r.stats.classSize}`], [t.average, r.stats.averagePct != null ? `${r.stats.averagePct}%` : "—"], [t.highest, r.stats.highest ?? "—"], [t.lowest, r.stats.lowest ?? "—"]].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="num text-xl font-bold">{v}</p></div>
        ))}
      </div>
      <h2 className="mb-2 font-semibold">{t.students}</h2>
      <div className="mb-6 overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-start"><tr><th className="p-2 text-start">{t.student}</th><th className="p-2 text-start">{t.score}</th><th className="p-2 text-start">{t.status}</th></tr></thead>
          <tbody>{r.rows.map((x) => (
            <tr key={x.studentId} className="border-t">
              <td className="p-2">{f.name(x)}</td>
              <td className="num p-2">{x.score != null ? `${x.score} (${x.pct}%)` : "—"}</td>
              <td className="p-2 text-muted-foreground">{st(x.status)}{x.autoSubmitted && ` · ${t.auto}`}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <h2 className="mb-2 font-semibold">{t.questionBreakdown}</h2>
      <div className="space-y-2">
        {r.breakdown.map((b) => (
          <div key={b.number} className="rounded-xl border bg-card p-3">
            <div className="flex justify-between gap-2"><p dir="auto" className="text-sm">{b.number}. {b.text}</p><span className="num shrink-0 font-bold">{b.pctCorrect ?? "—"}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-success" style={{ width: `${b.pctCorrect ?? 0}%` }} /></div>
            <p className="num mt-1 text-xs text-muted-foreground">{(["A", "B", "C", "D"] as const).map((L) => `${L}${L === b.correct ? "✓" : ""}: ${b.counts[L]}`).join(" · ")} · {t.blank}: {b.blank}</p>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
