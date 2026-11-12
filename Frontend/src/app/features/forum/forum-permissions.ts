import { CurrentUser } from '../../core/auth/auth.service';
import { Post, Topic } from './forum.model';

/**
 * Droits du forum, alignés sur le forum-service (qui reste l'autorité : un refus donne un 403).
 * Modérateurs : ENSEIGNANT et ADMIN.
 */
export const isModerator = (user: CurrentUser | null): boolean => user?.role === 'ENSEIGNANT' || user?.role === 'ADMIN';

const owns = (user: CurrentUser | null, authorId: string): boolean => user !== null && user.id === authorId;

export const canPinOrLock = (user: CurrentUser | null): boolean => isModerator(user);

export const canResolve = (user: CurrentUser | null, topic: Topic): boolean => owns(user, topic.authorId) || isModerator(user);

export const canDeleteTopic = (user: CurrentUser | null, topic: Topic): boolean => owns(user, topic.authorId) || isModerator(user);

/** L'auteur ne modifie pas un sujet verrouillé ; un modérateur le peut. */
export const canEditTopic = (user: CurrentUser | null, topic: Topic): boolean =>
  isModerator(user) || (owns(user, topic.authorId) && !topic.isLocked);

export const canReply = (user: CurrentUser | null, topic: Topic): boolean => user !== null && (!topic.isLocked || isModerator(user));

export const canEditPost = (user: CurrentUser | null, post: Post): boolean => owns(user, post.authorId) || isModerator(user);

/** Meilleure réponse : auteur du sujet ou modérateur. */
export const canAccept = (user: CurrentUser | null, topic: Topic): boolean => owns(user, topic.authorId) || isModerator(user);

export const hasModerationMenu = (user: CurrentUser | null, topic: Topic): boolean =>
  canPinOrLock(user) || canResolve(user, topic) || canDeleteTopic(user, topic);
