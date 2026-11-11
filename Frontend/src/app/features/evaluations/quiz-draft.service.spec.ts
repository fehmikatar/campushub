import { TestBed } from '@angular/core/testing';
import { QuizDraftService } from './quiz-draft.service';
import { QuizAttempt } from './quiz.models';
describe('Quiz draft isolation', () => {
  const a: QuizAttempt = {
    id: 7,
    quizId: 3,
    etudiantId: 'draft-test-user',
    debutUtc: '2026-11-12T00:00:00Z',
    limiteUtc: null,
  };
  const questions = [
    {
      id: 10,
      texte: 'Question',
      reponses: [
        { id: 100, texte: 'Oui' },
        { id: 101, texte: 'Non' },
      ],
    },
  ];
  afterEach(() => {
    sessionStorage.removeItem('campushub.quiz-draft.draft-test-user.3.7');
    vi.restoreAllMocks();
  });
  it('restores valid answers for the same server attempt', () => {
    const drafts = TestBed.inject(QuizDraftService);
    drafts.save(a, { 10: 100 });
    expect(drafts.read(a, questions)).toEqual({ 10: 100 });
    drafts.clear(a);
    expect(drafts.read(a, questions)).toEqual({});
  });
  it('does not expose another user or attempt draft', () => {
    const drafts = TestBed.inject(QuizDraftService);
    drafts.save(a, { 10: 100 });
    expect(drafts.read({ ...a, etudiantId: 'other' }, questions)).toEqual({});
    expect(drafts.read({ ...a, id: 8 }, questions)).toEqual({});
  });
  it('rejects answers that no longer belong to the current quiz', () => {
    const drafts = TestBed.inject(QuizDraftService);
    drafts.save(a, { 10: 999, 20: 100 });
    expect(drafts.read(a, questions)).toEqual({});
  });
  it('ignores malformed local data', () => {
    sessionStorage.setItem('campushub.quiz-draft.draft-test-user.3.7', 'invalid');
    expect(TestBed.inject(QuizDraftService).read(a, questions)).toEqual({});
  });
});
