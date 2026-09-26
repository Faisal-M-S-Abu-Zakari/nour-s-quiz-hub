import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteQuiz, getQuizForEdit, saveQuiz } from "@/lib/api.functions";
import { useI18n } from "@/lib/i18n";
import { ammanLocalToIso, isoToAmmanLocal } from "@/lib/csv";
import { AppShell, guard } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CLASSES, LETTERS, type Letter } from "@/lib/types";

export const Route = createFileRoute("/teacher/quiz/$quizId")({
  head: () => ({ meta: [{ title: "Edit quiz — Thursday Quizzes" }, { name: "description", content: "Create or edit a quiz." }, { property: "og:title", content: "Edit quiz" }, { property: "og:description", content: "Create or edit a quiz." }] }),
  ssr: false,
  beforeLoad: () => guard("teacher", "admin"),
  loader: ({ params }) => (params.quizId === "new" ? null : getQuizForEdit({ data: { quizId: params.quizId } })),
  component: Editor,
});

type Q = { id?: string; text: string; options: [string, string, string, string]; correct: Letter; points: number };
const blankQ = (): Q => ({ text: "", options: ["", "", "", ""], correct: "A", points: 1 });
const NEG = [0, 0.25, 0.5, 1];

function Editor() {
  const { user } = Route.useRouteContext();
  const loaded = Route.useLoaderData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(saveQuiz);
  const del = useServerFn(deleteQuiz);
  const q0 = loaded?.quiz;
  const locked = !!loaded?.hasAttempts;
  const now = new Date().toISOString();
  const [title, setTitle] = useState(q0?.title ?? "");
  const [className, setClassName] = useState(q0?.className ?? "10A");
  const [duration, setDuration] = useState(q0?.durationMinutes ?? 20);
  const [opens, setOpens] = useState(isoToAmmanLocal(q0?.opensAt ?? now));
  const [closes, setCloses] = useState(isoToAmmanLocal(q0?.closesAt ?? new Date(Date.now() + 7 * 86400_000).toISOString()));
  const [neg, setNeg] = useState(q0?.negativeMarking ?? 0);
  const [questions, setQuestions] = useState<Q[]>(q0?.questions ?? [blankQ()]);
  const [busy, setBusy] = useState(false);
  const upd = (i: number, p: Partial<Q>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...p } : q)));

  async function onSave() {
    setBusy(true);
    try {
      const r = await save({ data: { id: q0?.id, title, className, durationMinutes: Number(duration), opensAt: ammanLocalToIso(opens), closesAt: ammanLocalToIso(closes), negativeMarking: neg, questions } });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(t.saved);
        qc.invalidateQueries();
        navigate({ to: "/teacher" });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell user={user}>
      <h1 className="mb-4 text-xl font-bold">{q0 ? t.edit : t.newQuiz}</h1>
      {locked && <p className="mb-4 rounded-xl bg-warning/20 p-3 text-sm">{t.lockedNote}</p>}
      <div className="grid gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Label>{t.title}</Label><Input dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>{t.class}</Label>
          <select disabled={locked} className="h-9 w-full rounded-md border bg-background px-2" value={className} onChange={(e) => setClassName(e.target.value)}>{CLASSES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div><Label>{t.duration}</Label><Input disabled={locked} type="number" min={1} max={180} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
        <div><Label>{t.opensAt}</Label><Input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} /></div>
        <div><Label>{t.closesAt}</Label><Input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} /></div>
        <div className="sm:col-span-2"><Label>{t.negMarking} ({t.ofPoints})</Label>
          <div className="mt-1 flex flex-wrap gap-2">{NEG.map((n) => (
            <Button key={n} type="button" disabled={locked} size="sm" variant={neg === n ? "default" : "outline"} onClick={() => setNeg(n)}>{n ? `-${n * 100}%` : t.none}</Button>
          ))}</div></div>
      </div>
      <div className="mt-5 space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="rounded-2xl border bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{t.question} {i + 1}</span>
              <div className="flex items-center gap-2">
                <Label className="text-xs">{t.pts}</Label>
                <Input disabled={locked} type="number" min={0.5} step={0.5} className="h-8 w-20" value={q.points} onChange={(e) => upd(i, { points: Number(e.target.value) })} />
                {!locked && questions.length > 1 && <Button size="icon" variant="ghost" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}
              </div>
            </div>
            <Textarea disabled={locked} dir="auto" placeholder={t.questionText} value={q.text} onChange={(e) => upd(i, { text: e.target.value })} />
            <div className="mt-2 space-y-2">
              {LETTERS.map((L, k) => (
                <label key={L} className="flex items-center gap-2">
                  <input disabled={locked} type="radio" name={`c${i}`} checked={q.correct === L} onChange={() => upd(i, { correct: L })} className="size-5 accent-primary" aria-label={t.correctOption} />
                  <span className="w-4 font-bold">{L}</span>
                  <Input disabled={locked} dir="auto" value={q.options[k]} placeholder={`${t.option} ${L}`} onChange={(e) => { const o = [...q.options] as Q["options"]; o[k] = e.target.value; upd(i, { options: o }); }} />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t bg-background/95 p-4 backdrop-blur">
        {!locked && <Button variant="outline" onClick={() => setQuestions([...questions, blankQ()])}><Plus className="size-4" />{t.addQuestion}</Button>}
        {q0 && !locked && <Button variant="ghost" className="text-destructive" onClick={async () => { if (confirm(t.delete + "?")) { await del({ data: { quizId: q0.id } }); qc.invalidateQueries(); navigate({ to: "/teacher" }); } }}>{t.delete}</Button>}
        <Button className="ms-auto" disabled={busy} onClick={onSave}>{t.save}</Button>
      </div>
    </AppShell>
  );
}
