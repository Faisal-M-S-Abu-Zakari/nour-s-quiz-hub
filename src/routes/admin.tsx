import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminOverview, resetDemoData, teacherQuizzes } from "@/lib/api.functions";
import { useFormat, useI18n } from "@/lib/i18n";
import { AppShell, guard, StatusBadge } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Centre overview — Thursday Quizzes" }, { name: "description", content: "Class performance and student scores across the centre." }, { property: "og:title", content: "Centre overview" }, { property: "og:description", content: "Class performance and student scores across the centre." }] }),
  ssr: false,
  beforeLoad: () => guard("admin"),
  loader: async () => ({ overview: await adminOverview(), quizzes: await teacherQuizzes() }),
  component: Admin,
});

function Admin() {
  const { user } = Route.useRouteContext();
  const { overview, quizzes } = Route.useLoaderData();
  const { t } = useI18n();
  const f = useFormat();
  const router = useRouter();
  const reset = useServerFn(resetDemoData);
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const students = overview.students
    .filter((s) => (cls === "all" || s.className === cls) && (s.nameEn + s.nameAr + s.id).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.averagePct ?? -1) - (a.averagePct ?? -1));
  return (
    <AppShell user={user} nav={<Link to="/teacher" className="px-2 text-muted-foreground">{t.teacherPortal}</Link>}>
      <h1 className="mb-4 text-xl font-bold">{t.overview}</h1>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {overview.classes.map((c) => (
          <button key={c.className} onClick={() => setCls(cls === c.className ? "all" : c.className)} className={`rounded-2xl border bg-card p-4 text-start ${cls === c.className ? "ring-2 ring-ring" : ""}`}>
            <p className="text-lg font-bold">{c.className}</p>
            <p className="num text-3xl font-bold text-primary">{c.averagePct ?? "—"}%</p>
            <p className="text-xs text-muted-foreground">{t.average} · {c.students} {t.students} · {t.participation} {c.participationPct ?? "—"}%</p>
          </button>
        ))}
      </div>
      <h2 className="mb-2 font-semibold">{t.allQuizzes}</h2>
      <div className="mb-6 space-y-2">
        {quizzes.map((z) => (
          <Link key={z.id} to="/teacher/results/$quizId" params={{ quizId: z.id }} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 hover:bg-accent">
            <div><p dir="auto" className="font-medium">{z.title}</p><p className="text-xs text-muted-foreground">{z.className} · {z.teacherNameEn} · {f.dateTime(z.closesAt)}</p></div>
            <div className="text-end"><StatusBadge status={z.status} /><p className="num text-sm">{z.submissions}/{z.classSize} · {z.averagePct ?? "—"}%</p></div>
          </Link>
        ))}
      </div>
      <h2 className="mb-2 font-semibold">{t.students}</h2>
      <Input className="mb-2" dir="auto" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted"><tr><th className="p-2 text-start">{t.student}</th><th className="p-2 text-start">{t.class}</th><th className="p-2 text-start">{t.quizzesTaken}</th><th className="p-2 text-start">{t.average}</th></tr></thead>
          <tbody>{students.map((s) => (
            <tr key={s.id} className="border-t"><td className="p-2">{f.name(s)}</td><td className="p-2">{s.className}</td><td className="num p-2">{s.taken}</td><td className="num p-2">{s.averagePct != null ? `${s.averagePct}%` : "—"}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <Button variant="outline" className="mt-6" onClick={async () => { if (confirm(t.resetData + "?")) { await reset(); router.invalidate(); } }}>{t.resetData}</Button>
    </AppShell>
  );
}
