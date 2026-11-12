import { HttpErrorResponse } from '@angular/common/http';
import { errorMessage, fieldErrors } from './error-message';

const failure = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

describe('errorMessage', () => {
  it('lit les détails de validation du forum', () => {
    const error = failure(400, { message: 'Données invalides', errors: [{ field: 'name', message: 'Nom : 2 à 80 caractères' }] });
    expect(errorMessage(error)).toBe('Nom : 2 à 80 caractères');
  });

  it('lit le message simple (Course, Notification)', () => {
    expect(errorMessage(failure(400, { message: 'Impossible de publier un cours sans chapitre', statusCode: 400 }))).toBe(
      'Impossible de publier un cours sans chapitre',
    );
  });

  it('accepte un texte court', () => {
    expect(errorMessage(failure(500, 'Boom'))).toBe('Boom');
  });

  it('signale un serveur injoignable', () => {
    expect(errorMessage(failure(0, null))).toContain('injoignable');
  });

  it('renvoie le message générique sinon', () => {
    expect(errorMessage(failure(500, { timestamp: 'x' }), 'Générique')).toBe('Générique');
    expect(errorMessage(new Error('x'), 'Générique')).toBe('Générique');
  });
});

describe('erreurs du service de réclamations (DRF)', () => {
  it('lit « detail »', () => {
    expect(errorMessage(failure(400, { detail: 'Transition interdite.' }))).toBe('Transition interdite.');
  });

  it('extrait les erreurs par champ', () => {
    const error = failure(400, { subject: ['Trop court.'], description: ['Obligatoire.', 'Autre'], detail: 'ignoré' });
    expect(fieldErrors(error)).toEqual({ subject: 'Trop court.', description: 'Obligatoire. Autre' });
    expect(fieldErrors(new Error('x'))).toEqual({});
  });
});
