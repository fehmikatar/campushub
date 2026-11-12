import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Icons } from '../../shared/icon/icons';
import { StatCard } from '../../shared/stat-card/stat-card';
import { Course } from '../courses/course';
import { CoursesService } from '../courses/courses.service';
import { QuizResult } from '../evaluations/quiz.models';
import { QuizService } from '../evaluations/quiz.service';
import { UnreadNotifications } from './unread-notifications';

interface ResultRow {
  result: QuizResult;
  title: string;
}

/**
 * Écran 31 : tableau de bord étudiant. Données réelles : résultats de quiz, cours publiés, notifications.
 * Pas d'API d'inscription ni de progression pour l'instant : « Reprendre l'apprentissage » propose les derniers cours.
 */
@Component({
  selector: 'app-student-dashboard',
  imports: [RouterLink, DatePipe, DecimalPipe, StatCard, UnreadNotifications],
  templateUrl: './student-dashboard.html',
  styleUrl: './dashboard.scss',
})
export class StudentDashboard {
  private readonly quizzes = inject(QuizService);
  private readonly coursesApi = inject(CoursesService);

  protected readonly icons = Icons;
  protected readonly user = inject(AuthService).user;

  protected readonly results = signal<QuizResult[] | null>(null);
  protected readonly rows = signal<ResultRow[]>([]);
  protected readonly courses = signal<Course[] | null>(null);
  protected readonly courseTotal = signal<number | null>(null);
  protected readonly resultsFailed = signal(false);
  protected readonly coursesFailed = signal(false);

  protected readonly average = computed(() => {
    const list = this.results();
    return list && list.length > 0 ? Math.round(list.reduce((sum, result) => sum + result.score, 0) / list.length) : null;
  });

  constructor() {
    this.quizzes.mine().subscribe({
      next: (list) => {
        const latest = [...list].sort((a, b) => b.datePassage.localeCompare(a.datePassage));
        this.results.set(latest);
        this.loadTitles(latest.slice(0, 5));
      },
      error: () => this.resultsFailed.set(true),
    });
    this.coursesApi.list({ limit: 4 }).subscribe({
      next: (page) => {
        this.courses.set(page.data);
        this.courseTotal.set(page.total);
      },
      error: () => this.coursesFailed.set(true),
    });
  }

  /** Titres des quiz affichés (au plus 5 appels) ; sans titre, on montre le numéro du quiz. */
  private loadTitles(results: QuizResult[]): void {
    this.rows.set(results.map((result) => ({ result, title: `Quiz n° ${result.quizId}` })));
    if (results.length === 0) {
      return;
    }
    forkJoin(
      results.map((result) =>
        this.quizzes.get(result.quizId).pipe(
          map((quiz) => quiz.titre),
          catchError(() => of(`Quiz n° ${result.quizId}`)),
        ),
      ),
    ).subscribe((titles) => this.rows.set(results.map((result, index) => ({ result, title: titles[index] }))));
  }
}
