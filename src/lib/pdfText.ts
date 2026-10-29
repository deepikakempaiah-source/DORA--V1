import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;
export const MAX_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_DOCUMENT_TEXT = 180_000;

export async function extractPdfText(file: File): Promise<{ text: string; pageCount: number }> {
  if (file.size > MAX_PDF_BYTES) throw new Error("This PDF exceeds the 12 MB supported limit.");
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const content = await pdf.getPage(page).then((p) => p.getTextContent());
    const text = content.items.map((item: any) => typeof item.str === "string" ? item.str : "").join(" ").trim();
    if (text) pages.push(`[[PAGE ${page}]]\n${text}`);
    if (pages.join("\n").length > MAX_DOCUMENT_TEXT) break;
  }
  const text = pages.join("\n\n").slice(0, MAX_DOCUMENT_TEXT);
  if (!text.trim()) throw new Error("No readable text was found. This looks like a scanned or image-only PDF; OCR is not available.");
  return { text, pageCount: pdf.numPages };
}
