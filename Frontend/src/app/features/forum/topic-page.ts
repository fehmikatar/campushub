import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ROLE_LABELS } from '../../core/auth/role';
import { errorMessage } from '../../core/http/error-message';
import { ToastService } from '../../core/toast/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog/confirm-dialog';
import { Icon } from '../../shared/icon/icon';
import { Icons } from '../../shared/icon/icons';
import { renderMarkdown } from '../../shared/markdown/markdown';
import { MarkdownEditor } from '../../shared/markdown/markdown-editor';
import { timeAgo } from '../../shared/time-ago';
import { Paged, Post, Topic, TopicFlag } from './forum.model';
import { ForumService } from './forum.service';
import {
  canAccept,
  canDeleteTopic,
  canEditPost,
  canEditTopic,
  canPinOrLock,
  canReply,
  canResolve,
  hasModerationMenu,
  isModerator,
} from './forum-permissions';

const PAGE_SIZE = 20;

type Pending = { kind: 'topic' } | { kind: 'post'; post: Post };

/** Écrans 12 et 14 : un sujet, ses réponses, et les actions de modération. */
@Component({
  selector: 'app-topic-page',
  imports: [RouterLink, Icon, MarkdownEditor, ConfirmDialog],
  templateUrl: './topic-page.html',
  styleUrl: './topic-page.scss',
})
export class TopicPage {
  private readonly forum = inject(ForumService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly topicId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly user = inject(AuthService).user;
  protected readonly icons = Icons;
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly topic = signal<Topic | null>(null);
  protected readonly notFound = signal(false);
  protected readonly failed = signal(false);
  protected readonly posts = signal<Paged<Post> | null>(null);
  protected readonly busy = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly pending = signal<Pending | null>(null);

  protected readonly editingTopic = signal(false);
  protected readonly editTitle = signal('');
  protected readonly editContent = signal('');
  protected readonly editError = signal<string | null>(null);

  protected readonly editingPostId = signal<string | null>(null);
  protected readonly editPostContent = signal('');

  protected readonly replyContent = signal('');
  protected readonly replyTo = signal<Post | null>(null);
  protected readonly replyError = signal<string | null>(null);

  private page = 1;

  protected readonly topicHtml = computed(() => renderMarkdown(this.topic()?.content ?? ''));
  protected readonly postViews = computed(() =>
    (this.posts()?.items ?? []).map((post) => ({ post, html: renderMarkdown(post.content) })),
  );

  constructor() {
    this.load();
  }

  // --- droits (voir forum-permissions.ts) ---
  protected readonly moderator = computed(() => isModerator(this.user()));
  protected canPinOrLock = () => canPinOrLock(this.user());
  protected canResolve = (topic: Topic) => canResolve(this.user(), topic);
  protected canDeleteTopic = (topic: Topic) => canDeleteTopic(this.user(), topic);
  protected canEditTopic = (topic: Topic) => canEditTopic(this.user(), topic);
  protected canReply = (topic: Topic) => canReply(this.user(), topic);
  protected canEditPost = (post: Post) => canEditPost(this.user(), post);
  protected canAccept = (topic: Topic) => canAccept(this.user(), topic);
  protected hasMenu = (topic: Topic) => hasModerationMenu(this.user(), topic);

  protected ago(iso: string): string {
    return timeAgo(iso);
  }

  protected get totalPages(): number {
    return this.posts()?.totalPages ?? 1;
  }

  protected currentPage(): number {
    return this.page;
  }

  protected parentLabel(post: Post): string | null {
    if (!post.parentPostId) {
      return null;
    }
    const parent = this.posts()?.items.find((item) => item._id === post.parentPostId);
    return parent ? `en réponse à un message de ${ROLE_LABELS[parent.authorRole]}` : 'en réponse à un autre message';
  }

  protected load(): void {
    this.failed.set(false);
    this.notFound.set(false);
    this.forum.topic(this.topicId).subscribe({
      next: (topic) => {
        this.topic.set(topic);
        this.loadPosts(1);
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 400)) {
          this.notFound.set(true);
        } else {
          this.failed.set(true);
        }
      },
    });
  }

  protected loadPosts(page: number): void {
    this.page = page;
    this.forum.posts(this.topicId, page).subscribe({
      next: (result) => this.posts.set(result),
      error: () => this.toast.error('Impossible de charger les réponses.'),
    });
  }

  // --- modération et actions sur le sujet ---
  protected toggle(flag: TopicFlag): void {
    const topic = this.topic();
    if (!topic) {
      return;
    }
    const field = { pin: 'isPinned', lock: 'isLocked', resolve: 'isResolved' } as const;
    const next = !topic[field[flag]];
    this.menuOpen.set(false);
    this.run(this.forum.setFlag(topic._id, flag, next), () => {
      this.topic.set({ ...topic, [field[flag]]: next });
      this.toast.success(
        {
          pin: next ? 'Sujet épinglé.' : 'Sujet désépinglé.',
          lock: next ? 'Sujet verrouillé.' : 'Sujet déverrouillé.',
          resolve: next ? 'Sujet marqué comme résolu.' : 'Sujet marqué comme non résolu.',
        }[flag],
      );
    });
  }

  protected startEditTopic(topic: Topic): void {
    this.editTitle.set(topic.title);
    this.editContent.set(topic.content);
    this.editError.set(null);
    this.editingTopic.set(true);
  }

  protected saveTopic(): void {
    const topic = this.topic();
    const title = this.editTitle().trim();
    const content = this.editContent().trim();
    if (!topic) {
      return;
    }
    if (title.length < 5 || title.length > 150 || content.length < 1) {
      this.editError.set('Le titre doit faire 5 à 150 caractères et le message ne peut pas être vide.');
      return;
    }
    this.busy.set(true);
    this.forum.updateTopic(topic._id, { title, content, tags: topic.tags, categoryId: topic.categoryId }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.topic.set({ ...topic, ...updated });
        this.editingTopic.set(false);
        this.toast.success('Sujet modifié.');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.editError.set(errorMessage(error));
      },
    });
  }

  protected askDeleteTopic(): void {
    this.menuOpen.set(false);
    this.pending.set({ kind: 'topic' });
  }

  // --- réponses ---
  protected like(post: Post): void {
    const request = post.likedByMe ? this.forum.unlike(post._id) : this.forum.like(post._id);
    request.subscribe({
      next: (result) => this.patchPost({ ...post, likesCount: result.likesCount, likedByMe: result.likedByMe }),
      error: (error: unknown) => this.toast.error(errorMessage(error)),
    });
  }

  protected accept(post: Post): void {
    const topic = this.topic();
    if (!topic) {
      return;
    }
    this.run(this.forum.accept(post._id, !post.isAcceptedAnswer), () => {
      // La réponse validée marque aussi le sujet comme résolu : on recharge l'état.
      this.forum.topic(topic._id).subscribe((fresh) => this.topic.set(fresh));
      this.loadPosts(this.page);
    });
  }

  protected setReplyTo(post: Post | null): void {
    this.replyTo.set(post);
  }

  protected sendReply(): void {
    const topic = this.topic();
    const content = this.replyContent().trim();
    if (!topic) {
      return;
    }
    if (content.length < 1 || content.length > 10000) {
      this.replyError.set('Le message est obligatoire (10 000 caractères maximum).');
      return;
    }
    this.busy.set(true);
    this.replyError.set(null);
    this.forum.createPost(topic._id, content, this.replyTo()?._id).subscribe({
      next: () => {
        this.busy.set(false);
        this.replyContent.set('');
        this.replyTo.set(null);
        this.toast.success('Réponse publiée.');
        this.forum.topic(topic._id).subscribe((fresh) => this.topic.set(fresh));
        // On affiche la dernière page, où se trouve la nouvelle réponse.
        this.loadPosts(Math.max(1, Math.ceil(((this.posts()?.total ?? 0) + 1) / PAGE_SIZE)));
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.replyError.set(errorMessage(error));
      },
    });
  }

  protected startEditPost(post: Post): void {
    this.editPostContent.set(post.content);
    this.editingPostId.set(post._id);
  }

  protected savePost(post: Post): void {
    const content = this.editPostContent().trim();
    if (content.length < 1 || content.length > 10000) {
      this.toast.error('Le message est obligatoire (10 000 caractères maximum).');
      return;
    }
    this.busy.set(true);
    this.forum.updatePost(post._id, content).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.patchPost({ ...post, ...updated });
        this.editingPostId.set(null);
        this.toast.success('Réponse modifiée.');
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }

  protected askDeletePost(post: Post): void {
    this.pending.set({ kind: 'post', post });
  }

  protected confirmDelete(): void {
    const pending = this.pending();
    const topic = this.topic();
    if (!pending || !topic) {
      return;
    }
    this.pending.set(null);
    if (pending.kind === 'topic') {
      this.run(this.forum.deleteTopic(topic._id), () => {
        this.toast.success('Sujet supprimé.');
        void this.router.navigate(['/forum'], { queryParams: { cours: topic.courseId } });
      });
    } else {
      this.run(this.forum.deletePost(pending.post._id), () => {
        this.toast.success('Réponse supprimée.');
        this.forum.topic(topic._id).subscribe((fresh) => this.topic.set(fresh));
        const onlyOne = (this.posts()?.items.length ?? 0) <= 1;
        this.loadPosts(onlyOne && this.page > 1 ? this.page - 1 : this.page);
      });
    }
  }

  @HostListener('document:click', ['$event'])
  protected closeMenuOnOutsideClick(event: MouseEvent): void {
    const menu = this.host.nativeElement.querySelector('.moderation');
    if (this.menuOpen() && menu && !menu.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }

  private patchPost(updated: Post): void {
    this.posts.update((page) => page && { ...page, items: page.items.map((post) => (post._id === updated._id ? updated : post)) });
  }

  private run(request: { subscribe: (observer: { next: () => void; error: (error: unknown) => void }) => unknown }, done: () => void): void {
    this.busy.set(true);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        done();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.toast.error(errorMessage(error));
      },
    });
  }
}
