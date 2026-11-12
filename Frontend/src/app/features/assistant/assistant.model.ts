/** Forme des réponses du service d'Aziz (assistant académique, règlement, documents). */

export interface PageEvidence {
  document_id: string;
  title: string;
  source: string;
  page: number;
  articles: string[];
  excerpt: string;
  text: string;
  cited: boolean;
}

export interface RuleEvidence {
  rule_id: string;
  article: string;
  pages: number[];
  category: string;
  rule_type: string;
  text: string;
  citation: string;
  cited: boolean;
}

export interface AmbiguityEvidence {
  amb_id: string;
  issue: string;
  pages: number[];
  details: string;
  handling: string;
}

export interface Evidence {
  academic_year: string;
  pages: PageEvidence[];
  rules: RuleEvidence[];
  ambiguities: AmbiguityEvidence[];
}

export interface CitationCheck {
  verified?: boolean;
  warnings?: string[];
  cited_pages?: number[];
  cited_rules?: string[];
  invalid_pages?: number[];
  invalid_rules?: string[];
}

export interface ChatMessage {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
  evidence?: Evidence;
  citation_check?: CitationCheck;
  official_decision?: boolean;
  academic_year?: string;
  /** Message en attente de réponse ou en échec (jamais envoyé par le service). */
  pending?: boolean;
  failed?: boolean;
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  messages?: ChatMessage[];
}

export interface ConversationPage {
  count?: number;
  next?: string | null;
  results: Conversation[];
}

export interface AskResponse {
  conversation_id: number;
  answer: string;
  academic_year: string;
  official_decision: boolean;
  evidence: Evidence;
  citation_check: CitationCheck;
}

export interface AcademicRule {
  id: string;
  article: string;
  pages: number[];
  category: string;
  rule_type: string;
  rule: string;
  source_citation: string;
  automatable: boolean;
  academic_year: string;
}

export interface Ambiguity {
  id: string;
  issue: string;
  pages: number[];
  details: string;
  handling: string;
}

export interface RuleDetail extends AcademicRule {
  related_ambiguities: Ambiguity[];
  official_source: string;
}

export interface RuleList {
  count: number;
  results: AcademicRule[];
  official_source: string;
}

export interface AmbiguityList {
  count: number;
  results: Ambiguity[];
}

export interface KnowledgeDocument {
  id: number;
  filename: string;
  title: string;
  origin: 'pdf' | 'json';
  academic_year: string;
  status: string;
  error: string;
  page_count: number;
  chunk_count: number;
  ingested_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentList {
  count: number;
  results: KnowledgeDocument[];
}

export const QUESTION_MAX = 2000;
export const TITLE_MAX = 200;

export const SUGGESTIONS: readonly string[] = [
  'Quelles sont les conditions de validation d\'un module ?',
  'Combien d\'absences sont tolérées avant l\'élimination ?',
  'Comment fonctionne le rattrapage ?',
  'Quelles sont les règles de passage en année supérieure ?',
];
