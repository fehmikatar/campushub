import { Component, computed, inject, input } from '@angular/core';
import { ROLE_LABELS, Role } from '../../core/auth/role';
import { UserDirectoryService } from './user-directory.service';

/** Auteur d'un sujet ou d'un message : avatar, nom (« Utilisateur » tant que l'annuaire ne répond pas) et rôle. */
@Component({
  selector: 'app-forum-author',
  template: `
    <span class="avatar" aria-hidden="true">{{ initial() }}</span>
    <span class="name">{{ name() }}</span>
    <span class="pill" [class.info]="role() === 'ENSEIGNANT'" [class.danger]="role() === 'ADMIN'">{{ roleLabel() }}</span>
  `,
  styles: `
    :host { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
    .avatar {
      display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%;
      background: var(--indigo-soft); color: var(--indigo); font-weight: 600; font-size: 12px;
    }
    .name { font-weight: 500; }
  `,
})
export class ForumAuthor {
  private readonly directory = inject(UserDirectoryService);

  readonly authorId = input.required<string>();
  readonly role = input.required<Role>();

  protected readonly name = computed(() => this.directory.displayName(this.authorId()) ?? 'Utilisateur');
  protected readonly initial = computed(() => this.name().charAt(0).toUpperCase());
  protected readonly roleLabel = computed(() => ROLE_LABELS[this.role()] ?? this.role());
}
