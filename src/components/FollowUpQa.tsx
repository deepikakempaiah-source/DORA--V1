import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import { QaMessage, ResearchResult } from "../types.js";
import { HelpCircle, Send, Loader2, User, Bot } from "lucide-react";
import MovingBorder from "./MovingBorder.js";
import { useTheme } from "../context/ThemeContext.js";

interface FollowUpQaProps {
  research: ResearchResult;
  messages: QaMessage[];
  onAddMessage: (msg: QaMessage) => void;
  personalGeminiApiKey?: string;
}

const SUGGESTED_QUESTIONS = [
  "Summarize the core mechanism in 3 bullet points",
  "What are the primary limitations and bottlenecks?",
  "How does this compare with alternative solutions?",
  "What are the most promising next-generation developments?",
];

export const FollowUpQa: React.FC<FollowUpQaProps> = ({
  research,
  messages,
  onAddMessage,
  personalGeminiApiKey,
}) => {
  const { isDark } = useTheme();
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAsk = async (queryToAsk?: string) => {
    const finalQuestion = (queryToAsk || question).trim();
    if (!finalQuestion || isLoading) return;

    setError(null);
    const userMsg: QaMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: finalQuestion,
      timestamp: Date.now(),
    };

    onAddMessage(userMsg);
    setQuestion("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/research/qa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(personalGeminiApiKey ? { "X-DORA-Gemini-Key": personalGeminiApiKey } : {}),
        },
        body: JSON.stringify({
          research,
          question: finalQuestion,
          history: [...messages, userMsg],
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const assistantMsg: QaMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.answer || "No response received.",
        timestamp: Date.now(),
      };
      onAddMessage(assistantMsg);
    } catch (err: any) {
      console.error("Follow-up QA error:", err);
      setError(err.message || "Failed to answer follow-up question.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const suggestions =
    research.relatedQuestions && research.relatedQuestions.length > 0
      ? research.relatedQuestions
      : SUGGESTED_QUESTIONS;

  return (
    <section
      id="followup-qa-section"
      className={`border-t pt-8 mt-8 space-y-4 ${
        isDark ? "border-neutral-800" : "border-neutral-200"
      }`}
    >
      <div>
        <h2
          className={`text-base font-medium flex items-center gap-2 ${
            isDark ? "text-neutral-100" : "text-neutral-900"
          }`}
        >
          <HelpCircle className={`w-4 h-4 ${isDark ? "text-neutral-400" : "text-neutral-500"}`} />
          <span>Follow-up Inquiries &amp; Deep Dive Q&amp;A</span>
        </h2>
        <p className={`text-xs mt-0.5 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
          Ask specific questions directly grounded in this research report, retrieved sources, and document evidence.
        </p>
      </div>

      {/* Suggested Question Chips */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {suggestions.map((sug, idx) => (
            <motion.button
              key={idx}
              type="button"
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleAsk(sug)}
              disabled={isLoading}
              className={`text-[11px] px-2.5 py-1.5 rounded-md transition-colors text-left cursor-pointer shadow-sm ${
                isDark
                  ? "text-neutral-300 hover:text-white bg-[#18181b] border border-neutral-700/80 hover:border-neutral-600"
                  : "text-neutral-700 hover:text-neutral-950 bg-white border border-neutral-200 hover:border-neutral-300"
              }`}
            >
              &ldquo;{sug}&rdquo;
            </motion.button>
          ))}
        </div>
      )}

      {/* Messages Thread */}
      {messages.length > 0 && (
        <div
          className={`space-y-3.5 rounded-lg p-4 max-h-[480px] overflow-y-auto border ${
            isDark
              ? "bg-[#141417] border-neutral-800"
              : "bg-neutral-50 border-neutral-200 shadow-inner"
          }`}
        >
          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex gap-3 text-xs ${
                  msg.role === "user"
                    ? isDark
                      ? "bg-[#222226] p-2.5 rounded border border-neutral-700/80"
                      : "bg-white p-2.5 rounded border border-neutral-200 shadow-sm"
                    : "p-1"
                }`}
              >
                <div className={`mt-0.5 shrink-0 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                  {msg.role === "user" ? (
                    <User className={`w-3.5 h-3.5 ${isDark ? "text-neutral-300" : "text-neutral-700"}`} />
                  ) : (
                    <Bot className={`w-3.5 h-3.5 ${isDark ? "text-neutral-200" : "text-neutral-800"}`} />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <div
                    className={`text-[11px] font-mono ${
                      isDark ? "text-neutral-400" : "text-neutral-500"
                    }`}
                  >
                    {msg.role === "user" ? "You" : "Research Assistant"}
                  </div>
                  <div
                    className={`leading-relaxed text-xs ${
                      isDark ? "text-neutral-200" : "text-neutral-800"
                    }`}
                  >
                    <Markdown
                      components={{
                        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 space-y-1 my-1">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-1">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        code: ({ children }) => (
                          <code
                            className={`font-mono text-[11px] px-1 py-0.5 rounded ${
                              isDark
                                ? "bg-neutral-800 text-neutral-200"
                                : "bg-neutral-200 text-neutral-800"
                            }`}
                          >
                            {children}
                          </code>
                        ),
                      }}
                    >
                      {msg.content}
                    </Markdown>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`flex items-center gap-2 text-xs py-2 ${
                isDark ? "text-neutral-400" : "text-neutral-600"
              }`}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Analyzing research context to answer your question...</span>
            </motion.div>
          )}
        </div>
      )}

      {error && (
        <div
          className={`text-xs p-2.5 rounded-md border ${
            isDark
              ? "text-red-400 bg-[#1c1414] border-red-900/60"
              : "text-red-600 bg-red-50 border-red-200"
          }`}
        >
          {error}
        </div>
      )}

      {/* Input Box */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div
          className={`relative flex-1 rounded-md p-[1.5px] overflow-hidden transition-colors shadow-sm ${
            isDark
              ? "bg-neutral-700/80 focus-within:bg-neutral-500"
              : "bg-neutral-800 focus-within:bg-neutral-700 ring-1 ring-neutral-900/30"
          }`}
        >
          <MovingBorder duration={8000} rx={6} ry={6}>
            <div
              className={`opacity-100 ${
                isDark
                  ? "w-20 h-20 bg-[radial-gradient(circle_at_center,#ffffff_0%,rgba(255,255,255,0.9)_25%,rgba(255,255,255,0.3)_50%,transparent_70%)]"
                  : "w-28 h-28 bg-[radial-gradient(circle_at_center,#ffffff_0%,rgba(255,255,255,1)_30%,rgba(255,255,255,0.75)_55%,rgba(255,255,255,0.25)_75%,transparent_90%)] filter drop-shadow-[0_0_8px_rgba(255,255,255,0.9)]"
              }`}
              aria-hidden="true"
            />
          </MovingBorder>
          <input
            id="followup-question-input"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question based on this research..."
            disabled={isLoading}
            className={`w-full relative z-10 outline-none text-base sm:text-xs px-3.5 py-2.5 rounded-[5px] transition-colors bg-[#18181b] border border-neutral-800/80 ${
              isDark
                ? "text-neutral-100 placeholder:text-neutral-400"
                : "text-neutral-300 placeholder:text-neutral-500"
            }`}
          />
        </div>
        <motion.button
          id="ask-followup-button"
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => handleAsk()}
          disabled={isLoading || !question.trim()}
          className={`inline-flex w-full sm:w-auto justify-center items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-md transition-all shadow-sm shrink-0 cursor-pointer disabled:cursor-not-allowed ${
            question.trim()
              ? "bg-neutral-100 hover:bg-white text-black ring-1 ring-white/60 shadow-sm"
              : "bg-[#27272a] text-neutral-400 border border-neutral-600/80 hover:bg-[#323238] hover:text-neutral-300"
          }`}
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>Ask</span>
        </motion.button>
      </div>
    </section>
  );
};

export default FollowUpQa;
