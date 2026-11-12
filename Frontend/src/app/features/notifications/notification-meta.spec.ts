import { targetFor } from './notification-meta';

describe('targetFor', () => {
  it('ouvre le sujet quand le forum fournit son identifiant', () => {
    expect(targetFor({ type: 'forum.reply', data: { topicId: 'abc', courseId: 'c1' } })).toEqual({ commands: ['/forum/sujets', 'abc'] });
    expect(targetFor({ type: 'forum.accepted', data: { topicId: 42 } })).toEqual({ commands: ['/forum/sujets', '42'] });
  });

  it('retombe sur la liste du cours, puis sur le forum', () => {
    expect(targetFor({ type: 'forum.like', data: { courseId: 'c1' } })).toEqual({ commands: ['/forum'], queryParams: { cours: 'c1' } });
    expect(targetFor({ type: 'forum.like', data: null })).toEqual({ commands: ['/forum'] });
  });

  it('ignore un identifiant vide ou invalide', () => {
    expect(targetFor({ type: 'forum.reply', data: { topicId: '  ', courseId: {} } })).toEqual({ commands: ['/forum'] });
  });

  it('suit le type pour les autres notifications', () => {
    expect(targetFor({ type: 'grade', data: null })).toEqual({ commands: ['/evaluations'] });
    expect(targetFor({ type: 'announcement', data: null })).toBeNull();
    expect(targetFor({ type: 'inconnu', data: null })).toBeNull();
  });
});
