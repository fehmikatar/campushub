import { Component, input } from '@angular/core';
import { PRIORITY_LABELS, PRIORITY_TONES, Priority, STATUS_LABELS, STATUS_TONES, Status } from './reclamation.model';

/** Pastille de statut : Nouvelle (bleu), En cours (orange), Résolue (vert), Rejetée (rouge). */
@Component({
  selector: 'app-status-pill',
  template: `<span [class]="'pill ' + tone[status()]">{{ label[status()] }}</span>`,
})
export class StatusPill {
  readonly status = input.required<Status>();
  protected readonly label = STATUS_LABELS;
  protected readonly tone = STATUS_TONES;
}

/** Pastille de priorité (lecture seule pour l'étudiant). */
@Component({
  selector: 'app-priority-pill',
  template: `<span [class]="'pill ' + tone[priority()]">{{ label[priority()] }}</span>`,
})
export class PriorityPill {
  readonly priority = input.required<Priority>();
  protected readonly label = PRIORITY_LABELS;
  protected readonly tone = PRIORITY_TONES;
}
