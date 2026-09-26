import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { getSession, login } from "@/lib/api.functions";
import { useI18n } from "@/lib/i18n";
import { homeFor, LangToggle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — Thursday Quizzes" },
      { name: "description", content: "Sign in to take your weekly quiz or manage your class quizzes." },
      { property: "og:title", content: "Sign in — Thursday Quizzes" },
      { property: "og:description", content: "Sign in to take your weekly quiz or manage your class quizzes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const user = await getSession();
    if (user) throw redirect({ to: homeFor(user.role) });
  },
  component: LoginPage,
});

const DEMO = [
  { label: "Student 10A", u: "s10a01", p: "pass1234" },
  { label: "Student 10B", u: "s10b01", p: "pass1234" },
  { label: "Teacher (Math)", u: "t.khaled", p: "teacher123" },
  { label: "Teacher (Arabic)", u: "t.rania", p: "teacher123" },
  { label: "Nour (admin)", u: "nour", p: "admin123" },
];

function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const doLogin = useServerFn(login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(u = username, p = password) {
    setBusy(true);
    setError("");
    try {
      const r = await doLogin({ data: { username: u, password: p } });
      if (!r.ok) setError(t.invalidLogin);
      else navigate({ to: homeFor(r.user.role) });
    } catch {
      setError(t.invalidLogin);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-3">
        <LangToggle />
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <GraduationCap className="size-8" />
            </div>
            <h1 className="text-2xl font-bold">{t.appName}</h1>
            <p className="text-sm text-muted-foreground">{t.centre}</p>
          </div>
          <form
            className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="u">{t.username}</Label>
              <Input id="u" autoCapitalize="none" autoCorrect="off" autoComplete="username" dir="ltr" className="h-12 text-base" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p">{t.password}</Label>
              <Input id="p" type="password" autoComplete="current-password" dir="ltr" className="h-12 text-base" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
              {t.signIn}
            </Button>
          </form>
          <div className="mt-6">
            <p className="mb-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.demoAccounts}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.u}
                  type="button"
                  disabled={busy}
                  onClick={() => submit(d.u, d.p)}
                  className="rounded-full border bg-card px-3 py-1.5 text-xs hover:bg-accent"
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
