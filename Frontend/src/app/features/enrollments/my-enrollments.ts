import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CourseService } from '../courses/course.service';
import { EnrolledCourse, loadEnrolledCourses } from './enrolled-courses';
import { EnrollmentsService } from './enrollments.service';

type Filter = 'all' | 'progress' | 'done';

/** « Mes cours » de l'étudiant : ses inscriptions réelles, avec le cours et la progression de chacune. */
@Component({
  selector: 'app-my-enrollments',
  imports: [DatePipe, RouterLink],
  template: `
    @if (failed()) {
      <div class="alert" role="alert">
        Impossible de charger vos inscriptions.
        <button type="button" class="link-btn" (click)="load()">Réessayer</button>
      </div>
    } @else if (items() === null) {
      <div class="card card-pad"><div class="skeleton"></div></div>
    } @else if (items()!.length === 0) {
      <section class="card empty-state">
        <h2>Votre parcours commence ici</h2>
        <p class="muted">Vous n'êtes inscrit à aucun cours pour l'instant.</p>
        <a class="btn btn-primary" routerLink="/catalogue">Explorer le catalogue</a>
      </section>
    } @else {
      <div class="tabs" role="tablist">
        @for (tab of tabs; track tab.key) {
          <button type="button" role="tab" [class.on]="filter() === tab.key" [attr.aria-selected]="filter() === tab.key" (click)="filter.set(tab.key)">
            {{ tab.label }} ({{ count(tab.key) }})
          </button>
        }
      </div>
      <div class="grid">
        @for (item of visible(); track item.enrollment.id) {
          <article class="card card-pad course">
            <h2>{{ item.course?.titre ?? 'Cours indisponible' }}</h2>
            <p class="muted">
              {{ item.course?.categorie ?? "Ce cours n'est plus accessible." }} · inscrit le {{ item.enrollment.date_inscription | date: 'dd/MM/yyyy' }}
            </p>
            <div class="progress" role="progressbar" [attr.aria-valuenow]="item.percent" aria-valuemin="0" aria-valuemax="100" aria-label="Progression">
              <span [style.width.%]="item.percent"></span>
            </div>
            <div class="foot">
              <strong>{{ item.percent }} %</strong>
              @if (item.course) {
                <a class="btn btn-primary" [routerLink]="['/courses', item.course.id]">{{ item.percent === 0 ? 'Commencer' : item.percent >= 100 ? 'Revoir' : 'Continuer' }}</a>
              }
            </div>
          </article>
        } @empty {
          <p class="muted">Aucun cours dans cette catégorie.</p>
        }
      </div>
    }
  `,
  styles: `
    h2 { margin: 0 0 4px; font-size: 16px; }
    .muted { color: var(--text-muted); margin: 0 0 12px; }
    .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 16px; flex-wrap: wrap; }
    .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 10px 14px; cursor: pointer; color: var(--text-muted); font: inherit; }
    .tabs button.on { color: var(--indigo); border-bottom-color: var(--indigo); font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .progress { height: 8px; border-radius: 999px; background: var(--border); overflow: hidden; }
    .progress span { display: block; height: 100%; background: var(--indigo); border-radius: 999px; }
    .foot { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
  `,
})
export class MyEnrollments {
  private readonly enrollments = inject(EnrollmentsService);
  private readonly courses = inject(CourseService);

  protected readonly items = signal<EnrolledCourse[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly filter = signal<Filter>('all');
  protected readonly tabs: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Tous' },
    { key: 'progress', label: 'En cours' },
    { key: 'done', label: 'Terminés' },
  ];

  protected readonly visible = computed(() => (this.items() ?? []).filter((item) => this.matches(item, this.filter())));

  constructor() {
    this.load();
  }

  protected count(filter: Filter): number {
    return (this.items() ?? []).filter((item) => this.matches(item, filter)).length;
  }

  protected load(): void {
    this.failed.set(false);
    loadEnrolledCourses(this.enrollments, this.courses).subscribe({
      next: (items) => this.items.set(items),
      error: () => this.failed.set(true),
    });
  }

  private matches(item: EnrolledCourse, filter: Filter): boolean {
    return filter === 'all' || (filter === 'done' ? item.percent >= 100 : item.percent < 100);
  }
}
