import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilePage } from './profile-page';

describe('ProfilePage', () => {
  const open = (user: object) => {
    TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: { user: signal(user) } }] });
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('affiche les informations du token, en lecture seule', () => {
    const page = open({ id: 'u1', prenom: 'Élise', nom: 'Martin', email: 'elise@campushub.test', role: 'ENSEIGNANT' });
    const text = page.textContent ?? '';

    expect(text).toContain('Élise');
    expect(text).toContain('Martin');
    expect(text).toContain('elise@campushub.test');
    expect(text).toContain('Enseignant');
    expect(page.querySelector('.avatar')?.textContent?.trim()).toBe('ÉM');
    expect(page.querySelector('input')).toBeNull(); // aucun champ modifiable
  });

  it('renvoie vers la console de compte Keycloak pour le mot de passe', () => {
    const page = open({ id: 'u1', prenom: 'A', nom: 'B', email: 'a@b.tn', role: 'ETUDIANT' });
    const hrefs = Array.from(page.querySelectorAll('a')).map((a) => a.getAttribute('href'));

    expect(hrefs).toContain('http://localhost:8180/realms/campushub/account');
    expect(hrefs).toContain('http://localhost:8180/realms/campushub/account/#/security/signingin');
  });

  it("utilise l'e-mail quand le nom est absent", () => {
    const page = open({ id: 'u1', prenom: '', nom: '', email: 'seul@campushub.test', role: 'ETUDIANT' });
    expect(page.querySelector('.identity h2')?.textContent?.trim()).toBe('seul@campushub.test');
    expect(page.querySelector('.avatar')?.textContent?.trim()).toBe('S');
  });
});
