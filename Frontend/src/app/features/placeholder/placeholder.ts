import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/** Page provisoire des écrans des lots suivants (le titre vient de `data.title` de la route). */
@Component({
  selector: 'app-placeholder',
  template: `
    <h1>{{ title }}</h1>
    <p class="muted">Cet écran sera disponible dans un prochain lot.</p>
  `,
  styles: `
    h1 { margin: 0 0 8px; }
    .muted { margin: 0; color: var(--text-muted); }
  `,
})
export class Placeholder {
  protected readonly title = inject(ActivatedRoute).snapshot.data['title'] as string;
}
