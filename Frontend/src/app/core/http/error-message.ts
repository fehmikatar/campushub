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
    const { message, errors, detail } = body as { message?: unknown; errors?: unknown; detail?: unknown };
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
    // Django REST Framework : { detail: "..." } ou { champ: ["message", ...] }.
    if (typeof detail === 'string' && detail !== '') {
      return detail;
    }
    const perField = Object.values(fieldErrors(error)).join(' ');
    if (perField !== '') {
      return perField;
    }
  }
  if (typeof body === 'string' && body !== '' && body.length < 200) {
    return body;
  }
  return fallback;
}

/**
 * Erreurs par champ au format Django REST Framework (`{ champ: ["message"] }`), pour les afficher sous chaque champ.
 * Les clés `detail`, `message` et `errors` ne sont pas des champs.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  const body: unknown = error instanceof HttpErrorResponse ? error.error : null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [field, value] of Object.entries(body as Record<string, unknown>)) {
    if (['detail', 'message', 'errors'].includes(field)) {
      continue;
    }
    const messages = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    if (messages.length > 0) {
      result[field] = messages.join(' ');
    }
  }
  return result;
}
