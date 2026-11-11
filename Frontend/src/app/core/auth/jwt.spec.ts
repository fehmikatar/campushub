import { fakeJwt } from '../../../testing/fake-jwt';
import { decodeJwt } from './jwt';
import { highestRole } from './role';

describe('decodeJwt', () => {
  it('lit le contenu du token, accents compris', () => {
    const payload = decodeJwt(fakeJwt({ given_name: 'Zoé' }));
    expect(payload?.sub).toBe('11111111-1111-4111-8111-111111111111');
    expect(payload?.given_name).toBe('Zoé');
  });

  it('renvoie null pour un token mal formé', () => {
    expect(decodeJwt('pas-un-jwt')).toBeNull();
    expect(decodeJwt('a.@@@.c')).toBeNull();
  });
});

describe('highestRole', () => {
  it('garde le rôle CampusHub le plus élevé', () => {
    expect(highestRole(['ETUDIANT', 'ADMIN', 'ENSEIGNANT'])).toBe('ADMIN');
    expect(highestRole(['offline_access', 'ENSEIGNANT'])).toBe('ENSEIGNANT');
  });

  it('ignore les rôles Keycloak et renvoie null sans rôle CampusHub', () => {
    expect(highestRole(['offline_access', 'uma_authorization', 'default-roles-campushub'])).toBeNull();
    expect(highestRole(undefined)).toBeNull();
  });
});
