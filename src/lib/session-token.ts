/** Browser copy of the signed session token, used when the preview iframe blocks cookies. */
const KEY = "quiz_session";
export function getToken(): string | null {
  try {
    return typeof window === "undefined" ? null : sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) sessionStorage.setItem(KEY, t);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
