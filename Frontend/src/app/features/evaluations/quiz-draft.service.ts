import { Injectable } from '@angular/core';
import { QuizAttempt, QuizQuestion } from './quiz.models';
@Injectable({ providedIn: 'root' })
export class QuizDraftService {
  private key(attempt: QuizAttempt) {
    return `campushub.quiz-draft.${attempt.etudiantId}.${attempt.quizId}.${attempt.id}`;
  }
  read(attempt: QuizAttempt, questions: QuizQuestion[]): Record<number, number> {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(this.key(attempt)) ?? '{}');
      if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
      const valid: Record<number, number> = {};
      for (const q of questions) {
        const answer = (stored as Record<string, unknown>)[q.id];
        if (typeof answer === 'number' && q.reponses.some((r) => r.id === answer))
          valid[q.id] = answer;
      }
      return valid;
    } catch {
      return {};
    }
  }
  save(attempt: QuizAttempt, answers: Record<number, number>) {
    try {
      sessionStorage.setItem(this.key(attempt), JSON.stringify(answers));
    } catch {
      /* unavailable storage must not prevent answering */
    }
  }
  clear(attempt: QuizAttempt) {
    try {
      sessionStorage.removeItem(this.key(attempt));
    } catch {
      /* optional browser storage */
    }
  }
}
