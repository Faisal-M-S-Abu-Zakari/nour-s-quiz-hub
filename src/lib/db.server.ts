import { createHash } from "node:crypto";
import { buildSeed } from "./seed";
import type { DB } from "./types";

const DATA_FILE = "data/db.json";
const PEPPER = "bythursday-quiz";

export async function hashPassword(username: string, password: string): Promise<string> {
  return createHash("sha256").update(`${PEPPER}:${username}:${password}`).digest("hex");
}

let db: DB | null = null;
let loading: Promise<DB> | null = null;

async function readFile(): Promise<DB | null> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(DATA_FILE)) return null;
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as DB;
  } catch {
    return null;
  }
}

/** Load the database: data/db.json if present, otherwise build from the seed spreadsheets. */
export async function getDb(): Promise<DB> {
  if (db) return db;
  if (!loading) {
    loading = (async () => {
      const fromFile = await readFile();
      db = fromFile ?? (await buildSeed(hashPassword));
      if (!fromFile) await persist();
      return db;
    })();
  }
  return loading;
}

/** Best-effort persistence to disk. On runtimes without a writable disk, data stays in memory. */
export async function persist(): Promise<void> {
  if (!db) return;
  try {
    const fs = await import("node:fs");
    fs.mkdirSync("data", { recursive: true });
    fs.writeFileSync(DATA_FILE + ".tmp", JSON.stringify(db, null, 1));
    fs.renameSync(DATA_FILE + ".tmp", DATA_FILE);
  } catch {
    /* in-memory only */
  }
}

/** Serialise all mutations so concurrent requests can't interleave (e.g. double start). */
let chain: Promise<unknown> = Promise.resolve();
export function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const d = await getDb();
    const result = await fn(d);
    await persist();
    return result;
  });
  chain = run.catch(() => undefined);
  return run;
}

export async function resetDb(): Promise<void> {
  db = await buildSeed(hashPassword);
  await persist();
}
