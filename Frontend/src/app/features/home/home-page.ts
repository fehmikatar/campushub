import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { AdminDashboard } from '../admin/dashboard/admin-dashboard';

/** Accueil : tableau de bord pour l'administrateur, message provisoire pour les autres rôles (lot 7). */
@Component({
  selector: 'app-home-page',
  imports: [AdminDashboard],
  template: `
    @if (user()?.role === 'ADMIN') {
      <app-admin-dashboard />
    } @else {
      <h1>Bienvenue {{ user()?.prenom }}</h1>
      <p class="muted">Cet écran sera disponible dans un prochain lot.</p>
    }
  `,
  styles: `
    h1 { margin: 0 0 8px; }
    .muted { margin: 0; color: var(--text-muted); }
  `,
})
export class HomePage {
  protected readonly user = inject(AuthService).user;
}
