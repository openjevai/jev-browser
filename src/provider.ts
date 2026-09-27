// The only model transport. Host agents supply all generated text.
export interface JevConfig { url: string; key: string; model: string }
export interface ChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number | null;
}
export interface NoulAnswer { type: "noul"; noul: number }
export type Answer = ChoiceAnswer | NoulAnswer;
export interface Question { type: "choice" | "noul"; instructions: string; criteria?: Record<string, string> }
export interface AskResult {
  answers: Record<string, Answer>;
  usage: { input_tokens: number | null; output_tokens: number | null };
  model: string;
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env): JevConfig {
  if (!env.JEV_API_URL || !env.JEV_API_KEY?.trim()) {
    throw new Error("Set JEV_API_URL to the complete Jev inference endpoint and JEV_API_KEY to its key. Legacy TYPESAFE_API_KEY, OPENROUTER_API_KEY, JEV_PROVIDER and JEV_BROWSER_TYPE_* configuration is no longer used.");
  }
  let url: URL;
  try { url = new URL(env.JEV_API_URL); } catch { throw new Error("JEV_API_URL must be a complete HTTP(S) inference endpoint."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.hash || url.pathname === "/") {
    throw new Error("JEV_API_URL must be a complete HTTP(S) inference endpoint without credentials or a fragment.");
  }
  if (/[\r\n]/.test(env.JEV_API_KEY)) throw new Error("JEV_API_KEY must not contain line breaks.");
  const model = env.JEV_MODEL?.trim() || (url.hostname === "openrouter.ai" ? "typesafe/jev-1.13" : url.hostname === "api.openjev.sh" ? "openjev" : "jev-latest");
  return { url: url.href, key: env.JEV_API_KEY, model };
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function probability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
const malformed = () => new Error("Jev returned an invalid decision; no browser action was executed.");
export function validateAnswers(value: unknown, questions: Record<string, Question>): Record<string, Answer> {
  if (!object(value)) throw malformed();
  const result: Record<string, Answer> = {};
  for (const [name, question] of Object.entries(questions)) {
    const answer = value[name];
    if (!object(answer) || answer.type !== question.type) throw malformed();
    if (question.type === "noul") {
      if (!probability(answer.noul)) throw malformed();
      result[name] = { type: "noul", noul: answer.noul };
    } else {
      const criteria = question.criteria ?? {};
      if (typeof answer.choice !== "string" || !Object.hasOwn(criteria, answer.choice)) throw malformed();
      if (!object(answer.probabilities)) throw malformed();
      const probabilities: Record<string, number> = {};
      for (const [choice, p] of Object.entries(answer.probabilities)) {
        if (!Object.hasOwn(criteria, choice) || !probability(p)) throw malformed();
        probabilities[choice] = p;
      }
      if (!Object.hasOwn(probabilities, answer.choice)) throw malformed();
      if (answer.confidence != null && !probability(answer.confidence)) throw malformed();
      result[name] = { type: "choice", choice: answer.choice, probabilities, confidence: (answer.confidence as number | null) ?? null };
    }
  }
  return result;
}
export async function askJev(
  state: unknown, questions: Record<string, Question>, config: JevConfig, signal?: AbortSignal,
): Promise<AskResult> {
  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST", redirect: "error", signal,
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, state, questions }),
    });
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new Error("Jev request failed. Check the endpoint, network and TLS settings; redirects are not followed.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Jev inference returned HTTP ${response.status}. Check the endpoint, key and model access.`);
  }
  let body: unknown;
  try { body = await response.json(); } catch {
    if (signal?.aborted) throw signal.reason;
    throw malformed();
  }
  if (!object(body)) throw malformed();
  const usage = object(body.usage) ? body.usage : {};
  const tokens = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  return {
    answers: validateAnswers(body.answers, questions),
    usage: { input_tokens: tokens(usage.input_tokens), output_tokens: tokens(usage.output_tokens) },
    model: config.model,
  };
}
