import { applyTab, buildThreads } from './forum-tabs';
import { Post, Topic } from './forum.models';

const topic = (id: string, repliesCount: number, viewsCount: number): Topic => ({
  _id: id,
  title: id,
  content: '',
  courseId: 1,
  categoryId: null,
  tags: [],
  authorId: 'u',
  authorRole: 'ETUDIANT',
  isPinned: false,
  isLocked: false,
  isResolved: false,
  repliesCount,
  viewsCount,
  lastActivityAt: '2026-01-01T00:00:00Z',
});

const post = (id: string, parentPostId: string | null = null): Post => ({
  _id: id,
  content: id,
  authorId: 'u',
  authorRole: 'ETUDIANT',
  isAcceptedAnswer: false,
  likesCount: 0,
  parentPostId,
});

describe('applyTab', () => {
  const topics = [topic('a', 0, 5), topic('b', 3, 1), topic('c', 3, 9), topic('d', 0, 50)];

  it('« Récents » garde l\'ordre de l\'API sans modifier la liste', () => {
    const result = applyTab(topics, 'recent');
    expect(result.map((t) => t._id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result).not.toBe(topics);
  });

  it('« Populaires » trie par réponses puis par vues', () => {
    expect(applyTab(topics, 'popular').map((t) => t._id)).toEqual(['c', 'b', 'd', 'a']);
    expect(topics.map((t) => t._id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('« Sans réponse » ne garde que les sujets sans réponse', () => {
    expect(applyTab(topics, 'unanswered').map((t) => t._id)).toEqual(['a', 'd']);
  });
});

describe('buildThreads', () => {
  it('rattache les réponses à leur message racine, y compris une réponse à une réponse', () => {
    const threads = buildThreads([post('1'), post('2', '1'), post('3', '2'), post('4')]);
    expect(threads.map((t) => t.post._id)).toEqual(['1', '4']);
    expect(threads[0].replies.map((p) => p._id)).toEqual(['2', '3']);
    expect(threads[1].replies).toEqual([]);
  });

  it('traite une réponse au parent introuvable comme un message racine', () => {
    const threads = buildThreads([post('1', 'absent')]);
    expect(threads.map((t) => t.post._id)).toEqual(['1']);
  });
});
