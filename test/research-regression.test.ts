import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import http from "node:http";
import { createExpressApp } from "../server/app.js";
import { createResearchPlan } from "../server/planner.js";
import { retrieveInformation } from "../server/retriever.js";
import { processPdfDocuments } from "../server/pdfProcessor.js";
import { answerResearchFollowUp } from "../server/qaAssistant.js";
import { generateResearchDiagram } from "../server/diagramGenerator.js";
import {
  generateContentWithRetry,
  isRetryable,
  setGeminiClientForTesting,
} from "../server/geminiClient.js";
import type { GoogleGenAI } from "@google/genai";
import type { ResearchResult } from "../src/types.js";

process.env.GEMINI_API_KEY = "test-key";

function fakeClient(handler: (request: any) => Promise<any> | any): GoogleGenAI {
  return { models: { generateContent: async (request: any) => handler(request) } } as unknown as GoogleGenAI;
}

function resultFixture(): ResearchResult {
  return {
    query: "test", mode: "quick", isDeepResearch: false, hasPdf: false,
    plan: { intent: "test", mode: "quick", isComplex: false, hasPdf: false, subtasks: ["answer"], searchQueries: [] },
    sections: [{ id: "sec-1", title: "Answer", content: "A useful answer." }],
    sources: [], papers: [], videos: [], images: [], additionalResources: [],
    stats: { subtasksCompleted: 1, sourcesEvaluated: 0, uniqueFactsExtracted: 1, deduplicatedCount: 0, durationMs: 1 },
  };
}

afterEach(() => setGeminiClientForTesting(null));

test("short general and factual queries get a usable Quick plan", async () => {
  setGeminiClientForTesting(fakeClient(() => ({ text: JSON.stringify({ intent: "Answer", subtasks: ["answer"], searchQueries: ["test"] }) })));
  for (const query of ["What is artificial intelligence?", "When was the web invented?"]) {
    const plan = await createResearchPlan(query, "quick");
    assert.equal(plan.mode, "quick");
    assert.ok(plan.subtasks.length >= 1);
  }
});

test("programming, deep, academic, and comparative queries remain routable", async () => {
  setGeminiClientForTesting(fakeClient(() => ({ text: JSON.stringify({ intent: "Answer", subtasks: ["answer"], searchQueries: ["test"] }) })));
  const cases = [
    ["How do I implement an LRU cache in TypeScript?", "deep"],
    ["Analyze the economic and technical trade-offs of renewable grids", "deep"],
    ["What does current peer-reviewed evidence say about CRISPR off-target effects?", "academic"],
    ["Compare PostgreSQL and MySQL for a transactional application", "deep"],
  ] as const;
  for (const [query, mode] of cases) {
    const plan = await createResearchPlan(query, mode);
    assert.equal(plan.mode, mode);
    assert.ok(plan.subtasks.length >= 1);
    assert.ok(plan.searchQueries.length >= 1);
  }
});

test("a PDF with no extractable data returns an honest notice", async () => {
  const pdf = await processPdfDocuments([{ name: "empty.pdf", mimeType: "application/pdf", text: "", size: 1 }], "Summarize it");
  assert.equal(pdf.pdfReferences.length, 0);
  assert.match(pdf.extractedFindings, /empty|corrupted/i);
});

test("a valid PDF response reaches document evidence parsing", async () => {
  setGeminiClientForTesting(fakeClient(() => ({ text: "Finding.\n<<<REFERENCES_JSON\n[{\"id\":\"ref-1\",\"fileName\":\"paper.pdf\",\"sectionTitle\":\"Introduction\",\"pageNumber\":1,\"extractedFinding\":\"A supported finding\"}]\nREFERENCES_JSON>>>" })));
  const pdf = await processPdfDocuments([{ name: "paper.pdf", mimeType: "application/pdf", text: "[[PAGE 1]] A supported finding", size: 80 }], "What does it say?");
  assert.equal(pdf.pdfReferences[0]?.pageNumber, 1);
  assert.match(pdf.extractedFindings, /Finding/);
});

test("an empty PDF model response is reported as an extraction failure", async () => {
  setGeminiClientForTesting(fakeClient(() => ({ text: "" })));
  const pdf = await processPdfDocuments([{ name: "scan.pdf", mimeType: "application/pdf", text: "[[PAGE 1]] readable text", size: 80 }], "Summarize it");
  assert.match(pdf.processingError || "", /could not extract readable text/i);
  assert.equal(pdf.pdfReferences.length, 0);
});

test("resume PDF analysis is instructed to preserve candidate facts without invention", async () => {
  setGeminiClientForTesting(fakeClient((request) => {
    const prompt = JSON.stringify(request.contents);
    assert.match(prompt, /resume-refinement request/i);
    return { text: "Candidate experience extracted." };
  }));
  const pdf = await processPdfDocuments([{ name: "resume.pdf", mimeType: "application/pdf", text: "[[PAGE 1]] Candidate history", size: 80 }], "Refine and make this ATS friendly resume");
  assert.match(pdf.extractedFindings, /Candidate experience/i);
  assert.equal(pdf.processingError, undefined);
});

test("no-search-result responses remain explicitly unverified", async () => {
  setGeminiClientForTesting(fakeClient(() => ({ text: "A general overview.", candidates: [{ groundingMetadata: { groundingChunks: [] } }] })));
  const retrieved = await retrieveInformation("an obscure topic", ["an obscure topic"], "quick");
  assert.equal(retrieved.sources.length, 0);
  assert.match(retrieved.summaryOfFindings, /No external sources were returned/i);
});

