import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../core/toast/toast.service';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { NotificationPreferences } from './notification.model';
import { PREFERENCE_GROUPS } from './notification-meta';
import { NotificationsService } from './notifications.service';

/** Écran 24 : préférences (types de notifications reçus, alertes e-mail). */
@Component({
  selector: 'app-preferences-page',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  templateUrl: './preferences-page.html',
  styleUrl: './preferences-page.scss',
})
export class PreferencesPage {
  private readonly api = inject(NotificationsService);
  private readonly toast = inject(ToastService);

  protected readonly icons = Icons;
  protected readonly groups = PREFERENCE_GROUPS;
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  /** Groupes activés (clé -> reçoit ces notifications). */
  protected readonly enabled = signal<Record<string, boolean>>({});
  protected readonly form = inject(FormBuilder).nonNullable.group({
    emailEnabled: true,
    email: ['', Validators.email],
  });

  /** Types coupés qu'aucun groupe ne gère : conservés tels quels à l'enregistrement. */
  private unknownMuted: string[] = [];

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.preferences().subscribe({
      next: (preferences) => {
        const muted = new Set(preferences.muted_types);
        this.enabled.set(
          Object.fromEntries(this.groups.map((group) => [group.key, !group.types.some((type) => muted.has(type))])),
        );
        const known = new Set(this.groups.flatMap((group) => group.types));
        this.unknownMuted = preferences.muted_types.filter((type) => !known.has(type));
        this.form.setValue({ emailEnabled: preferences.email_enabled, email: preferences.email ?? '' });
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected toggle(key: string): void {
    this.enabled.update((current) => ({ ...current, [key]: !current[key] }));
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const { emailEnabled, email } = this.form.getRawValue();
    const muted = this.groups.filter((group) => !this.enabled()[group.key]).flatMap((group) => group.types);
    const preferences: NotificationPreferences = {
      email: email.trim() || null,
      email_enabled: emailEnabled,
      muted_types: [...muted, ...this.unknownMuted],
    };

    this.saving.set(true);
    this.api.updatePreferences(preferences).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Préférences enregistrées.');
      },
      error: () => {
        this.saving.set(false);
        this.toast.error("Impossible d'enregistrer les préférences.");
      },
    });
  }
}
