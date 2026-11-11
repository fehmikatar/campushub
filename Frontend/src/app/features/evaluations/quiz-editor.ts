import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { QuizService } from './quiz.service';
import { QuizInput } from './quiz.models';
import { QuizState } from './quiz-state';
import { CourseService } from '../courses/course.service';
import { Course } from '../courses/course.models';
export const oneCorrect = (control: AbstractControl) =>
  (control.value as { estCorrecte: boolean }[]).filter((r) => r.estCorrecte).length === 1
    ? null
    : { oneCorrect: true };
const notBlank = (control: AbstractControl) =>
  typeof control.value === 'string' && !control.value.trim() ? { required: true } : null;
@Component({
  selector: 'app-quiz-editor',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './quiz.scss',
  template: `
    <header class="head">
      <div>
        <a routerLink="/quiz">← Quiz</a>
        <h1>{{ id ? 'Modifier le quiz' : 'Créer un quiz' }}</h1>
        <p class="muted">
          Concevez une évaluation claire, avec une seule bonne réponse par question.
        </p>
      </div>
    </header>
    @if (error()) {
      <div class="alert" role="alert">{{ error() }}</div>
    }
    @if (id) {
      <div class="notice">
        Resélectionnez la bonne réponse de chaque question avant d’enregistrer. Les corrections
        existantes ne sont pas fournies par l’API.
      </div>
    }
    @if (busy()) {
      <p role="status">Chargement…</p>
    }
    <form [formGroup]="form" (ngSubmit)="save()" class="editor">
      <section class="card padded">
        <h2>Informations du quiz</h2>
        <div class="fields">
          <label
            >Titre *<input
              formControlName="titre"
              maxlength="200"
              placeholder="Ex. Les bases d’Angular"
            /><small class="error-text">{{ field('titre') }}</small></label
          ><label
            >Cours *<select formControlName="courseId">
              <option [ngValue]="0">Choisir un cours</option>
              @for (course of courses(); track course.id) {
                <option [ngValue]="course.id">{{ course.titre }}</option>
              }
            </select>
            <span class="actions"
              ><button
                type="button"
                class="btn btn-secondary"
                [disabled]="busy() || coursePage === 1"
                (click)="changeCoursePage(-1)"
              >
                Précédents</button
              ><button
                type="button"
                class="btn btn-secondary"
                [disabled]="busy() || !moreCourses()"
                (click)="changeCoursePage(1)"
              >
                Autres cours
              </button></span
            >
            <small class="error-text">{{ field('courseId') }}</small></label
          ><label
            >Tentatives maximum *<input
              type="number"
              min="1"
              step="1"
              formControlName="maxTentatives"
            /><small class="error-text">{{ field('maxTentatives') }}</small></label
          ><label
            >Durée en minutes<input
              type="number"
              min="1"
              step="1"
              formControlName="dureeMinutes"
              placeholder="Vide : sans limite"
            /><small class="error-text">{{ field('dureeMinutes') }}</small></label
          >
        </div>
      </section>
      <div formArrayName="questions">
        @for (q of questions.controls; track q; let i = $index) {
          <section class="card padded question-editor" [formGroupName]="i">
            <div class="head">
              <h2>Question {{ i + 1 }}</h2>
              <button
                type="button"
                class="btn btn-secondary danger-text"
                [disabled]="questions.length === 1 || busy()"
                (click)="questions.removeAt(i)"
              >
                Supprimer la question
              </button>
            </div>
            <label
              >Énoncé *<textarea formControlName="texte" rows="3" maxlength="500"></textarea
              ><small class="error-text">{{ field('questions[' + i + '].texte') }}</small></label
            >
            <div formArrayName="reponses">
              @for (r of answers(i).controls; track r; let j = $index) {
                <div class="answer-editor" [formGroupName]="j">
                  <label class="correct-choice"
                    ><input
                      type="radio"
                      [name]="'correct-' + i"
                      [checked]="r.controls.estCorrecte.value"
                      (change)="chooseCorrect(i, j)"
                      [attr.aria-label]="'Bonne réponse ' + (j + 1) + ' de la question ' + (i + 1)"
                    />Correcte</label
                  ><label class="answer-input"
                    >Réponse {{ j + 1 }} *<input formControlName="texte" maxlength="300" /><small
                      class="error-text"
                      >{{ field('questions[' + i + '].reponses[' + j + '].texte') }}</small
                    ></label
                  ><button
                    type="button"
                    class="btn btn-secondary"
                    [disabled]="answers(i).length <= 2 || busy()"
                    (click)="answers(i).removeAt(j)"
                    [attr.aria-label]="'Supprimer réponse ' + (j + 1)"
                  >
                    Retirer
                  </button>
                </div>
              }
            </div>
            <p class="error-text">{{ field('questions[' + i + '].reponses') }}</p>
            @if (answers(i).invalid && submitted) {
              <p class="error-text">
                Remplissez au moins deux réponses et choisissez exactement une bonne réponse.
              </p>
            }
            <button
              type="button"
              class="btn btn-secondary"
              [disabled]="busy()"
              (click)="answers(i).push(answer())"
            >
              ＋ Ajouter une réponse
            </button>
          </section>
        }
      </div>
      <div class="actions">
        <button
          type="button"
          class="btn btn-secondary"
          [disabled]="busy()"
          (click)="questions.push(question())"
        >
          ＋ Ajouter une question</button
        ><button class="btn btn-primary" [disabled]="busy()">Enregistrer le quiz</button
        ><a class="btn btn-secondary" routerLink="/quiz">Annuler</a>
      </div>
      @if (submitted && form.invalid) {
        <p class="error-text" role="alert">
          Vérifiez les champs obligatoires, les longueurs et les bonnes réponses.
        </p>
      }
    </form>
  `,
})
export class QuizEditor extends QuizState {
  private readonly courseApi = inject(CourseService);
  readonly courses = signal<Course[]>([]);
  readonly moreCourses = signal(false);
  readonly ready = signal(false);
  coursePage = 1;
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(QuizService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly id = Number(this.route.snapshot.paramMap.get('id')) || null;
  submitted = false;
  answer(texte = '', estCorrecte = false) {
    return this.fb.nonNullable.group({
      texte: [texte, [Validators.required, notBlank, Validators.maxLength(300)]],
      estCorrecte,
    });
  }
  question(texte = '', responses?: { texte: string }[]) {
    return this.fb.nonNullable.group({
      texte: [texte, [Validators.required, notBlank, Validators.maxLength(500)]],
      reponses: this.fb.array(
        (responses ?? [{ texte: '' }, { texte: '' }]).map((r) => this.answer(r.texte)),
        [Validators.minLength(2), oneCorrect],
      ),
    });
  }
  readonly form = this.fb.group({
    titre: this.fb.nonNullable.control('', [
      Validators.required,
      notBlank,
      Validators.maxLength(200),
    ]),
    courseId: this.fb.nonNullable.control(
      Number(this.route.snapshot.queryParamMap.get('courseId')) || 0,
      [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
    ),
    maxTentatives: this.fb.nonNullable.control(1, [
      Validators.required,
      Validators.min(1),
      Validators.pattern(/^\d+$/),
    ]),
    dureeMinutes: this.fb.control<number | null>(null, [
      Validators.min(1),
      Validators.pattern(/^\d+$/),
    ]),
    questions: this.fb.array([this.question()], [Validators.minLength(1)]),
  });
  get questions() {
    return this.form.controls.questions;
  }
  answers(i: number) {
    return this.questions.at(i).controls.reponses;
  }
  chooseCorrect(i: number, j: number) {
    this.answers(i).controls.forEach((r, k) => r.controls.estCorrecte.setValue(k === j));
  }
  constructor() {
    super();
    void this.run(async () => {
      if (
        this.route.snapshot.paramMap.has('id') &&
        (!this.id || !Number.isInteger(this.id) || this.id < 1)
      )
        throw new Error('Identifiant de quiz invalide.');
      if (this.id) {
        const q = await firstValueFrom(this.api.get(this.id!));
        this.form.patchValue({
          titre: q.titre,
          courseId: q.courseId,
          maxTentatives: q.maxTentatives,
          dureeMinutes: q.dureeMinutes,
        });
        this.questions.clear();
        q.questions.forEach((x) => this.questions.push(this.question(x.texte, x.reponses)));
      }
      await this.fetchCourses();
      this.ready.set(true);
    });
  }
  private async fetchCourses() {
    const page = await firstValueFrom(this.courseApi.list({ page: this.coursePage, limit: 50 }));
    const selected = this.form.controls.courseId.value;
    const list = [...page.data];
    if (selected > 0 && !list.some((c) => c.id === selected))
      list.unshift(await firstValueFrom(this.courseApi.get(selected)));
    this.courses.set(list);
    this.moreCourses.set(page.total > this.coursePage * 50);
  }
  changeCoursePage(delta: number) {
    return this.run(async () => {
      const next = this.coursePage + delta;
      if (next < 1) return;
      const previous = this.coursePage;
      this.coursePage = next;
      try {
        await this.fetchCourses();
      } catch (e) {
        this.coursePage = previous;
        throw e;
      }
    });
  }
  save() {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.ready()) return;
    return this.run(async () => {
      const body = this.form.getRawValue() as QuizInput;
      if (this.id) await firstValueFrom(this.api.update(this.id, body));
      else await firstValueFrom(this.api.create(body));
      await this.router.navigate(['/quiz'], { queryParams: { courseId: body.courseId } });
    }, 'Ce quiz possède déjà des résultats et ne peut plus être modifié. Créez un nouveau quiz pour changer les questions ou les réponses.');
  }
}
