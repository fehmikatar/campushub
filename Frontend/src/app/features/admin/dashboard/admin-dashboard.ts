import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { Icon } from '../../../shared/icon/icon';
import { IconData } from '../../../shared/icon/icon';
import { Icons } from '../../../shared/icon/icons';
import { CourseStatus } from '../../courses/course';
import { CoursesService } from '../../courses/courses.service';
import { ForumCategoriesService } from '../forum-categories/forum-categories.service';
import { KeycloakUsersService } from '../users/keycloak-users.service';

interface Stat {
  label: string;
  value: number | null;
  detail: string;
  link: string;
  icon: IconData;
}

/** Accueil de l'administrateur : chiffres clés, chaque carte mène à l'écran de gestion correspondant. */
@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterLink, Icon],
  template: `
    <h1>Tableau de bord</h1>
    <p class="muted">Vue d'ensemble de la plateforme.</p>

    <div class="grid">
      @for (stat of stats(); track stat.label) {
        <a class="card stat" [routerLink]="stat.link">
          <span class="stat-icon"><app-icon [name]="stat.icon" [size]="22" /></span>
          <span class="stat-body">
            <small class="muted">{{ stat.label }}</small>
            <strong class="value">{{ stat.value ?? '—' }}</strong>
            <small class="muted">{{ stat.detail }}</small>
          </span>
        </a>
      }
    </div>
  `,
  styles: `
    :host { display: block; max-width: 1000px; }
    h1 { margin: 0 0 4px; }
    .muted { color: var(--text-muted); margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 20px; }
    .stat { display: flex; align-items: center; gap: 14px; padding: 18px; text-decoration: none; color: var(--text); transition: box-shadow 0.15s; }
    .stat:hover { box-shadow: 0 4px 16px rgb(15 23 42 / 0.1); }
    .stat-icon { display: grid; place-items: center; flex: none; width: 48px; height: 48px; border-radius: 12px; background: var(--indigo-soft); color: var(--indigo); }
    .stat-body { display: grid; gap: 2px; }
    .value { font-size: 28px; font-weight: 600; line-height: 1.1; }
  `,
})
export class AdminDashboard {
  private readonly courses = inject(CoursesService);
  private readonly categories = inject(ForumCategoriesService);
  private readonly users = inject(KeycloakUsersService);

  private readonly icons = Icons;
  protected readonly stats = signal<Stat[]>(this.build([null, null, null, null, null, null, null]));

  constructor() {
    // Chaque chiffre est indépendant : un service indisponible affiche « — » sans bloquer les autres.
    const total = (statut?: CourseStatus) =>
      this.courses.list({ statut, limit: 1 }).pipe(
        map((page) => page.total),
        catchError(() => of(null)),
      );
    forkJoin([
      this.users.count().pipe(catchError(() => of(null))),
      this.users.countMembers('ENSEIGNANT').pipe(catchError(() => of(null))),
      total(),
      total('PUBLIE'),
      total('BROUILLON'),
      total('ARCHIVE'),
      this.categories.list().pipe(
        map((list) => list.length),
        catchError(() => of(null)),
      ),
    ]).subscribe((values) => this.stats.set(this.build(values)));
  }

  private build([users, teachers, courses, published, drafts, archived, categories]: (number | null)[]): Stat[] {
    return [
      { label: 'Utilisateurs', value: users, detail: 'comptes Keycloak', link: '/utilisateurs', icon: this.icons.users },
      { label: 'Enseignants', value: teachers, detail: 'rôle validé', link: '/utilisateurs', icon: this.icons.userCheck },
      {
        label: 'Cours',
        value: courses,
        detail: `${published ?? '—'} publiés, ${drafts ?? '—'} brouillons, ${archived ?? '—'} archivés`,
        link: '/cours',
        icon: this.icons.library,
      },
      { label: 'Catégories du forum', value: categories, detail: 'à gérer', link: '/categories', icon: this.icons.tags },
    ];
  }
}
