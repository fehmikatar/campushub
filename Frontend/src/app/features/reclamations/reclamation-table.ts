import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CATEGORY_LABELS, Reclamation, isFinal } from './reclamation.model';
import { PriorityPill, StatusPill } from './reclamation-pills';

/**
 * Liste de réclamations : tableau sur ordinateur, cartes empilées sur mobile.
 * Mode `admin` : ajoute l'étudiant et la priorité, et propose « Traiter » tant que la réclamation n'est pas close.
 */
@Component({
  selector: 'app-reclamation-table',
  imports: [DatePipe, RouterLink, StatusPill, PriorityPill],
  template: `
    <div class="card table-card only-desktop">
      <table>
        <thead>
          <tr>
            <th>Référence</th>
            @if (admin()) { <th>Étudiant</th> }
            <th>Objet</th>
            <th>Catégorie</th>
            @if (admin()) { <th>Priorité</th> }
            <th>Date</th>
            <th>Statut</th>
            <th class="right">Action</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.item.id) {
            <tr [class.hot]="admin() && !row.final">
              <td><a class="ref" [routerLink]="['/reclamations', row.item.id]">{{ row.item.reference }}</a></td>
              @if (admin()) { <td>{{ row.item.author_username }}</td> }
              <td class="subject">{{ row.item.subject }}</td>
              <td>{{ categories[row.item.category] }}</td>
              @if (admin()) { <td><app-priority-pill [priority]="row.item.priority" /></td> }
              <td class="muted">{{ row.item.created_at | date: 'dd/MM/yyyy' }}</td>
              <td><app-status-pill [status]="row.item.status" /></td>
              <td class="right">
                @if (admin() && !row.final) {
                  <a class="btn btn-primary small" [routerLink]="['/reclamations', row.item.id, 'traiter']">Traiter</a>
                } @else {
                  <a class="btn btn-secondary small" [routerLink]="['/reclamations', row.item.id]">Voir</a>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>

    <div class="only-mobile">
      @for (row of rows(); track row.item.id) {
        <a class="card mobile-card" [routerLink]="['/reclamations', row.item.id]">
          <div class="line">
            <strong class="ref">{{ row.item.reference }}</strong>
            <app-status-pill [status]="row.item.status" />
          </div>
          <span class="subject">{{ row.item.subject }}</span>
          <small class="muted">
            {{ categories[row.item.category] }} · {{ row.item.created_at | date: 'dd/MM/yyyy' }}
            @if (admin()) { · {{ row.item.author_username }} }
          </small>
        </a>
      }
    </div>
  `,
  styles: `
    .ref { font-weight: 600; text-decoration: none; white-space: nowrap; }
    .subject { overflow-wrap: anywhere; }
    .muted { color: var(--text-muted); }
    .small { height: 32px; padding: 0 12px; font-size: 13px; }
    tr.hot td:first-child { box-shadow: inset 3px 0 0 var(--warning); }
    .mobile-card { display: grid; gap: 6px; padding: 14px; color: var(--text); text-decoration: none; }
    .line { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  `,
})
export class ReclamationTable {
  readonly items = input.required<Reclamation[]>();
  readonly mode = input<'student' | 'admin'>('student');

  protected readonly categories = CATEGORY_LABELS;
  protected readonly admin = computed(() => this.mode() === 'admin');
  protected readonly rows = computed(() => this.items().map((item) => ({ item, final: isFinal(item.status) })));
}
