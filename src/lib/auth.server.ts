import { createHmac, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie, deleteCookie, getRequestHeader } from "@tanstack/react-start/server";
import { getDb } from "./db.server";
import type { Role, User } from "./types";

const COOKIE = "quiz_session";
const MAX_AGE = 60 * 60 * 12; // 12h

function secret() {
  return process.env["SESSION_SECRET"] ?? "dev-only-secret-change-me";
}

export function signToken(userId: string, expSec: number): string {
  const payload = `${userId}.${expSec}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string, nowSec: number): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, exp, sig] = parts as [string, string, string];
  const expected = createHmac("sha256", secret()).update(`${userId}.${exp}`).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < nowSec) return null;
  return userId;
}

/** Sets the session cookie and also returns the token: inside the editor preview (a cross-site
 *  iframe) browsers may block cookies, so the client keeps a copy and sends it as a header. */
export function startSession(userId: string): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const token = signToken(userId, exp);
  setCookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    partitioned: true,
    path: "/",
    maxAge: MAX_AGE,
  });
  return token;
}

export function endSession() {
  deleteCookie(COOKIE, { path: "/", sameSite: "none", secure: true, partitioned: true });
}

export async function currentUser(): Promise<User | null> {
  const token = getCookie(COOKIE) || getRequestHeader("x-quiz-session");
  if (!token) return null;
  const id = verifyToken(token, Math.floor(Date.now() / 1000));
  if (!id) return null;
  const db = await getDb();
  return db.users.find((u) => u.id === id) ?? null;
}

export class HttpError extends Error {}

export async function requireRole(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) throw new HttpError("Please sign in again.");
  if (!roles.includes(u.role)) throw new HttpError("You do not have access to this page.");
  return u;
}
