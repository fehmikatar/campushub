const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers');
const { TOKENS: T, IDS } = h;

before(h.start);
after(h.stop);

test('création : repliesCount +1, auteur issu du token', async () => {
  const t = await h.createTopic(T.etudiant);
  const r = await h.api(T.etudiant2, 'POST', `/topics/${t._id}/posts`, { content: 'Ma réponse', authorId: 'pirate', authorRole: 'ADMIN' });
  assert.equal(r.status, 201);
  assert.equal(r.body.authorId, IDS.etudiant2);
  assert.equal(r.body.authorRole, 'ETUDIANT');
  assert.equal((await h.getTopic(t._id)).repliesCount, 1);
  await h.createPost(T.etudiant, t._id);
  assert.equal((await h.getTopic(t._id)).repliesCount, 2);
});

test('validation 400 : contenu vide, parentPostId invalide ; 404 sujet inconnu', async () => {
  const t = await h.createTopic(T.etudiant);
  assert.equal((await h.api(T.etudiant, 'POST', `/topics/${t._id}/posts`, { content: '   ' })).status, 400);
  assert.equal((await h.api(T.etudiant, 'POST', `/topics/${t._id}/posts`, { content: 'x', parentPostId: 'nope' })).status, 400);
  assert.equal((await h.api(T.etudiant, 'POST', `/topics/${new mongoose.Types.ObjectId()}/posts`, { content: 'x' })).status, 404);
});

test("un seul niveau d'imbrication : réponse à une réponse OK, au-delà 400", async () => {
  const t = await h.createTopic(T.etudiant);
  const root = await h.createPost(T.etudiant, t._id);
  const child = await h.api(T.etudiant2, 'POST', `/topics/${t._id}/posts`, { content: 'enfant', parentPostId: root._id });
  assert.equal(child.status, 201);
  assert.equal(child.body.parentPostId, root._id);
  const grand = await h.api(T.etudiant, 'POST', `/topics/${t._id}/posts`, { content: 'petit-enfant', parentPostId: child.body._id });
  assert.equal(grand.status, 400);
});

test("parentPostId d'un autre sujet → 400", async () => {
  const t1 = await h.createTopic(T.etudiant);
  const t2 = await h.createTopic(T.etudiant);
  const p = await h.createPost(T.etudiant, t1._id);
  assert.equal((await h.api(T.etudiant, 'POST', `/topics/${t2._id}/posts`, { content: 'x', parentPostId: p._id })).status, 400);
});

test('sujet verrouillé : 403 pour étudiant (même auteur), OK pour enseignant', async () => {
  const t = await h.createTopic(T.etudiant);
  await h.api(T.enseignant, 'PATCH', `/topics/${t._id}/lock`, { value: true });
  assert.equal((await h.api(T.etudiant2, 'POST', `/topics/${t._id}/posts`, { content: 'x' })).status, 403);
  assert.equal((await h.api(T.etudiant, 'POST', `/topics/${t._id}/posts`, { content: 'x' })).status, 403);
  assert.equal((await h.api(T.enseignant, 'POST', `/topics/${t._id}/posts`, { content: 'ok' })).status, 201);
  assert.equal((await h.getTopic(t._id)).repliesCount, 1);
});

test('liste paginée des réponses avec likedByMe', async () => {
  const t = await h.createTopic(T.etudiant);
  const p1 = await h.createPost(T.etudiant, t._id, { content: 'un' });
  await h.createPost(T.etudiant, t._id, { content: 'deux' });
  await h.createPost(T.etudiant, t._id, { content: 'trois' });
  await h.api(T.etudiant2, 'POST', `/posts/${p1._id}/like`);
  const r = await h.api(T.etudiant2, 'GET', `/topics/${t._id}/posts?limit=2`);
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 2);
  assert.equal(r.body.total, 3);
  assert.equal(r.body.totalPages, 2);
  assert.equal(r.body.items[0]._id, p1._id);
  assert.equal(r.body.items[0].likedByMe, true);
  assert.equal(r.body.items[1].likedByMe, false);
});

test('modification : auteur et modérateur OK, autre étudiant 403', async () => {
  const t = await h.createTopic(T.etudiant);
  const p = await h.createPost(T.etudiant, t._id);
  assert.equal((await h.api(T.etudiant2, 'PUT', `/posts/${p._id}`, { content: 'hack' })).status, 403);
  assert.equal((await h.api(T.etudiant, 'PUT', `/posts/${p._id}`, { content: 'édité' })).body.content, 'édité');
  assert.equal((await h.api(T.enseignant, 'PUT', `/posts/${p._id}`, { content: 'modéré' })).status, 200);
});

test('suppression : autre étudiant 403 ; auteur 204 ; repliesCount -1 ; pas de double décrément', async () => {
  const t = await h.createTopic(T.etudiant);
  const p1 = await h.createPost(T.etudiant, t._id);
  await h.createPost(T.etudiant, t._id);
  assert.equal((await h.getTopic(t._id)).repliesCount, 2);
  assert.equal((await h.api(T.etudiant2, 'DELETE', `/posts/${p1._id}`)).status, 403);
  assert.equal((await h.api(T.etudiant, 'DELETE', `/posts/${p1._id}`)).status, 204);
  assert.equal((await h.getTopic(t._id)).repliesCount, 1);
  assert.equal((await h.api(T.etudiant, 'DELETE', `/posts/${p1._id}`)).status, 404);
  assert.equal((await h.getTopic(t._id)).repliesCount, 1);
  const list = await h.api(T.etudiant, 'GET', `/topics/${t._id}/posts`);
  assert.equal(list.body.total, 1);
});