test("follow-ups use the previous report context", async () => {
  setGeminiClientForTesting(fakeClient((request) => {
    assert.match(JSON.stringify(request.contents), /Original Research Topic/);
    return { text: "Grounded follow-up answer." };
  }));
  const answer = await answerResearchFollowUp({ research: resultFixture(), question: "What is the takeaway?", history: [] });
  assert.equal(answer, "Grounded follow-up answer.");
});

test("follow-ups preserve bounded document context instead of sending an unbounded report", async () => {
  const research = resultFixture();
  research.sections = [{ id: "long", title: "Long report", content: "r".repeat(30_000) }];
  research.hasPdf = true;
  research.pdfDocumentContext = "resume evidence: actual employer and dates";
  setGeminiClientForTesting(fakeClient((request) => {
    const prompt = JSON.stringify(request.contents);
    assert.match(prompt, /resume evidence: actual employer and dates/);
    assert.match(prompt, /Context truncated to keep this follow-up responsive/);
    assert.ok(prompt.length < 28_000);
    return { text: "Bounded grounded answer." };
  }));
  const answer = await answerResearchFollowUp({ research, question: "What should be improved?", history: [] });
  assert.equal(answer, "Bounded grounded answer.");
});

test("follow-up history is bounded before it reaches Gemini", async () => {
  const history = Array.from({ length: 8 }, (_, index) => ({
    id: `m-${index}`, role: index % 2 ? "assistant" as const : "user" as const,
    content: `message-${index}-` + "h".repeat(5_000), timestamp: index,
  }));
  setGeminiClientForTesting(fakeClient((request) => {
    const serialized = JSON.stringify(request.contents);
    assert.ok(serialized.length < 16_000);
    assert.match(serialized, /Context truncated to keep this follow-up responsive/);
    return { text: "History safely bounded." };
  }));
  const answer = await answerResearchFollowUp({ research: resultFixture(), question: "Continue", history });
  assert.equal(answer, "History safely bounded.");
});

test("permanent Gemini errors do not trigger model fallback", async () => {
  const models: string[] = [];
  setGeminiClientForTesting(fakeClient((request) => {
    models.push(request.model);
    throw new Error("400 invalid request");
  }));
  await assert.rejects(() => generateContentWithRetry({ contents: "test", timeoutMs: 500 }, 0));
  assert.deepEqual(models, ["gemini-3.5-flash-lite"]);
});

test("a temporary Gemini 503 is retried", async () => {
  let calls = 0;
  setGeminiClientForTesting(fakeClient(() => {
    calls += 1;
    if (calls === 1) throw new Error("503 service unavailable");
    return { text: "Recovered" };
  }));
  const response = await generateContentWithRetry({ contents: "test", preferredModel: "test-model", timeoutMs: 500 }, 1);
  assert.equal(response.text, "Recovered");
  assert.equal(calls, 2);
  assert.equal(isRetryable(new Error("503 unavailable")), true);
});

test("a persistent model failure is surfaced rather than fabricated", async () => {
  setGeminiClientForTesting(fakeClient(() => { throw new Error("400 invalid request"); }));
  await assert.rejects(() => generateContentWithRetry({ contents: "test", preferredModel: "test-model", timeoutMs: 500 }, 0));
});

test("an optional diagram failure does not invalidate completed research", async () => {
  setGeminiClientForTesting(fakeClient(() => { throw new Error("diagram model unavailable"); }));
  const diagram = await generateResearchDiagram(resultFixture());
  assert.match(diagram.mermaidCode, /^flowchart/);
});

test("SSE delivers result before done, including CRLF-safe frames", async () => {
  setGeminiClientForTesting(fakeClient((request) => {
    const prompt = typeof request.contents === "string" ? request.contents : JSON.stringify(request.contents);
    if (request.config?.responseMimeType === "application/json" && prompt.includes("Research Query")) {
      return { text: JSON.stringify({ sections: [{ title: "Answer", content: "Useful result." }], relatedQuestions: [] }) };
    }
    if (request.config?.responseMimeType === "application/json") {
      return { text: JSON.stringify({ intent: "Answer", subtasks: ["answer"], searchQueries: ["test"] }) };
    }
    return { text: "A concise ungrounded overview.", candidates: [{ groundingMetadata: { groundingChunks: [] } }] };
  }));

  const server = http.createServer(createExpressApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${address.port}/api/research/stream`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "What is AI?", mode: "quick" }),
    });
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.match(body, /event: result\n/);
    assert.match(body, /event: done\n/);
    assert.ok(body.indexOf("event: result") < body.indexOf("event: done"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});

test("an aborted SSE client does not crash the request handler", async () => {
  setGeminiClientForTesting(fakeClient(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
    return { text: JSON.stringify({ intent: "Answer", subtasks: ["answer"], searchQueries: ["test"] }) };
  }));
  const server = http.createServer(createExpressApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/research/stream`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "Will this cancel safely?", mode: "quick" }), signal: controller.signal,
    });
    await response.body?.getReader().read(); // initial SSE comment confirms the stream opened
    controller.abort();
    assert.equal(controller.signal.aborted, true);
    // Allow the in-flight mock pipeline to settle before afterEach removes it.
    await new Promise((resolve) => setTimeout(resolve, 400));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});
