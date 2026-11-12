import { Role } from '../../core/auth/role';

/** Catégorie du forum. Pas de compteurs de sujets dans l'API. */
export interface Category {
  _id: string;
  name: string;
  slug?: string;
  description: string;
  order: number;
}

export interface Topic {
  _id: string;
  title: string;
  content: string;
  courseId: number;
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
  createdAt?: string;
}

export interface Post {
  _id: string;
  topicId?: string;
  content: string;
  authorId: string;
  authorRole: Role;
  isAcceptedAnswer: boolean;
  likesCount: number;
  parentPostId: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Pagination du forum-service. */
export interface Page<T> {
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
  tags: string[];
  categoryId?: string;
}

export type ModerationFlag = 'pin' | 'lock' | 'resolve';
