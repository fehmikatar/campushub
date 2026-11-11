import { Component, input, output } from '@angular/core';

/** Fenêtre de confirmation avant une action destructrice (suppression, archivage...). */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div class="overlay" (click)="cancelled.emit()">
      <div class="dialog card" role="alertdialog" aria-modal="true" [attr.aria-label]="title()" (click)="$event.stopPropagation()">
        <h2>{{ title() }}</h2>
        <p>{{ message() }}</p>
        <div class="actions">
          <button type="button" class="btn btn-secondary" (click)="cancelled.emit()">Annuler</button>
          <button type="button" class="btn danger" [disabled]="busy()" (click)="confirmed.emit()">{{ confirmLabel() }}</button>
        </div>
      </div>
    </div>
  `,
  styles: `
    .overlay { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: 16px; background: rgb(15 23 42 / 0.5); }
    .dialog { width: 100%; max-width: 440px; padding: 24px; }
    h2 { margin: 0 0 8px; }
    p { margin: 0; color: var(--text-muted); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
    .danger { background: var(--danger); color: #fff; }
    .danger:hover:not(:disabled) { background: #dc2626; }
  `,
})
export class ConfirmDialog {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Supprimer');
  readonly busy = input(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
