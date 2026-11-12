import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/http/error-message';
import { ToastService } from '../../core/toast/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { timeAgo } from '../../shared/time-ago';
import { ForumAuthor } from './forum-author';
import { buildThreads } from './forum-tabs';
import { ModerationFlag, Page, Post, Topic } from './forum.models';
import { ForumService } from './forum.service';

type Pending = { kind: 'topic' } | { kind: 'post'; id: string };

const POST_MAX = 10000;

/** Écrans 12 et 14 : détail d'un sujet, fil de messages et modération. */
@Component({
  selector: 'app-topic-detail',
  imports: [Icon, RouterLink, ForumAuthor, ConfirmDialog, NgTemplateOutlet],
  templateUrl: './topic-detail.html',
  styleUrl: './topic-detail.scss',
})
export class TopicDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly forum = inject(ForumService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  protected readonly icons = Icons;
  protected readonly postMax = POST_MAX;
  protected readonly topicId = this.route.snapshot.paramMap.get('topicId') ?? '';
  protected readonly topic = signal<Topic | null>(null);
  protected readonly posts = signal<Page<Post> | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly threads = computed(() => buildThreads(this.posts()?.items ?? []));
  protected readonly menuOpen = signal(false);
  protected readonly pending = signal<Pending | null>(null);
  protected readonly busy = signal(false);
  /** Messages aimés pendant cette visite (l'API ne dit pas si l'utilisateur a déjà aimé). */
  protected readonly liked = signal<ReadonlySet<string>>(new Set());
  protected readonly editingId = signal<string | null>(null);
  protected readonly editText = signal('');
  protected readonly replyTo = signal<Post | null>(null);
  protected readonly replyText = signal('');

  protected readonly userId = computed(() => this.auth.user()?.id ?? null);
  protected readonly isModerator = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'ENSEIGNANT' || role === 'ADMIN';
  });
  protected readonly replyError = computed(() =>
    this.replyText().length > POST_MAX ? `Le message ne peut pas dépasser ${POST_MAX} caractères.` : null,
  );
  protected readonly canReply = computed(() => this.replyText().trim() !== '' && !this.replyError() && !this.busy());
  protected readonly canSaveEdit = computed(
    () => this.editText().trim() !== '' && this.editText().length <= POST_MAX && !this.busy(),
  );

  private page = 1;

  constructor() {
    this.load();
  }

  protected ago(iso: string | undefined): string {
    return iso ? timeAgo(iso) : '';
  }

  protected isMine(post: Post): boolean {
    return post.authorId === this.userId();
  }

  protected load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.forum.topic(this.topicId).subscribe({
      next: (topic) => {
        this.topic.set(topic);
        this.loadPosts(this.page, true);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }

  protected loadPosts(page: number, initial = false): void {
    this.forum.posts(this.topicId, page).subscribe({
      next: (result) => {
        this.page = result.page;
        this.posts.set(result);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (initial) {
          this.failed.set(true);
          this.loading.set(false);
        } else {
          this.fail(error);
        }
      },
    });
  }

  // --- Modération (écran 14) ---

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected moderate(flag: ModerationFlag): void {
    const topic = this.topic();
    if (!topic) {
      return;
    }
    this.menuOpen.set(false);
    const current = { pin: topic.isPinned, lock: topic.isLocked, resolve: topic.isResolved }[flag];
    const key = { pin: 'isPinned', lock: 'isLocked', resolve: 'isResolved' }[flag] as
      | 'isPinned'
      | 'isLocked'
      | 'isResolved';
    const messages = {
      pin: ['Sujet épinglé.', 'Sujet désépinglé.'],
      lock: ['Sujet verrouillé.', 'Sujet déverrouillé.'],
      resolve: ['Sujet marqué comme résolu.', 'Sujet marqué comme non résolu.'],
    }[flag];
    this.forum.moderate(this.topicId, flag, !current).subscribe({
      next: () => {
        this.topic.update((t) => t && { ...t, [key]: !current });
        this.toast.success(messages[current ? 1 : 0]);
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  protected askDeleteTopic(): void {
    this.menuOpen.set(false);
    this.pending.set({ kind: 'topic' });
  }

  protected askDeletePost(post: Post): void {
    this.pending.set({ kind: 'post', id: post._id });
  }

  protected cancelDelete(): void {
    this.pending.set(null);
  }

  protected confirmDelete(): void {
    const pending = this.pending();
    if (!pending || this.busy()) {
      return;
    }
    this.busy.set(true);
    if (pending.kind === 'topic') {
      const courseId = this.topic()?.courseId;
      this.forum.removeTopic(this.topicId).subscribe({
        next: () => {
          this.busy.set(false);
          this.pending.set(null);
          this.toast.success('Sujet supprimé.');
          void this.router.navigate(courseId ? ['/forum/cours', courseId] : ['/forum']);
        },
        error: (error: unknown) => this.endDelete(error),
      });
    } else {
      this.forum.removePost(pending.id).subscribe({
        next: () => {
          this.busy.set(false);
          this.pending.set(null);
          this.toast.success('Message supprimé.');
          this.topic.update((t) => t && { ...t, repliesCount: Math.max(0, t.repliesCount - 1) });
          this.loadPosts(this.page);
        },
        error: (error: unknown) => this.endDelete(error),
      });
    }
  }

  // --- Messages ---

  protected toggleLike(post: Post): void {
    const wasLiked = this.liked().has(post._id);
    const apply = (delta: number) => {
      this.posts.update(
        (page) =>
          page && {
            ...page,
            items: page.items.map((p) =>
              p._id === post._id ? { ...p, likesCount: Math.max(0, p.likesCount + delta) } : p,
            ),
          },
      );
      this.liked.update((set) => {
        const next = new Set(set);
        if (delta > 0) {
          next.add(post._id);
        } else {
          next.delete(post._id);
        }
        return next;
      });
    };
    apply(wasLiked ? -1 : 1);
    (wasLiked ? this.forum.unlike(post._id) : this.forum.like(post._id)).subscribe({
      error: (error: unknown) => {
        apply(wasLiked ? 1 : -1);
        this.fail(error);
      },
    });
  }

  protected startEdit(post: Post): void {
    this.editingId.set(post._id);
    this.editText.set(post.content);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected saveEdit(post: Post): void {
    if (!this.canSaveEdit()) {
      return;
    }
    this.busy.set(true);
    const content = this.editText().trim();
    this.forum.updatePost(post._id, content).subscribe({
      next: () => {
        this.busy.set(false);
        this.editingId.set(null);
        this.posts.update(
          (page) => page && { ...page, items: page.items.map((p) => (p._id === post._id ? { ...p, content } : p)) },
        );
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.fail(error);
      },
    });
  }

  protected canAccept(): boolean {
    const topic = this.topic();
    return this.isModerator() || (topic !== null && topic.authorId === this.userId());
  }

  protected toggleAccept(post: Post): void {
    const value = !post.isAcceptedAnswer;
    this.forum.accept(post._id, value).subscribe({
      next: () =>
        this.posts.update(
          (page) =>
            page && {
              ...page,
              items: page.items.map((p) =>
                p._id === post._id
                  ? { ...p, isAcceptedAnswer: value }
                  : value
                    ? { ...p, isAcceptedAnswer: false }
                    : p,
              ),
            },
        ),
      error: (error: unknown) => this.fail(error),
    });
  }

  protected startReply(post: Post | null): void {
    this.replyTo.set(post);
    document.getElementById('reply-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected publishReply(): void {
    if (!this.canReply()) {
      return;
    }
    this.busy.set(true);
    this.forum.createPost(this.topicId, this.replyText().trim(), this.replyTo()?._id).subscribe({
      next: () => {
        this.busy.set(false);
        this.replyText.set('');
        this.replyTo.set(null);
        this.topic.update((t) => t && { ...t, repliesCount: t.repliesCount + 1 });
        const total = (this.posts()?.total ?? 0) + 1;
        const limit = this.posts()?.limit || 50;
        this.loadPosts(Math.max(1, Math.ceil(total / limit)));
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.fail(error);
      },
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  private endDelete(error: unknown): void {
    this.busy.set(false);
    this.pending.set(null);
    this.fail(error);
  }

  /** Un 403 reçoit un message clair (l'intercepteur redirige en plus vers « Accès refusé »). */
  private fail(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.toast.error("Vous n'avez pas le droit d'effectuer cette action.");
    } else {
      this.toast.error(errorMessage(error));
    }
  }
}
