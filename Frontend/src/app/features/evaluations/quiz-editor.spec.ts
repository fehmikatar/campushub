import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { QuizEditor } from './quiz-editor';
import { QuizService } from './quiz.service';
import { CourseService } from '../courses/course.service';
describe('Quiz editor', () => {
  let api: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    api = {
      create: vi.fn(() => of({ id: 1 })),
      update: vi.fn(() => of(null)),
      get: vi.fn(() =>
        of({
          id: 1,
          titre: 'Quiz',
          courseId: 12,
          maxTentatives: 2,
          dureeMinutes: null,
          questions: [
            {
              id: 10,
              texte: 'Question',
              reponses: [
                { id: 100, texte: 'Oui' },
                { id: 101, texte: 'Non' },
              ],
            },
          ],
        }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [QuizEditor],
      providers: [
        provideRouter([
          { path: 'quiz/new', component: QuizEditor },
          { path: 'quiz/:id/edit', component: QuizEditor },
        ]),
        { provide: QuizService, useValue: api },
        {
          provide: CourseService,
          useValue: {
            list: () => of({ data: [{ id: 12, titre: 'Cours Angular' }], total: 1 }),
            get: () => of({ id: 12, titre: 'Cours Angular' }),
          },
        },
      ],
    });
  });
  async function open(path = '/quiz/new?courseId=12') {
    const h = await RouterTestingHarness.create(path);
    await h.fixture.whenStable();
    h.detectChanges();
    return h.routeDebugElement!.componentInstance as QuizEditor;
  }
  function fill(c: QuizEditor) {
    c.form.patchValue({ titre: 'Test', courseId: 12 });
    c.questions.at(0).controls.texte.setValue('Question');
    c.answers(0).at(0).controls.texte.setValue('Oui');
    c.answers(0).at(1).controls.texte.setValue('Non');
  }
  it('does not submit without a correction', async () => {
    const c = await open();
    fill(c);
    await c.save();
    expect(api.create).not.toHaveBeenCalled();
    expect(c.form.invalid).toBe(true);
  });
  it('creates dynamic questions with exactly one chosen answer', async () => {
    const c = await open();
    fill(c);
    c.chooseCorrect(0, 0);
    c.chooseCorrect(0, 1);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await c.save();
    expect(api.create).toHaveBeenCalledWith({
      titre: 'Test',
      courseId: 12,
      maxTentatives: 1,
      dureeMinutes: null,
      questions: [
        {
          texte: 'Question',
          reponses: [
            { texte: 'Oui', estCorrecte: false },
            { texte: 'Non', estCorrecte: true },
          ],
        },
      ],
    });
  });
  it('requires reselecting corrections when editing instead of guessing them', async () => {
    const c = await open('/quiz/1/edit');
    expect(c.form.invalid).toBe(true);
    expect(c.answers(0).controls.every((a) => !a.controls.estCorrecte.value)).toBe(true);
    c.chooseCorrect(0, 0);
    expect(c.form.valid).toBe(true);
  });
  it('keeps server field errors next to their fields', async () => {
    const c = await open();
    fill(c);
    c.chooseCorrect(0, 0);
    api.create.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              message: 'Validation',
              fieldErrors: [{ field: 'titre', message: 'Titre refuse' }],
            },
          }),
      ),
    );
    await c.save();
    expect(c.field('titre')).toBe('Titre refuse');
  });
  it('does not overwrite a quiz whose initial load failed', async () => {
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
    const c = await open('/quiz/1/edit');
    fill(c);
    c.chooseCorrect(0, 0);
    await c.save();
    expect(api.update).not.toHaveBeenCalled();
    expect(c.ready()).toBe(false);
  });
  it('explains why an already used quiz cannot be changed', async () => {
    const c=await open('/quiz/1/edit');c.chooseCorrect(0,0);
    api.update.mockReturnValue(throwError(()=>new HttpErrorResponse({status:409,error:{message:'The request conflicts with the current state of the resource'}})));
    await c.save();expect(c.error()).toContain('possède déjà des résultats');
    expect(c.error()).not.toContain('quota');
  });
});
