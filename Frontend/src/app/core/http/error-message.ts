import { HttpErrorResponse } from '@angular/common/http';

/**
 * Message lisible pour une erreur d'API. Les services n'ont pas le même format d'erreur :
 * `{ message }`, `{ message, errors: [{ field, message }] }` ou du texte ; sinon un message générique.
 */
export function errorMessage(error: unknown, fallback = 'Une erreur est survenue. Réessayez dans un instant.'): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 0) {
    return 'Le serveur est injoignable. Réessayez dans un instant.';
  }
  const body: unknown = error.error;
  if (body && typeof body === 'object') {
    const { message, errors } = body as { message?: unknown; errors?: unknown };
    const details = Array.isArray(errors)
      ? errors
          .map((item) => (item && typeof item === 'object' ? (item as { message?: unknown }).message : null))
          .filter((text): text is string => typeof text === 'string')
      : [];
    if (details.length > 0) {
      return details.join(' ');
    }
    if (typeof message === 'string' && message !== '') {
      return message;
    }
  }
  if (typeof body === 'string' && body !== '' && body.length < 200) {
    return body;
  }
  return fallback;
}
