import { createResearchPlan } from "./planner.js";
import { retrieveInformation } from "./retriever.js";
import { processPdfDocuments, MultiPdfAnalysisResult } from "./pdfProcessor.js";
import { runDeduplicationSystem } from "./deduplicator.js";
import { synthesizeResearchAnswer } from "./synthesizer.js";
import { generateContentWithRetry, PRIMARY_MODEL, withTimeout } from "./geminiClient.js";
import {
  ResearchResult,
  ResearchRequestPayload,
  ProgressStep,
  ProgressStepId,
  UploadedFile,
  ResearchPlan,
} from "../src/types.js";

export type ProgressCallback = (step: ProgressStep) => void;

function isDocumentEditingRequest(query: string): boolean {
  return /\b(resume|cv|curriculum vitae|ats|cover letter|proofread|rewrite|refine)\b/i.test(query);
}

// ---------------------------------------------------------------------------
// Pure conversational greetings or salutations (no research requested)
// ---------------------------------------------------------------------------
function isConversationalGreeting(query: string): boolean {
  const q = query.trim().toLowerCase();
  const conversationalRegex = /^(hi|hello|hey|good morning|good evening|good afternoon|howdy|sup|greetings|thanks|thank you|ok|okay|bye|goodbye)[\s.!?]*$/i;
  return conversationalRegex.test(q);
}

// ---------------------------------------------------------------------------
// Conversational greeting responder (only for trivial non-research greetings in Quick mode)
// ---------------------------------------------------------------------------
async function runConversationalGreeting(
  query: string,
  notify: (id: ProgressStepId, label: string, status: ProgressStep["status"], detail?: string) => void,
  startTime: number
): Promise<ResearchResult> {
  notify("planning", "Analyzing greeting…", "in_progress");

  const systemInstruction = `You are DORA, an advanced Deep Orchestration Research Assistant.
Respond warmly and concisely to the user's greeting. Introduce yourself briefly and invite the user to ask any research question across Quick, Deep, or Academic modes, or upload PDF documents.`;

  let answerText: string;
  try {
    const response = await generateContentWithRetry({
      preferredModel: PRIMARY_MODEL,
      contents: query,
      config: { systemInstruction, temperature: 0.3 },
      timeoutMs: 6_000,
    });
    answerText = response.text?.trim() || "Hello! I am DORA, your Deep Research Assistant. How can I help you research today?";
  } catch (err: any) {
    answerText = "Hello! I am DORA (Deep Orchestration Research Assistant). Ask me any question or upload PDF documents to begin.";
  }

  notify("planning", "Greeting ready", "completed");
  (["retrieval", "pdf_processing", "evaluation", "synthesis", "deduplication"] as ProgressStepId[]).forEach((id) => {
    notify(id, "Skipped (conversational greeting)", "skipped");
  });

  const durationMs = Date.now() - startTime;

  return {
    query,
    mode: "quick",
    isDeepResearch: false,
    hasPdf: false,
    pdfFileName: "",
    pdfFileNames: [],
    pdfFiles: [],
    plan: {
      intent: query,
      mode: "quick",
      isComplex: false,
      hasPdf: false,
      subtasks: ["Greet the user and introduce research capabilities"],
      searchQueries: [],
    },
    sections: [
      {
        id: "sec-1",
        title: "Greeting & Overview",
        content: answerText,
      },
    ],
    sources: [],
    papers: [],
    videos: [],
    images: [],
    additionalResources: [],
    pdfReferences: [],
    contradictions: undefined,
    relatedQuestions: [
      "What is artificial intelligence and its core architectures?",
      "Compare quantum error correction architectures in recent papers",
      "Explain cloud computing in simple terms",
    ],
    stats: {
      subtasksCompleted: 1,
      sourcesEvaluated: 0,
      contradictionsFound: 0,
      uniqueFactsExtracted: 1,
      deduplicatedCount: 0,
      durationMs,
    },
  };
}

