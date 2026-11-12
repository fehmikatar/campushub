import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HomePage } from './home-page';

describe('HomePage', () => {
  const tag = (role: string) => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: signal({ id: 'u1', prenom: 'X', nom: 'Y', email: '', role }) } },
      ],
    });
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const found = ['app-admin-dashboard', 'app-teacher-dashboard', 'app-student-dashboard'].find((name) => root.querySelector(name));
    TestBed.inject(HttpTestingController).match(() => true); // les requêtes des tableaux de bord ne nous intéressent pas ici
    return found;
  };

  it('affiche le tableau de bord du rôle', () => {
    expect(tag('ADMIN')).toBe('app-admin-dashboard');
  });

  it("affiche celui de l'enseignant", () => {
    expect(tag('ENSEIGNANT')).toBe('app-teacher-dashboard');
  });

  it("affiche celui de l'étudiant par défaut", () => {
    expect(tag('ETUDIANT')).toBe('app-student-dashboard');
  });
});
