export type ResearchMode = 'quick' | 'deep' | 'academic';

export interface SourceQuality {
  authorityTier: 'High' | 'Medium' | 'Standard';
  sourceType: 'official' | 'academic' | 'news' | 'documentation' | 'web';
  isPrimary: boolean;
  academicCredibility?: string; // e.g. 'Peer-Reviewed Journal', 'IEEE Conference', 'RFC Standard', 'Official Documentation'
  publishedYear?: string;
  relevanceLevel: 'High' | 'Medium';
  whyRelevant?: string;
  supportedClaims?: string;
}

export interface SourceCitation {
  id: number;
  title: string;
  url: string;
  snippet?: string;
  sourceType: 'official' | 'academic' | 'news' | 'documentation' | 'web';
  domain?: string;
  quality?: SourceQuality;
}

export interface AcademicPaper {
  id: string;
  title: string;
  authors?: string;
  year?: string;
  publication?: string;
  url: string;
  doi?: string;
  abstract?: string;
  keyContribution?: string;
  methodology?: string;
  limitations?: string;
  isIeeeOpenAccess?: boolean;
  isOpenAccess?: boolean;
  isPaywalled?: boolean;
  relevance: string;
}

export interface MediaResource {
  id: string;
  type: 'video' | 'image' | 'resource' | 'dataset' | 'tool';
  title: string;
  url: string;
  description?: string;
  thumbnail?: string;
  category?: string;
}

export interface PdfReference {
  id: string;
  fileName?: string;
  sectionTitle: string;
  pageNumber?: number | string;
  extractedFinding: string;
  relevanceToQuery?: string;
}

export interface StructuredSection {
  id: string;
  title: string;
  content: string; // Markdown content with inline citations
}

export interface ResearchPlan {
  intent: string;
  mode: ResearchMode;
  isComplex: boolean;
  hasPdf: boolean;
  subtasks: string[];
  searchQueries: string[];
  focusAreas?: string[];
}

export interface ContradictionItem {
  topic: string;
  claimA: string;
  sourceA: string;
  claimB: string;
  sourceB: string;
  analysis: string;
}

export interface ResearchStats {
  subtasksCompleted: number;
  sourcesEvaluated: number;
  uniqueFactsExtracted: number;
  deduplicatedCount: number;
  durationMs: number;
  contradictionsFound?: number;
}

export interface ResearchResult {
  query: string;
  mode: ResearchMode;
  isDeepResearch: boolean;
  hasPdf: boolean;
  pdfFileName?: string;
  pdfFileNames?: string[];
  pdfFiles?: { name: string; size?: number }[];
  plan: ResearchPlan;
  sections: StructuredSection[];
  sources: SourceCitation[];
  papers: AcademicPaper[];
  videos: MediaResource[];
  images: MediaResource[];
  additionalResources: MediaResource[];
  pdfReferences?: PdfReference[];
  /** Bounded extracted document context retained for report follow-ups. */
  pdfDocumentContext?: string;
  pdfProcessingError?: string;
  contradictions?: ContradictionItem[];
  relatedQuestions?: string[];
  stats: ResearchStats;
}

export type ProgressStepId = 
  | 'planning'
  | 'retrieval'
  | 'pdf_processing'
  | 'evaluation'
  | 'deduplication'
  | 'synthesis';

export interface ProgressStep {
  id: ProgressStepId;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'error';
  detail?: string;
}

export interface UploadedFile {
  name: string;
  mimeType: string;
  size: number;
  /** Text extracted in the browser. Raw PDF bytes are intentionally never sent to Vercel. */
  text?: string;
  pageCount?: number;
}

export interface ResearchRequestPayload {
  query: string;
  mode?: ResearchMode;
  file?: UploadedFile;
  files?: UploadedFile[];
  previousContext?: {
    originalQuery: string;
    mode: ResearchMode;
    summary: string;
  };
}

export interface QaMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface DiagramResult {
  title: string;
  mermaidCode: string;
  explanation: string;
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  query: string;
  mode?: ResearchMode;
  result: ResearchResult;
  qaMessages?: QaMessage[];
  diagram?: DiagramResult;
}

