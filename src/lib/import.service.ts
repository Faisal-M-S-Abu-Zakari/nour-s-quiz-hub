/**
 * Spreadsheet import rules. Pure functions over a DB object so they can be unit tested.
 * Rows are plain objects keyed by the header row (same headers as the files in /seed).
 * All-or-nothing: if any row has an error, nothing is changed.
 */
import { buildQuizzes } from "./seed";
import type { DB, User } from "./types";

export type Row = Record<string, string>;
export type ImportKind = "students" | "teachers";
export interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
  applied: boolean;
}

interface NRow { username?: string; name_ar?: string; name_en?: string; role?: string; class?: string; password?: string; subject?: string; [k: string]: string | undefined }
const norm = (r: Row): NRow =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, "_"), String(v ?? "").trim()]));

const USERNAME = /^[a-z0-9._-]{2,40}$/;
const CLASS = /^[0-9A-Za-z\u0600-\u06FF -]{1,10}$/;

/** passwordHashes: username -> hash, precomputed by the caller for rows that have a password. */
export function importUsers(
  db: DB,
  kind: ImportKind,
  rawRows: Row[],
  passwordHashes: Record<string, string>,
  apply: boolean,
): ImportResult {
  const errors: string[] = [];
  const seen = new Set<string>();
  const planned: { existing: User | undefined; next: User }[] = [];
  rawRows.map(norm).forEach((r, i) => {
    const line = `Row ${i + 2}`;
    const username = (r.username ?? "").toLowerCase();
    if (!USERNAME.test(username)) return void errors.push(`${line}: invalid username "${r.username ?? ""}".`);
    if (seen.has(username)) return void errors.push(`${line}: username "${username}" appears twice.`);
    seen.add(username);
    if (!r.name_ar) errors.push(`${line}: Arabic name is missing.`);
    if (!r.name_en) errors.push(`${line}: English name is missing.`);
    const existing = db.users.find((u) => u.id === username);
    const role = kind === "students" ? "student" : r.role?.toLowerCase() === "admin" ? "admin" : "teacher";
    if (existing && (existing.role === "student") !== (role === "student"))
      return void errors.push(`${line}: "${username}" already exists as a ${existing.role}.`);
    if (kind === "students" && !CLASS.test(r.class ?? "")) errors.push(`${line}: class is missing or invalid.`);
    const hash = passwordHashes[username];
    if (!existing && !hash) errors.push(`${line}: password is required for new accounts.`);
    if (r.password && r.password.length < 4) errors.push(`${line}: password must be at least 4 characters.`);
    const next: User = {
      id: username,
      role,
      nameAr: r.name_ar ?? "",
      nameEn: r.name_en ?? "",
      passwordHash: hash ?? existing?.passwordHash ?? "",
      ...(kind === "students" ? { className: (r.class ?? "").toUpperCase() } : { subject: r.subject || existing?.subject || "" }),
    };
    planned.push({ existing, next });
  });
  if (!rawRows.length) errors.push("The file has no rows.");
  const ok = errors.length === 0;
  if (ok && apply) {
    for (const p of planned) {
      if (p.existing) Object.assign(p.existing, p.next);
      else db.users.push(p.next);
    }
  }
  return {
    created: planned.filter((p) => !p.existing).length,
    updated: planned.filter((p) => p.existing).length,
    errors: errors.slice(0, 50),
    applied: ok && apply,
  };
}

const toCsv = (rows: Row[]) => {
  const n = rows.map(norm) as Row[];
  const headers = [...new Set(n.flatMap((r) => Object.keys(r)))];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [headers.map(esc).join(","), ...n.map((r) => headers.map((h) => esc(r[h] ?? "")).join(","))].join("\n");
};

export function importQuizzes(db: DB, quizRows: Row[], questionRows: Row[], apply: boolean): ImportResult {
  const errors: string[] = [];
  let quizzes;
  try {
    quizzes = buildQuizzes(toCsv(quizRows), toCsv(questionRows));
  } catch (e) {
    return { created: 0, updated: 0, errors: [(e as Error).message], applied: false };
  }
  if (!quizzes.length) errors.push("The quiz file has no rows.");
  for (const q of quizzes) {
    const label = `Quiz ${q.id}`;
    if (!q.id) errors.push("A quiz row is missing quiz_id.");
    const teacher = db.users.find((u) => u.id === q.teacherId.toLowerCase());
    if (!teacher || teacher.role === "student") errors.push(`${label}: teacher "${q.teacherId}" not found — import teachers first.`);
    else q.teacherId = teacher.id;
    q.className = q.className.toUpperCase();
    if (!db.users.some((u) => u.role === "student" && u.className === q.className))
      errors.push(`${label}: no students in class "${q.className}" — import the student roster first.`);
    if (!q.questions.length) errors.push(`${label}: no questions found for this quiz_id.`);
    q.questions.forEach((x, i) => {
      if (!x.text || x.options.some((o) => !o)) errors.push(`${label} question ${i + 1}: text and all four options are required.`);
    });
    if (!(q.negativeMarking >= 0 && q.negativeMarking <= 1)) errors.push(`${label}: negative_marking must be between 0 and 1.`);
    if (new Date(q.closesAt) <= new Date(q.opensAt)) errors.push(`${label}: closes_at must be after opens_at.`);
    if (db.quizzes.some((z) => z.id === q.id) && db.attempts.some((a) => a.quizId === q.id))
      errors.push(`${label}: students have already taken this quiz, so it can't be replaced.`);
  }
  const ok = errors.length === 0;
  let created = 0, updated = 0;
  for (const q of quizzes) {
    const idx = db.quizzes.findIndex((z) => z.id === q.id);
    if (idx >= 0) updated++;
    else created++;
    if (ok && apply) {
      if (idx >= 0) db.quizzes[idx] = q;
      else db.quizzes.push(q);
    }
  }
  return { created, updated, errors: errors.slice(0, 50), applied: ok && apply };
}
