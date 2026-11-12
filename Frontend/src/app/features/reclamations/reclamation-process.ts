import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/http/error-message';
import { ToastService } from '../../core/toast/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import {
  CATEGORY_LABELS,
  COMMENT_MAX,
  PRIORITIES,
  PRIORITY_LABELS,
  Priority,
  RESPONSE_MAX,
  Reclamation,
  STATUS_LABELS,
  Status,
  StatusChange,
  TRANSITIONS,
  isFinal,
} from './reclamation.model';
import { PriorityPill, StatusPill } from './reclamation-pills';
import { ReclamationsService } from './reclamations.service';

/** Écran 6 : traitement d'une réclamation par l'administration (changement de statut, priorité, réponse). */
@Component({
  selector: 'app-reclamation-process',
  imports: [DatePipe, FormsModule, RouterLink, ConfirmDialog, StatusPill, PriorityPill],
  template: `
    @if (notFound()) {
      <div class="card empty-state">
        <h2>Réclamation introuvable</h2>
        <a class="btn btn-primary" routerLink="/reclamations/gestion">Retour à la gestion</a>
      </div>
    } @else if (failed()) {
      <div class="alert" role="alert">
        Impossible de charger cette réclamation.
        <button type="button" class="link-btn" (click)="load()">Réessayer</button>
      </div>
    } @else if (reclamation(); as rec) {
      <div class="page">
        <p class="crumbs">
          <a routerLink="/reclamations/gestion">Gestion</a> /
          <a [routerLink]="['/reclamations', rec.id]">{{ rec.reference }}</a> / Traitement
        </p>
        <header class="page-head">
          <div>
            <h1>Traiter {{ rec.reference }}</h1>
            <p>{{ rec.subject }}</p>
          </div>
          <app-status-pill [status]="rec.status" />
        </header>

        <div class="columns">
          <section class="card card-pad">
            <h2>Résumé</h2>
            <dl>
              <div><dt>Étudiant</dt><dd>{{ rec.author_username }}</dd></div>
              <div><dt>Catégorie</dt><dd>{{ categories[rec.category] }}</dd></div>
              <div><dt>Soumise le</dt><dd>{{ rec.created_at | date: 'dd/MM/yyyy HH:mm' }}</dd></div>
              <div><dt>Priorité actuelle</dt><dd><app-priority-pill [priority]="rec.priority" /></dd></div>
            </dl>
            <h3>Description</h3>
            <p class="text">{{ rec.description }}</p>
          </section>

          @if (final()) {
            <section class="card card-pad">
              <h2>Réclamation clôturée</h2>
              <p class="muted">Cette réclamation est dans un état final ({{ statusLabels[rec.status] }}) : elle ne peut plus être modifiée.</p>
              <a class="btn btn-secondary" [routerLink]="['/reclamations', rec.id]">Voir le détail</a>
            </section>
          } @else {
            <form class="card card-pad form" (ngSubmit)="ask()" #f="ngForm">
              <h2>Décision</h2>
              <label>Nouveau statut
                <select name="status" [(ngModel)]="status" required>
                  <option value="" disabled>Choisir un statut</option>
                  @for (item of options(); track item) { <option [value]="item">{{ statusLabels[item] }}</option> }
                </select>
              </label>
              <label>Priorité
                <select name="priority" [(ngModel)]="priority">
                  @for (item of priorities; track item) { <option [value]="item">{{ priorityLabels[item] }}</option> }
                </select>
              </label>
              <label>Commentaire interne (historique)
                <textarea name="comment" rows="3" [(ngModel)]="comment" [maxlength]="commentMax"></textarea>
                <small class="muted">{{ comment.length }}/{{ commentMax }}</small>
              </label>
              <label>Réponse à l'étudiant @if (needsResponse()) { <span class="req">(obligatoire)</span> }
                <textarea name="response" rows="6" [(ngModel)]="response" [maxlength]="responseMax"></textarea>
                <small class="muted">{{ response.length }}/{{ responseMax }}</small>
              </label>
              @if (error()) { <div class="alert" role="alert">{{ error() }}</div> }
              <div class="actions">
                <a class="btn btn-secondary" [routerLink]="['/reclamations', rec.id]">Annuler</a>
                <button type="submit" class="btn btn-primary" [disabled]="!canSubmit()">Enregistrer la décision</button>
              </div>
            </form>
          }
        </div>
      </div>

      @if (confirming()) {
        <app-confirm-dialog
          title="Confirmer la décision ?"
          [message]="'La réclamation passera à « ' + statusLabels[status || rec.status] + ' ». Cette décision est définitive.'"
          confirmLabel="Confirmer"
          [busy]="saving()"
          (confirmed)="submit()"
          (cancelled)="confirming.set(false)"
        />
      }
    } @else {
      <div class="card card-pad"><div class="skeleton"></div></div>
    }
  `,
  styles: `
    h2 { margin: 0 0 12px; font-size: 16px; }
    h3 { margin: 16px 0 6px; font-size: 14px; }
    .columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; align-items: start; }
    dl { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; }
    dt { font-size: 12px; color: var(--text-muted); }
    dd { margin: 0; font-weight: 500; }
    .text { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.6; }
    .muted { color: var(--text-muted); }
    .form { display: grid; gap: 14px; }
    label { display: grid; gap: 6px; font-weight: 500; }
    label small { font-weight: 400; justify-self: end; }
    .req { color: var(--danger); font-weight: 400; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    @media (max-width: 900px) { .columns { grid-template-columns: 1fr; } }
  `,
})
export class ReclamationProcess {
  private readonly api = inject(ReclamationsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly categories = CATEGORY_LABELS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly priorities = PRIORITIES;
  protected readonly commentMax = COMMENT_MAX;
  protected readonly responseMax = RESPONSE_MAX;

  protected readonly reclamation = signal<Reclamation | null>(null);
  protected readonly notFound = signal(false);
  protected readonly failed = signal(false);
  protected readonly confirming = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  protected status: Status | '' = '';
  protected priority: Priority = 'normal';
  protected comment = '';
  protected response = '';

  protected readonly final = computed(() => {
    const rec = this.reclamation();
    return rec !== null && isFinal(rec.status);
  });
  protected readonly options = computed(() => {
    const rec = this.reclamation();
    return rec ? TRANSITIONS[rec.status] : [];
  });

  constructor() {
    this.load();
  }

  /** Une décision finale (résolue ou rejetée) exige une réponse à l'étudiant. */
  protected needsResponse(): boolean {
    return this.status === 'resolved' || this.status === 'rejected';
  }

  protected canSubmit(): boolean {
    return this.status !== '' && (!this.needsResponse() || this.response.trim().length > 0) && !this.saving();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.get(this.id).subscribe({
      next: (rec) => {
        this.reclamation.set(rec);
        this.priority = rec.priority;
      },
      error: (error: HttpErrorResponse) => (error.status === 404 ? this.notFound.set(true) : this.failed.set(true)),
    });
  }

  protected ask(): void {
    if (!this.canSubmit()) {
      return;
    }
    if (this.needsResponse()) {
      this.confirming.set(true);
    } else {
      this.submit();
    }
  }

  protected submit(): void {
    if (this.status === '') {
      return;
    }
    const change: StatusChange = { status: this.status, priority: this.priority };
    if (this.comment.trim()) {
      change.comment = this.comment.trim();
    }
    if (this.response.trim()) {
      change.admin_response = this.response.trim();
    }
    this.saving.set(true);
    this.error.set('');
    this.api.changeStatus(this.id, change).subscribe({
      next: (rec) => {
        this.toast.success('Décision enregistrée.');
        this.router.navigate(['/reclamations', rec.id]);
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.confirming.set(false);
        this.error.set(errorMessage(error));
      },
    });
  }
}
