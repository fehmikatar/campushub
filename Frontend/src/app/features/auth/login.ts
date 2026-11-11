import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { pkceChallenge, registrationUrl } from '../../core/auth/registration';
import { AppConfig } from '../../core/config/app-config';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly config = inject(AppConfig);

  protected readonly icons = Icons;
  /** Retour de la page d'inscription de Keycloak : le compte vient d'être créé. */
  protected readonly justRegistered = signal(this.route.snapshot.queryParamMap.has('registered'));
  protected readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  protected readonly showPassword = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, password } = this.form.getRawValue();
    this.loading.set(true);
    this.error.set(null);

    this.auth.login(username.trim(), password).subscribe({
      next: (user) => {
        this.loading.set(false);
        if (!user?.role) {
          // Compte Keycloak sans rôle CampusHub.
          this.auth.logout();
          void this.router.navigate(['/forbidden']);
          return;
        }
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : '/');
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.messageFor(error));
      },
    });
  }

  /** Ouvre la page d'inscription de Keycloak ; le compte créé a le rôle ETUDIANT par défaut. */
  protected async register(): Promise<void> {
    const challenge = await pkceChallenge();
    const returnTo = `${window.location.origin}/login?registered=1`;
    window.location.assign(registrationUrl(this.config, returnTo, challenge));
  }

  private messageFor(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401 || error.status === 400) {
        return 'Identifiant ou mot de passe incorrect.';
      }
      if (error.status === 0) {
        return "Le serveur d'authentification est injoignable. Réessayez dans un instant.";
      }
    }
    return 'Connexion impossible pour le moment.';
  }
}
