import { Injectable, computed, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'campushub.theme';

/**
 * Thème clair ou sombre. Le choix est mémorisé dans le navigateur ; sans choix, on suit le réglage du système.
 * Les couleurs viennent des variables CSS de `styles.scss` (attribut `data-theme` sur <html>).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.initial());
  readonly dark = computed(() => this.theme() === 'dark');

  constructor() {
    this.apply(this.theme());
  }

  toggle(): void {
    this.set(this.dark() ? 'light' : 'dark');
  }

  set(theme: Theme): void {
    this.theme.set(theme);
    this.apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // stockage indisponible : le choix vaut pour cette session seulement
    }
  }

  private apply(theme: Theme): void {
    document.documentElement.dataset['theme'] = theme;
  }

  private initial(): Theme {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // stockage indisponible
    }
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
