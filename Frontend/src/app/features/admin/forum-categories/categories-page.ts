import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { errorMessage } from '../../../core/http/error-message';
import { ToastService } from '../../../core/toast/toast.service';
import { ConfirmDialog } from '../../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../../shared/icon/icon';
import { Icons } from '../../../shared/icon/icons';
import { ForumCategory } from './forum-category';
import { ForumCategoriesService } from './forum-categories.service';

/** Écran 28 : catégories du forum (administrateur). */
@Component({
  selector: 'app-categories-page',
  imports: [ReactiveFormsModule, Icon, ConfirmDialog],
  templateUrl: './categories-page.html',
  styleUrl: './categories-page.scss',
})
export class CategoriesPage {
  private readonly api = inject(ForumCategoriesService);
  private readonly toast = inject(ToastService);

  protected readonly icons = Icons;
  protected readonly categories = signal<ForumCategory[]>([]);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  /** null = formulaire fermé ; 'new' = création ; sinon identifiant de la catégorie modifiée. */
  protected readonly editing = signal<string | 'new' | null>(null);
  protected readonly toDelete = signal<ForumCategory | null>(null);
  protected readonly deleting = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    description: ['', Validators.maxLength(300)],
    order: [0, [Validators.required, Validators.min(0)]],
  });
  protected readonly descriptionLength = computed(() => this.form.controls.description.value.length);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api.list().subscribe({
      next: (list) => {
        this.categories.set([...list].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)));
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected openNew(): void {
    const nextOrder = this.categories().reduce((max, category) => Math.max(max, category.order), 0) + 1;
    this.form.reset({ name: '', description: '', order: nextOrder });
    this.formError.set(null);
    this.editing.set('new');
  }

  protected openEdit(category: ForumCategory): void {
    this.form.reset({ name: category.name, description: category.description ?? '', order: category.order });
    this.formError.set(null);
    this.editing.set(category._id);
  }

  protected closeForm(): void {
    this.editing.set(null);
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const target = this.editing();
    const value = this.form.getRawValue();
    const input = { name: value.name.trim(), description: value.description.trim(), order: Number(value.order) };

    this.saving.set(true);
    this.formError.set(null);
    const request = target === 'new' || target === null ? this.api.create(input) : this.api.update(target, input);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(null);
        this.toast.success(target === 'new' ? 'Catégorie créée.' : 'Catégorie modifiée.');
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.formError.set(errorMessage(error));
      },
    });
  }

  protected askDelete(category: ForumCategory): void {
    this.toDelete.set(category);
  }

  protected confirmDelete(): void {
    const category = this.toDelete();
    if (!category) {
      return;
    }
    this.deleting.set(true);
    this.api.remove(category._id).subscribe({
      next: () => {
        this.deleting.set(false);
        this.toDelete.set(null);
        this.toast.success('Catégorie supprimée.');
        this.load();
      },
      error: (error: unknown) => {
        this.deleting.set(false);
        this.toDelete.set(null);
        this.toast.error(errorMessage(error));
      },
    });
  }
}
