import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { CourseService } from '../courses/course.service';
import { Course } from '../courses/course.models';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { QuizService } from './quiz.service';
import { Quiz, QuizResult } from './quiz.models';
import { QuizState } from './quiz-state';
@Component({
  selector: 'app-quiz-list',
  imports: [FormsModule, RouterLink, DatePipe, ConfirmDialog],
  styleUrl: './quiz.scss',
  template: `
    <header class="head">
      <div>
        <p class="eyebrow">CAMPUSHUB · ÉVALUATIONS</p>
        <h1>{{ history && !manager ? 'Mes résultats' : 'Quiz' }}</h1>
        <p class="muted">
          {{
            manager
              ? 'Créez et gérez les évaluations de vos cours.'
              : 'Testez vos connaissances et retrouvez vos résultats.'
          }}
        </p>
      </div>
      @if (manager) {
        <a
          class="btn btn-primary"
          routerLink="/quiz/new"
          [queryParams]="courseId ? { courseId } : {}"
          >Créer un quiz</a
        >
      }
    </header>
    @if (error()) {
      <div class="alert" role="alert">
        {{ error() }}
        <button class="link-btn" (click)="load()" [disabled]="busy()">Réessayer</button>
      </div>
    }
    @if (busy()) {
      <p role="status" class="muted">Chargement…</p>
    }
    @if (history && !manager) {
      <section class="card padded">
        <h2>Historique des tentatives</h2>
        @for (r of results(); track r.id) {
          <a class="result-row" [routerLink]="['/quiz/result', r.id]"
            ><span>Quiz #{{ r.quizId }} · {{ r.datePassage | date: 'dd/MM/yyyy HH:mm' }}</span
            ><strong>{{ r.score }} % →</strong></a
          >
        } @empty {
          @if (!busy()) {
            <p class="muted">Vous n’avez pas encore de résultat.</p>
            <a routerLink="/quiz">Découvrir les quiz</a>
          }
        }
      </section>
    } @else {
      <section class="card filters">
        <label
          >Cours<select [(ngModel)]="courseId" (ngModelChange)="selectCourse()" [disabled]="busy()">
            <option [ngValue]="0">Choisir un cours</option>
            @for (c of courses(); track c.id) {
              <option [ngValue]="c.id">{{ c.titre }}</option>
            }
          </select></label
        ><button
          class="btn btn-secondary"
          [disabled]="busy() || coursePage === 1"
          (click)="coursePage = coursePage - 1; loadCourses()"
        >
          Cours précédents</button
        ><button
          class="btn btn-secondary"
          [disabled]="busy() || !moreCourses()"
          (click)="coursePage = coursePage + 1; loadCourses()"
        >
          Autres cours
        </button>
      </section>
      @if (!courseId) {
        <div class="card empty">
          <h2>Un cours, un nouveau défi</h2>
          <p class="muted">Choisissez un cours pour afficher ses quiz.</p>
        </div>
      }
      @if (courseId && !quizzes().length && !busy() && !error()) {
        <div class="card empty">
          <h2>Aucun quiz pour ce cours</h2>
          <p class="muted">Les évaluations apparaîtront ici dès leur création.</p>
        </div>
      }
      <div class="quiz-grid">
        @for (q of quizzes(); track q.id) {
          <article class="card quiz-card">
            <div class="quiz-cover" aria-hidden="true">?</div>
            <div class="padded">
              <span class="pill info">{{ q.questions.length }} questions</span>
              <h2>{{ q.titre }}</h2>
              <p class="muted">
                {{ q.dureeMinutes ? q.dureeMinutes + ' minutes' : 'Sans limite de temps' }} ·
                {{ q.maxTentatives }} tentative(s) maximum
              </p>
              @if (manager) {
                <div class="actions">
                  <a class="btn btn-secondary" [routerLink]="['/quiz', q.id, 'edit']">Modifier</a
                  ><a class="btn btn-secondary" [routerLink]="['/quiz', q.id, 'results']"
                    >Résultats</a
                  ><button
                    class="btn btn-secondary danger-text"
                    (click)="toDelete.set(q)"
                    [disabled]="busy()"
                  >
                    Supprimer
                  </button>
                </div>
              } @else {
                <p class="muted">{{ remaining(q) }} tentative(s) restante(s)</p>
                @if (remaining(q) === 0) {
                  <button class="btn btn-secondary" disabled>Quota atteint</button>
                } @else {
                  <a class="btn btn-primary" [routerLink]="['/quiz', q.id, 'play']"
                    >Ouvrir le quiz</a
                  >
                }
                @if (lastResult(q); as r) {
                  <a class="btn btn-secondary" [routerLink]="['/quiz/result', r.id]"
                    >Dernier résultat : {{ r.score }} %</a
                  >
                }
              }
            </div>
          </article>
        }
      </div>
      @if (manager) {
        <p class="muted footnote">
          La modification, la suppression et les résultats sont réservés au créateur du quiz ou à
          l’administrateur. Un quiz ayant des résultats ne peut plus être modifié ou supprimé.
        </p>
      }
    }
    @if (toDelete(); as q) {
      <app-confirm-dialog
        title="Supprimer le quiz ?"
        [message]="'Supprimer « ' + q.titre + ' » ?'"
        [busy]="busy()"
        (cancelled)="toDelete.set(null)"
        (confirmed)="remove(q)"
      />
    }
  `,
})
export class QuizList extends QuizState {
  private readonly api = inject(QuizService);
  private readonly courseApi = inject(CourseService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly courses = signal<Course[]>([]);
  readonly quizzes = signal<Quiz[]>([]);
  readonly results = signal<QuizResult[]>([]);
  readonly moreCourses = signal(false);
  readonly toDelete = signal<Quiz | null>(null);
  courseId = Number(this.route.snapshot.queryParamMap.get('courseId')) || 0;
  coursePage = 1;
  readonly history = !!this.route.snapshot.data['history'];
  get manager() {
    return this.auth.user()?.role === 'ADMIN' || this.auth.user()?.role === 'ENSEIGNANT';
  }
  constructor() {
    super();
    void this.load();
  }
  load() {
    return this.run(async () => {
      if (!this.manager) this.results.set(await firstValueFrom(this.api.mine()));
      if (this.history && !this.manager) return;
      await this.fetchCourses();
      if (this.courseId) this.quizzes.set(await firstValueFrom(this.api.list(this.courseId)));
    });
  }
  private async fetchCourses() {
    const page = await firstValueFrom(this.courseApi.list({ page: this.coursePage, limit: 50 }));
    const list = [...page.data];
    if (this.courseId > 0 && !list.some((c) => c.id === this.courseId))
      list.unshift(await firstValueFrom(this.courseApi.get(this.courseId)));
    this.courses.set(list);
    this.moreCourses.set(page.total > this.coursePage * 50);
  }
  loadCourses() {
    return this.run(() => this.fetchCourses());
  }
  selectCourse() {
    this.quizzes.set([]);
    if (!this.courseId) return;
    return this.run(async () => {
      this.quizzes.set(await firstValueFrom(this.api.list(this.courseId)));
    });
  }
  remaining(q: Quiz) {
    return Math.max(0, q.maxTentatives - this.results().filter((r) => r.quizId === q.id).length);
  }
  lastResult(q: Quiz) {
    return this.results()
      .filter((r) => r.quizId === q.id)
      .sort((a, b) => Date.parse(b.datePassage) - Date.parse(a.datePassage))[0];
  }
  remove(q: Quiz) {
    return this.run(async () => {
      try {
        await firstValueFrom(this.api.remove(q.id));
        this.quizzes.update((list) => list.filter((x) => x.id !== q.id));
      } finally {
        this.toDelete.set(null);
      }
    }, 'Ce quiz possède déjà des résultats et ne peut pas être supprimé. Son historique doit être conservé.');
  }
}
