import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';

/** Écran 1 : « Accès refusé » (403). */
@Component({
  selector: 'app-forbidden',
  imports: [RouterLink, Icon],
  template: `
    <div class="status">
      <span class="badge"><app-icon [name]="icons.shieldAlert" [size]="48" /></span>
      <h1>Accès refusé</h1>
      <p>Vous n'avez pas les permissions nécessaires pour accéder à cette ressource.</p>
      <div class="actions">
        <a class="btn btn-primary" routerLink="/">Retour à l'accueil</a>
        @if (auth.isAuthenticated()) {
          <button type="button" class="btn btn-secondary" (click)="logout()">Se déconnecter</button>
        }
      </div>
    </div>
  `,
  styleUrl: './status-page.scss',
})
export class Forbidden {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly icons = Icons;

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}

/** Écran 2 : « Session expirée ». */
@Component({
  selector: 'app-session-expired',
  imports: [RouterLink, Icon],
  template: `
    <div class="status">
      <span class="badge"><app-icon [name]="icons.clock" [size]="48" /></span>
      <h1>Session expirée</h1>
      <p>Votre session a expiré. Reconnectez-vous pour continuer.</p>
      <div class="actions">
        <a class="btn btn-primary" routerLink="/login">Se reconnecter</a>
      </div>
    </div>
  `,
  styleUrl: './status-page.scss',
})
export class SessionExpired {
  protected readonly icons = Icons;
}
