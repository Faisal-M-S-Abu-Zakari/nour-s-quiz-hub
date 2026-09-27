/** Lovable AI Gateway call (OpenAI Responses, streamed and consumed server-side). */
const MODEL = "openai/gpt-6-astra";

export class AiError extends Error {
  constructor(public code: "rate_limited" | "no_credits" | "denied" | "failed", message: string) {
    super(message);
  }
}

export async function explainMistake(p: {
  lang: "ar" | "en";
  question: string;
  options: string[];
  selected: string;
  correct: string;
}): Promise<{ explanation: string; tip: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AiError("failed", "AI is not configured.");
  const language = p.lang === "ar" ? "Modern Standard Arabic" : "English";
  const prompt = [
    `A secondary-school student in Jordan answered a multiple-choice question incorrectly.`,
    `Question: ${p.question}`,
    ...p.options.map((o, i) => `${"ABCD"[i]}. ${o}`),
    `Student's answer: ${p.selected}`,
    `Correct answer: ${p.correct}`,
    ``,
    `Write in ${language}, addressing the student kindly and directly.`,
    `Return ONLY a JSON object: {"explanation": string, "tip": string}.`,
    `"explanation": at most 120 words. Explain why the correct answer is right and the likely mistake behind the student's choice. Show short working if it is a calculation.`,
    `"tip": one focused study tip, at most 40 words, for avoiding this kind of mistake.`,
  ].join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error("AI gateway error", res.status, body.slice(0, 300));
    if (res.status === 429) throw new AiError("rate_limited", "Too many requests.");
    if (res.status === 402) throw new AiError("no_credits", "AI credits exhausted.");
    if (res.status === 403) throw new AiError("denied", "AI access denied.");
    throw new AiError("failed", "AI request failed.");
  }

  let text = "";
  let buf = "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") text += ev.delta;
        else if (ev.type === "response.failed" || ev.type === "error") throw new AiError("failed", "AI request failed.");
      } catch (e) {
        if (e instanceof AiError) throw e;
      }
    }
  }
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const j = JSON.parse(m ? m[0] : text);
    const explanation = String(j.explanation ?? "").trim();
    const tip = String(j.tip ?? "").trim();
    if (explanation) return { explanation, tip };
  } catch {
    /* fall through */
  }
  if (text.trim()) return { explanation: text.trim(), tip: "" };
  throw new AiError("failed", "The AI returned no answer.");
}
