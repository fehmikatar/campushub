import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../core/http/error-message';
import { ToastService } from '../../core/toast/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { renderMarkdown } from '../../shared/markdown/markdown';
import { ChatMessage, Conversation, QUESTION_MAX, SUGGESTIONS, TITLE_MAX } from './assistant.model';
import { AssistantService } from './assistant.service';

/** Écran 8 : assistant académique (questions sur le règlement, réponses sourcées, historique des conversations). */
@Component({
  selector: 'app-assistant-page',
  imports: [DatePipe, FormsModule, RouterLink, Icon, ConfirmDialog],
  templateUrl: './assistant-page.html',
  styleUrl: './assistant-page.scss',
})
export class AssistantPage {
  private readonly api = inject(AssistantService);
  private readonly toast = inject(ToastService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly icons = Icons;
  protected readonly suggestions = SUGGESTIONS;
  protected readonly questionMax = QUESTION_MAX;
  protected readonly titleMax = TITLE_MAX;

  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly listFailed = signal(false);
  protected readonly currentId = signal<number | null>(null);
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly loadingConversation = signal(false);
  protected readonly sending = signal(false);
  protected readonly openedSources = signal<ChatMessage | null>(null);
  protected readonly deleting = signal<Conversation | null>(null);
  protected readonly renaming = signal<number | null>(null);
  protected readonly menuOpen = signal(false);
  protected readonly busyDelete = signal(false);

  protected question = '';
  protected renameValue = '';

  protected readonly empty = computed(() => this.messages().length === 0 && !this.loadingConversation());

  constructor() {
    this.loadConversations();
  }

  protected html(text: string): string {
    return renderMarkdown(text);
  }

  protected loadConversations(): void {
    this.listFailed.set(false);
    this.api.conversations().subscribe({
      next: (page) => this.conversations.set(page.results),
      error: () => this.listFailed.set(true),
    });
  }

  protected newConversation(): void {
    this.currentId.set(null);
    this.messages.set([]);
    this.openedSources.set(null);
    this.menuOpen.set(false);
  }

  protected open(conversation: Conversation): void {
    this.menuOpen.set(false);
    this.openedSources.set(null);
    this.currentId.set(conversation.id);
    this.loadingConversation.set(true);
    this.messages.set([]);
    this.api.conversation(conversation.id).subscribe({
      next: (full) => {
        this.messages.set(full.messages ?? []);
        this.loadingConversation.set(false);
        this.scrollDown();
      },
      error: (error: HttpErrorResponse) => {
        this.loadingConversation.set(false);
        this.currentId.set(null);
        this.toast.error(errorMessage(error));
        this.loadConversations();
      },
    });
  }

  protected suggest(text: string): void {
    this.question = text;
    this.send();
  }

  protected canSend(): boolean {
    const text = this.question.trim();
    return text.length > 0 && text.length <= QUESTION_MAX && !this.sending();
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  protected send(): void {
    if (!this.canSend()) {
      return;
    }
    const text = this.question.trim();
    this.question = '';
    this.messages.update((list) => [...list, { role: 'user', content: text }, { role: 'assistant', content: '', pending: true }]);
    this.sending.set(true);
    this.scrollDown();
    this.api.ask(text, this.currentId()).subscribe({
      next: (response) => {
        const wasNew = this.currentId() === null;
        this.currentId.set(response.conversation_id);
        this.messages.update((list) => [
          ...list.slice(0, -1),
          {
            role: 'assistant',
            content: response.answer,
            evidence: response.evidence,
            citation_check: response.citation_check,
            official_decision: response.official_decision,
            academic_year: response.academic_year,
          },
        ]);
        this.sending.set(false);
        this.scrollDown();
        if (wasNew) {
          this.loadConversations();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.sending.set(false);
        this.question = text;
        this.messages.update((list) => [...list.slice(0, -1), { role: 'assistant', content: errorMessage(error), failed: true }]);
        this.scrollDown();
      },
    });
  }

  protected startRename(conversation: Conversation): void {
    this.renaming.set(conversation.id);
    this.renameValue = conversation.title;
  }

  protected saveRename(conversation: Conversation): void {
    const title = this.renameValue.trim();
    this.renaming.set(null);
    if (!title || title === conversation.title) {
      return;
    }
    this.api.rename(conversation.id, title).subscribe({
      next: () => this.conversations.update((list) => list.map((c) => (c.id === conversation.id ? { ...c, title } : c))),
      error: (error: HttpErrorResponse) => this.toast.error(errorMessage(error)),
    });
  }

  protected confirmDelete(): void {
    const target = this.deleting();
    if (!target) {
      return;
    }
    this.busyDelete.set(true);
    this.api.deleteConversation(target.id).subscribe({
      next: () => {
        this.busyDelete.set(false);
        this.deleting.set(null);
        this.conversations.update((list) => list.filter((c) => c.id !== target.id));
        if (this.currentId() === target.id) {
          this.newConversation();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.busyDelete.set(false);
        this.deleting.set(null);
        this.toast.error(errorMessage(error));
      },
    });
  }

  /** Pages citées dans la réponse (ou, à défaut, pages retrouvées). */
  protected citedPages(message: ChatMessage): number[] {
    const cited = message.citation_check?.cited_pages ?? [];
    return cited.length ? cited : (message.evidence?.pages ?? []).map((page) => page.page);
  }

  protected hasSources(message: ChatMessage): boolean {
    const evidence = message.evidence;
    return !!evidence && (evidence.pages.length > 0 || evidence.rules.length > 0 || evidence.ambiguities.length > 0);
  }

  private scrollDown(): void {
    setTimeout(() => {
      const element = this.scroller()?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }
}
