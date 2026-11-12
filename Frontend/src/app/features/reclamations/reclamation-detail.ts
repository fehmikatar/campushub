import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/error-message';
import { ToastService } from '../../core/toast/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { CATEGORY_LABELS, HistoryEntry, Reclamation, STATUS_LABELS, Status, isFinal } from './reclamation.model';
import { PriorityPill, StatusPill } from './reclamation-pills';
import { ReclamationsService } from './reclamations.service';

interface Step {
  key: string;
  title: string;
  description: string;
  entry: HistoryEntry | null;
  /** « Non nécessaire » : la décision est tombée sans passer par cette étape (ex. rejet direct). */
  skipped: boolean;
}

/** Écran 4 : détail d'une réclamation, avec la chronologie réelle de son traitement. */
@Component({
  selector: 'app-reclamation-detail',
  imports: [DatePipe, RouterLink, Icon, ConfirmDialog, StatusPill, PriorityPill],
  templateUrl: './reclamation-detail.html',
  styleUrl: './reclamation-detail.scss',
})
export class ReclamationDetail {
  private readonly api = inject(ReclamationsService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly icons = Icons;
  protected readonly categories = CATEGORY_LABELS;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly role = inject(AuthService).user()?.role;

  protected readonly reclamation = signal<Reclamation | null>(null);
  protected readonly notFound = signal(false);
  protected readonly failed = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);

  protected readonly isAdmin = computed(() => this.role === 'ADMIN');
  protected readonly isStudent = computed(() => this.role === 'ETUDIANT');
  /** L'étudiant ne modifie ni ne supprime qu'une réclamation « Nouvelle ». */
  protected readonly studentCanChange = computed(() => this.isStudent() && this.reclamation()?.status === 'new');
  protected readonly adminCanProcess = computed(() => {
    const reclamation = this.reclamation();
    return this.isAdmin() && reclamation !== null && !isFinal(reclamation.status);
  });

  protected readonly steps = computed<Step[]>(() => {
    const history = this.reclamation()?.history ?? [];
    const entry = (status: Status) => history.find((item) => item.to_status === status) ?? null;
    const final = entry('resolved') ?? entry('rejected');
    const inProgress = entry('in_progress');
    return [
      { key: 'new', title: 'Nouvelle', description: 'Réclamation soumise', entry: entry('new'), skipped: false },
      {
        key: 'in_progress',
        title: 'En cours',
        description: 'Prise en charge par l\'administration',
        entry: inProgress,
        skipped: !inProgress && final !== null,
      },
      {
        key: 'final',
        title: final ? STATUS_LABELS[final.to_status] : 'Résolue / Rejetée',
        description: 'Décision finale',
        entry: final,
        skipped: false,
      },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.notFound.set(false);
    this.api.get(this.id).subscribe({
      next: (reclamation) => this.reclamation.set(reclamation),
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.notFound.set(true);
        } else {
          this.failed.set(true);
        }
      },
    });
  }

  protected remove(): void {
    this.deleting.set(true);
    this.api.remove(this.id).subscribe({
      next: () => {
        this.toast.success('Votre réclamation a été supprimée.');
        void this.router.navigate(['/reclamations/liste']);
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.confirmingDelete.set(false);
        this.toast.error(errorMessage(error));
        this.load(); // l'état a peut-être changé (prise en charge entre-temps)
      },
    });
  }
}
