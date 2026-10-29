import { generateContentWithRetry, PRIMARY_MODEL } from "./geminiClient.js";
import { PdfReference, UploadedFile } from "../src/types.js";

export interface MultiPdfAnalysisResult {
  fileNames: string[];
  documentSummary: string;
  extractedFindings: string;
  pdfReferences: PdfReference[];
  processingError?: string;
}

export async function processPdfDocuments(
  files: UploadedFile[],
  query: string
): Promise<MultiPdfAnalysisResult> {
  if (!files || files.length === 0) {
    return {
      fileNames: [],
      documentSummary: "No PDF documents provided.",
      extractedFindings: "",
      pdfReferences: [],
    };
  }

  const validFiles: UploadedFile[] = [];
  const invalidFileNotices: string[] = [];

  for (const file of files) {
    if (!file.text || typeof file.text !== "string" || file.text.trim().length < 10) {
      invalidFileNotices.push(`"${file.name}": No readable text was supplied. The PDF may be scanned, corrupted, or unsupported.`);
      continue;
    }

    if (file.size > 12 * 1024 * 1024 || file.text.length > 180_000) {
      invalidFileNotices.push(`"${file.name}": Document exceeds the supported processing limit.`);
      continue;
    }

    validFiles.push(file);
  }

  if (validFiles.length === 0) {
    return {
      fileNames: files.map((f) => f.name),
      documentSummary: "Uploaded document(s) could not be processed.",
      extractedFindings: invalidFileNotices.join("\n"),
      pdfReferences: [],
    };
  }

  const fileNames = validFiles.map((f) => f.name);

  const isResumeTask = /\b(resume|cv|curriculum vitae|ats|job application)\b/i.test(query);
  const systemInstruction = `You are DORA's Document Intelligence Engine.
Analyze the provided PDF document(s) with high academic and empirical precision.

OBJECTIVES:
1. Read all attached PDF documents thoroughly in the context of the user's research query: "${query}".
2. Identify core methodologies, key empirical data points, theorems, benchmarks, equations, and conclusions.
3. If the document is an image-only scan without an embedded text layer, clearly indicate that OCR is not supported for scanned images and summarize whatever metadata or readable text is accessible.
4. If multiple PDFs are attached, identify comparative relationships, differences in methodology, or contrasting findings.
5. Extract specific, claim-level findings with exact page numbers (e.g. Page 4, Section 3.2). Do NOT fabricate any page numbers or section titles.
6. Format extracted references in a JSON block at the very end of your response, strictly bounded by <<<REFERENCES_JSON and REFERENCES_JSON>>>:

<<<REFERENCES_JSON
[
  {
    "id": "ref-1",
    "fileName": "name-of-file.pdf",
    "sectionTitle": "Section name or header",
    "pageNumber": 1,
    "extractedFinding": "Specific finding or data point from this page",
    "relevanceToQuery": "Why relevant"
  }
]
REFERENCES_JSON>>>`;

  const parts: any[] = [{ text: `Documents Analyzed: ${fileNames.join(", ")}
Research Inquiry: "${query}"

${isResumeTask
  ? "This is a resume-refinement request. Extract only facts actually present: contact fields, roles, employers, dates, education, skills, achievements, and missing information. Preserve factual content exactly; do not invent target roles, metrics, credentials, or experience. Return an actionable ATS-friendly rewrite plan and highlight gaps that need user input."
  : "Please extract structured findings, cite exact page numbers, explain core terminology, and note any empirical discoveries or cross-document comparisons."}\n\n${validFiles.map((file) => `DOCUMENT: ${file.name}\n${file.text}`).join("\n\n")}` }];

  try {
    const response = await generateContentWithRetry({
      preferredModel: PRIMARY_MODEL,
      contents: { parts },
      config: {
        systemInstruction,
        temperature: 0.2,
      },
      // PDF understanding includes upload decoding and can take longer than a
      // text completion; the orchestration layer still has a total deadline.
      timeoutMs: 24_000,
    }, 0);

    const outputText = response.text || "";

    let pdfReferences: PdfReference[] = [];
    const jsonMatch =
      outputText.match(/<<<REFERENCES_JSON\s*([\s\S]*?)\s*REFERENCES_JSON>>>/) ||
      outputText.match(/```json\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          pdfReferences = parsed.map((p, idx) => ({
            id: p.id || `ref-${idx + 1}`,
            fileName: p.fileName || fileNames[0],
            sectionTitle: p.sectionTitle || "Key Section",
            pageNumber: p.pageNumber,
            extractedFinding: p.extractedFinding || "",
            relevanceToQuery: p.relevanceToQuery,
          }));
        }
      } catch (err) {
        console.warn("Failed to parse PDF references JSON:", err);
      }
    }

    const cleanedText = outputText
      .replace(/<<<REFERENCES_JSON[\s\S]*?REFERENCES_JSON>>>/, "")
      .replace(/```json\s*\[\s*\{[\s\S]*?\}\s*\]\s*```/, "")
      .trim();

    if (!cleanedText) {
      return {
        fileNames: files.map((f) => f.name),
        documentSummary: "No readable document content was returned.",
        extractedFindings: invalidFileNotices.join("\n"),
        pdfReferences: [],
        processingError: "DORA could not extract readable text from this PDF. If it is scanned or protected, upload a searchable, unencrypted PDF.",
      };
    }

    const finalFindings = invalidFileNotices.length > 0
      ? `${cleanedText}\n\n*Notice regarding other files:*\n${invalidFileNotices.join("\n")}`
      : cleanedText;

    return {
      fileNames: files.map((f) => f.name),
      documentSummary: cleanedText.slice(0, 600) + (cleanedText.length > 600 ? "..." : ""),
      extractedFindings: finalFindings,
      pdfReferences,
    };
  } catch (err) {
    console.error("Error in processPdfDocuments:", err);
    const msg = err instanceof Error ? err.message : String(err);
    const isScanOrUnsupported = msg.toLowerCase().includes("unsupported") || msg.toLowerCase().includes("image");

    return {
      fileNames: files.map((f) => f.name),
      documentSummary: "Document processing encountered an issue.",
      extractedFindings: isScanOrUnsupported
        ? "The uploaded document could not be processed. If this is a scanned PDF, note that OCR text extraction is not currently supported for image-only scans. Please upload a searchable PDF."
        : `Document analysis notice: ${msg}`,
      pdfReferences: [],
      processingError: isScanOrUnsupported
        ? "The PDF appears unsupported or image-only. Upload a searchable PDF; OCR is not available."
        : "DORA could not extract usable document evidence. Try a smaller searchable PDF and submit again.",
    };
  }
}
