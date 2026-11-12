import { CurrentUser } from '../../core/auth/auth.service';
import { Post, Topic } from './forum.model';
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

const user = (id: string, role: CurrentUser['role']): CurrentUser => ({ id, prenom: '', nom: '', email: '', role });
const student = user('s1', 'ETUDIANT');
const otherStudent = user('s2', 'ETUDIANT');
const teacher = user('t1', 'ENSEIGNANT');
const admin = user('a1', 'ADMIN');
const topic = (over: Partial<Topic> = {}) => ({ authorId: 's1', isLocked: false, ...over }) as Topic;
const post = (authorId: string) => ({ authorId }) as Post;

describe('droits du forum', () => {
  it('enseignants et administrateurs sont modérateurs', () => {
    expect([student, teacher, admin, null].map(isModerator)).toEqual([false, true, true, false]);
  });

  it('seuls les modérateurs épinglent et verrouillent', () => {
    expect([student, teacher, admin].map(canPinOrLock)).toEqual([false, true, true]);
  });

  it("l'auteur résout et supprime son sujet, pas un autre étudiant", () => {
    expect(canResolve(student, topic())).toBe(true);
    expect(canDeleteTopic(student, topic())).toBe(true);
    expect(canResolve(otherStudent, topic())).toBe(false);
    expect(canDeleteTopic(otherStudent, topic())).toBe(false);
    expect(canDeleteTopic(teacher, topic())).toBe(true);
  });

  it("l'auteur ne modifie pas un sujet verrouillé, un modérateur le peut", () => {
    expect(canEditTopic(student, topic())).toBe(true);
    expect(canEditTopic(student, topic({ isLocked: true }))).toBe(false);
    expect(canEditTopic(teacher, topic({ isLocked: true }))).toBe(true);
  });

  it('on ne répond pas à un sujet verrouillé sauf modérateur', () => {
    expect(canReply(student, topic({ isLocked: true }))).toBe(false);
    expect(canReply(teacher, topic({ isLocked: true }))).toBe(true);
    expect(canReply(student, topic())).toBe(true);
  });

  it("la meilleure réponse est validée par l'auteur du sujet ou un modérateur", () => {
    expect(canAccept(student, topic())).toBe(true);
    expect(canAccept(otherStudent, topic())).toBe(false);
    expect(canAccept(admin, topic())).toBe(true);
  });

  it("l'auteur d'une réponse la modifie, pas un autre étudiant", () => {
    expect(canEditPost(student, post('s1'))).toBe(true);
    expect(canEditPost(otherStudent, post('s1'))).toBe(false);
    expect(canEditPost(teacher, post('s1'))).toBe(true);
  });

  it('le menu de modération est vide pour un étudiant étranger au sujet', () => {
    expect(hasModerationMenu(otherStudent, topic())).toBe(false);
    expect(hasModerationMenu(student, topic())).toBe(true);
    expect(hasModerationMenu(teacher, topic())).toBe(true);
  });
});
