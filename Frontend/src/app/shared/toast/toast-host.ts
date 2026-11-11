import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toasts" aria-live="polite">
      @for (toast of toasts.toasts(); track toast.id) {
        <button type="button" class="toast" [class.error]="toast.kind === 'error'" (click)="toasts.dismiss(toast.id)">
          {{ toast.message }}
        </button>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; right: 24px; bottom: 24px; display: grid; gap: 8px; z-index: 50; }
    .toast { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 16px; background: var(--success-bg); color: var(--text); font: inherit; text-align: left; box-shadow: var(--shadow); cursor: pointer; }
    .toast.error { background: var(--danger-bg); border-color: var(--danger); }
  `,
})
export class ToastHost {
  protected readonly toasts = inject(ToastService);
}