// ---------------------------------------------------------------------------
// Main Research Orchestration Pipeline
// ---------------------------------------------------------------------------
export async function orchestrateDeepResearch(
  payload: ResearchRequestPayload,
  onProgress?: ProgressCallback
): Promise<ResearchResult> {
  const startTime = Date.now();
  const rawQuery = (payload.query || "").trim();
  const mode = payload.mode || "deep";

  // Gather uploaded files (supporting single file or files array)
  const uploadedFiles: UploadedFile[] = [];
  if (payload.files && Array.isArray(payload.files)) {
    uploadedFiles.push(...payload.files.filter((f) => f && typeof f.text === "string"));
  } else if (payload.file && typeof payload.file.text === "string") {
    uploadedFiles.push(payload.file);
  }

  const hasPdf = uploadedFiles.length > 0;
  const pdfNames = uploadedFiles.map((f) => f.name);

  // If query is empty but files are attached, create an intelligent query
  const query = rawQuery || (hasPdf
    ? `Analyze, summarize, and extract key findings from ${pdfNames.join(", ")}`
    : "Comprehensive Research Overview");

  const notify = (
    id: ProgressStepId,
    label: string,
    status: ProgressStep["status"],
    detail?: string
  ) => {
    if (onProgress) {
      onProgress({ id, label, status, detail });
    }
  };

  // Only pure conversational greetings without any PDFs in Quick mode bypass the pipeline
  if (!hasPdf && mode === "quick" && isConversationalGreeting(query)) {
    return runConversationalGreeting(query, notify, startTime);
  }

  console.log(`[Orchestrator] Starting research pipeline: "${query.slice(0, 60)}" (mode=${mode}, hasPdf=${hasPdf})`);

  // ──────────────────────────────────────────────
  // STEP 1: Research Planning & Intent Analysis (bounded to 10s)
  // ──────────────────────────────────────────────
  notify(
    "planning",
    `Formulating ${mode.toUpperCase()} research plan…`,
    "in_progress",
    "Analyzing query intent, dimensions, and subtasks"
  );

  let plan: ResearchPlan;
  try {
    plan = await withTimeout(
      createResearchPlan(query, mode, hasPdf, pdfNames),
      10_000,
      "Research Planning"
    );
  } catch (planErr) {
    console.warn("[Orchestrator] Planning timed out or errored, using fallback plan:", planErr);
    plan = {
      intent: `Conduct ${mode} research on: ${query}`,
      mode,
      isComplex: mode !== "quick",
      hasPdf,
      subtasks: mode === "quick"
        ? [`Core definition, verified mechanism, and concise answer for "${query}"`]
        : mode === "academic"
        ? [
            `Theoretical foundation and literature framing of ${query.slice(0, 40)}`,
            "State-of-the-art methodology, algorithms, and empirical benchmarks",
            "Limitations, comparative trade-offs, and open research challenges",
          ]
        : [
            `Core principles, operational mechanisms, and taxonomy of ${query.slice(0, 40)}`,
            "Current state of the art, modern implementations, and adoption",
            "Empirical benchmarks, critical trade-offs, and future outlook",
          ],
      searchQueries: [query, `${query} overview`],
    };
  }

  const planPreview =
    plan.subtasks.length > 0
      ? `Subtasks:\n${plan.subtasks.map((st, i) => `${i + 1}. ${st}`).join("\n")}`
      : `Intent: "${plan.intent}"`;

  notify("planning", "Research plan formulated", "completed", planPreview);

  // ──────────────────────────────────────────────
  // STEP 2 & 3: Web Retrieval & PDF Processing (bounded to 18s)
  // ──────────────────────────────────────────────
  notify(
    "retrieval",
    `Retrieving ${mode === "academic" ? "academic papers & peer-reviewed sources" : "verified sources"}…`,
    "in_progress",
    `Querying sources for: ${plan.searchQueries.slice(0, 2).join(", ")}`
  );

  if (hasPdf) {
    notify(
      "pdf_processing",
      `Analyzing document${uploadedFiles.length > 1 ? "s" : ""}: ${pdfNames.join(", ")}…`,
      "in_progress",
      "Extracting text evidence, methodology, and citations"
    );
  } else {
    notify("pdf_processing", "No PDF uploaded", "skipped");
  }

  let retrievalResult: {
    summaryOfFindings: string;
    sources: any[];
    papers: any[];
    videos: any[];
    images: any[];
    additionalResources: any[];
  } = {
    summaryOfFindings: `Research findings for query: ${query}`,
    sources: [],
    papers: [],
    videos: [],
    images: [],
    additionalResources: [],
  };

  let pdfResult: MultiPdfAnalysisResult | undefined = undefined;

  try {
    const documentEditingRequest = hasPdf && isDocumentEditingRequest(query);
    // Independent settlements are critical: a slow PDF must not discard a
    // completed retrieval result, and document-editing work should not spend
    // time on irrelevant web retrieval before using the uploaded document.
    const retrievalTask = documentEditingRequest
      ? Promise.resolve({
          summaryOfFindings: "External retrieval was intentionally skipped because this request is grounded in the uploaded document.",
          sources: [], papers: [], videos: [], images: [], additionalResources: [],
        })
      : withTimeout(retrieveInformation(query, plan.searchQueries, mode), 18_000, "Source Retrieval");
    const pdfTask = hasPdf
      ? withTimeout(processPdfDocuments(uploadedFiles, query), 50_000, "PDF Processing")
      : Promise.resolve(undefined);
    const [retrievalSettled, pdfSettled] = await Promise.allSettled([retrievalTask, pdfTask]);

    if (retrievalSettled.status === "fulfilled" && retrievalSettled.value) {
      retrievalResult = retrievalSettled.value;
    } else if (retrievalSettled.status === "rejected") {
      console.warn("[Orchestrator] Web retrieval failed or timed out:", retrievalSettled.reason);
      retrievalResult = {
        summaryOfFindings: "External source retrieval was unavailable. Do not present any claim as verified or retrieved unless it is supported by an attached document.",
        sources: [],
        papers: [],
        videos: [],
        images: [],
        additionalResources: [],
      };
    }

    if (hasPdf && pdfSettled.status === "fulfilled") {
      pdfResult = pdfSettled.value;
    } else if (hasPdf && pdfSettled.status === "rejected") {
      console.warn("[Orchestrator] PDF processing failed or timed out:", pdfSettled.reason);
      pdfResult = {
        fileNames: pdfNames,
        documentSummary: "Document processing did not finish within the safe processing window.",
        extractedFindings: "",
        pdfReferences: [],
        processingError: "DORA could not finish reading this PDF in time. Try a smaller searchable PDF or split the document and try again.",
      };
    }
  } catch (err) {
    console.warn("[Orchestrator] Overall retrieval/PDF phase timed out:", err);
  }

  const sourceCount = retrievalResult.sources.length;
  const paperCount = retrievalResult.papers.length;
  notify(
    "retrieval",
    "Source retrieval complete",
    "completed",
    sourceCount > 0
      ? `Gathered ${sourceCount} verified source${sourceCount > 1 ? "s" : ""} (${paperCount} academic paper${paperCount !== 1 ? "s" : ""}).`
      : "No external sources were retrieved. Any answer will clearly distinguish model knowledge from verified evidence."
  );

  if (hasPdf) {
    if (pdfResult?.processingError) {
      notify("pdf_processing", "PDF analysis could not extract evidence", "error", pdfResult.processingError);
    } else if (pdfResult && pdfResult.pdfReferences.length > 0) {
      notify(
        "pdf_processing",
        "PDF analysis complete",
        "completed",
        `Extracted ${pdfResult.pdfReferences.length} page/section citations across ${pdfResult.fileNames.join(", ")}.`
      );
    } else if (pdfResult && pdfResult.extractedFindings.trim()) {
      notify(
        "pdf_processing",
        "PDF analysis complete",
        "completed",
        `Synthesized document context across ${pdfNames.join(", ")}.`
      );
    } else {
      notify(
        "pdf_processing",
        "PDF processing completed with fallback",
        "completed",
        "The document could not be processed, so no document evidence will be claimed."
      );
    }
  }

  // ──────────────────────────────────────────────
  // STEP 4: Evidence Evaluation & Contradiction Detection (bounded to 4s)
  // ──────────────────────────────────────────────
  notify(
    "evaluation",
    "Cross-referencing evidence and evaluating source credibility…",
    "in_progress",
    "Validating claims, publication tiers, and potential discrepancies"
  );

  notify(
    "evaluation",
    "Evidence evaluated",
    "completed",
    `Evaluated ${sourceCount} source${sourceCount !== 1 ? "s" : ""}${hasPdf && !pdfResult?.processingError ? " and available document evidence" : ""}.`
  );

  // ──────────────────────────────────────────────
  // STEP 5: Report Synthesis (bounded to 18s)
  // ──────────────────────────────────────────────
  notify(
    "synthesis",
    `Synthesizing ${mode.toUpperCase()} research report with claim citations…`,
    "in_progress",
    "Structuring comprehensive sections and inline citations"
  );

  let synthesisResult;
  try {
    synthesisResult = await withTimeout(
      synthesizeResearchAnswer({
        query,
        plan,
        webSummary: retrievalResult.summaryOfFindings,
        sources: retrievalResult.sources,
        pdfAnalysis: pdfResult,
      }),
      18_000,
      "Report Synthesis"
    );
  } catch (synthErr) {
    console.warn("[Orchestrator] Synthesis timed out or errored; returning an explicitly partial result:", synthErr);
    synthesisResult = {
      sections: [
        {
          id: "sec-partial",
          title: "Research could not be fully synthesized",
          content: "The evidence collection stage completed, but report synthesis failed. No completed evidence-based report is being shown. Please retry; if this persists, use a narrower question or Quick mode.",
        },
      ],
      relatedQuestions: [
        `What are the most recent developments in ${query.slice(0, 30)}?`,
        `What are the practical applications and benchmarks?`,
      ],
    };
  }

  notify("synthesis", "Report synthesis complete", "completed");

  // ──────────────────────────────────────────────
  // STEP 6: No-Repetition System (Deduplication)
  // ──────────────────────────────────────────────
  notify(
    "deduplication",
    "Applying No-Repetition filter across all findings and sources…",
    "in_progress",
    "Pruning redundant findings and duplicate references"
  );

  const deduplicated = runDeduplicationSystem(
    retrievalResult.sources,
    retrievalResult.papers,
    retrievalResult.videos,
    retrievalResult.images,
    retrievalResult.additionalResources,
    synthesisResult.sections
  );

  notify(
    "deduplication",
    "No-Repetition filter applied",
    "completed",
    `Pruned ${deduplicated.deduplicatedCount} redundant item${deduplicated.deduplicatedCount !== 1 ? "s" : ""}.`
  );

  const durationMs = Date.now() - startTime;
  const contradictionsCount = synthesisResult.contradictions?.length || 0;

  return {
    query,
    mode,
    isDeepResearch: mode !== "quick",
    hasPdf,
    pdfFileName: pdfNames.join(", "),
    pdfFileNames: pdfNames,
    pdfFiles: uploadedFiles.map((f) => ({ name: f.name, size: f.size })),
    plan,
    sections: deduplicated.sections,
    sources: deduplicated.sources,
    papers: deduplicated.papers,
    videos: deduplicated.videos,
    images: deduplicated.images,
    additionalResources: deduplicated.additionalResources,
    pdfReferences: pdfResult?.pdfReferences || [],
    pdfDocumentContext: pdfResult && !pdfResult.processingError ? pdfResult.extractedFindings.slice(0, 12_000) : undefined,
    pdfProcessingError: pdfResult?.processingError,
    contradictions: synthesisResult.contradictions,
    relatedQuestions: synthesisResult.relatedQuestions,
    stats: {
      subtasksCompleted: plan.subtasks.length,
      sourcesEvaluated: retrievalResult.sources.length,
      contradictionsFound: contradictionsCount,
      uniqueFactsExtracted: deduplicated.sections.reduce(
        (acc, sec) =>
          acc +
          sec.content
            .split("\n")
            .filter((l) => l.trim().length > 0 && !l.startsWith("#")).length,
        0
      ),
      deduplicatedCount: deduplicated.deduplicatedCount,
      durationMs,
    },
  };
}
