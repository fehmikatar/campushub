import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const create = () => TestBed.inject(ThemeService);

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  it('applique le thème mémorisé au démarrage', () => {
    localStorage.setItem('campushub.theme', 'dark');
    const service = create();

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('bascule entre clair et sombre et mémorise le choix', () => {
    localStorage.setItem('campushub.theme', 'light');
    const service = create();

    service.toggle();
    expect(service.dark()).toBe(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('campushub.theme')).toBe('dark');

    service.toggle();
    expect(service.dark()).toBe(false);
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('campushub.theme')).toBe('light');
  });

  it('ignore une valeur mémorisée invalide', () => {
    localStorage.setItem('campushub.theme', 'rose');
    expect(['light', 'dark']).toContain(create().theme());
  });
});
