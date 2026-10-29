import { GoogleGenAI } from "@google/genai";

let genAIClient: GoogleGenAI | null = null;

/** Test-only seam. Production code always creates the client from GEMINI_API_KEY. */
export function setGeminiClientForTesting(client: GoogleGenAI | null): void {
  genAIClient = client;
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY environment variable is not configured. Please set it in your Vercel project settings."
    );
  }

  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }

  return genAIClient;
}

// Active, verified production model IDs (2026)
export const PRIMARY_MODEL = "gemini-3.5-flash-lite";   // fast, cost-efficient, active
export const ADVANCED_MODEL = "gemini-3.5-flash";        // higher capability, verified active
// Use an explicit stable ID rather than a moving alias, so a fallback cannot
// fail merely because an alias changes or is unavailable for the project.
export const BACKUP_MODEL = "gemini-3.5-flash-lite";

export type GeminiErrorKind = "rate_limit" | "quota_exhausted" | "invalid_credential" | "permission" | "model_unavailable" | "overloaded" | "network" | "timeout" | "payload_too_large" | "invalid_request" | "unknown";
export function classifyGeminiError(err: unknown): GeminiErrorKind {
  const status = Number((err as any)?.status || (err as any)?.code || 0);
  const message = String((err as any)?.message ?? err).toLowerCase();
  if (status === 413 || /payload.{0,20}(too large|size)|request entity too large/.test(message)) return "payload_too_large";
  if (status === 401 || /api key.{0,40}(invalid|not valid)|invalid credential/.test(message)) return "invalid_credential";
  if (status === 403 || /permission denied|not authorized/.test(message)) return "permission";
  if (/daily.{0,30}quota|quota.{0,30}(exhausted|exceeded)|resource_exhausted/.test(message)) return "quota_exhausted";
  if (status === 429 || /rate limit|too many requests/.test(message)) return "rate_limit";
  if (status === 404 || /model.{0,30}(not found|unsupported|unavailable)/.test(message)) return "model_unavailable";
  if (status === 503 || /\b503\b|overload|high demand|service unavailable/.test(message)) return "overloaded";
  if (/timeout|timed out/.test(message)) return "timeout";
  if (/econnreset|socket hang up|network|fetch failed/.test(message)) return "network";
  if (status === 400 || /invalid request|malformed/.test(message)) return "invalid_request";
  return "unknown";
}

/** Returns true for transient errors that are safe to retry on the same model */
export function isRetryable(err: unknown): boolean {
  return ["rate_limit", "overloaded", "network", "timeout"].includes(classifyGeminiError(err));
}

/** Sleep for `ms` milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with full jitter.
 * delay = random(0, min(cap, base * 2^attempt))
 */
export function backoffMs(attempt: number, baseMs = 300, capMs = 1_500): number {
  const exponential = Math.min(capMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * exponential);
}

/** Race a promise against a timeout */
export function withTimeout<T>(promise: Promise<T> | T, ms: number, description = "Operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${description} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve(promise).then(
      (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}

export interface GenerateParams {
  contents: any;
  config?: any;
  /** Override which model to try first. Defaults to PRIMARY_MODEL. */
  preferredModel?: string;
  /** Per-call timeout in milliseconds (defaults to 15,000ms) */
  timeoutMs?: number;
}

/**
 * Calls generateContent with bounded exponential backoff + jitter + hard per-call timeout.
 * Sequence:
 *   1. Try primary model up to maxRetries times (with backoff on retryable errors).
 *   2. If primary fails, fallback to ADVANCED_MODEL.
 *   3. If ADVANCED_MODEL fails, fallback to BACKUP_MODEL.
 */
export async function generateContentWithRetry(
  params: GenerateParams,
  maxRetries = 1
) {
  const ai = getGeminiClient();
  const primary = params.preferredModel || PRIMARY_MODEL;
  const perCallTimeout = params.timeoutMs || 15_000;
  let lastErr: unknown;
  // A fallback must be a different model. The previous sequence could call the
  // primary again as its own backup, multiplying latency without new recovery.
  const models = Array.from(new Set([
    primary,
    primary === ADVANCED_MODEL ? BACKUP_MODEL : ADVANCED_MODEL,
    BACKUP_MODEL,
  ]));

  for (const [modelIndex, model] of models.entries()) {
    const attempts = modelIndex === 0 ? maxRetries + 1 : 1;
    const config = modelIndex === 0 ? params.config : (params.config?.tools ? { ...params.config, tools: undefined } : params.config);
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        console.log(`[GeminiClient] Calling ${model}${modelIndex ? " fallback" : ""} (attempt ${attempt + 1}/${attempts})...`);
        return await withTimeout(ai.models.generateContent({ model, contents: params.contents, config }), perCallTimeout,
          `Gemini ${modelIndex ? "fallback " : ""}generateContent (${model})`);
      } catch (err: unknown) {
        lastErr = err;
        const kind = classifyGeminiError(err);
        const msg = String((err as any)?.message ?? err);
        console.warn(`[GeminiClient] ${model} attempt ${attempt + 1}/${attempts} failed: ${msg.slice(0, 160)}`);
        if (!isRetryable(err) || attempt === attempts - 1) break;
        await sleep(backoffMs(attempt));
      }
    }
    // Credentials, project quota and malformed input cannot be solved by a model switch.
    if (["invalid_credential", "permission", "quota_exhausted", "payload_too_large", "invalid_request"].includes(classifyGeminiError(lastErr))) break;
  }
  throw lastErr;
}
