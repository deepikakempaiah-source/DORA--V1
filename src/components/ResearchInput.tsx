import React, { useRef, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Upload, FileText, X, ArrowUp, Zap, Compass, GraduationCap } from "lucide-react";
import { ResearchMode, UploadedFile } from "../types.js";
import MovingBorder from "./MovingBorder.js";
import { useTheme } from "../context/ThemeContext.js";
import { extractPdfText } from "../lib/pdfText.js";

interface ResearchInputProps {
  onSearch: (
    query: string,
    mode: ResearchMode,
    files?: UploadedFile[]
  ) => void;
  isLoading: boolean;
}

export const ResearchInput: React.FC<ResearchInputProps> = ({ onSearch, isLoading }) => {
  const { isDark } = useTheme();
  const [query, setQuery] = useState("");
  const [selectedMode, setSelectedMode] = useState<ResearchMode>("deep");
  const [userExplicitlyChangedMode, setUserExplicitlyChangedMode] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sampleQueries = [
    {
      text: "Commercialization barriers for solid-state lithium metal batteries and recent breakthroughs",
      mode: "deep" as ResearchMode,
    },
    {
      text: "Compare quantum error correction architectures: Surface codes vs Low-Density Parity-Check (LDPC) codes in IEEE papers",
      mode: "academic" as ResearchMode,
    },
    {
      text: "What is the memory bandwidth of HBM3e vs GDDR7?",
      mode: "quick" as ResearchMode,
    },
  ];

  // Automatic Mode Recommendation logic
  const recommendedMode = useMemo<ResearchMode>(() => {
    const lower = query.toLowerCase();
    if (
      lower.includes("paper") ||
      lower.includes("ieee") ||
      lower.includes("arxiv") ||
      lower.includes("literature review") ||
      lower.includes("methodology") ||
      lower.includes("doi") ||
      lower.includes("peer-reviewed") ||
      lower.includes("theorem") ||
      lower.includes("ablation") ||
      lower.includes("citation")
    ) {
      return "academic";
    }

    if (
      (lower.startsWith("what is ") ||
        lower.startsWith("who ") ||
        lower.startsWith("when was ") ||
        lower.startsWith("define ")) &&
      query.length < 50
    ) {
      return "quick";
    }

    return "deep";
  }, [query]);

  // If user hasn't manually overridden the mode, auto-align with recommendation
  useEffect(() => {
    if (!userExplicitlyChangedMode && query.trim().length > 10) {
      setSelectedMode(recommendedMode);
    }
  }, [recommendedMode, userExplicitlyChangedMode, query]);

  const handleFilesChosen = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newFiles: File[] = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.endsWith(".pdf")
    );

    if (newFiles.length === 0) {
      alert("Please upload valid PDF documents.");
      return;
    }

    setPreparingFiles(true); setFileError(null);
    try {
      const extracted = await Promise.all(newFiles.map(async (file) => ({
        name: file.name, mimeType: file.type || "application/pdf", size: file.size,
        ...(await extractPdfText(file)),
      })));
      setAttachedFiles((prev) => [...prev, ...extracted.filter((f) => !prev.some((p) => p.name === f.name))]);
    } catch (err) { setFileError(err instanceof Error ? err.message : "Could not read this PDF."); }
    finally { setPreparingFiles(false); }

    // If PDF is attached, auto-recommend academic or deep if user hasn't overridden
    if (!userExplicitlyChangedMode) {
      setSelectedMode("academic");
    }
  };

  const removeFile = (fileName: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.name !== fileName));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesChosen(e.dataTransfer.files);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (preparingFiles || !trimmed && attachedFiles.length === 0) return;

    const effectiveQuery =
      trimmed ||
      (attachedFiles.length === 1
        ? `Analyze and synthesize findings from "${attachedFiles[0].name}"`
        : `Cross-analyze, summarize, and compare findings across the uploaded documents.`);

    onSearch(effectiveQuery, selectedMode, attachedFiles.length > 0 ? attachedFiles : undefined);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Mode Selector Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className={`flex items-center gap-1 rounded-md p-1 shadow-sm transition-colors ${
            isDark
              ? "bg-[#18181b] border border-neutral-700/80"
              : "bg-white border border-neutral-200"
          }`}
        >
          <button
            id="mode-quick-button"
            type="button"
            onClick={() => {
              setSelectedMode("quick");
              setUserExplicitlyChangedMode(true);
            }}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
              selectedMode === "quick"
                ? isDark
                  ? "text-black font-medium"
                  : "text-white font-medium"
                : isDark
                ? "text-neutral-300 hover:text-white"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {selectedMode === "quick" && (
              <motion.span
                layoutId="activeModePill"
                className={`absolute inset-0 rounded z-0 ${
                  isDark ? "bg-neutral-100" : "bg-neutral-900"
                }`}
                transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
              />
            )}
            <Zap className="w-3.5 h-3.5 relative z-10" />
            <span className="relative z-10">Quick</span>
          </button>

          <button
            id="mode-deep-button"
            type="button"
            onClick={() => {
              setSelectedMode("deep");
              setUserExplicitlyChangedMode(true);
            }}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
              selectedMode === "deep"
                ? isDark
                  ? "text-black font-medium"
                  : "text-white font-medium"
                : isDark
                ? "text-neutral-300 hover:text-white"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {selectedMode === "deep" && (
              <motion.span
                layoutId="activeModePill"
                className={`absolute inset-0 rounded z-0 ${
                  isDark ? "bg-neutral-100" : "bg-neutral-900"
                }`}
                transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
              />
            )}
            <Compass className="w-3.5 h-3.5 relative z-10" />
            <span className="relative z-10">Deep</span>
          </button>

          <button
            id="mode-academic-button"
            type="button"
            onClick={() => {
              setSelectedMode("academic");
              setUserExplicitlyChangedMode(true);
            }}
            className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors cursor-pointer ${
              selectedMode === "academic"
                ? isDark
                  ? "text-black font-medium"
                  : "text-white font-medium"
                : isDark
                ? "text-neutral-300 hover:text-white"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            {selectedMode === "academic" && (
              <motion.span
                layoutId="activeModePill"
                className={`absolute inset-0 rounded z-0 ${
                  isDark ? "bg-neutral-100" : "bg-neutral-900"
                }`}
                transition={{ type: "spring", bounce: 0.15, duration: 0.3 }}
              />
            )}
            <GraduationCap className="w-3.5 h-3.5 relative z-10" />
            <span className="relative z-10">Academic</span>
          </button>
        </div>

        {/* Smart recommendation pill */}
        <AnimatePresence>
          {query.trim().length > 10 && selectedMode !== recommendedMode && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setSelectedMode(recommendedMode);
                setUserExplicitlyChangedMode(true);
              }}
              className={`text-xs rounded-md px-2.5 py-1 transition-colors flex items-center gap-1 shadow-sm cursor-pointer ${
                isDark
                  ? "text-neutral-300 hover:text-white bg-[#18181b] border border-neutral-700/80"
                  : "text-neutral-700 hover:text-neutral-950 bg-white border border-neutral-200"
              }`}
            >
              <span>Recommend:</span>
              <span className={`capitalize underline ${isDark ? "text-white" : "text-black"}`}>
                {recommendedMode}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Research Query Box with Moving Border */}
      <div
        id="research-input-wrapper"
        className={`relative rounded-xl p-[1.5px] overflow-hidden transition-all duration-300 ${
          dragActive
            ? "bg-neutral-500 shadow-2xl ring-2 ring-neutral-300"
            : isDark
            ? "bg-neutral-700/80 shadow-xl shadow-black/60 hover:bg-neutral-600/90"
            : "bg-neutral-800 shadow-2xl shadow-neutral-900/30 hover:bg-neutral-700 ring-1 ring-neutral-900/40"
        }`}
      >
        {/* Moving light ray in smooth continuous motion - enhanced intensity and luminescence */}
        <MovingBorder duration={9000} rx={12} ry={12}>
          <div
            className={`opacity-100 ${
              isDark
                ? "w-28 h-28 bg-[radial-gradient(circle_at_center,#ffffff_0%,rgba(255,255,255,0.9)_25%,rgba(255,255,255,0.3)_50%,transparent_70%)]"
                : "w-36 h-36 bg-[radial-gradient(circle_at_center,#ffffff_0%,rgba(255,255,255,1)_30%,rgba(255,255,255,0.75)_55%,rgba(255,255,255,0.25)_75%,transparent_90%)] filter drop-shadow-[0_0_12px_rgba(255,255,255,0.9)]"
            }`}
            aria-hidden="true"
          />
        </MovingBorder>

        <form
          id="research-form"
          onSubmit={handleSubmit}
          className="relative z-10 rounded-[11px] p-4 transition-colors bg-[#18181b] border border-neutral-800/90 shadow-inner"
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          {/* Attached PDF Preview List with AnimatePresence */}
          <AnimatePresence>
            {attachedFiles.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 space-y-1.5 overflow-hidden"
              >
                {attachedFiles.map((file) => (
                  <motion.div
                    key={file.name}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="flex items-center justify-between rounded-md px-3 py-1.5 text-xs bg-[#222226] border border-neutral-700/80 text-neutral-200"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="w-3.5 h-3.5 shrink-0 text-neutral-400" />
                      <span className="font-mono truncate max-w-md">{file.name}</span>
                      <span className="text-neutral-400">
                        ({formatFileSize(file.size)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(file.name)}
                      className="p-1 transition-colors text-neutral-400 hover:text-white"
                      title="Remove file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          {fileError && <p className="mb-2 text-xs text-red-400">{fileError}</p>}

          {/* Query Input */}
          <div className="relative">
            <textarea
              id="research-query-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                attachedFiles.length > 0
                  ? "Ask any question about the uploaded document(s), request comparative analysis, or cross-reference with literature..."
                  : selectedMode === "academic"
                  ? "Enter research paper topic, theoretical framework, IEEE study question, or literature inquiry..."
                  : selectedMode === "quick"
                  ? "Enter quick factual query, benchmark check, or definition..."
                  : "Enter any deep research inquiry (e.g. architectural trade-offs, state-of-the-art comparison, empirical benchmarks)..."
              }
              rows={3}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              className={`w-full bg-transparent text-base sm:text-sm focus:outline-none resize-none leading-relaxed transition-colors ${
                isDark
                  ? "text-neutral-100 placeholder-neutral-400"
                  : "text-neutral-300 placeholder-neutral-500"
              }`}
            />
          </div>

          {/* Action Controls Bar */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t mt-2 border-neutral-800/80"
          >
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFilesChosen(e.target.files);
                  if (e.target) e.target.value = "";
                }}
              />
              <motion.button
                id="upload-pdf-button"
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || preparingFiles}
                className="inline-flex items-center gap-1.5 text-xs rounded-md px-3 py-2 sm:py-1.5 transition-colors shadow-sm disabled:opacity-50 cursor-pointer text-neutral-200 hover:text-white bg-[#27272a] hover:bg-[#323238] border border-neutral-600 hover:border-neutral-500"
              >
                <Upload className="w-3.5 h-3.5 text-neutral-300" />
                <span>{attachedFiles.length > 0 ? "Add More PDFs" : "Upload PDF"}</span>
              </motion.button>

              <span className="text-xs hidden sm:inline text-neutral-400">
                Ctrl+Enter to submit
              </span>
            </div>

            <motion.button
              id="submit-research-button"
              type="submit"
              whileHover={!isLoading && (query.trim() || attachedFiles.length > 0) ? { scale: 1.02 } : {}}
              whileTap={!isLoading && (query.trim() || attachedFiles.length > 0) ? { scale: 0.98 } : {}}
              disabled={isLoading || preparingFiles || (!query.trim() && attachedFiles.length === 0)}
              className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2.5 sm:py-2 rounded-md transition-all shadow-md cursor-pointer disabled:cursor-not-allowed w-full sm:w-auto ${
                query.trim() || attachedFiles.length > 0
                  ? "bg-neutral-100 hover:bg-white text-black ring-1 ring-white/60 shadow-md shadow-black/40"
                  : "bg-[#27272a] text-neutral-400 border border-neutral-600/80 hover:bg-[#323238] hover:text-neutral-300"
              }`}
            >
              {isLoading || preparingFiles ? (
                <span>{preparingFiles ? "Reading PDF..." : "Orchestrating..."}</span>
              ) : (
                <>
                  <span className="capitalize">{selectedMode} Research</span>
                  <ArrowUp className="w-3.5 h-3.5" />
                </>
              )}
            </motion.button>
          </div>
        </form>
      </div>

      {/* Suggested prompts if empty */}
      {!isLoading && !query && attachedFiles.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mt-4"
        >
          <p className={`text-xs mb-2 font-medium ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
            Example research inquiries:
          </p>
          <div className="flex flex-col gap-1.5">
            {sampleQueries.map((sample, idx) => (
              <motion.button
                key={idx}
                type="button"
                whileHover={{ x: 3 }}
                onClick={() => {
                  setQuery(sample.text);
                  setSelectedMode(sample.mode);
                  setUserExplicitlyChangedMode(true);
                }}
                className={`text-left text-xs p-2.5 rounded-md transition-colors flex items-center justify-between gap-2 shadow-sm cursor-pointer ${
                  isDark
                    ? "text-neutral-300 hover:text-white bg-[#18181b] hover:bg-[#222226] border border-neutral-700/80 hover:border-neutral-600"
                    : "text-neutral-700 hover:text-neutral-950 bg-white hover:bg-neutral-50 border border-neutral-200 hover:border-neutral-300"
                }`}
              >
                <span className="truncate">&bull; {sample.text}</span>
                <span
                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded shrink-0 ${
                    isDark
                      ? "bg-[#27272a] text-neutral-300 border border-neutral-600/80"
                      : "bg-neutral-100 text-neutral-700 border border-neutral-300"
                  }`}
                >
                  {sample.mode}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ResearchInput;
