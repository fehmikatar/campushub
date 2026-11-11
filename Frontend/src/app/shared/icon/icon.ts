import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/** Données d'une icône Lucide : liste de [balise SVG, attributs]. */
export type IconData = readonly (readonly [string, Readonly<Record<string, string | number>>])[];

/** Icône Lucide en SVG (le paquet `lucide` est indépendant du framework). */
@Component({
  selector: 'app-icon',
  template: `<span class="icon" [innerHTML]="svg()"></span>`,
  styles: `
    :host { display: inline-flex; flex: none; }
    .icon { display: inline-flex; }
  `,
})
export class Icon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<IconData>();
  readonly size = input(20);

  // Le contenu vient des données statiques de Lucide, jamais de l'utilisateur.
  protected readonly svg = computed(() => {
    const shapes = this.name()
      .map(([tag, attrs]) => {
        const attributes = Object.entries(attrs)
          .map(([key, value]) => `${key}="${value}"`)
          .join(' ');
        return `<${tag} ${attributes}/>`;
      })
      .join('');
    const size = this.size();
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`,
    );
  });
}
