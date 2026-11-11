import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { QuizService } from './quiz.service';
import { Quiz, QuizResult } from './quiz.models';
import { QuizState } from './quiz-state';
@Component({
  selector: 'app-quiz-results',
  imports: [DatePipe, DecimalPipe, RouterLink],
  styleUrl: './quiz.scss',
  template: `
    <header class="head">
      <div>
        <a routerLink="/quiz">← Quiz</a>
        <h1>{{ single ? 'Mon résultat' : 'Résultats du quiz' }}</h1>
        <p class="muted">{{ quiz()?.titre }}</p>
      </div>
    </header>
    @if (error()) {
      <div class="alert" role="alert">
        {{ error() }} <button class="link-btn" (click)="load()">Réessayer</button>
      </div>
    }
    @if (busy()) {
      <p role="status">Chargement…</p>
    }
    @if (single && rows().length) {
      @for (r of rows(); track r.id) {
        <section class="card empty">
          <span class="pill success">Tentative enregistrée</span>
          <div class="score">{{ r.score | number: '1.0-2' }} %</div>
          <p>{{ r.datePassage | date: 'dd/MM/yyyy HH:mm' }}</p>
          @if (student) {
            <p>{{ remaining() }} tentative(s) restante(s)</p>
            @if (remaining() > 0) {
              <a class="btn btn-primary" [routerLink]="['/quiz', r.quizId, 'play']"
                >Réessayer le quiz</a
              >
            }
          }
        </section>
      }
    }
    @if (!single) {
      <div class="card table-card">
        <table>
          <thead>
            <tr>
              <th>Étudiant</th>
              <th>Score</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                <td>{{ r.etudiantId }}</td>
                <td>{{ r.score | number: '1.0-2' }} %</td>
                <td>{{ r.datePassage | date: 'dd/MM/yyyy HH:mm' }}</td>
              </tr>
            } @empty {
              @if (!busy() && !error()) {
                <tr>
                  <td colspan="3">Aucun résultat pour ce quiz.</td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class QuizResults extends QuizState {
  private api = inject(QuizService);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  readonly single = this.route.snapshot.routeConfig?.path === 'result/:id';
  readonly rows = signal<QuizResult[]>([]);
  readonly quiz = signal<Quiz | null>(null);
  readonly remaining = signal(0);
  get student() {
    return this.auth.user()?.role === 'ETUDIANT';
  }
  constructor() {
    super();
    void this.load();
  }
  load() {
    return this.run(async () => {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (this.single) {
        const r = await firstValueFrom(this.api.result(id));
        this.rows.set([r]);
        const q = await firstValueFrom(this.api.get(r.quizId));
        this.quiz.set(q);
        if (this.student) {
          const all = await firstValueFrom(this.api.mine());
          this.remaining.set(
            Math.max(0, q.maxTentatives - all.filter((x) => x.quizId === q.id).length),
          );
        }
      } else {
        this.rows.set(await firstValueFrom(this.api.results(id)));
        this.quiz.set(await firstValueFrom(this.api.get(id)));
      }
    });
  }
}
