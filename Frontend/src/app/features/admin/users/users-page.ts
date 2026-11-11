import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_LABELS } from '../../../core/auth/role';
import { errorMessage } from '../../../core/http/error-message';
import { ToastService } from '../../../core/toast/toast.service';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/icon/icon';
import { Icons } from '../../../shared/icon/icons';
import { KeycloakUsersService, ManagedUser, PAGE_SIZE } from './keycloak-users.service';

/** Écran « Utilisateurs » (administrateur) : comptes, rôle, et validation des demandes d'enseignant. */
@Component({
  selector: 'app-users-page',
  imports: [FormsModule, DatePipe, Icon, ConfirmDialog],
  templateUrl: './users-page.html',
  styleUrl: './users-page.scss',
})
export class UsersPage {
  private readonly api = inject(KeycloakUsersService);
  private readonly toast = inject(ToastService);
  protected readonly me = inject(AuthService).user;

  protected readonly icons = Icons;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly users = signal<ManagedUser[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly failed = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly toRevoke = signal<ManagedUser | null>(null);
  protected readonly onlyPending = signal(false);

  protected search = '';
  private page = 1;

  /** Comptes qui demandent à être enseignant sans l'être encore (sur la page affichée). */
  protected readonly pendingCount = computed(() => this.users().filter((user) => this.isPending(user)).length);
  protected readonly shown = computed(() => (this.onlyPending() ? this.users().filter((user) => this.isPending(user)) : this.users()));

  constructor() {
    this.load();
  }

  protected get totalPages(): number {
    return Math.max(1, Math.ceil(this.total() / PAGE_SIZE));
  }

  protected currentPage(): number {
    return this.page;
  }

  protected isPending(user: ManagedUser): boolean {
    return user.requestedRole === 'ENSEIGNANT' && user.role === 'ETUDIANT';
  }

  protected fullName(user: ManagedUser): string {
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username;
  }

  protected submitSearch(): void {
    this.page = 1;
    this.load();
  }

  protected goTo(page: number): void {
    this.page = page;
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(null);
    this.api.list(this.search, this.page).subscribe({
      next: ({ users, total }) => {
        this.users.set(users);
        this.total.set(total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.failed.set(
          error instanceof HttpErrorResponse && error.status === 403
            ? "Votre compte n'a pas le droit de gérer les utilisateurs dans Keycloak (rôles realm-management manquants)."
            : errorMessage(error, 'Impossible de charger les utilisateurs.'),
        );
        this.loading.set(false);
      },
    });
  }

  protected grant(user: ManagedUser): void {
    this.run(this.api.grantTeacher(user.id), `${this.fullName(user)} est maintenant enseignant.`);
  }

  protected confirmRevoke(): void {
    const user = this.toRevoke();
    if (user) {
      this.toRevoke.set(null);
      this.run(this.api.revokeTeacher(user.id), `Le rôle enseignant de ${this.fullName(user)} est retiré.`);
    }
  }

  private run(request: ReturnType<KeycloakUsersService['grantTeacher']>, success: string): void {
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(success);
        this.load();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }
}
