import { Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { QuizService } from './quiz.service';
import { Quiz, QuizAttempt, QuizResult } from './quiz.models';
import { QuizState } from './quiz-state';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { QuizDraftService } from './quiz-draft.service';
@Component({
  selector: 'app-quiz-player',
  imports: [RouterLink, DecimalPipe, ConfirmDialog],
  styleUrl: './quiz.scss',
  template: `
    <a routerLink="/quiz">← Tous les quiz</a>
    @if (error()) {
      <div class="alert" role="alert">{{ error() }}</div>
    }
    @if (busy()) {
      <p role="status">Chargement…</p>
    }
    @if (expired() && !result() && !busy()) {
      <div class="notice" role="status">
        Le temps est écoulé. Vos réponses ont été conservées si l’envoi a échoué.
      </div>
      @if (error() && answered > 0) {
        <button class="btn btn-secondary" (click)="submit(true)">Réessayer l’envoi</button>
      }
      @if (remaining > 0) {
        <button class="btn btn-secondary" (click)="restartExpired()">
          Démarrer une nouvelle tentative
        </button>
      }
    }
    @if (quiz(); as q) {
      <header class="head">
        <div>
          <p class="eyebrow">À VOUS DE JOUER</p>
          <h1>{{ q.titre }}</h1>
          <p class="muted">
            {{ q.questions.length }} questions · {{ q.maxTentatives }} tentative(s) maximum
          </p>
        </div>
        @if (attempt()?.limiteUtc && !result()) {
          <strong class="timer" role="timer" [attr.aria-label]="'Temps restant : ' + clock">{{
            clock
          }}</strong>
        }
      </header>
      @if (result(); as r) {
        <section class="card empty">
          <span class="pill success">Résultat enregistré</span>
          <h2>Votre score</h2>
          <div class="score">{{ r.score | number: '1.0-2' }} %</div>
          <p>{{ remaining }} tentative(s) restante(s)</p>
          <div class="actions centered">
            <a class="btn btn-secondary" [routerLink]="['/quiz/result', r.id]">Voir le résultat</a>
            @if (remaining > 0) {
              <button class="btn btn-primary" (click)="retry()">Réessayer</button>
            }
            <a class="btn btn-secondary" routerLink="/quiz">Retour aux quiz</a>
          </div>
        </section>
      } @else if (!attempt()) {
        <section class="card empty">
          <h2>Prêt à commencer ?</h2>
          <p class="muted">
            {{
              q.dureeMinutes
                ? 'Vous disposez de ' +
                  q.dureeMinutes +
                  ' minutes. Le temps continue si vous quittez la page.'
                : 'Ce quiz n’a pas de limite de temps.'
            }}
          </p>
          <p>{{ remaining }} tentative(s) restante(s)</p>
          <button
            class="btn btn-primary"
            [disabled]="busy() || remaining === 0 || !q.questions.length || blocked()"
            (click)="start()"
          >
            {{ remaining === 0 ? 'Quota de tentatives atteint' : 'Commencer le quiz' }}
          </button>
        </section>
      } @else {
        @if (current; as question) {
          <div class="progress-label">
            <span>Question {{ index() + 1 }} sur {{ q.questions.length }}</span
            ><span>{{ answered }} réponse(s)</span>
          </div>
          <progress
            [value]="answered"
            [max]="q.questions.length"
            aria-label="Progression"
          ></progress>
          <section class="card padded question-player">
            <h2>{{ question.texte }}</h2>
            <fieldset [disabled]="busy() || expired()">
              <legend class="muted">Sélectionnez une réponse</legend>
              @for (a of question.reponses; track a.id) {
                <label class="answer-choice" [class.selected]="answers()[question.id] === a.id"
                  ><input
                    type="radio"
                    [name]="'question-' + question.id"
                    [checked]="answers()[question.id] === a.id"
                    (change)="choose(question.id, a.id)"
                  /><span>{{ a.texte }}</span></label
                >
              }
            </fieldset>
            <div class="actions">
              <button
                class="btn btn-secondary"
                [disabled]="busy() || index() === 0"
                (click)="index.update(previous)"
              >
                ← Précédent</button
              ><button
                class="btn btn-secondary"
                [disabled]="busy() || index() === q.questions.length - 1"
                (click)="index.update(next)"
              >
                Suivant →</button
              ><button
                class="btn btn-primary"
                [disabled]="busy() || answered === 0 || expired()"
                (click)="confirm.set(true)"
              >
                Soumettre
              </button>
            </div>
            <p class="muted">
              Les questions sans réponse comptent comme fausses. Au moins une réponse est nécessaire
              pour soumettre.
            </p>
          </section>
        }
      }
    }
    @if (confirm()) {
      <app-confirm-dialog
        title="Soumettre vos réponses ?"
        [message]="
          'Vous avez répondu à ' +
          answered +
          ' question(s). Les réponses ne pourront plus être modifiées après envoi.'
        "
        confirmLabel="Soumettre"
        [busy]="busy()"
        (confirmed)="submit()"
        (cancelled)="confirm.set(false)"
      />
    }
  `,
})
export class QuizPlayer extends QuizState {
  private readonly api = inject(QuizService);
  private readonly route = inject(ActivatedRoute);
  private readonly drafts = inject(QuizDraftService);
  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  readonly quiz = signal<Quiz | null>(null);
  readonly attempt = signal<QuizAttempt | null>(null);
  readonly result = signal<QuizResult | null>(null);
  readonly history = signal<QuizResult[]>([]);
  readonly answers = signal<Record<number, number>>({});
  readonly index = signal(0);
  readonly seconds = signal<number | null>(null);
  readonly expired = signal(false);
  readonly blocked = signal(false);
  readonly confirm = signal(false);
  private timer?: ReturnType<typeof setInterval>;
  private autoSent = false;
  private disposed = false;
  private uncertainSubmission = false;
  readonly previous = (n: number) => n - 1;
  readonly next = (n: number) => n + 1;
  get current() {
    return this.quiz()?.questions[this.index()];
  }
  get answered() {
    return Object.keys(this.answers()).length;
  }
  get remaining() {
    return Math.max(
      0,
      (this.quiz()?.maxTentatives ?? 0) - this.history().filter((r) => r.quizId === this.id).length,
    );
  }
  get clock() {
    const s = this.seconds() ?? 0;
    return (
      Math.floor(s / 60)
        .toString()
        .padStart(2, '0') +
      ':' +
      (s % 60).toString().padStart(2, '0')
    );
  }
  constructor() {
    super();
    inject(DestroyRef).onDestroy(() => {
      this.disposed = true;
      this.stopTimer();
    });
    void this.run(async () => {
      const [q, h] = await Promise.all([
        firstValueFrom(this.api.get(this.id)),
        firstValueFrom(this.api.mine()),
      ]);
      this.quiz.set(q);
      this.history.set(h);
    });
  }
  choose(question: number, answer: number) {
    if (!this.busy() && !this.expired()) {
      this.answers.update((a) => ({ ...a, [question]: answer }));
      const attempt = this.attempt();
      if (attempt) this.drafts.save(attempt, this.answers());
    }
  }
  start() {
    if (this.remaining === 0 || this.blocked() || this.attempt()) return;
    return this.run(async () => {
      try {
        const a = await firstValueFrom(this.api.start(this.id));
        if (this.disposed) return;
        this.attempt.set(a);
        this.answers.set(this.drafts.read(a, this.quiz()?.questions ?? []));
        this.index.set(0);
        this.autoSent = false;
        this.uncertainSubmission = false;
        this.expired.set(false);
        if (a.limiteUtc) {
          const limit = Date.parse(
            /[zZ]|[+-]\d\d:\d\d$/.test(a.limiteUtc) ? a.limiteUtc : a.limiteUtc + 'Z',
          );
          if (!Number.isFinite(limit)) throw new Error('Date de fin de tentative invalide.');
          this.seconds.set(Math.max(0, Math.ceil((limit - Date.now()) / 1000)));
          this.timer = setInterval(() => this.tick(limit), 250);
        }
      } catch (e) {
        if ((e as { status?: number }).status === 409) this.blocked.set(true);
        throw e;
      }
    });
  }
  tick(limit: number) {
    this.seconds.set(Math.max(0, Math.ceil((limit - Date.now()) / 1000)));
    if (this.seconds() === 0 && !this.autoSent && !this.busy()) {
      this.autoSent = true;
      this.expired.set(true);
      this.stopTimer();
      if (!this.answered) {
        this.error.set(
          'Temps écoulé sans réponse. Aucun résultat n’a été enregistré ; vous pouvez démarrer une nouvelle tentative si votre quota le permet.',
        );
        return;
      }
      void this.submit(true);
    }
  }
  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  submit(automatic = false) {
    this.confirm.set(false);
    if (this.busy() || this.result() || !this.attempt() || (!automatic && !this.answered)) return;
    return this.run(async () => {
      if (this.uncertainSubmission) {
        const latest = await firstValueFrom(this.api.mine());
        const known = new Set(this.history().map((r) => r.id));
        const saved = latest
          .filter((r) => r.quizId === this.id && !known.has(r.id))
          .sort((a, b) => Date.parse(b.datePassage) - Date.parse(a.datePassage))[0];
        this.history.set(latest);
        if (saved) {
          this.finish(saved);
          return;
        }
      }
      const reponses = Object.entries(this.answers()).map(([questionId, reponseId]) => ({
        questionId: Number(questionId),
        reponseId,
      }));
      try {
        const r = await firstValueFrom(this.api.submit(this.id, { reponses }));
        this.finish(r);
      } catch (error) {
        this.uncertainSubmission =
          error instanceof HttpErrorResponse && (error.status === 0 || error.status >= 500);
        throw error;
      }
    });
  }
  private finish(result: QuizResult) {
    this.result.set(result);
    this.history.update((h) => [...h.filter((r) => r.id !== result.id), result]);
    this.uncertainSubmission = false;
    const attempt = this.attempt();
    if (attempt) this.drafts.clear(attempt);
    this.stopTimer();
  }
  async restartExpired() {
    if (!window.confirm('Abandonner cette tentative et en démarrer une nouvelle ?')) return;
    const previous = this.attempt();
    if (previous) this.drafts.clear(previous);
    this.retry();
    await this.start();
  }
  retry() {
    this.result.set(null);
    this.attempt.set(null);
    this.answers.set({});
    this.seconds.set(null);
    this.expired.set(false);
    this.blocked.set(false);
    this.error.set('');
  }
  canLeave() {
    return (
      !this.attempt() ||
      !!this.result() ||
      this.expired() ||
      window.confirm(
        'Quitter le quiz ? Le temps continuera à s’écouler et les réponses non envoyées seront perdues.',
      )
    );
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.attempt() && !this.result() && !this.expired()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
