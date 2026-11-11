import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UsersPage } from './users-page';

const ADMIN = 'http://localhost:8180/admin/realms/campushub';
const user = (id: string, username: string, requestedRole?: string) => ({
  id, username, email: `${username}@campushub.test`, firstName: username, lastName: 'Test', enabled: true,
  createdTimestamp: 1794400000000, attributes: requestedRole ? { requestedRole: [requestedRole] } : undefined,
});

describe('UsersPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Réponses de la liste : utilisateurs, total, membres ENSEIGNANT, membres ADMIN. */
  const answerList = (users: object[], teachers: object[] = [], admins: object[] = []) => {
    http.expectOne((r) => r.url === `${ADMIN}/users`).flush(users);
    http.expectOne((r) => r.url === `${ADMIN}/users/count`).flush(users.length);
    http.expectOne((r) => r.url === `${ADMIN}/roles/ENSEIGNANT/users`).flush(teachers);
    http.expectOne((r) => r.url === `${ADMIN}/roles/ADMIN/users`).flush(admins);
  };
  const open = (users: object[], teachers: object[] = [], admins: object[] = []) => {
    const fixture = TestBed.createComponent(UsersPage);
    answerList(users, teachers, admins);
    fixture.detectChanges();
    return fixture;
  };
  const el = (fixture: ReturnType<typeof open>) => fixture.nativeElement as HTMLElement;

  it('déduit le rôle le plus élevé et repère les demandes en attente', () => {
    const fixture = open(
      [user('a', 'alice', 'ENSEIGNANT'), user('b', 'bob'), user('c', 'carl', 'ENSEIGNANT'), user('d', 'dora')],
      [user('c', 'carl')],
      [user('d', 'dora')],
    );
    const rows = Array.from(el(fixture).querySelectorAll('tbody tr')).map((row) => row.textContent ?? '');

    expect(rows[0]).toContain('Étudiant');
    expect(rows[0]).toContain('à valider'); // alice demande enseignant sans l'être
    expect(rows[1]).not.toContain('à valider');
    expect(rows[2]).toContain('Enseignant');
    expect(rows[2]).not.toContain('à valider'); // carl a déjà le rôle
    expect(rows[3]).toContain('Administrateur');
  });

  it('valide un enseignant : lit le rôle puis l\'attribue', () => {
    const fixture = open([user('a', 'alice', 'ENSEIGNANT')]);
    el(fixture).querySelector<HTMLButtonElement>('tbody .btn')!.click();

    http.expectOne(`${ADMIN}/roles/ENSEIGNANT`).flush({ id: 'role-1', name: 'ENSEIGNANT' });
    const assign = http.expectOne(`${ADMIN}/users/a/role-mappings/realm`);
    expect(assign.request.method).toBe('POST');
    expect(assign.request.body).toEqual([{ id: 'role-1', name: 'ENSEIGNANT' }]);
    assign.flush(null, { status: 204, statusText: 'No Content' });
    answerList([user('a', 'alice', 'ENSEIGNANT')], [user('a', 'alice')]);
  });

  it('retire le rôle enseignant après confirmation', () => {
    const fixture = open([user('c', 'carl')], [user('c', 'carl')]);
    el(fixture).querySelector<HTMLButtonElement>('tbody .btn')!.click();
    fixture.detectChanges();
    expect(el(fixture).textContent).toContain('Retirer le rôle enseignant ?');

    el(fixture).querySelector<HTMLButtonElement>('app-confirm-dialog .danger')!.click();
    http.expectOne(`${ADMIN}/roles/ENSEIGNANT`).flush({ id: 'role-1', name: 'ENSEIGNANT' });
    const revoke = http.expectOne(`${ADMIN}/users/c/role-mappings/realm`);
    expect(revoke.request.method).toBe('DELETE');
    expect(revoke.request.body).toEqual([{ id: 'role-1', name: 'ENSEIGNANT' }]);
    revoke.flush(null, { status: 204, statusText: 'No Content' });
    answerList([user('c', 'carl')]);
  });

  it("ne propose aucune action sur un administrateur", () => {
    const fixture = open([user('d', 'dora')], [], [user('d', 'dora')]);
    expect(el(fixture).querySelector('tbody .btn')).toBeNull();
  });

  it("explique le manque de droits Keycloak (403)", () => {
    const fixture = TestBed.createComponent(UsersPage);
    for (const request of http.match(() => true)) {
      // Au premier échec, forkJoin annule les autres requêtes.
      if (!request.cancelled) {
        request.flush({}, { status: 403, statusText: 'Forbidden' });
      }
    }
    fixture.detectChanges();
    expect(el(fixture).querySelector('.alert')?.textContent).toContain('realm-management');
  });

  it('recherche avec le texte saisi', async () => {
    const fixture = open([user('a', 'alice')]);
    await fixture.whenStable(); // ngModel s'enregistre dans le formulaire de façon asynchrone
    const input = el(fixture).querySelector<HTMLInputElement>('input[type=search]')!;
    input.value = 'ali';
    input.dispatchEvent(new Event('input'));
    el(fixture).querySelector('form')!.dispatchEvent(new Event('submit'));

    const request = http.expectOne((r) => r.url === `${ADMIN}/users`);
    expect(request.request.params.get('search')).toBe('ali');
    request.flush([]);
    http.expectOne((r) => r.url === `${ADMIN}/users/count`).flush(0);
    http.expectOne((r) => r.url === `${ADMIN}/roles/ENSEIGNANT/users`).flush([]);
    http.expectOne((r) => r.url === `${ADMIN}/roles/ADMIN/users`).flush([]);
  });
});
