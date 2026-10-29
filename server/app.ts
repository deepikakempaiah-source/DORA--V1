import "dotenv/config";
import express from "express";
import { orchestrateDeepResearch } from "./orchestrator.js";
import { generateResearchDiagram } from "./diagramGenerator.js";
import { answerResearchFollowUp } from "./qaAssistant.js";
import { withPersonalGeminiApiKey } from "./geminiClient.js";
import { ResearchRequestPayload, ResearchResult, QaMessage } from "../src/types.js";

// Keep a delivery margin below the configured Vercel function duration (300s).
// Document analysis and synthesis are sequential after planning, so the former
// 50-second guard could terminate a valid PDF request before synthesis began.
const RESEARCH_TIMEOUT_MS = 120_000;

/** Serialize any thrown value into a clean, human-readable string */
function errorMessage(err: unknown): string {
  if (!err) return "An unexpected error occurred.";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    // Avoid leaking raw nested JSON blobs to the UI
    const obj = err as any;
    if (obj?.error?.message) return String(obj.error.message);
    if (obj?.message) return String(obj.message);
    const s = JSON.stringify(err);
    // If it's a short JSON snippet, return it; otherwise give a generic message
    return s.length < 300 ? s : "Research service returned an unexpected error.";
  } catch {
    return "An unexpected error occurred.";
  }
}

/** Read an optional per-request fallback key without ever adding it to logs. */
function personalApiKeyFromRequest(req: express.Request): string | undefined {
  const value = req.get("X-DORA-Gemini-Key")?.trim();
  if (!value) return undefined;
  if (value.length < 20 || value.length > 256) {
    throw new Error("The personal Gemini API key format is invalid.");
  }
  return value;
}

