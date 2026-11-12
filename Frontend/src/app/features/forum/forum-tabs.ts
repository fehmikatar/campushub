import { Post, Topic } from './forum.models';

export type TopicTab = 'recent' | 'popular' | 'unanswered';

export const TAB_LABELS: Record<TopicTab, string> = {
  recent: 'Récents',
  popular: 'Populaires',
  unanswered: 'Sans réponse',
};

/** « Récents » garde l'ordre de l'API ; « Populaires » trie par réponses puis vues ; « Sans réponse » filtre. */
export function applyTab(topics: readonly Topic[], tab: TopicTab): Topic[] {
  switch (tab) {
    case 'popular':
      return [...topics].sort((a, b) => b.repliesCount - a.repliesCount || b.viewsCount - a.viewsCount);
    case 'unanswered':
      return topics.filter((topic) => topic.repliesCount === 0);
    default:
      return [...topics];
  }
}

export interface PostThread {
  post: Post;
  replies: Post[];
}

/**
 * Fil à un niveau : une réponse à une réponse est rattachée au message racine ;
 * un parent introuvable fait de la réponse un message racine.
 */
export function buildThreads(posts: readonly Post[]): PostThread[] {
  const byId = new Map(posts.map((post) => [post._id, post]));
  const rootOf = (post: Post): Post => {
    let current = post;
    const seen = new Set<string>();
    while (current.parentPostId && byId.has(current.parentPostId) && !seen.has(current._id)) {
      seen.add(current._id);
      current = byId.get(current.parentPostId)!;
    }
    return current;
  };
  const threads = new Map<string, PostThread>();
  for (const post of posts) {
    if (!post.parentPostId || !byId.has(post.parentPostId)) {
      threads.set(post._id, { post, replies: [] });
    }
  }
  for (const post of posts) {
    if (!threads.has(post._id)) {
      threads.get(rootOf(post)._id)?.replies.push(post);
    }
  }
  return [...threads.values()];
}
