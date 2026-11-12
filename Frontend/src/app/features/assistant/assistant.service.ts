import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppConfig } from '../../core/config/app-config';
import {
  AmbiguityList,
  AskResponse,
  Conversation,
  ConversationPage,
  DocumentList,
  KnowledgeDocument,
  RuleDetail,
  RuleList,
} from './assistant.model';

/** Assistant académique, règlement et documents du service d'Aziz (via la Gateway : `/api/v1/reclamation/...`). */
@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfig);

  private get base(): string {
    return `${this.config.apiUrl}/api/v1/reclamation`;
  }

  ask(question: string, conversationId: number | null, academicYear?: string): Observable<AskResponse> {
    const body: Record<string, unknown> = { question };
    if (conversationId !== null) {
      body['conversation_id'] = conversationId;
    }
    if (academicYear) {
      body['academic_year'] = academicYear;
    }
    return this.http.post<AskResponse>(`${this.base}/academic-assistant/ask/`, body);
  }

  conversations(): Observable<ConversationPage> {
    return this.http.get<ConversationPage>(`${this.base}/conversations/`, { params: new HttpParams().set('limit', 100) });
  }

  conversation(id: number): Observable<Conversation> {
    return this.http.get<Conversation>(`${this.base}/conversations/${id}/`);
  }

  rename(id: number, title: string): Observable<Conversation> {
    return this.http.put<Conversation>(`${this.base}/conversations/${id}/`, { title });
  }

  deleteConversation(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/conversations/${id}/`);
  }

  rules(filters: { q?: string; category?: string; article?: string } = {}): Observable<RuleList> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value && value.trim()) {
        params = params.set(key, value.trim());
      }
    }
    return this.http.get<RuleList>(`${this.base}/academic-rules/`, { params });
  }

  rule(id: string): Observable<RuleDetail> {
    return this.http.get<RuleDetail>(`${this.base}/academic-rules/${encodeURIComponent(id)}/`);
  }

  ambiguities(): Observable<AmbiguityList> {
    return this.http.get<AmbiguityList>(`${this.base}/ambiguities/`);
  }

  documents(): Observable<DocumentList> {
    return this.http.get<DocumentList>(`${this.base}/documents/`);
  }

  uploadDocument(file: File): Observable<KnowledgeDocument> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<KnowledgeDocument>(`${this.base}/documents/`, form);
  }

  replaceDocument(id: number, file: File): Observable<KnowledgeDocument> {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<KnowledgeDocument>(`${this.base}/documents/${id}/`, form);
  }

  deleteDocument(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/documents/${id}/`);
  }
}
