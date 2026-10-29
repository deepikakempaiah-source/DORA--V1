import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import {
  ResearchResult,
  QaMessage,
  DiagramResult,
} from "../types.js";
import { ResearchDiagramViewer } from "./ResearchDiagramViewer.js";
import { FollowUpQa } from "./FollowUpQa.js";
import { generateDocxBlob } from "../lib/docxExport.js";
import {
  FileText,
  ExternalLink,
  BookOpen,
  Video,
  Copy,
  Check,
  RotateCcw,
  Layers,
  Download,
  Printer,
  Workflow,
  ChevronDown,
  AlertTriangle,
  Database,
  ShieldCheck,
  Compass,
  ArrowRight,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext.js";

interface ResearchViewerProps {
  result: ResearchResult;
  onReset: () => void;
  qaMessages: QaMessage[];
  onAddQaMessage: (msg: QaMessage) => void;
  diagram?: DiagramResult;
  onDiagramGenerated: (diagram: DiagramResult) => void;
  personalGeminiApiKey?: string;
}

export const ResearchViewer: React.FC<ResearchViewerProps> = ({
  result,
  onReset,
  qaMessages,
  onAddQaMessage,
  diagram,
  onDiagramGenerated,
  personalGeminiApiKey,
}) => {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  const generateMarkdownReport = (): string => {
    let md = `# Research Report: ${result.query}\n\n`;
    md += `*Generated: ${new Date().toLocaleString()}*\n`;
    md += `*Mode: ${result.mode?.toUpperCase() || (result.isDeepResearch ? "Deep Research" : "Direct Research")}*\n`;

    if (result.hasPdf) {
      md += `*Document Context: ${result.pdfFileName}*\n`;
    }
    md += `\n---\n\n`;

    for (const section of result.sections) {
      md += `## ${section.title}\n\n${section.content}\n\n`;
    }

    if (result.contradictions && result.contradictions.length > 0) {
      md += `## Conflicting Information & Disagreements\n\n`;
      for (const c of result.contradictions) {
        md += `### Disagreement: ${c.topic}\n`;
        md += `- **Position A** (${c.sourceA}): ${c.claimA}\n`;
        md += `- **Position B** (${c.sourceB}): ${c.claimB}\n`;
        md += `- *Synthesis & Context*: ${c.analysis}\n\n`;
      }
    }

    if (result.hasPdf && result.pdfReferences && result.pdfReferences.length > 0) {
      md += `## Document References (${result.pdfFileName})\n\n`;
      for (const p of result.pdfReferences) {
        md += `- **${p.sectionTitle}** ${p.pageNumber ? `(Page ${p.pageNumber})` : ""}: ${p.extractedFinding}\n`;
      }
      md += `\n`;
    }

    if (result.papers.length > 0) {
      md += `## Relevant Academic & IEEE Papers\n\n`;
      for (const p of result.papers) {
        md += `- **${p.title}** (${p.publication || "Academic"}${p.year ? `, ${p.year}` : ""}): [Link](${p.url})\n`;
        if (p.relevance) md += `  *Relevance*: ${p.relevance}\n`;
        if (p.keyContribution) md += `  *Contribution*: ${p.keyContribution}\n`;
      }
      md += `\n`;
    }

    if (result.additionalResources && result.additionalResources.length > 0) {
      md += `## Discovered Tools, Datasets & Code\n\n`;
      for (const r of result.additionalResources) {
        md += `- **${r.title}** (${r.category || r.type}): [Link](${r.url}) - ${r.description || ""}\n`;
      }
      md += `\n`;
    }

    if (result.sources.length > 0) {
      md += `## Verified Sources & Citations\n\n`;
      for (const s of result.sources) {
        md += `[${s.id}] **${s.title}**: ${s.url} (${s.quality?.academicCredibility || s.domain || "Web"})\n`;
      }
      md += `\n`;
    }

    if (diagram) {
      md += `## Concept Architecture & Flowchart\n\n`;
      md += `\`\`\`mermaid\n${diagram.mermaidCode}\n\`\`\`\n\n`;
      if (diagram.explanation) {
        md += `*${diagram.explanation}*\n\n`;
      }
    }

    if (qaMessages.length > 0) {
      md += `## Follow-up Inquiries (Q&A)\n\n`;
      for (const qa of qaMessages) {
        if (qa.role === "user") {
          md += `**Q: ${qa.content}**\n\n`;
        } else {
          md += `A: ${qa.content}\n\n`;
        }
      }
    }

    return md;
  };

  const generatePlainTextReport = (): string => {
    let txt = `======================================================\n`;
    txt += `RESEARCH REPORT: ${result.query.toUpperCase()}\n`;
    txt += `Generated: ${new Date().toLocaleString()} | Mode: ${result.mode?.toUpperCase() || "DEEP"}\n`;
    if (result.hasPdf) {
      txt += `Document Context: ${result.pdfFileName}\n`;
    }
    txt += `======================================================\n\n`;

    for (const section of result.sections) {
      txt += `[${section.title.toUpperCase()}]\n`;
      txt += `${section.content.replace(/\[\d+\]/g, "")}\n\n`;
    }

    if (result.contradictions && result.contradictions.length > 0) {
      txt += `[CONFLICTING INFORMATION & DISAGREEMENTS]\n`;
      for (const c of result.contradictions) {
        txt += `Topic: ${c.topic}\n`;
        txt += `• Claim A (${c.sourceA}): ${c.claimA}\n`;
        txt += `• Claim B (${c.sourceB}): ${c.claimB}\n`;
        txt += `• Context: ${c.analysis}\n\n`;
      }
    }

    if (result.papers.length > 0) {
      txt += `[ACADEMIC PAPERS & PROCEEDINGS]\n`;
      for (const p of result.papers) {
        txt += `- ${p.title} (${p.publication || "Academic"}${p.year ? `, ${p.year}` : ""}): ${p.url}\n`;
      }
      txt += `\n`;
    }

    if (result.sources.length > 0) {
      txt += `[VERIFIED SOURCES & CITATIONS]\n`;
      for (const s of result.sources) {
        txt += `[${s.id}] ${s.title}: ${s.url}\n`;
      }
      txt += `\n`;
    }

    if (qaMessages.length > 0) {
      txt += `[FOLLOW-UP QUESTIONS & ANSWERS]\n`;
      for (const qa of qaMessages) {
        txt += `${qa.role === "user" ? "Q" : "A"}: ${qa.content}\n\n`;
      }
    }

    return txt;
  };

  const copyFullReport = () => {
    const reportText = generateMarkdownReport();
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    downloadBlob(blob, fileName);
  };

  const safeFilename = (result.query.slice(0, 30) || "research_report").replace(/[^a-zA-Z0-9]/g, "_");

  const handleDownloadDocx = async () => {
    try {
      setIsExportingDocx(true);
      setShowExportMenu(false);
      const blob = await generateDocxBlob(result, qaMessages);
      downloadBlob(blob, `${safeFilename}.docx`);
    } catch (err) {
      console.error("DOCX export error:", err);
      alert("Failed to export Word document.");
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleDownloadMd = () => {
    downloadFile(generateMarkdownReport(), `${safeFilename}.md`, "text/markdown;charset=utf-8");
    setShowExportMenu(false);
  };

  const handleDownloadTxt = () => {
    downloadFile(generatePlainTextReport(), `${safeFilename}.txt`, "text/plain;charset=utf-8");
    setShowExportMenu(false);
  };

  const handleDownloadPdf = () => {
    setShowExportMenu(false);
    window.print();
  };

  const scrollToDiagram = () => {
    const el = document.getElementById("research-diagram-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const scrollToQa = (q?: string) => {
    const el = document.getElementById("followup-qa-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      if (q) {
        const input = document.getElementById("followup-question-input") as HTMLInputElement;
        if (input) {
          input.value = q;
          input.focus();
        }
      }
    }
  };

  return (
    <div id="research-results-container" className="w-full max-w-4xl mx-auto my-6 space-y-8">
      {/* Header Info & Controls */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 ${
          isDark ? "border-neutral-800" : "border-neutral-200"
        }`}
      >
        <div>
          <div className="flex items-center gap-2 text-xs font-mono mb-1 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded text-[11px] uppercase font-semibold border ${
                isDark
                  ? "bg-neutral-900 border-neutral-800 text-neutral-300"
                  : "bg-neutral-100 border-neutral-300 text-neutral-800"
              }`}
            >
              {result.mode || (result.isDeepResearch ? "Deep" : "Quick")} Research
            </span>
            {result.hasPdf && (
              <span
                className={`px-2 py-0.5 rounded text-[11px] flex items-center gap-1 border ${
                  isDark
                    ? "bg-neutral-900 border-neutral-800 text-neutral-300"
                    : "bg-neutral-100 border-neutral-300 text-neutral-800"
                }`}
              >
                <FileText className={`w-3 h-3 ${isDark ? "text-neutral-400" : "text-neutral-600"}`} />
                <span>PDF: {result.pdfFileName}</span>
              </span>
            )}
          </div>
          <h1
            className={`text-xl font-medium leading-snug ${
              isDark ? "text-neutral-100" : "text-neutral-900"
            }`}
          >
            {result.query}
          </h1>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Quick Copy Report Button */}
          <motion.button
            id="copy-report-button"
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={copyFullReport}
            title="Copy whole research report to clipboard"
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors shadow-sm cursor-pointer ${
              isDark
                ? "text-neutral-200 hover:text-white bg-[#18181b] hover:bg-[#242428] border border-neutral-700/80 hover:border-neutral-600"
                : "text-neutral-800 hover:text-black bg-white hover:bg-neutral-100 border border-neutral-300 hover:border-neutral-400"
            }`}
          >
            {copied ? (
              <Check className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-800"}`} />
            ) : (
              <Copy className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-600"}`} />
            )}
            <span>{copied ? "Copied" : "Copy"}</span>
          </motion.button>

          {/* Export Dropdown (PDF, DOCX, .MD, .TXT) */}
          <div id="export-dropdown-container" className="relative">
            <motion.button
              id="export-options-button"
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={isExportingDocx}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors shadow-sm disabled:opacity-50 cursor-pointer ${
                isDark
                  ? "text-neutral-200 hover:text-white bg-[#18181b] hover:bg-[#242428] border border-neutral-700/80 hover:border-neutral-600"
                  : "text-neutral-800 hover:text-black bg-white hover:bg-neutral-100 border border-neutral-300 hover:border-neutral-400"
              }`}
            >
              <Download className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-600"}`} />
              <span>{isExportingDocx ? "Exporting..." : "Export"}</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 ${
                  isDark ? "text-neutral-400" : "text-neutral-500"
                } ${showExportMenu ? "rotate-180" : ""}`}
              />
            </motion.button>

            <AnimatePresence>
              {showExportMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className={`absolute right-0 top-full mt-1.5 w-52 rounded-md shadow-2xl py-1.5 z-30 text-xs border ${
                    isDark
                      ? "bg-[#18181b] border-neutral-700/80"
                      : "bg-white border-neutral-200 shadow-neutral-300/50"
                  }`}
                  onClick={() => setShowExportMenu(false)}
                >
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                      isDark
                        ? "text-neutral-200 hover:text-white hover:bg-[#27272a]"
                        : "text-neutral-800 hover:text-black hover:bg-neutral-100"
                    }`}
                  >
                    <Printer className={`w-3.5 h-3.5 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
                    <span>Download as PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadDocx}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                      isDark
                        ? "text-neutral-200 hover:text-white hover:bg-[#27272a]"
                        : "text-neutral-800 hover:text-black hover:bg-neutral-100"
                    }`}
                  >
                    <FileText className={`w-3.5 h-3.5 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
                    <span>Download as Word (.DOCX)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadMd}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                      isDark
                        ? "text-neutral-200 hover:text-white hover:bg-[#27272a]"
                        : "text-neutral-800 hover:text-black hover:bg-neutral-100"
                    }`}
                  >
                    <FileText className={`w-3.5 h-3.5 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
                    <span>Download as Markdown (.MD)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadTxt}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                      isDark
                        ? "text-neutral-200 hover:text-white hover:bg-[#27272a]"
                        : "text-neutral-800 hover:text-black hover:bg-neutral-100"
                    }`}
                  >
                    <Download className={`w-3.5 h-3.5 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
                    <span>Download as Text (.TXT)</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Flowchart Jump */}
          <motion.button
            id="jump-to-diagram-btn"
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={scrollToDiagram}
            title="Convert to Flowchart or Block Diagram"
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors shadow-sm cursor-pointer ${
              isDark
                ? "text-neutral-200 hover:text-white bg-[#18181b] hover:bg-[#242428] border border-neutral-700/80 hover:border-neutral-600"
                : "text-neutral-800 hover:text-black bg-white hover:bg-neutral-100 border border-neutral-300 hover:border-neutral-400"
            }`}
          >
            <Workflow className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-600"}`} />
            <span>Diagram</span>
          </motion.button>

          {/* New Research Reset */}
          <motion.button
            id="new-research-button"
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onReset}
            className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors shadow-sm cursor-pointer ${
              isDark
                ? "text-neutral-200 hover:text-white bg-[#18181b] hover:bg-[#242428] border border-neutral-700/80 hover:border-neutral-600"
                : "text-neutral-800 hover:text-black bg-white hover:bg-neutral-100 border border-neutral-300 hover:border-neutral-400"
            }`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-600"}`} />
            <span>New Research</span>
          </motion.button>
        </div>
      </div>

      {/* Execution Stats Bar */}
      <div
        className={`grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md p-3.5 text-xs shadow-sm border ${
          isDark
            ? "bg-[#18181b] border-neutral-800"
            : "bg-neutral-50 border-neutral-200"
        }`}
      >
        <div>
          <span className={`block ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>Subtasks Completed</span>
          <span className={`font-mono font-medium ${isDark ? "text-neutral-200" : "text-neutral-900"}`}>
            {result.stats.subtasksCompleted}
          </span>
        </div>
        <div>
          <span className={`block ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>Sources Evaluated</span>
          <span className={`font-mono font-medium ${isDark ? "text-neutral-200" : "text-neutral-900"}`}>
            {result.stats.sourcesEvaluated}
          </span>
        </div>
        <div>
          <span className={`block ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>Repetitions Filtered</span>
          <span className={`font-mono font-medium ${isDark ? "text-neutral-200" : "text-neutral-900"}`}>
            {result.stats.deduplicatedCount}
          </span>
        </div>
        <div>
          <span className={`block ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>Execution Time</span>
          <span className={`font-mono font-medium ${isDark ? "text-neutral-200" : "text-neutral-900"}`}>
            {(result.stats.durationMs / 1000).toFixed(1)}s
          </span>
        </div>
      </div>

      {/* Structured Sections */}
      <div className="space-y-6">
        {result.sections.map((section) => (
          <section
            key={section.id}
            id={`section-${section.id}`}
            className={`border-b pb-6 last:border-b-0 ${
              isDark ? "border-neutral-900" : "border-neutral-200"
            }`}
          >
            <h2
              className={`text-base font-medium mb-3 flex items-center gap-2 ${
                isDark ? "text-neutral-100" : "text-neutral-900"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isDark ? "bg-neutral-400" : "bg-neutral-600"}`} />
              {section.title}
            </h2>
            <div className={`text-sm leading-relaxed space-y-3 max-w-none ${isDark ? "text-neutral-300" : "text-neutral-800"}`}>
              <Markdown
                components={{
                  p: ({ children }) => (
                    <p className={`mb-3 leading-relaxed ${isDark ? "text-neutral-300" : "text-neutral-800"}`}>
                      {children}
                    </p>
                  ),
                  ul: ({ children }) => (
                    <ul className={`list-disc pl-5 space-y-1.5 my-2 ${isDark ? "text-neutral-300" : "text-neutral-800"}`}>
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className={`list-decimal pl-5 space-y-1.5 my-2 ${isDark ? "text-neutral-300" : "text-neutral-800"}`}>
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => (
                    <strong className={`font-medium ${isDark ? "text-neutral-100" : "text-neutral-900"}`}>
                      {children}
                    </strong>
                  ),
                  code: ({ children }) => (
                    <code
                      className={`font-mono text-xs px-1 py-0.5 rounded break-words ${
                        isDark
                          ? "bg-neutral-900 text-neutral-200"
                          : "bg-neutral-100 text-neutral-800 border border-neutral-300"
                      }`}
                    >
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="overflow-x-auto p-3 rounded my-2 text-xs font-mono max-w-full bg-neutral-900 text-neutral-100 border border-neutral-800">
                      {children}
                    </pre>
                  ),
                  table: ({ children }) => (
                    <div className="w-full overflow-x-auto my-3 rounded border border-neutral-800">
                      <table className="w-full text-xs text-left border-collapse">
                        {children}
                      </table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className={`p-2.5 font-semibold border-b ${isDark ? "bg-neutral-900/80 border-neutral-800 text-neutral-200" : "bg-neutral-100 border-neutral-200 text-neutral-800"}`}>
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className={`p-2.5 border-b ${isDark ? "border-neutral-900 text-neutral-300" : "border-neutral-200 text-neutral-700"}`}>
                      {children}
                    </td>
                  ),
                }}
              >
                {section.content}
              </Markdown>
            </div>
          </section>
        ))}
      </div>

      {/* Contradiction Detection & Disagreements Section */}
      {result.contradictions && result.contradictions.length > 0 && (
        <section
          id="contradictions-section"
          className={`border-t pt-6 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
        >
          <h2
            className={`text-base font-medium mb-3 flex items-center gap-2 ${
              isDark ? "text-neutral-100" : "text-neutral-900"
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Conflicting Information &amp; Disagreements</span>
          </h2>
          <p className={`text-xs mb-3 ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
            DORA detected divergent empirical data, contrasting claims, or differing timelines across credible sources:
          </p>
          <div className="space-y-3">
            {result.contradictions.map((item, idx) => (
              <div
                key={idx}
                className={`border rounded p-3 text-xs space-y-2 ${
                  isDark
                    ? "bg-neutral-950 border-neutral-800"
                    : "bg-amber-50/40 border-amber-200"
                }`}
              >
                <div className={`font-medium ${isDark ? "text-neutral-200" : "text-neutral-900"}`}>
                  Topic: <span className={isDark ? "text-white" : "text-black"}>{item.topic}</span>
                </div>
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 rounded ${
                    isDark ? "bg-neutral-900/50" : "bg-white border border-amber-200/60"
                  }`}
                >
                  <div>
                    <span className={`block text-[11px] ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
                      Position A ({item.sourceA})
                    </span>
                    <span className={isDark ? "text-neutral-300" : "text-neutral-800"}>{item.claimA}</span>
                  </div>
                  <div>
                    <span className={`block text-[11px] ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
                      Position B ({item.sourceB})
                    </span>
                    <span className={isDark ? "text-neutral-300" : "text-neutral-800"}>{item.claimB}</span>
                  </div>
                </div>
                {item.analysis && (
                  <p
                    className={`text-[11px] leading-relaxed pt-1 border-t ${
                      isDark
                        ? "text-neutral-400 border-neutral-900"
                        : "text-neutral-700 border-amber-200/50"
                    }`}
                  >
                    <span className={`font-medium ${isDark ? "text-neutral-300" : "text-neutral-900"}`}>
                      Context / Synthesis:
                    </span>{" "}
                    {item.analysis}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Explore Further / Related Research Questions */}
      {result.relatedQuestions && result.relatedQuestions.length > 0 && (
        <section
          id="explore-further-section"
          className={`border-t pt-6 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
        >
          <h2
            className={`text-base font-medium mb-2 flex items-center gap-2 ${
              isDark ? "text-neutral-100" : "text-neutral-900"
            }`}
          >
            <Compass className={`w-4 h-4 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
            <span>Explore Further</span>
          </h2>
          <p className={`text-xs mb-3 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
            Click any question to investigate further in the follow-up Q&amp;A:
          </p>
          <div className="flex flex-col gap-1.5">
            {result.relatedQuestions.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => scrollToQa(q)}
                className={`text-left text-xs p-2.5 rounded-md transition-colors flex items-center justify-between group shadow-sm cursor-pointer ${
                  isDark
                    ? "text-neutral-200 hover:text-white bg-[#18181b] hover:bg-[#222226] border border-neutral-700/80 hover:border-neutral-600"
                    : "text-neutral-800 hover:text-black bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <span>&bull; {q}</span>
                <ArrowRight
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isDark
                      ? "text-neutral-400 group-hover:text-neutral-200"
                      : "text-neutral-400 group-hover:text-black"
                  }`}
                />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* PDF References (When PDF was processed) */}
      {result.hasPdf && result.pdfProcessingError && (
        <section
          className={`border-t pt-6 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
        >
          <div className={`rounded-md border p-3 text-xs leading-relaxed ${
            isDark ? "border-amber-900/60 bg-amber-950/20 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}>
            <strong>Document evidence was not available.</strong> {result.pdfProcessingError}
          </div>
        </section>
      )}
      {result.hasPdf && result.pdfReferences && result.pdfReferences.length > 0 && (
        <section
          id="pdf-references-section"
          className={`border-t pt-6 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
        >
          <h2
            className={`text-base font-medium mb-3 flex items-center gap-2 ${
              isDark ? "text-neutral-100" : "text-neutral-900"
            }`}
          >
            <FileText className={`w-4 h-4 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
            <span>Document References ({result.pdfFileName})</span>
          </h2>
          <div className="space-y-2.5">
            {result.pdfReferences.map((ref, idx) => (
              <div
                key={ref.id || idx}
                className={`rounded-md p-3 text-xs shadow-sm border ${
                  isDark
                    ? "bg-[#18181b] border-neutral-800"
                    : "bg-white border-neutral-200"
                }`}
              >
                <div
                  className={`flex items-center justify-between font-mono mb-1 ${
                    isDark ? "text-neutral-400" : "text-neutral-600"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {ref.fileName && (
                      <span className={`text-[11px] ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                        {ref.fileName} &bull;
                      </span>
                    )}
                    <span className={isDark ? "text-neutral-200" : "text-neutral-900 font-medium"}>
                      {ref.sectionTitle}
                    </span>
                  </div>
                  {ref.pageNumber && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] border ${
                        isDark
                          ? "bg-[#27272a] border-neutral-700 text-neutral-300"
                          : "bg-neutral-100 border-neutral-300 text-neutral-700"
                      }`}
                    >
                      Page {ref.pageNumber}
                    </span>
                  )}
                </div>
                <p className={`leading-relaxed ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>
                  {ref.extractedFinding}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Relevant Research Papers (including IEEE Open Access / arXiv) */}
      {result.papers.length > 0 && (
        <section
          id="research-papers-section"
          className={`border-t pt-6 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
        >
          <h2
            className={`text-base font-medium mb-3 flex items-center gap-2 ${
              isDark ? "text-neutral-100" : "text-neutral-900"
            }`}
          >
            <BookOpen className={`w-4 h-4 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
            <span>Relevant Research Papers &amp; Academic Literature</span>
          </h2>
          <div className="space-y-2.5">
            {result.papers.map((paper) => (
              <div
                key={paper.id}
                className={`rounded-md p-3 text-xs space-y-2 shadow-sm border ${
                  isDark
                    ? "bg-[#18181b] border-neutral-800"
                    : "bg-white border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`font-medium text-sm ${
                          isDark ? "text-neutral-200" : "text-neutral-900"
                        }`}
                      >
                        {paper.title}
                      </span>
                      {paper.isIeeeOpenAccess && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                            isDark
                              ? "bg-neutral-900 border-neutral-700 text-neutral-300"
                              : "bg-blue-50 border-blue-200 text-blue-800"
                          }`}
                        >
                          IEEE Open Access
                        </span>
                      )}
                      {paper.isOpenAccess && !paper.isIeeeOpenAccess && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                            isDark
                              ? "bg-neutral-900 border-neutral-800 text-neutral-400"
                              : "bg-neutral-100 border-neutral-300 text-neutral-700"
                          }`}
                        >
                          Open Access
                        </span>
                      )}
                      {paper.isPaywalled && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                            isDark
                              ? "bg-neutral-900 border-neutral-800 text-neutral-500"
                              : "bg-neutral-100 border-neutral-200 text-neutral-500"
                          }`}
                        >
                          Subscription / Paywall
                        </span>
                      )}
                    </div>

                    <div
                      className={`text-[11px] font-mono flex items-center gap-2 flex-wrap ${
                        isDark ? "text-neutral-500" : "text-neutral-500"
                      }`}
                    >
                      {paper.authors && <span>{paper.authors}</span>}
                      {paper.publication && <span>&bull; {paper.publication}</span>}
                      {paper.year && <span>({paper.year})</span>}
                      {paper.doi && <span>&bull; DOI: {paper.doi}</span>}
                    </div>
                  </div>

                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1 shrink-0 hover:underline pt-1 ${
                      isDark ? "text-neutral-400 hover:text-white" : "text-neutral-600 hover:text-black"
                    }`}
                  >
                    <span>View Paper</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {paper.abstract && (
                  <p
                    className={`text-[11px] leading-relaxed p-2 rounded ${
                      isDark
                        ? "text-neutral-400 bg-neutral-900/30"
                        : "text-neutral-600 bg-neutral-50 border border-neutral-200/50"
                    }`}
                  >
                    <span className={`font-medium ${isDark ? "text-neutral-300" : "text-neutral-800"}`}>
                      Abstract:
                    </span>{" "}
                    {paper.abstract}
                  </p>
                )}

                {(paper.keyContribution || paper.methodology) && (
                  <div
                    className={`grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1 ${
                      isDark ? "text-neutral-400" : "text-neutral-600"
                    }`}
                  >
                    {paper.keyContribution && (
                      <div>
                        <span className={`font-medium ${isDark ? "text-neutral-300" : "text-neutral-800"}`}>
                          Key Contribution:
                        </span>{" "}
                        {paper.keyContribution}
                      </div>
                    )}
                    {paper.methodology && (
                      <div>
                        <span className={`font-medium ${isDark ? "text-neutral-300" : "text-neutral-800"}`}>
                          Methodology:
                        </span>{" "}
                        {paper.methodology}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Discovered Tools, Datasets & Code */}
      {result.additionalResources && result.additionalResources.length > 0 && (
        <section
          id="resources-section"
          className={`border-t pt-6 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
        >
          <h2
            className={`text-base font-medium mb-3 flex items-center gap-2 ${
              isDark ? "text-neutral-100" : "text-neutral-900"
            }`}
          >
            <Database className={`w-4 h-4 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
            <span>Discovered Datasets, Tools &amp; Repositories</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {result.additionalResources.map((res) => (
              <a
                key={res.id}
                href={res.url}
                target="_blank"
                rel="noreferrer"
                className={`rounded-md p-3 text-xs block transition-colors group shadow-sm border ${
                  isDark
                    ? "bg-[#18181b] border-neutral-800 hover:border-neutral-600"
                    : "bg-white border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={`font-medium truncate ${
                      isDark ? "text-neutral-200 group-hover:text-white" : "text-neutral-900 group-hover:text-black"
                    }`}
                  >
                    {res.title}
                  </span>
                  <ExternalLink
                    className={`w-3 h-3 shrink-0 ${
                      isDark ? "text-neutral-400" : "text-neutral-500"
                    }`}
                  />
                </div>
                {res.description && (
                  <p
                    className={`text-[11px] line-clamp-2 mb-1.5 ${
                      isDark ? "text-neutral-400" : "text-neutral-600"
                    }`}
                  >
                    {res.description}
                  </p>
                )}
                <span
                  className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                    isDark
                      ? "bg-[#27272a] border-neutral-700 text-neutral-300"
                      : "bg-neutral-100 border-neutral-300 text-neutral-700"
                  }`}
                >
                  {res.category || res.type}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Relevant Videos */}
      {result.videos.length > 0 && (
        <section
          id="videos-section"
          className={`border-t pt-6 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
        >
          <h2
            className={`text-base font-medium mb-3 flex items-center gap-2 ${
              isDark ? "text-neutral-100" : "text-neutral-900"
            }`}
          >
            <Video className={`w-4 h-4 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
            <span>Relevant Videos &amp; Lectures</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {result.videos.map((vid) => (
              <a
                key={vid.id}
                href={vid.url}
                target="_blank"
                rel="noreferrer"
                className={`rounded-md p-3 text-xs block transition-colors group shadow-sm border ${
                  isDark
                    ? "bg-[#18181b] border-neutral-800 hover:border-neutral-600"
                    : "bg-white border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <div
                  className={`font-medium truncate mb-1 ${
                    isDark ? "text-neutral-200 group-hover:text-white" : "text-neutral-900 group-hover:text-black"
                  }`}
                >
                  {vid.title}
                </div>
                <div
                  className={`text-[11px] truncate flex items-center gap-1 ${
                    isDark ? "text-neutral-400" : "text-neutral-500"
                  }`}
                >
                  <span>YouTube</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Sources & Citations with Source Quality Indicators */}
      {result.sources.length > 0 && (
        <section
          id="sources-section"
          className={`border-t pt-6 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}
        >
          <h2
            className={`text-base font-medium mb-3 flex items-center gap-2 ${
              isDark ? "text-neutral-100" : "text-neutral-900"
            }`}
          >
            <Layers className={`w-4 h-4 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
            <span>Verified Sources &amp; Quality Indicators</span>
          </h2>
          <div className="space-y-2">
            {result.sources.map((src) => (
              <div
                key={src.id}
                className={`flex items-start justify-between gap-3 text-xs p-2.5 rounded-md transition-colors shadow-sm border ${
                  isDark
                    ? "bg-[#18181b] border-neutral-800 hover:border-neutral-700"
                    : "bg-white border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <span
                    className={`font-mono shrink-0 w-6 pt-0.5 ${
                      isDark ? "text-neutral-500" : "text-neutral-400"
                    }`}
                  >
                    [{src.id}]
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`font-medium truncate hover:underline ${
                          isDark ? "text-neutral-200 hover:text-white" : "text-neutral-900 hover:text-black"
                        }`}
                      >
                        {src.title}
                      </a>
                      {src.quality?.authorityTier === "High" && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-mono flex items-center gap-1 border ${
                            isDark
                              ? "bg-neutral-900 border-neutral-700 text-neutral-300"
                              : "bg-emerald-50 border-emerald-200 text-emerald-800"
                          }`}
                        >
                          <ShieldCheck className={`w-3 h-3 ${isDark ? "text-neutral-400" : "text-emerald-600"}`} />
                          <span>High Authority</span>
                        </span>
                      )}
                      {src.quality?.academicCredibility && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded font-mono border ${
                            isDark
                              ? "bg-neutral-900 border-neutral-800 text-neutral-400"
                              : "bg-neutral-100 border-neutral-300 text-neutral-700"
                          }`}
                        >
                          {src.quality.academicCredibility}
                        </span>
                      )}
                      {src.quality?.publishedYear && (
                        <span className={`text-[10px] font-mono ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
                          ({src.quality.publishedYear})
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[11px] font-mono truncate ${
                        isDark ? "text-neutral-500" : "text-neutral-500"
                      }`}
                    >
                      {src.domain || src.url}
                    </div>
                  </div>
                </div>

                <a
                  href={src.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`p-1 shrink-0 ${
                    isDark ? "text-neutral-500 hover:text-neutral-200" : "text-neutral-400 hover:text-black"
                  }`}
                  title="Open source"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Concept Architecture & Flowchart (1-Click Diagram Generation) */}
      <ResearchDiagramViewer
        research={result}
        initialDiagram={diagram}
        onDiagramGenerated={onDiagramGenerated}
        personalGeminiApiKey={personalGeminiApiKey}
      />

      {/* Follow-up Questions & Deep Dive Q&A */}
      <FollowUpQa
        research={result}
        messages={qaMessages}
        onAddMessage={onAddQaMessage}
        personalGeminiApiKey={personalGeminiApiKey}
      />
    </div>
  );
};

export default ResearchViewer;
