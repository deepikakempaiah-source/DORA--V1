import { generateContentWithRetry, PRIMARY_MODEL } from "./geminiClient.js";
import {
  ResearchPlan,
  SourceCitation,
  PdfReference,
  StructuredSection,
  ContradictionItem,
} from "../src/types.js";

export interface SynthesisInput {
  query: string;
  plan: ResearchPlan;
  webSummary: string;
  sources: SourceCitation[];
  pdfAnalysis?: {
    fileNames: string[];
    documentSummary: string;
    extractedFindings: string;
    pdfReferences: PdfReference[];
  };
}

export interface SynthesisOutput {
  sections: StructuredSection[];
  contradictions?: ContradictionItem[];
  relatedQuestions?: string[];
}

export async function synthesizeResearchAnswer(
  input: SynthesisInput
): Promise<SynthesisOutput> {
  const mode = input.plan.mode || "deep";
  const isAcademic = mode === "academic";
  const isQuick = mode === "quick";
  const isResumeTask = /\b(resume|cv|curriculum vitae|ats|job application)\b/i.test(input.query);

  // Prepare source list description
  const formattedSources = input.sources
    .map((s) => `[${s.id}] "${s.title}" (${s.domain || s.sourceType} - ${s.quality?.academicCredibility || s.quality?.authorityTier || "Web"}): ${s.url}`)
    .join("\n");

  const formattedPdfInfo = input.pdfAnalysis && input.pdfAnalysis.fileNames.length > 0
    ? `\nATTACHED DOCUMENTS (${input.pdfAnalysis.fileNames.join(", ")}):
Document Summary:
${input.pdfAnalysis.documentSummary}

Extracted PDF Findings:
${input.pdfAnalysis.extractedFindings}

Specific Page References:
${input.pdfAnalysis.pdfReferences
  .map((r) => `- [PDF: ${r.fileName ? `${r.fileName} - ` : ""}Page ${r.pageNumber || "N/A"}, ${r.sectionTitle}]: ${r.extractedFinding}`)
  .join("\n")}`
    : "No document attached.";

  const systemInstruction = `You are DORA's Research Synthesis and Scientific Intelligence Engine.
Synthesize findings into a high-density, rigorously verified research report formatted in Markdown with structured sections according to the mode: "${mode.toUpperCase()}".

MANDATES:
1. ACCURACY & CLAIM-LEVEL CITATIONS:
   - Attach citations directly to specific factual claims, benchmark numbers, dates, and assertions using bracket numbers (e.g. "...yielded 94.2% accuracy under double-blind trials [1], [3].").
   - When citing attached PDFs, use exact tags: "[PDF: Page X]" or "[PDF: DocumentName - Page X, Section Y]".
   - Distinguish external web facts from attached PDF facts.
   - Never fabricate citations, statistics, or URLs. If evidence is weak or unverified, state that clearly.

2. STRUCTURED SECTIONS ADAPTED TO MODE:
   ${
     isQuick
       ? `For QUICK MODE, produce 2-3 concise, high-density sections:
   - "Direct Answer & Core Mechanism"
   - "Verified Empirical Data & Evidence"
   - "Summary & Practical Takeaway"`
       : isAcademic
       ? `For ACADEMIC MODE, produce research-oriented academic sections:
   - "Research Question & Literature Context": Theoretical background and foundational framing.
   - "Core Mechanisms & Methodology": Deep technical, architectural, or algorithmic analysis.
   - "Experimental Results & Benchmarks": Empirical findings, quantitative figures, ablation results.
   - "Limitations & Constraints": Known failure modes, computational bottlenecks, or bounds.
   - "Research Gaps & Open Problems": Unresolved questions and future research directions.
   - "Related Work & Comparative Solutions": Comparison of prevailing academic paradigms.`
       : `For DEEP MODE, produce comprehensive, structured sections:
   - "Executive Overview": Authoritative synthesis answering the core question.
   - "Key Empirical Discoveries": Bulleted discoveries with claim-level citations.
   - "Detailed Architecture & Mechanism": In-depth functional breakdown.
   - "Important Facts, Benchmarks & Metrics": Hard quantitative figures and parameters.
   - "Advantages & Critical Trade-offs": Nuanced evaluation of trade-offs.
   - "Practical Applications & Deployment": Production implementations and real-world adoption.
   - "Conclusion & Future Outlook": Forward-looking synthesis.`
   }

3. NO-REPETITION & RESEARCH COMPRESSION:
   - Merge duplicate points across sources.
   - Present completely fresh information in each section—never repeat sentences or previous summaries.
   - High information density; prune generic boilerplate or filler introductions.

4. CONTRADICTION & DISAGREEMENT DETECTION:
   - Actively analyze if credible sources differ or conflict regarding numbers, timelines, efficacy, or architecture.
   - If genuine contradictions exist, describe them clearly and populate the "contradictions" array. If no contradictions exist, return an empty array.

5. RELATED RESEARCH QUESTIONS:
   - Formulate 3-4 compelling, non-trivial follow-up research questions ("Explore Further") that logically expand on this research.

6. DOCUMENT EDITING REQUESTS:
   ${isResumeTask ? "- The attached resume is the primary evidence. Produce a practical ATS-friendly refinement: preserve every factual employer, date, skill, education record, and achievement; do not invent a target job, metrics, credentials, or experience. Clearly list any missing details the candidate must provide." : "- Not applicable unless the user explicitly asks for document editing."}

OUTPUT FORMAT:
Return strictly valid JSON with no markdown wrapping or code fences. Format:
{
  "sections": [
    {
      "title": "Section Title",
      "content": "Markdown body with citations [1], [2], [PDF: Page 4]"
    }
  ],
  "contradictions": [
    {
      "topic": "Specific point of contention",
      "claimA": "Position/number from first source",
      "sourceA": "Source citation or name",
      "claimB": "Contrasting position/number from second source",
      "sourceB": "Source citation or name",
      "analysis": "Explanation of why the discrepancy exists"
    }
  ],
  "relatedQuestions": [
    "Question 1",
    "Question 2",
    "Question 3"
  ]
}`;

  const prompt = `Research Query: "${input.query}"
Research Mode: ${mode.toUpperCase()}
Research Plan Subtasks: ${input.plan.subtasks.join("; ")}

VERIFIED SOURCES:
${formattedSources || "No external web sources retrieved."}

EXTERNAL RETRIEVAL FINDINGS:
${input.webSummary}

${formattedPdfInfo}

Please synthesize the research answer conforming strictly to the JSON schema.`;

  try {
    const response = await generateContentWithRetry({
      preferredModel: PRIMARY_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const text = response.text || "{}";
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      try {
        // Fix unescaped backslashes commonly occurring in technical formulas, paths, or LaTeX
        const sanitized = text.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
        parsed = JSON.parse(sanitized);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0].replace(/\\(?!["\\/bfnrtu])/g, "\\\\"));
          } catch {
            parsed = null;
          }
        }
      }
    }

    let sections: StructuredSection[] = [];
    if (parsed && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      sections = parsed.sections.map((s: { title: string; content: string }, idx: number) => ({
        id: `sec-${idx + 1}`,
        title: s.title || `Section ${idx + 1}`,
        content: s.content || "",
      }));
    } else {
      sections = [
        {
          id: "sec-1",
          title: isAcademic ? "Academic Research Synthesis" : "Research Synthesis",
          content: text,
        },
      ];
    }

    const contradictions: ContradictionItem[] = Array.isArray(parsed.contradictions)
      ? parsed.contradictions.filter((c: any) => c.topic && (c.claimA || c.claimB))
      : [];

    const relatedQuestions: string[] = Array.isArray(parsed.relatedQuestions)
      ? parsed.relatedQuestions.filter((q: any) => typeof q === "string" && q.trim().length > 0)
      : [
          `What are the most recent 2025-2026 developments in ${input.query.slice(0, 30)}?`,
          `How do computational overhead and real-world deployment costs compare?`,
          `What are the primary theoretical limitations and failure conditions?`,
        ];

    return {
      sections,
      contradictions: contradictions.length > 0 ? contradictions : undefined,
      relatedQuestions,
    };
  } catch (err) {
    console.error("Error in synthesizeResearchAnswer:", err);
    throw err;
  }
}

