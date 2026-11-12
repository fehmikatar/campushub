import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { errorMessage } from '../../core/http/error-message';
import { ToastService } from '../../core/toast/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { KnowledgeDocument } from '../assistant/assistant.model';
import { AssistantService } from '../assistant/assistant.service';

export const MAX_PDF_MB = 20;

/** Écran 10 (ADMIN) : documents indexés par l'assistant (dépôt, remplacement, suppression de PDF). */
@Component({
  selector: 'app-documents-page',
  imports: [DatePipe, Icon, ConfirmDialog],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Documents de l'assistant</h1>
          <p>PDF indexés pour répondre aux questions. L'indexation peut prendre quelques instants.</p>
        </div>
        <label class="btn btn-primary upload" [class.disabled]="busy()">
          <app-icon [name]="icons.upload" [size]="16" /> {{ busy() ? 'Indexation...' : 'Ajouter un PDF' }}
          <input type="file" accept="application/pdf,.pdf" [disabled]="busy()" (change)="pick($event, null)" hidden />
        </label>
      </header>

      @if (failed()) {
        <div class="alert" role="alert">Impossible de charger les documents. <button type="button" class="link-btn" (click)="load()">Réessayer</button></div>
      } @else if (items() === null) {
        <div class="card card-pad"><div class="skeleton"></div></div>
      } @else if (items()!.length === 0) {
        <div class="card empty-state"><h2>Aucun document</h2><p class="muted">Ajoutez un PDF pour l'indexer.</p></div>
      } @else {
        <div class="card table-wrap">
          <table>
            <thead><tr><th>Document</th><th>Origine</th><th>Pages</th><th>Segments</th><th>Statut</th><th>Indexé le</th><th></th></tr></thead>
            <tbody>
              @for (doc of items(); track doc.id) {
                <tr>
                  <td><strong>{{ doc.title || doc.filename }}</strong><br /><small class="muted">{{ doc.filename }}</small></td>
                  <td>{{ doc.origin === 'json' ? 'Règlement préparé' : 'PDF' }}</td>
                  <td>{{ doc.page_count }}</td>
                  <td>{{ doc.chunk_count }}</td>
                  <td><span class="pill" [class.pill-success]="doc.status === 'indexed' || doc.status === 'ready'" [class.pill-danger]="doc.status === 'failed'" [class.pill-warning]="doc.status === 'pending'">{{ statusLabel(doc.status) }}</span>
                    @if (doc.error) { <br /><small class="error-text">{{ doc.error }}</small> }</td>
                  <td>{{ doc.ingested_at ? (doc.ingested_at | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                  <td class="actions">
                    @if (doc.origin === 'pdf') {
                      <label class="btn btn-secondary small" [class.disabled]="busy()">Remplacer<input type="file" accept="application/pdf,.pdf" [disabled]="busy()" (change)="pick($event, doc)" hidden /></label>
                      <button type="button" class="btn btn-secondary small" (click)="deleting.set(doc)" aria-label="Supprimer"><app-icon [name]="icons.trash" [size]="14" /></button>
                    } @else {
                      <small class="muted">Lecture seule</small>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (deleting(); as doc) {
      <app-confirm-dialog title="Supprimer ce document ?" [message]="'« ' + (doc.title || doc.filename) + ' » sera retiré de l\\'index de l\\'assistant.'" [busy]="busy()" (confirmed)="remove(doc)" (cancelled)="deleting.set(null)" />
    }
  `,
  styles: `
    h2 { margin: 0 0 8px; font-size: 16px; }
    .muted { color: var(--text-muted); }
    .error-text { color: var(--danger); }
    .upload { cursor: pointer; }
    .disabled { opacity: 0.6; pointer-events: none; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { font-size: 12px; color: var(--text-muted); font-weight: 500; }
    .actions { display: flex; gap: 6px; justify-content: flex-end; }
    .small { height: 32px; padding: 0 10px; cursor: pointer; }
  `,
})
export class DocumentsPage {
  private readonly api = inject(AssistantService);
  private readonly toast = inject(ToastService);

  protected readonly icons = Icons;
  protected readonly items = signal<KnowledgeDocument[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly busy = signal(false);
  protected readonly deleting = signal<KnowledgeDocument | null>(null);

  constructor() {
    this.load();
  }

  protected statusLabel(status: string): string {
    const labels: Record<string, string> = { indexed: 'Indexé', ready: 'Indexé', pending: 'En attente', failed: 'Échec' };
    return labels[status] ?? status;
  }

  protected load(): void {
    this.failed.set(false);
    this.api.documents().subscribe({
      next: (list) => this.items.set(list.results),
      error: () => this.failed.set(true),
    });
  }

  protected pick(event: Event, replace: KnowledgeDocument | null): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      this.toast.error('Seuls les fichiers PDF sont acceptés.');
      return;
    }
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      this.toast.error(`Le fichier dépasse ${MAX_PDF_MB} Mo.`);
      return;
    }
    this.busy.set(true);
    const call = replace ? this.api.replaceDocument(replace.id, file) : this.api.uploadDocument(file);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(replace ? 'Document remplacé et réindexé.' : 'Document ajouté et indexé.');
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  protected remove(doc: KnowledgeDocument): void {
    this.busy.set(true);
    this.api.deleteDocument(doc.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toast.success('Document supprimé.');
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toast.error(errorMessage(error));
      },
    });
  }
}