export function createExpressApp() {
  const app = express();

  // Support up to 50MB payload for uploaded PDFs
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // ──────────────────────────────────────────────
  // API Health Check
  // ──────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "DORA — Deep Orchestration Research Assistant",
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // ──────────────────────────────────────────────
  // ──────────────────────────────────────────────
  // Standard Research Endpoint (Non-streaming)
  // ──────────────────────────────────────────────
  app.post("/api/research", async (req, res) => {
    try {
      const payload: ResearchRequestPayload = req.body;
      const hasFiles = Boolean((payload?.files && payload.files.length > 0) || payload?.file);
      if (!payload || ((!payload.query || typeof payload.query !== "string" || !payload.query.trim()) && !hasFiles)) {
        return res.status(400).json({ error: "Missing or invalid 'query' in request body." });
      }

      if (!payload.query || !payload.query.trim()) {
        payload.query = "Analyze and synthesize findings from uploaded document(s)";
      }

      const result = await withPersonalGeminiApiKey(
        personalApiKeyFromRequest(req),
        () => orchestrateDeepResearch(payload)
      );
      return res.json(result);
    } catch (err: unknown) {
      console.error("Research error:", err);
      return res.status(500).json({ error: errorMessage(err) });
    }
  });

  // ──────────────────────────────────────────────
  // Streaming Research Endpoint (Server-Sent Events)
  // ──────────────────────────────────────────────
  app.post("/api/research/stream", async (req, res) => {
    const payload: ResearchRequestPayload = req.body;
    const hasFiles = Boolean((payload?.files && payload.files.length > 0) || payload?.file);
    if (!payload || ((!payload.query || typeof payload.query !== "string" || !payload.query.trim()) && !hasFiles)) {
      return res.status(400).json({ error: "Missing or invalid 'query' in request body." });
    }

    if (!payload.query || !payload.query.trim()) {
      payload.query = "Analyze and synthesize findings from uploaded document(s)";
    }

    const queryPreview = payload.query.slice(0, 60);
    const mode = payload.mode || "deep";
    console.log(`[SSE] Incoming research stream request: "${queryPreview}" (mode=${mode}, hasPdf=${hasFiles})`);

    // Configure SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable Nginx/Vercel edge buffering
    res.flushHeaders?.();

    // Flush initial comment so reverse proxies (Vercel, Cloudflare, etc.) immediately open the stream
    res.write(": dora-sse-connected\n\n");
    (res as any).flush?.();

    let finished = false;
    let clientDisconnected = false;

    const sendEvent = (event: string, data: unknown) => {
      if (finished || clientDisconnected || res.writableEnded || res.destroyed) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        (res as any).flush?.();
      } catch (writeErr) {
        console.warn("[SSE] Write failed:", writeErr);
      }
    };

    // Heartbeat every 3 seconds to ensure edge proxies never idle-timeout during model calls
    const heartbeatInterval = setInterval(() => {
      if (!finished && !clientDisconnected && !res.writableEnded && !res.destroyed) {
        try {
          res.write(": keepalive\n\n");
          (res as any).flush?.();
        } catch {
          // write failure handled on next attempt or close
        }
      }
    }, 3000);

    const finish = () => {
      clearInterval(heartbeatInterval);
      if (finished) return;
      finished = true;
      try { res.end(); } catch { /* already closed */ }
    };

    // Hard safety timeout: send error + done terminal events before Vercel kills function
    const timeoutHandle = setTimeout(() => {
      console.warn(`[SSE] Research request reached overall safety timeout (120s) for: "${queryPreview}"`);
      sendEvent("error", {
        message: "Research timed out. The topic may require too many sub-steps. Try using 'Quick' mode or a more specific query.",
      });
      sendEvent("done", { success: false, reason: "timeout" });
      finish();
    }, RESEARCH_TIMEOUT_MS);

    // Do not use req.on("close") here: for a POST, Node/Vercel may emit it
    // after the request body is read even while the response stream is healthy.
    // That previously suppressed the result frame after orchestration succeeded.
    res.on("close", () => {
      if (!finished && !res.writableEnded) {
        clientDisconnected = true;
        clearTimeout(timeoutHandle);
        clearInterval(heartbeatInterval);
        console.log(`[SSE] Client disconnected before delivery completed for: "${queryPreview}"`);
      }
    });

    try {
      const result = await withPersonalGeminiApiKey(
        personalApiKeyFromRequest(req),
        () => orchestrateDeepResearch(payload, (step) => {
          sendEvent("progress", step);
        })
      );

      clearTimeout(timeoutHandle);
      console.log(`[SSE] Successfully completed research for: "${queryPreview}". Dispatching result and done events.`);
      sendEvent("result", result);
      sendEvent("done", { success: true });
    } catch (runErr: unknown) {
      clearTimeout(timeoutHandle);
      console.error(`[SSE] Research orchestration error for "${queryPreview}":`, runErr);
      sendEvent("error", { message: errorMessage(runErr) });
      sendEvent("done", { success: false, reason: "error" });
    } finally {
      finish();
    }
  });

  // ──────────────────────────────────────────────
  // Flowchart & Block Diagram Generation
  // ──────────────────────────────────────────────
  app.post("/api/research/diagram", async (req, res) => {
    try {
      const research: ResearchResult = req.body?.research;
      if (!research || !research.query) {
        return res.status(400).json({ error: "Missing or invalid research payload." });
      }

      const diagram = await withPersonalGeminiApiKey(
        personalApiKeyFromRequest(req),
        () => generateResearchDiagram(research)
      );
      return res.json(diagram);
    } catch (err: unknown) {
      console.error("Diagram generation error:", err);
      return res.status(500).json({ error: errorMessage(err) });
    }
  });

  // ──────────────────────────────────────────────
  // Follow-up Q&A Assistant Endpoint
  // ──────────────────────────────────────────────
  app.post("/api/research/qa", async (req, res) => {
    try {
      const { research, question, history } = req.body as {
        research: ResearchResult;
        question: string;
        history?: QaMessage[];
      };

      if (!research || !question || typeof question !== "string" || !question.trim()) {
        return res.status(400).json({ error: "Missing research context or question." });
      }

      const answer = await withPersonalGeminiApiKey(
        personalApiKeyFromRequest(req),
        () => answerResearchFollowUp({
          research,
          question: question.trim(),
          history: Array.isArray(history) ? history : [],
        })
      );

      return res.json({ answer });
    } catch (err: unknown) {
      console.error("Follow-up QA error:", err);
      return res.status(500).json({ error: errorMessage(err) });
    }
  });

  return app;
}
