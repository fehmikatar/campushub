import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../core/http/error-message';
import { ToastService } from '../../core/toast/toast.service';
import { Category } from './forum.models';
import { ForumService } from './forum.service';

export const TITLE_MIN = 5;
export const TITLE_MAX = 150;
export const CONTENT_MAX = 10000;
export const TAGS_MAX = 5;
export const TAG_MAX_LENGTH = 30;

/** « a, b ,, c » -> ['a', 'b', 'c'] */
export function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '');
}

/** Écran 13 : nouveau sujet. */
@Component({
  selector: 'app-new-topic',
  imports: [RouterLink],
  templateUrl: './new-topic.html',
  styleUrl: './new-topic.scss',
})
export class NewTopic {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly forum = inject(ForumService);
  private readonly toast = inject(ToastService);

  protected readonly courseId = Number(this.route.snapshot.paramMap.get('courseId'));
  protected readonly limits = { TITLE_MIN, TITLE_MAX, CONTENT_MAX, TAGS_MAX, TAG_MAX_LENGTH };
  protected readonly categories = signal<Category[]>([]);
  protected readonly title = signal('');
  protected readonly categoryId = signal('');
  protected readonly content = signal('');
  protected readonly tagsRaw = signal('');
  protected readonly touched = signal(false);
  protected readonly busy = signal(false);

  protected readonly tags = computed(() => parseTags(this.tagsRaw()));
  protected readonly titleError = computed(() => {
    const length = this.title().trim().length;
    if (length < TITLE_MIN) {
      return `Le titre doit contenir au moins ${TITLE_MIN} caractères.`;
    }
    return length > TITLE_MAX ? `Le titre ne peut pas dépasser ${TITLE_MAX} caractères.` : null;
  });
  protected readonly categoryError = computed(() => (this.categoryId() ? null : 'Choisissez une catégorie.'));
  protected readonly contentError = computed(() => {
    if (this.content().trim() === '') {
      return 'Décrivez votre question.';
    }
    return this.content().length > CONTENT_MAX ? `Le contenu ne peut pas dépasser ${CONTENT_MAX} caractères.` : null;
  });
  protected readonly tagsError = computed(() => {
    const tags = this.tags();
    if (tags.length > TAGS_MAX) {
      return `Cinq tags au maximum.`;
    }
    return tags.some((tag) => tag.length > TAG_MAX_LENGTH)
      ? `Un tag ne peut pas dépasser ${TAG_MAX_LENGTH} caractères.`
      : null;
  });
  protected readonly valid = computed(
    () => !this.titleError() && !this.categoryError() && !this.contentError() && !this.tagsError(),
  );

  constructor() {
    this.forum.categories().subscribe({
      next: (list) => this.categories.set([...list].sort((a, b) => a.order - b.order)),
      error: () => this.toast.error('Impossible de charger les catégories.'),
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected submit(): void {
    this.touched.set(true);
    if (!this.valid() || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.forum
      .createTopic(this.courseId, {
        title: this.title().trim(),
        content: this.content().trim(),
        tags: this.tags(),
        categoryId: this.categoryId(),
      })
      .subscribe({
        next: (topic) => {
          this.toast.success('Sujet publié.');
          void this.router.navigate(['/forum/sujets', topic._id]);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.toast.error(errorMessage(error, 'Publication impossible pour le moment.'));
        },
      });
  }
}
