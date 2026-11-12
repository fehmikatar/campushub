import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/http/error-message';
import { ToastService } from '../../core/toast/toast.service';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { MarkdownEditor } from '../../shared/markdown/markdown-editor';
import { ForumCategory } from '../admin/forum-categories/forum-category';
import { ForumCategoriesService } from '../admin/forum-categories/forum-categories.service';
import { ForumService } from './forum.service';

const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 30;

/** Écran 13 : nouveau sujet dans le forum d'un cours (`?cours=<id>`). */
@Component({
  selector: 'app-new-topic-page',
  imports: [ReactiveFormsModule, RouterLink, Icon, MarkdownEditor],
  templateUrl: './new-topic-page.html',
  styleUrl: './new-topic-page.scss',
})
export class NewTopicPage {
  private readonly forum = inject(ForumService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly icons = Icons;
  protected readonly courseId = inject(ActivatedRoute).snapshot.queryParamMap.get('cours') ?? '';
  protected readonly categories = signal<ForumCategory[]>([]);
  protected readonly content = signal('');
  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(150)]],
    categoryId: [''],
    tags: [''],
  });
  protected readonly titleLength = computed(() => this.form.controls.title.value.length);

  constructor() {
    inject(ForumCategoriesService).list().subscribe({
      next: (list) => this.categories.set([...list].sort((a, b) => a.order - b.order)),
      error: () => undefined,
    });
  }

  protected get contentInvalid(): boolean {
    const length = this.content().trim().length;
    return length < 1 || length > 10000;
  }

  /** Étiquettes saisies, séparées par des virgules. */
  protected parsedTags(): string[] {
    return this.form.controls.tags.value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');
  }

  protected get tagsError(): string | null {
    const tags = this.parsedTags();
    if (tags.length > MAX_TAGS) {
      return `${MAX_TAGS} étiquettes au maximum.`;
    }
    return tags.some((tag) => tag.length > MAX_TAG_LENGTH) ? `Une étiquette fait ${MAX_TAG_LENGTH} caractères au maximum.` : null;
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.contentInvalid || this.tagsError || this.saving() || !this.courseId) {
      this.form.markAllAsTouched();
      return;
    }
    const { title, categoryId } = this.form.getRawValue();
    this.saving.set(true);
    this.error.set(null);
    this.forum
      .createTopic(this.courseId, {
        title: title.trim(),
        content: this.content().trim(),
        tags: this.parsedTags(),
        ...(categoryId ? { categoryId } : {}),
      })
      .subscribe({
        next: (topic) => {
          this.saving.set(false);
          this.toast.success('Sujet publié.');
          void this.router.navigate(['/forum/sujets', topic._id]);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(errorMessage(error));
        },
      });
  }
}
