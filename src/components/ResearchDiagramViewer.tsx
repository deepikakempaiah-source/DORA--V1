import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import mermaid from "mermaid";
import { DiagramResult, ResearchResult } from "../types.js";
import {
  Workflow,
  Download,
  FileImage,
  RefreshCw,
  Loader2,
  AlertCircle,
  Code,
  Check,
} from "lucide-react";
import { useTheme } from "../context/ThemeContext.js";

interface ResearchDiagramViewerProps {
  research: ResearchResult;
  initialDiagram?: DiagramResult;
  onDiagramGenerated?: (diagram: DiagramResult) => void;
  personalGeminiApiKey?: string;
}

export const ResearchDiagramViewer: React.FC<ResearchDiagramViewerProps> = ({
  research,
  initialDiagram,
  onDiagramGenerated,
  personalGeminiApiKey,
}) => {
  const { isDark } = useTheme();
  const [diagram, setDiagram] = useState<DiagramResult | null>(initialDiagram || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize mermaid with theme styling
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? "dark" : "default",
      themeVariables: isDark
        ? {
            darkMode: true,
            background: "#000000",
            primaryColor: "#171717",
            primaryTextColor: "#ededed",
            primaryBorderColor: "#404040",
            lineColor: "#737373",
            secondaryColor: "#0a0a0a",
            tertiaryColor: "#171717",
            fontFamily: "ui-monospace, monospace, sans-serif",
            fontSize: "13px",
          }
        : {
            darkMode: false,
            background: "#ffffff",
            primaryColor: "#f4f4f5",
            primaryTextColor: "#09090b",
            primaryBorderColor: "#d4d4d8",
            lineColor: "#52525b",
            secondaryColor: "#fafafa",
            tertiaryColor: "#f4f4f5",
            fontFamily: "ui-monospace, monospace, sans-serif",
            fontSize: "13px",
          },
      securityLevel: "loose",
      flowchart: {
        curve: "basis",
        htmlLabels: true,
        padding: 16,
      },
    });
  }, [isDark]);

  // Sync with initialDiagram if it changes
  useEffect(() => {
    if (initialDiagram) {
      setDiagram(initialDiagram);
    }
  }, [initialDiagram]);

  // Render SVG whenever diagram or theme changes
  useEffect(() => {
    if (!diagram?.mermaidCode) {
      setSvgHtml("");
      return;
    }

    let isMounted = true;
    const renderDiagram = async () => {
      try {
        setError(null);
        const uniqueId = `mermaid-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const { svg } = await mermaid.render(uniqueId, diagram.mermaidCode);
        if (isMounted) {
          setSvgHtml(svg);
        }
      } catch (err: any) {
        console.error("Mermaid rendering failed:", err);
        if (isMounted) {
          setError(
            "Visual rendering encountered an issue with diagram syntax. You can view the raw structure or click Regenerate."
          );
        }
      }
    };

    renderDiagram();
    return () => {
      isMounted = false;
    };
  }, [diagram, isDark]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/research/diagram", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(personalGeminiApiKey ? { "X-DORA-Gemini-Key": personalGeminiApiKey } : {}),
        },
        body: JSON.stringify({ research }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data: DiagramResult = await res.json();
      setDiagram(data);
      if (onDiagramGenerated) {
        onDiagramGenerated(data);
      }
    } catch (err: any) {
      console.error("Failed to generate diagram:", err);
      setError(err.message || "Could not generate diagram.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Download diagram as PNG image with theme-aware background
  const handleDownloadPng = () => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector("svg");
    if (!svgEl) return;

    try {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const blobURL = window.URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2; // high resolution
        canvas.width = (image.width || 1000) * scale;
        canvas.height = (image.height || 600) * scale;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = isDark ? "#000000" : "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

          const pngUrl = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          const safeName = research.query.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_");
          downloadLink.download = `${safeName}_flowchart.png`;
          downloadLink.href = pngUrl;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
        window.URL.revokeObjectURL(blobURL);
      };
      image.src = blobURL;
    } catch (e) {
      console.error("Failed to export PNG:", e);
    }
  };

  // Download diagram as SVG vector
  const handleDownloadSvg = () => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector("svg");
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = research.query.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "_");
    a.download = `${safeName}_flowchart.svg`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyMermaidCode = () => {
    if (!diagram?.mermaidCode) return;
    navigator.clipboard.writeText(diagram.mermaidCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <section
      id="research-diagram-section"
      className={`border-t pt-8 mt-8 space-y-4 ${
        isDark ? "border-neutral-800" : "border-neutral-200"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2
            className={`text-base font-medium flex items-center gap-2 ${
              isDark ? "text-neutral-100" : "text-neutral-900"
            }`}
          >
            <Workflow className={`w-4 h-4 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
            <span>Concept Flowchart &amp; Block Diagram</span>
          </h2>
          <p className={`text-xs mt-0.5 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
            Single-click distillation of research mechanisms into an intuitive visual diagram.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!diagram ? (
            <motion.button
              id="generate-diagram-button"
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-50 cursor-pointer ${
                isDark
                  ? "bg-neutral-100 text-black hover:bg-neutral-200"
                  : "bg-neutral-900 text-white hover:bg-black"
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Diagram...</span>
                </>
              ) : (
                <>
                  <Workflow className="w-3.5 h-3.5" />
                  <span>Generate Diagram</span>
                </>
              )}
            </motion.button>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <motion.button
                id="download-diagram-png-btn"
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDownloadPng}
                disabled={!svgHtml}
                title="Download as PNG image"
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors shadow-sm cursor-pointer ${
                  isDark
                    ? "text-neutral-200 hover:text-white bg-[#18181b] hover:bg-[#242428] border border-neutral-700/80 hover:border-neutral-600"
                    : "text-neutral-800 hover:text-black bg-white hover:bg-neutral-100 border border-neutral-300 hover:border-neutral-400"
                }`}
              >
                <FileImage className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-600"}`} />
                <span>Save PNG</span>
              </motion.button>

              <motion.button
                id="download-diagram-svg-btn"
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleDownloadSvg}
                disabled={!svgHtml}
                title="Download as SVG vector"
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors shadow-sm cursor-pointer ${
                  isDark
                    ? "text-neutral-200 hover:text-white bg-[#18181b] hover:bg-[#242428] border border-neutral-700/80 hover:border-neutral-600"
                    : "text-neutral-800 hover:text-black bg-white hover:bg-neutral-100 border border-neutral-300 hover:border-neutral-400"
                }`}
              >
                <Download className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-600"}`} />
                <span>Save SVG</span>
              </motion.button>

              <motion.button
                id="toggle-diagram-code-btn"
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowCode(!showCode)}
                title="Toggle Mermaid Syntax"
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors shadow-sm cursor-pointer ${
                  isDark
                    ? "text-neutral-200 hover:text-white bg-[#18181b] hover:bg-[#242428] border border-neutral-700/80 hover:border-neutral-600"
                    : "text-neutral-800 hover:text-black bg-white hover:bg-neutral-100 border border-neutral-300 hover:border-neutral-400"
                }`}
              >
                <Code className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-600"}`} />
                <span>{showCode ? "Hide Code" : "Code"}</span>
              </motion.button>

              <motion.button
                id="regenerate-diagram-button"
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleGenerate}
                disabled={isGenerating}
                title="Regenerate diagram"
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md transition-colors shadow-sm disabled:opacity-50 cursor-pointer ${
                  isDark
                    ? "text-neutral-200 hover:text-white bg-[#18181b] hover:bg-[#242428] border border-neutral-700/80 hover:border-neutral-600"
                    : "text-neutral-800 hover:text-black bg-white hover:bg-neutral-100 border border-neutral-300 hover:border-neutral-400"
                }`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-600"} ${
                    isGenerating ? "animate-spin" : ""
                  }`}
                />
                <span>Regenerate</span>
              </motion.button>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`border rounded p-3 text-xs flex items-start gap-2 ${
              isDark
                ? "bg-neutral-950 border-neutral-800 text-neutral-400"
                : "bg-neutral-50 border-neutral-300 text-neutral-600"
            }`}
          >
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {diagram && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {diagram.explanation && (
              <p
                className={`text-xs font-mono leading-relaxed p-2.5 rounded border ${
                  isDark
                    ? "text-neutral-400 bg-neutral-950/60 border-neutral-900"
                    : "text-neutral-600 bg-neutral-50 border-neutral-200"
                }`}
              >
                {diagram.explanation}
              </p>
            )}

            {/* Rendered SVG Canvas Container */}
            <div
              id="diagram-render-container"
              ref={containerRef}
              className={`w-full overflow-x-auto rounded p-4 flex items-center justify-center min-h-[220px] transition-colors border ${
                isDark
                  ? "bg-black border-neutral-900"
                  : "bg-white border-neutral-200 shadow-sm"
              }`}
            >
              {isGenerating ? (
                <div
                  className={`flex flex-col items-center gap-2 text-xs py-10 ${
                    isDark ? "text-neutral-500" : "text-neutral-500"
                  }`}
                >
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Constructing diagram nodes and flow relationships...</span>
                </div>
              ) : svgHtml ? (
                <div
                  className="w-full min-w-max sm:min-w-0 flex justify-center [&_svg]:min-w-[560px] sm:[&_svg]:min-w-0 [&_svg]:max-w-none sm:[&_svg]:max-w-full [&_svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: svgHtml }}
                />
              ) : (
                <div className={`text-xs py-8 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
                  Diagram ready. Waiting for render...
                </div>
              )}
            </div>

            {/* Optional Raw Mermaid Syntax Drawer */}
            <AnimatePresence>
              {showCode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`border rounded p-3 text-xs space-y-2 overflow-hidden ${
                    isDark
                      ? "bg-neutral-950 border-neutral-900"
                      : "bg-neutral-50 border-neutral-200"
                  }`}
                >
                  <div
                    className={`flex items-center justify-between font-mono text-[11px] ${
                      isDark ? "text-neutral-500" : "text-neutral-500"
                    }`}
                  >
                    <span>Mermaid Architecture Code</span>
                    <button
                      type="button"
                      onClick={copyMermaidCode}
                      className={`flex items-center gap-1 cursor-pointer ${
                        isDark ? "hover:text-white" : "hover:text-black"
                      }`}
                    >
                      {copiedCode ? <Check className="w-3 h-3 text-emerald-500" /> : null}
                      <span>{copiedCode ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <pre
                    className={`font-mono text-[11px] overflow-x-auto whitespace-pre p-2 border rounded ${
                      isDark
                        ? "text-neutral-300 bg-black border-neutral-900"
                        : "text-neutral-800 bg-white border-neutral-200"
                    }`}
                  >
                    {diagram.mermaidCode}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default ResearchDiagramViewer;
