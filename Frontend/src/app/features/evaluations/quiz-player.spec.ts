import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { QuizPlayer } from './quiz-player';
import { QuizService } from './quiz.service';
import { QuizResult } from './quiz.models';
describe('Student quiz attempts', () => {
  const quiz = {
    id: 3,
    titre: 'Test Angular',
    courseId: 1,
    maxTentatives: 2,
    dureeMinutes: 1,
    questions: [
      {
        id: 10,
        texte: 'Question A',
        reponses: [
          { id: 100, texte: 'Oui' },
          { id: 101, texte: 'Non' },
        ],
      },
      {
        id: 20,
        texte: 'Question B',
        reponses: [
          { id: 200, texte: 'Oui' },
          { id: 201, texte: 'Non' },
        ],
      },
    ],
  };
  const result: QuizResult = {
    id: 9,
    quizId: 3,
    etudiantId: 'student',
    score: 50,
    datePassage: '2026-11-12T00:00:00Z',
  };
  let api: {
    get: ReturnType<typeof vi.fn>;
    mine: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    submit: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    sessionStorage.removeItem('campushub.quiz-draft.student.3.1');
    api = {
      get: vi.fn(() => of(quiz)),
      mine: vi.fn(() => of([])),
      start: vi.fn(() =>
        of({
          id: 1,
          quizId: 3,
          etudiantId: 'student',
          debutUtc: new Date().toISOString(),
          limiteUtc: new Date(Date.now() + 1000).toISOString(),
        }),
      ),
      submit: vi.fn(() => of(result)),
    };
    TestBed.configureTestingModule({
      imports: [QuizPlayer],
      providers: [
        provideRouter([{ path: 'quiz/:id/play', component: QuizPlayer }]),
        { provide: QuizService, useValue: api },
      ],
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  async function open() {
    const harness = await RouterTestingHarness.create('/quiz/3/play');
    const fixture = harness.fixture;
    await fixture.whenStable();
    harness.detectChanges();
    return { fixture, c: harness.routeDebugElement!.componentInstance as QuizPlayer };
  }
  it('does not consume an attempt just by opening the page', async () => {
    const { c, fixture } = await open();
    expect(api.start).not.toHaveBeenCalled();
    expect(c.quiz()?.questions.length).toBe(2);
    expect(fixture.nativeElement.textContent).not.toContain('Créer un quiz');
  });
  it('submits unique choices, replacing a previous answer to the same question', async () => {
    const { c } = await open();
    await c.start();
    c.choose(10, 100);
    c.choose(10, 101);
    await c.submit();
    expect(api.submit).toHaveBeenCalledWith(3, { reponses: [{ questionId: 10, reponseId: 101 }] });
    expect(c.result()?.score).toBe(50);
    expect(c.remaining).toBe(1);
  });
  it('auto-submits exactly once at the server deadline', async () => {
    const { c } = await open();
    vi.useFakeTimers();
    await c.start();
    c.choose(10, 100);
    await vi.advanceTimersByTimeAsync(1250);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(c.result()).toEqual(result);
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.submit).toHaveBeenCalledTimes(1);
  });
  it('uses the remaining server time rather than resetting the full duration', async () => {
    const { c } = await open();
    vi.useFakeTimers();
    api.start.mockReturnValue(
      of({
        id: 1,
        quizId: 3,
        etudiantId: 'student',
        debutUtc: new Date(Date.now() - 50000).toISOString(),
        limiteUtc: new Date(Date.now() + 10000).toISOString(),
      }),
    );
    await c.start();
    await vi.advanceTimersByTimeAsync(250);
    expect(c.seconds()).toBe(10);
    expect(c.clock).toBe('00:10');
  });
  it('disables another start after an API quota conflict', async () => {
    const { c } = await open();
    api.start.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, error: { message: 'Quota atteint' } })),
    );
    await c.start();
    expect(c.blocked()).toBe(true);
    expect(c.error()).toContain('quota');
  });
  it('does not send a second submission while the first is pending', async () => {
    const { c } = await open();
    const response = new Subject<QuizResult>();
    api.submit.mockReturnValue(response);
    await c.start();
    c.choose(10, 100);
    const first = c.submit();
    await c.submit();
    expect(api.submit).toHaveBeenCalledTimes(1);
    response.next(result);
    response.complete();
    await first;
  });
  it('asks for confirmation before leaving an active attempt', async () => {
    const { c } = await open();
    await c.start();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(c.canLeave()).toBe(false);
  });
  it('restores saved choices when the server resumes the same attempt', async () => {
    sessionStorage.setItem(
      'campushub.quiz-draft.student.3.1',
      JSON.stringify({ 10: 100, 99: 999 }),
    );
    const { c } = await open();
    await c.start();
    expect(c.answers()).toEqual({ 10: 100 });
  });
  it('reconciles a lost submission response before sending again', async () => {
    const { c } = await open();
    await c.start();
    c.choose(10, 100);
    api.submit.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    await c.submit();
    expect(c.error()).toBeTruthy();
    api.mine.mockReturnValue(of([result]));
    await c.submit();
    expect(c.result()).toEqual(result);
    expect(api.submit).toHaveBeenCalledTimes(1);
  });
  it('does not invent a score or send an invalid empty submission at expiry', async () => {
    const { c } = await open();
    vi.useFakeTimers();
    await c.start();
    await vi.advanceTimersByTimeAsync(1250);
    expect(c.expired()).toBe(true);
    expect(c.result()).toBeNull();
    expect(api.submit).not.toHaveBeenCalled();
    expect(c.error()).toContain('sans réponse');
  });
});
