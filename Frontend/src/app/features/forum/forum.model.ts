import { Role } from '../../core/auth/role';

/** Sujet du forum (forum-service). Toujours rattaché à un cours ; pas de nom d'auteur dans l'API. */
export interface Topic {
  _id: string;
  title: string;
  content: string;
  courseId: string;
  categoryId: string | null;
  tags: string[];
  authorId: string;
  authorRole: Role;
  isPinned: boolean;
  isLocked: boolean;
  isResolved: boolean;
  repliesCount: number;
  viewsCount: number;
  lastActivityAt: string;
  createdAt: string;
}

/** Réponse à un sujet. `likedByMe` n'est renvoyé que dans la liste des messages. */
export interface Post {
  _id: string;
  topicId: string;
  parentPostId: string | null;
  content: string;
  authorId: string;
  authorRole: Role;
  isAcceptedAnswer: boolean;
  likesCount: number;
  likedByMe?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface TopicFilters {
  categoryId?: string;
  q?: string;
  resolved?: boolean;
  page?: number;
  limit?: number;
}

export interface TopicInput {
  title: string;
  content: string;
  tags?: string[];
  categoryId?: string | null;
}

export type TopicFlag = 'pin' | 'lock' | 'resolve';