test("un modérateur peut supprimer la réponse d'un autre", async () => {
  const t = await h.createTopic(T.etudiant);
  const p = await h.createPost(T.etudiant2, t._id);
  assert.equal((await h.api(T.enseignant, 'DELETE', `/posts/${p._id}`)).status, 204);
});

test('likes : 201, second like 409, unlike, likesCount cohérent', async () => {
  const t = await h.createTopic(T.etudiant);
  const p = await h.createPost(T.etudiant, t._id);
  const l1 = await h.api(T.etudiant, 'POST', `/posts/${p._id}/like`);
  assert.equal(l1.status, 201);
  assert.equal(l1.body.likesCount, 1);
  assert.equal(l1.body.likedByMe, true);
  assert.equal((await h.api(T.etudiant, 'POST', `/posts/${p._id}/like`)).status, 409);
  const l2 = await h.api(T.etudiant2, 'POST', `/posts/${p._id}/like`);
  assert.equal(l2.body.likesCount, 2);
  const u = await h.api(T.etudiant, 'DELETE', `/posts/${p._id}/like`);
  assert.equal(u.status, 200);
  assert.equal(u.body.likesCount, 1);
  assert.equal(u.body.likedByMe, false);
  assert.equal((await h.api(T.etudiant, 'DELETE', `/posts/${p._id}/like`)).status, 404);
  const list = await h.api(T.etudiant, 'GET', `/topics/${t._id}/posts`);
  assert.equal(list.body.items[0].likesCount, 1);
});

test('like concurrent du même utilisateur : un seul compte', async () => {
  const t = await h.createTopic(T.etudiant);
  const p = await h.createPost(T.etudiant, t._id);
  const rs = await Promise.all([1, 2, 3].map(() => h.api(T.etudiant2, 'POST', `/posts/${p._id}/like`)));
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409, 409]);
  const list = await h.api(T.etudiant, 'GET', `/topics/${t._id}/posts`);
  assert.equal(list.body.items[0].likesCount, 1);
});

test('like sur réponse supprimée → 404', async () => {
  const t = await h.createTopic(T.etudiant);
  const p = await h.createPost(T.etudiant, t._id);
  await h.api(T.etudiant, 'DELETE', `/posts/${p._id}`);
  assert.equal((await h.api(T.etudiant, 'POST', `/posts/${p._id}/like`)).status, 404);
});

describe("validation (accept) d'une réponse", () => {
  test("seul l'auteur du sujet ou un modérateur", async () => {
    const t = await h.createTopic(T.etudiant);
    const p = await h.createPost(T.etudiant2, t._id);
    assert.equal((await h.api(T.etudiant2, 'PATCH', `/posts/${p._id}/accept`, { value: true })).status, 403); // auteur de la réponse, pas du sujet
    assert.equal((await h.api(T.etudiant, 'PATCH', `/posts/${p._id}/accept`, { value: true })).status, 200);
    const t2 = await h.createTopic(T.etudiant);
    const p2 = await h.createPost(T.etudiant2, t2._id);
    assert.equal((await h.api(T.enseignant, 'PATCH', `/posts/${p2._id}/accept`, { value: true })).status, 200);
  });

  test('le sujet passe à isResolved ; retrait → non résolu', async () => {
    const t = await h.createTopic(T.etudiant);
    const p = await h.createPost(T.etudiant2, t._id);
    const r = await h.api(T.etudiant, 'PATCH', `/posts/${p._id}/accept`, { value: true });
    assert.equal(r.body.isAcceptedAnswer, true);
    assert.equal((await h.getTopic(t._id)).isResolved, true);
    await h.api(T.etudiant, 'PATCH', `/posts/${p._id}/accept`, { value: false });
    assert.equal((await h.getTopic(t._id)).isResolved, false);
  });

  test('une seule réponse acceptée à la fois', async () => {
    const t = await h.createTopic(T.etudiant);
    const a = await h.createPost(T.etudiant2, t._id);
    const b = await h.createPost(T.etudiant2, t._id);
    await h.api(T.etudiant, 'PATCH', `/posts/${a._id}/accept`, { value: true });
    await h.api(T.etudiant, 'PATCH', `/posts/${b._id}/accept`, { value: true });
    const list = (await h.api(T.etudiant, 'GET', `/topics/${t._id}/posts`)).body.items;
    assert.equal(list.filter((p) => p.isAcceptedAnswer).length, 1);
    assert.equal(list.find((p) => p._id === b._id).isAcceptedAnswer, true);
  });

  test('supprimer la réponse acceptée remet le sujet en non résolu', async () => {
    const t = await h.createTopic(T.etudiant);
    const p = await h.createPost(T.etudiant2, t._id);
    await h.api(T.etudiant, 'PATCH', `/posts/${p._id}/accept`, { value: true });
    await h.api(T.etudiant2, 'DELETE', `/posts/${p._id}`);
    assert.equal((await h.getTopic(t._id)).isResolved, false);
  });

  test('value non booléen → 400', async () => {
    const t = await h.createTopic(T.etudiant);
    const p = await h.createPost(T.etudiant2, t._id);
    assert.equal((await h.api(T.etudiant, 'PATCH', `/posts/${p._id}/accept`, { value: 'yes' })).status, 400);
  });
});
