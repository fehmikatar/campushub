import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { errorMessage } from '../../core/http/error-message';
import { QuizFieldError } from './quiz.models';
export class QuizState {
  readonly busy = signal(false);
  readonly error = signal('');
  readonly fieldErrors = signal<QuizFieldError[]>([]);
  field(path: string) {
    return this.fieldErrors()
      .filter((e) => e.field.toLowerCase() === path.toLowerCase())
      .map((e) => e.message)
      .join(' ');
  }
  async run(work: () => Promise<void>, conflictMessage?: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.fieldErrors.set([]);
    try {
      await work();
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        const details: unknown = e.error?.fieldErrors ?? e.error?.errors;
        this.fieldErrors.set(
          Array.isArray(details)
            ? details.filter(
                (item): item is QuizFieldError =>
                  !!item && typeof item.field === 'string' && typeof item.message === 'string',
              )
            : [],
        );
        this.error.set(
          e.status === 409
            ? conflictMessage ?? 'Cette tentative ne peut pas être poursuivie : quota atteint ou délai dépassé. Consultez vos résultats ou ouvrez un autre quiz.'
            : e.status === 403
              ? 'Accès refusé : cette action est réservée au créateur du quiz ou à un administrateur.'
              : e.status === 404
                ? 'Quiz ou cours introuvable.'
                : e.status === 503 || e.status === 0
                  ? 'Service momentanément indisponible. Réessayez plus tard.'
                  : errorMessage(e),
        );
      } else this.error.set(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      this.busy.set(false);
    }
  }
}
