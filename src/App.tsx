import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ResearchInput } from "./components/ResearchInput.js";
import { ResearchProgress } from "./components/ResearchProgress.js";
import { ResearchViewer } from "./components/ResearchViewer.js";
import { ErrorDisplay } from "./components/ErrorDisplay.js";
import { ResearchHistoryModal } from "./components/ResearchHistoryModal.js";
import { SavedResearchModal } from "./components/SavedResearchModal.js";
import { PapersModal } from "./components/PapersModal.js";
import { ResourcesModal } from "./components/ResourcesModal.js";
import { SettingsModal } from "./components/SettingsModal.js";
import { StaggeredMenu, StaggeredMenuItem, StaggeredMenuSocialItem } from "./components/StaggeredMenu.js";
import { ThemeProvider, useTheme } from "./context/ThemeContext.js";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { LoginPage } from "./components/LoginPage.js";
import {
  ResearchResult,
  ProgressStep,
  ResearchRequestPayload,
  HistoryItem,
  QaMessage,
  DiagramResult,
  ResearchMode,
  UploadedFile,
} from "./types.js";
import { LogOut, User } from "lucide-react";
import CursorRingField from "./components/originkit/ui/cursor-ring-field.js";
import BlurText from "./components/BlurText.js";
import TargetCursor from "./components/TargetCursor.js";
import ClickSpark from "./components/ClickSpark.js";
import { firebaseConfigured } from "./lib/firebase.js";

const STORAGE_KEY = "dora_research_history_v1";

const DEFAULT_STEPS: ProgressStep[] = [
  { id: "planning", label: "Research Planning & Intent Analysis", status: "pending" },
  { id: "retrieval", label: "Verified Source & Academic Retrieval", status: "pending" },
  { id: "pdf_processing", label: "PDF Document Processing & Citation Extraction", status: "pending" },
  { id: "evaluation", label: "Evidence Evaluation & Contradiction Detection", status: "pending" },
  { id: "synthesis", label: "Structured Answer Synthesis", status: "pending" },
  { id: "deduplication", label: "No-Repetition Deduplication Filter", status: "pending" },
];

