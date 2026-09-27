import { Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, LogOut, Languages } from "lucide-react";
import type { ReactNode } from "react";
import { getSession, logout } from "@/lib/api.functions";
import { useFormat, useI18n } from "@/lib/i18n";
import { setToken } from "@/lib/session-token";
import type { PublicUser } from "@/lib/quiz.service";
import type { Role } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function homeFor(role: Role) {
  return role === "student" ? "/student" : role === "admin" ? "/admin" : "/teacher";
}

/** Route guard for beforeLoad. The server re-checks roles on every call; this is UX only. */
export async function guard(...roles: Role[]) {
  const user = await getSession();
  if (!user) throw redirect({ to: "/" });
  if (!roles.includes(user.role)) throw redirect({ to: homeFor(user.role) });
  return { user };
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <Button variant="ghost" size="sm" onClick={() => setLang(lang === "ar" ? "en" : "ar")} aria-label="Language">
      <Languages className="size-4" />
      <span>{lang === "ar" ? "English" : "العربية"}</span>
    </Button>
  );
}

export function AppShell({ user, children, nav }: { user: PublicUser; children: ReactNode; nav?: ReactNode }) {
  const { t } = useI18n();
  const f = useFormat();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const doLogout = useServerFn(logout);
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2.5">
          <Link to={homeFor(user.role)} className="flex items-center gap-2 font-semibold text-primary">
            <GraduationCap className="size-6" />
            <span className="hidden sm:inline">{t.appName}</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">{nav}</nav>
          <div className="ms-auto flex items-center gap-1">
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:inline">{f.name(user)}</span>
            <LangToggle />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.signOut}
              onClick={async () => {
                setToken(null);
                await doLogout().catch(() => undefined);
                qc.clear();
                navigate({ to: "/", replace: true });
              }}
            >
              <LogOut className="size-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5 pb-24">{children}</main>
    </div>
  );
}

export function StatusBadge({ status }: { status: "open" | "upcoming" | "closed" }) {
  const { t } = useI18n();
  const cls =
    status === "open"
      ? "bg-success/15 text-success"
      : status === "upcoming"
        ? "bg-warning/20 text-warning-foreground"
        : "bg-muted text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{t[status]}</span>;
}
