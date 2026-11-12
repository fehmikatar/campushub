import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { StatCard } from '../../shared/stat-card/stat-card';
import { Reclamation, Status } from './reclamation.model';
import { ReclamationTable } from './reclamation-table';
import { ReclamationsService } from './reclamations.service';

/** Écran 1 : tableau de bord des réclamations de l'étudiant. */
@Component({
  selector: 'app-reclamations-dashboard',
  imports: [RouterLink, Icon, StatCard, ReclamationTable],
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Bonjour, {{ user()?.prenom || 'bienvenue' }} !</h1>
          <p>Suivez vos réclamations et obtenez l'aide dont vous avez besoin.</p>
        </div>
        <a class="btn btn-primary" routerLink="/reclamations/nouvelle">
          <app-icon [name]="icons.plus" [size]="16" /> Nouvelle réclamation
        </a>
      </header>

      <div class="stat-grid">
        <app-stat-card label="Total de mes réclamations" [value]="counts()?.total ?? null" [icon]="icons.clipboardList" link="/reclamations/liste" />
        <app-stat-card label="Nouvelles" [value]="counts()?.new ?? null" [icon]="icons.inbox" />
        <app-stat-card label="En cours" [value]="counts()?.in_progress ?? null" [icon]="icons.hourglass" />
        <app-stat-card label="Résolues" [value]="counts()?.resolved ?? null" [icon]="icons.circleCheck" />
      </div>

      <section class="card block">
        <header>
          <h2>Mes dernières réclamations</h2>
          <a routerLink="/reclamations/liste">Consulter mes réclamations →</a>
        </header>
        @if (failed()) {
          <p class="muted pad">Impossible de charger vos réclamations. Réessayez dans un instant.</p>
        } @else if (recent() === null) {
          <div class="pad"><div class="skeleton"></div></div>
        } @else if (recent()!.length === 0) {
          <div class="empty-state">
            <span class="badge-icon"><app-icon [name]="icons.inbox" [size]="36" /></span>
            <h2>Aucune réclamation pour le moment</h2>
            <p class="muted">Vous n'avez pas encore soumis de réclamation.</p>
            <a class="btn btn-primary" routerLink="/reclamations/nouvelle">Créer une réclamation</a>
          </div>
        } @else {
          <app-reclamation-table [items]="recent()!" />
        }
      </section>

      <section class="card assistant">
        <span class="badge-icon"><app-icon [name]="icons.bot" [size]="28" /></span>
        <div class="grow">
          <h2>Besoin d'aide avec le règlement ?</h2>
          <p class="muted">
            Notre assistant académique peut vous aider à comprendre les procédures, les règles et les démarches universitaires.
          </p>
        </div>
        <a class="btn btn-secondary" routerLink="/assistant">Poser une question</a>
      </section>
    </div>
  `,
  styles: `
    .block { margin-bottom: 20px; overflow: hidden; }
    .block > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 8px; }
    .block h2, .assistant h2 { margin: 0; font-size: 16px; }
    .block > header a { font-size: 13px; text-decoration: none; }
    .pad { margin: 0; padding: 8px 18px 18px; }
    .muted { color: var(--text-muted); margin: 0; }
    .assistant { display: flex; align-items: center; gap: 16px; padding: 20px; flex-wrap: wrap; }
    .assistant .grow { flex: 1; min-width: 220px; display: grid; gap: 4px; }
    .badge-icon { display: grid; place-items: center; flex: none; width: 56px; height: 56px; border-radius: 14px; background: var(--indigo-soft); color: var(--indigo); }
  `,
})
export class ReclamationsDashboard {
  private readonly api = inject(ReclamationsService);

  protected readonly icons = Icons;
  protected readonly user = inject(AuthService).user;
  protected readonly counts = signal<Record<Status | 'total', number> | null>(null);
  protected readonly recent = signal<Reclamation[] | null>(null);
  protected readonly failed = signal(false);

  constructor() {
    this.api.statusCounts().subscribe({ next: (counts) => this.counts.set(counts), error: () => this.failed.set(true) });
    this.api.list({ ordering: '-created_at' }).subscribe({
      next: (page) => this.recent.set(page.results.slice(0, 5)),
      error: () => this.failed.set(true),
    });
  }
}