function AppContent() {
  const { isDark } = useTheme();
  const { isAuthenticated, user, logout } = useAuth();
  const [currentQuery, setCurrentQuery] = useState("");
  const [currentMode, setCurrentMode] = useState<ResearchMode>("deep");
  const [lastPayload, setLastPayload] = useState<ResearchRequestPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(DEFAULT_STEPS);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modals & Navigation Views
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSavedOpen, setIsSavedOpen] = useState(false);
  const [isPapersOpen, setIsPapersOpen] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [qaMessages, setQaMessages] = useState<QaMessage[]>([]);
  const [currentDiagram, setCurrentDiagram] = useState<DiagramResult | undefined>(undefined);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load history from localStorage on initial render
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: HistoryItem[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to load research history from localStorage:", e);
    }
  }, []);

  // Save history helper
  const saveHistory = (items: HistoryItem[]) => {
    setHistory(items);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn("Failed to save research history to localStorage:", e);
    }
  };

  const handleStartResearch = async (
    query: string,
    mode: ResearchMode = "deep",
    files?: UploadedFile[]
  ) => {
    setError(null);
    setResult(null);
    setQaMessages([]);
    setCurrentDiagram(undefined);
    setIsLoading(true);
    setCurrentQuery(query);
    setCurrentMode(mode);

    const hasPdfs = files && files.length > 0;
    const payload: ResearchRequestPayload = {
      query,
      mode,
      files,
      file: hasPdfs ? files[0] : undefined,
    };
    setLastPayload(payload);

    // Reset steps
    const initialSteps = DEFAULT_STEPS.map((s) => {
      if (s.id === "pdf_processing" && !hasPdfs) {
        return { ...s, status: "skipped" as const };
      }
      return { ...s, status: "pending" as const, detail: undefined };
    });
    setProgressSteps(initialSteps);

    abortControllerRef.current = new AbortController();

    try {
      // Use SSE streaming endpoint for real-time progress
      const response = await fetch("/api/research/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body received from server.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let hasReceivedResult = false;
      let terminalError: Error | null = null;

      const consumeFrames = (input: string, isFinal = false) => {
        buffer += input;
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = isFinal ? "" : (frames.pop() || "");
        return isFinal ? frames.filter(Boolean) : frames;
      };

      const processFrame = (block: string): "continue" | "done" => {
        if (!block.trim() || block.trimStart().startsWith(":")) return "continue";

        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of block.split(/\r?\n/)) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }

        const dataStr = dataLines.join("\n");
        if (!dataStr) return "continue";

        let data: any;
        try {
          data = JSON.parse(dataStr);
        } catch {
          if (eventName === "error") terminalError = new Error(dataStr.slice(0, 300));
          return eventName === "done" ? "done" : "continue";
        }

        if (eventName === "progress") {
          const incomingStep = data as ProgressStep;
          setProgressSteps((prev) => prev.map((step) =>
            step.id === incomingStep.id ? { ...step, ...incomingStep } : step
          ));
        } else if (eventName === "result") {
          hasReceivedResult = true;
          const researchRes = data as ResearchResult;
          setResult(researchRes);

          const sessionId = `res-${Date.now()}`;
          setActiveSessionId(sessionId);
          const newHistoryItem: HistoryItem = {
            id: sessionId, timestamp: Date.now(), query: researchRes.query,
            result: researchRes, qaMessages: [], diagram: undefined,
          };
          setHistory((prev) => {
            const updated = [newHistoryItem, ...prev.filter((h) => h.id !== sessionId)];
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch (e) {
              console.warn("Storage write error:", e);
            }
            return updated;
          });
        } else if (eventName === "error") {
          terminalError = new Error(typeof data?.message === "string" ? data.message : JSON.stringify(data).slice(0, 300));
        }
        return eventName === "done" ? "done" : "continue";
      };

      readLoop: while (true) {
        const { value, done } = await reader.read();
        const frames = consumeFrames(decoder.decode(value || new Uint8Array(), { stream: !done }), done);
        for (const frame of frames) if (processFrame(frame) === "done") break readLoop;
        if (done) break readLoop;
      }

      try {
        await reader.cancel();
      } catch {
        // Stream already closed
      }

      if (terminalError) throw terminalError;
      if (!hasReceivedResult) {
        throw new Error("Research stream closed before returning findings. Please try again with a specific question or 'Quick' mode.");
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Research request aborted.");
        return;
      }
      console.error("Research execution error:", err);
      setError(err.message || "An unexpected error occurred during research.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastPayload) {
      handleStartResearch(lastPayload.query, lastPayload.mode, lastPayload.files);
    }
  };

  const handleReset = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setResult(null);
    setError(null);
    setIsLoading(false);
    setCurrentQuery("");
    setActiveSessionId(null);
    setQaMessages([]);
    setCurrentDiagram(undefined);
    setProgressSteps(DEFAULT_STEPS);
  };

  // Select item from history
  const handleSelectHistoryItem = (item: HistoryItem) => {
    setActiveSessionId(item.id);
    setResult(item.result);
    setCurrentQuery(item.query);
    setQaMessages(item.qaMessages || []);
    setCurrentDiagram(item.diagram);
    setError(null);
    setIsLoading(false);
  };

  // Delete single history item
  const handleDeleteHistoryItem = (id: string) => {
    const updated = history.filter((item) => item.id !== id);
    saveHistory(updated);
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  };

  // Clear all history
  const handleClearAllHistory = () => {
    saveHistory([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  // Add QA message and sync with history
  const handleAddQaMessage = (msg: QaMessage) => {
    const nextQa = [...qaMessages, msg];
    setQaMessages(nextQa);

    if (activeSessionId) {
      const updated = history.map((h) =>
        h.id === activeSessionId ? { ...h, qaMessages: nextQa } : h
      );
      saveHistory(updated);
    }
  };

  // Save Diagram and sync with history
  const handleDiagramGenerated = (diagram: DiagramResult) => {
    setCurrentDiagram(diagram);

    if (activeSessionId) {
      const updated = history.map((h) =>
        h.id === activeSessionId ? { ...h, diagram } : h
      );
      saveHistory(updated);
    }
  };

  // StaggeredMenu Items Specification
  const menuItems: StaggeredMenuItem[] = [
    {
      label: "New Research",
      ariaLabel: "Start a new research session",
      onClick: () => {
        handleReset();
      },
      isActive: !result && !isLoading,
    },
    {
      label: "History",
      ariaLabel: "View past research sessions",
      onClick: () => {
        setIsHistoryOpen(true);
      },
      isActive: isHistoryOpen,
    },
    {
      label: "Saved Research",
      ariaLabel: "View and export saved research sessions",
      onClick: () => {
        setIsSavedOpen(true);
      },
      isActive: isSavedOpen,
    },
    {
      label: "Papers",
      ariaLabel: "View academic papers and verified citations",
      onClick: () => {
        setIsPapersOpen(true);
      },
      isActive: isPapersOpen,
    },
    {
      label: "Resources",
      ariaLabel: "View research infrastructure and modules",
      onClick: () => {
        setIsResourcesOpen(true);
      },
      isActive: isResourcesOpen,
    },
    {
      label: "Settings",
      ariaLabel: "Configure system and theme preferences",
      onClick: () => {
        setIsSettingsOpen(true);
      },
      isActive: isSettingsOpen,
    },
  ];

  const socialItems: StaggeredMenuSocialItem[] = [
    { label: "GitHub", link: "https://github.com" },
    { label: "Gemini Core", link: "https://ai.google.dev" },
    { label: "arXiv API", link: "https://arxiv.org" },
    { label: "PubMed Index", link: "https://pubmed.ncbi.nlm.nih.gov" },
  ];

  if (!isAuthenticated) {
    return (
      <ClickSpark
        sparkColor={isDark ? "#ffffff" : "#000000"}
        sparkSize={12}
        sparkRadius={20}
        sparkCount={8}
        duration={420}
        extraScale={1.1}
      >
        <main
          className={`min-h-screen flex flex-col justify-between p-3 sm:p-8 relative overflow-x-hidden transition-colors duration-200 ${
            isDark
              ? "bg-black text-neutral-100 selection:bg-neutral-800"
              : "bg-neutral-50 text-neutral-900 selection:bg-neutral-300"
          }`}
        >
          {/* TargetCursor on interactive elements */}
          <TargetCursor
            targetSelector="button, input, textarea, select, [role='button'], a, .cursor-target, .sm-toggle, .sm-panel-item"
            spinDuration={2.2}
            hideDefaultCursor={true}
            hoverDuration={0.25}
            parallaxOn={true}
            cursorColor={isDark ? "#ffffff" : "#000000"}
            cursorColorOnTarget={isDark ? "#ffffff" : "#000000"}
          />

          {/* Background Interactive Originkit Cursor Ring Field */}
          <div
            id="cursor-ring-bg"
            className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
            aria-hidden="true"
          >
            <CursorRingField
              background="transparent"
              speed={5}
              cameraDistance={150}
              density={240}
              dotSize={110}
              colors={
                isDark
                  ? ["#ffffff", "#999999", "#222222"]
                  : ["#18181b", "#71717a", "#e4e4e7"]
              }
              ring={{ radius: 14, width: 9, push: 40, turbulence: 35 }}
            />
          </div>

          <LoginPage />
        </main>
      </ClickSpark>
    );
  }

  return (
    <ClickSpark
      sparkColor={isDark ? "#ffffff" : "#000000"}
      sparkSize={12}
      sparkRadius={20}
      sparkCount={8}
      duration={420}
      extraScale={1.1}
    >
      <main
        className={`min-h-screen flex flex-col justify-between p-3 sm:p-8 relative overflow-x-hidden transition-colors duration-200 ${
          isDark
            ? "bg-black text-neutral-100 selection:bg-neutral-800"
            : "bg-neutral-50 text-neutral-900 selection:bg-neutral-300"
        }`}
      >
        {/* TargetCursor from React Bits with smooth targeting on all interactive elements */}
        <TargetCursor
          targetSelector="button, input, textarea, select, [role='button'], a, .cursor-target, .sm-toggle, .sm-panel-item, .sm-socials-link"
          spinDuration={2.2}
          hideDefaultCursor={true}
          hoverDuration={0.25}
          parallaxOn={true}
          cursorColor={isDark ? "#ffffff" : "#000000"}
          cursorColorOnTarget={isDark ? "#ffffff" : "#000000"}
        />

        {/* Background Interactive Originkit Cursor Ring Field */}
        <div
          id="cursor-ring-bg"
          className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
          aria-hidden="true"
        >
          <CursorRingField
            background="transparent"
            speed={5}
            cameraDistance={150}
            density={240}
            dotSize={110}
            colors={
              isDark
                ? ["#ffffff", "#999999", "#222222"]
                : ["#18181b", "#71717a", "#e4e4e7"]
            }
            ring={{ radius: 14, width: 9, push: 40, turbulence: 35 }}
          />
        </div>

        {/* Staggered Menu Component (React Bits + GSAP) */}
        <StaggeredMenu
          position="right"
          isFixed={true}
          items={menuItems}
          socialItems={socialItems}
          displaySocials={true}
          displayItemNumbering={true}
          colors={
            isDark
              ? ["#18181b", "#27272a", "#121214"]
              : ["#e4e4e7", "#f4f4f5", "#d4d4d8"]
          }
          panelBgColor={isDark ? "#121214" : "#ffffff"}
          panelTextColor={isDark ? "#f4f4f5" : "#09090b"}
          panelBorderColor={isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"}
          menuButtonColor={isDark ? "#f4f4f5" : "#18181b"}
          openMenuButtonColor={isDark ? "#10b981" : "#059669"}
          accentColor={isDark ? "#10b981" : "#059669"}
          logoElement={
            <div
              className="flex items-center gap-2.5 cursor-pointer select-none"
              onClick={handleReset}
              title="Return to New Research"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span
                className={`text-sm font-bold font-mono tracking-widest transition-colors ${
                  isDark ? "text-neutral-100" : "text-neutral-900"
                }`}
              >
                D O R A
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border hidden sm:inline-block transition-colors ${
                  isDark
                    ? "bg-neutral-900/80 border-neutral-800 text-neutral-400"
                    : "bg-neutral-100 border-neutral-200 text-neutral-600"
                }`}
              >
                v2.5 Autonomous
              </span>
            </div>
          }
          headerRightContent={
            <div className="flex items-center gap-2">
              {result && !isLoading && (
                <button
                  type="button"
                  onClick={handleReset}
                  className={`text-xs font-mono px-2.5 py-1 rounded transition-colors cursor-pointer hidden md:inline-flex items-center gap-1 border ${
                    isDark
                      ? "text-neutral-300 hover:text-white bg-neutral-900/80 border-neutral-800 hover:border-neutral-700"
                      : "text-neutral-700 hover:text-black bg-white border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  &larr; New Research
                </button>
              )}

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* User Session pill & Logout */}
              <div
                className={`flex items-center gap-1.5 pl-1.5 border-l ${
                  isDark ? "border-neutral-800" : "border-neutral-200"
                }`}
              >
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono border hidden sm:flex ${
                    isDark
                      ? "bg-[#18181b] border-neutral-800 text-neutral-300"
                      : "bg-white border-neutral-300 text-neutral-800"
                  }`}
                  title={`Signed in as ${user?.email}`}
                >
                  <User className="w-3 h-3 text-neutral-400 shrink-0" />
                  <span className="max-w-[110px] truncate">{user?.email}</span>
                </div>

                <motion.button
                  id="btn-header-logout"
                  type="button"
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={logout}
                  title="Sign Out of Session"
                  className={`p-1.5 rounded transition-colors border cursor-pointer ${
                    isDark
                      ? "text-neutral-400 hover:text-white bg-[#18181b] hover:bg-[#222226] border-neutral-800"
                      : "text-neutral-600 hover:text-black bg-white hover:bg-neutral-100 border-neutral-300"
                  }`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </div>
          }
        />

        {/* Primary Workspace Container (Optimized for desktop-first width utilization) */}
        <div className="w-full max-w-5xl xl:max-w-6xl mx-auto flex-1 flex flex-col pt-16 sm:pt-20 relative z-10">
          {/* Dynamic Display Area with smooth transitions */}
          <div className="flex-1 flex flex-col">
            <AnimatePresence mode="wait">
              {/* If there is an active result, show Viewer */}
              {result && !isLoading && (
                <motion.div
                  key="result-viewer"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="w-full"
                >
                  <ResearchViewer
                    result={result}
                    onReset={handleReset}
                    qaMessages={qaMessages}
                    onAddQaMessage={handleAddQaMessage}
                    diagram={currentDiagram}
                    onDiagramGenerated={handleDiagramGenerated}
                  />
                </motion.div>
              )}

              {/* If error, show Error State */}
              {error && !isLoading && (
                <motion.div
                  key="error-display"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6 my-auto w-full max-w-4xl mx-auto"
                >
                  <ErrorDisplay message={error} onRetry={handleRetry} />
                  <div
                    className={`pt-4 border-t ${
                      isDark ? "border-neutral-900" : "border-neutral-200"
                    }`}
                  >
                    <ResearchInput onSearch={handleStartResearch} isLoading={isLoading} />
                  </div>
                </motion.div>
              )}

              {/* If loading, show Progress Steps */}
              {isLoading && (
                <motion.div
                  key="loading-progress"
                  initial={{ opacity: 0, scale: 0.98, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: -6 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="my-auto w-full max-w-4xl mx-auto"
                >
                  <ResearchProgress steps={progressSteps} query={currentQuery} />
                </motion.div>
              )}

              {/* Initial Search State (Centered) */}
              {!result && !isLoading && !error && (
                <motion.div
                  key="initial-state"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="my-auto py-8 sm:py-12 space-y-6 w-full max-w-4xl mx-auto"
                >
                  <div className="text-center mb-6 flex flex-col items-center">
                    <BlurText
                      text="D O R A"
                      delay={120}
                      animateBy="words"
                      direction="top"
                      stepDuration={0.35}
                      className={`text-4xl sm:text-5xl font-bold tracking-[0.3em] justify-center text-center select-none ${
                        isDark ? "text-neutral-100" : "text-neutral-900"
                      }`}
                    />
                    <p
                      className={`text-xs font-mono tracking-widest mt-3 uppercase ${
                        isDark ? "text-neutral-400" : "text-neutral-600"
                      }`}
                    >
                      DEEP ORCHESTRATION RESEARCH ASSISTANT
                    </p>
                  </div>

                  <ResearchInput onSearch={handleStartResearch} isLoading={isLoading} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Modals for Staggered Menu Navigation */}
          <ResearchHistoryModal
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            history={history}
            onSelect={handleSelectHistoryItem}
            onDelete={handleDeleteHistoryItem}
            onClearAll={handleClearAllHistory}
          />

          <SavedResearchModal
            isOpen={isSavedOpen}
            onClose={() => setIsSavedOpen(false)}
            history={history}
            onSelect={handleSelectHistoryItem}
          />

          <PapersModal
            isOpen={isPapersOpen}
            onClose={() => setIsPapersOpen(false)}
            history={history}
          />

          <ResourcesModal
            isOpen={isResourcesOpen}
            onClose={() => setIsResourcesOpen(false)}
          />

          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onClearHistory={handleClearAllHistory}
          />

          {/* Minimal Functional Footer */}
          <footer
            className={`py-6 border-t text-center text-xs font-mono mt-12 transition-colors ${
              isDark
                ? "border-neutral-900 text-neutral-600"
                : "border-neutral-200 text-neutral-500"
            }`}
          >
            Grounded in verified sources &amp; documents &bull; DORA Research Architecture
          </footer>
        </div>
      </main>
    </ClickSpark>
  );
}

export default function App() {
  if (!firebaseConfigured) {
    return <main className="min-h-screen grid place-items-center bg-black p-6 text-neutral-100"><div className="max-w-lg rounded-lg border border-neutral-800 bg-neutral-950 p-6 font-mono text-sm"><h1 className="mb-3 text-lg font-bold">DORA needs local Firebase configuration</h1><p className="text-neutral-400">Copy <code>.env.example</code> to <code>.env</code>, add the required <code>VITE_FIREBASE_*</code> values from your Firebase project, then restart <code>npm run dev</code>.</p></div></main>;
  }
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
