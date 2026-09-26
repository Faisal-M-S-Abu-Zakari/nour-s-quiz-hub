/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, newlines in fields, BOM). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCsv(input: string): any[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0]!.map((h) => h.trim());
  return nonEmpty.slice(1).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])),
  );
}

/** Seed/spreadsheet times are Amman local time (UTC+3, no DST since 2022). */
export function ammanLocalToIso(local: string): string {
  const d = new Date(`${local.length === 16 ? local + ":00" : local}+03:00`);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${local}`);
  return d.toISOString();
}

export function isoToAmmanLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}
