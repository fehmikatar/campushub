import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { AcademicRule, Ambiguity } from '../assistant/assistant.model';
import { AssistantService } from '../assistant/assistant.service';

/** Écran 9 : explorateur du règlement (règles structurées et points ambigus connus), en lecture seule. */
@Component({
  selector: 'app-regulation-page',
  imports: [FormsModule, RouterLink, Icon],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Règlement de scolarité</h1>
          <p>Règles structurées et points ambigus du règlement. Contenu en lecture seule.</p>
        </div>
        <a class="btn btn-primary" routerLink="/assistant"><app-icon [name]="icons.bot" [size]="16" /> Poser une question</a>
      </header>

      <div class="tabs" role="tablist">
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'rules'" [class.on]="tab() === 'rules'" (click)="tab.set('rules')">Règles ({{ rules().length }})</button>
        <button type="button" role="tab" [attr.aria-selected]="tab() === 'amb'" [class.on]="tab() === 'amb'" (click)="tab.set('amb')">Points ambigus ({{ ambiguities().length }})</button>
      </div>

      @if (failed()) {
        <div class="alert" role="alert">Impossible de charger le règlement. <button type="button" class="link-btn" (click)="load()">Réessayer</button></div>
      } @else if (loading()) {
        <div class="card card-pad"><div class="skeleton"></div></div>
      } @else if (tab() === 'rules') {
        <div class="toolbar">
          <div class="grow"><input class="search-input" type="search" [(ngModel)]="query" placeholder="Rechercher dans les règles..." aria-label="Rechercher" /></div>
          <label class="control">Catégorie
            <select [(ngModel)]="category">
              <option value="">Toutes</option>
              @for (item of categories(); track item) { <option [value]="item">{{ item }}</option> }
            </select>
          </label>
        </div>
        @for (rule of filtered(); track rule.id) {
          <article class="card card-pad item">
            <header>
              <strong>{{ rule.id }}</strong>
              <span class="pill pill-info">{{ rule.category }}</span>
              <span class="muted">Article {{ rule.article }} · pages {{ rule.pages.join(', ') }}</span>
            </header>
            <p>{{ rule.rule }}</p>
            <small class="muted">{{ rule.source_citation }}</small>
          </article>
        } @empty {
          <div class="card empty-state"><h2>Aucune règle</h2><p class="muted">Aucune règle ne correspond à votre recherche.</p></div>
        }
      } @else {
        @for (item of ambiguities(); track item.id) {
          <article class="card card-pad item amb">
            <header><strong>{{ item.id }}</strong><span class="muted">pages {{ item.pages.join(', ') }}</span></header>
            <h2>{{ item.issue }}</h2>
            <p>{{ item.details }}</p>
            <p><strong>Conduite à tenir :</strong> {{ item.handling }}</p>
          </article>
        } @empty {
          <div class="card empty-state"><h2>Aucun point ambigu</h2></div>
        }
      }
    </div>
  `,
  styles: `
    h2 { margin: 0 0 8px; font-size: 16px; }
    .muted { color: var(--text-muted); }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
    .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 14px; cursor: pointer; color: var(--text-muted); font: inherit; }
    .tabs button.on { color: var(--indigo); border-bottom-color: var(--indigo); font-weight: 600; }
    .item { margin-bottom: 12px; }
    .item header { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 6px; }
    .item p { margin: 0 0 6px; line-height: 1.6; }
    .amb { border-left: 4px solid #f59e0b; }
  `,
})
export class RegulationPage {
  private readonly api = inject(AssistantService);

  protected readonly icons = Icons;
  protected readonly rules = signal<AcademicRule[]>([]);
  protected readonly ambiguities = signal<Ambiguity[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly tab = signal<'rules' | 'amb'>('rules');
  protected readonly categories = computed(() => [...new Set(this.rules().map((rule) => rule.category))].sort());

  protected query = '';
  protected category = '';

  protected readonly filtered = () => {
    const text = this.query.trim().toLowerCase();
    return this.rules().filter(
      (rule) =>
        (!this.category || rule.category === this.category) &&
        (!text || `${rule.id} ${rule.rule} ${rule.article}`.toLowerCase().includes(text)),
    );
  };

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    let pending = 2;
    const done = () => {
      if (--pending === 0) {
        this.loading.set(false);
      }
    };
    const fail = () => {
      this.failed.set(true);
      done();
    };
    this.api.rules().subscribe({ next: (list) => { this.rules.set(list.results); done(); }, error: fail });
    this.api.ambiguities().subscribe({ next: (list) => { this.ambiguities.set(list.results); done(); }, error: fail });
  }
}
