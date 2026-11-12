import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/auth/role';
import { AppConfig } from '../../core/config/app-config';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';

/**
 * Écran 30 : mon profil, en lecture seule. Les informations viennent du token Keycloak ; leur modification et le
 * changement de mot de passe se font dans la console de compte Keycloak (il n'y a pas d'API de profil pour l'instant).
 */
@Component({
  selector: 'app-profile-page',
  imports: [Icon],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  private readonly config = inject(AppConfig);

  protected readonly icons = Icons;
  protected readonly user = inject(AuthService).user;
  protected readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });
  protected readonly fullName = computed(() => {
    const user = this.user();
    return `${user?.prenom ?? ''} ${user?.nom ?? ''}`.trim();
  });
  protected readonly initials = computed(() => {
    const user = this.user();
    const letters = `${user?.prenom.charAt(0) ?? ''}${user?.nom.charAt(0) ?? ''}`;
    return (letters || user?.email.charAt(0) || '?').toUpperCase();
  });

  /** Console de compte Keycloak : informations personnelles, mot de passe, sessions. */
  protected get accountUrl(): string {
    return `${this.config.keycloakUrl}/realms/${this.config.realm}/account`;
  }

  protected get passwordUrl(): string {
    return `${this.accountUrl}/#/security/signingin`;
  }
}
