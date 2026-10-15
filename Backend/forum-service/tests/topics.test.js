const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers');
const { TOKENS: T, IDS } = h;

after(h.stop);

let category;
before(async () => {
  await h.start();
  category = (await h.api(T.admin, 'POST', '/categories', { name: 'Cat sujets' })).body;
});

test('création : authorId/authorRole viennent du token, pas du body', async () => {
  const r = await h.api(T.etudiant, 'POST', `/courses/${h.COURSE}/topics`, {
    title: 'Titre valide', content: 'Contenu', tags: ['Java', 'SPRING'], categoryId: category._id,
    authorId: 'pirate', authorRole: 'ADMIN',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.authorId, IDS.etudiant);
  assert.equal(r.body.authorRole, 'ETUDIANT');
  assert.equal(r.body.courseId, h.COURSE);
  assert.deepEqual(r.body.tags, ['java', 'spring']);
  assert.equal(r.body.repliesCount, 0);
  assert.equal(r.body.viewsCount, 0);
});

test('validation 400 : titre court, contenu vide, trop de tags, categoryId invalide', async () => {
  const url = `/courses/${h.COURSE}/topics`;
  assert.equal((await h.api(T.etudiant, 'POST', url, { title: 'abc', content: 'x' })).status, 400);
  assert.equal((await h.api(T.etudiant, 'POST', url, { title: 'Titre valide', content: '  ' })).status, 400);
  assert.equal((await h.api(T.etudiant, 'POST', url, { title: 'Titre valide', content: 'x', tags: ['a', 'b', 'c', 'd', 'e', 'f'] })).status, 400);
  assert.equal((await h.api(T.etudiant, 'POST', url, { title: 'Titre valide', content: 'x', categoryId: 'pas-un-id' })).status, 400);
});

test('catégorie inexistante → 400', async () => {
  const r = await h.api(T.etudiant, 'POST', `/courses/${h.COURSE}/topics`, {
    title: 'Titre valide', content: 'x', categoryId: new mongoose.Types.ObjectId().toString(),
  });
  assert.equal(r.status, 400);
});

test('liste paginée', async () => {
  const course = 'course-pagination';
  for (let i = 0; i < 5; i++) {
    await h.api(T.etudiant, 'POST', `/courses/${course}/topics`, { title: `Sujet paginé ${i}`, content: 'x' });
  }
  const p1 = await h.api(T.etudiant, 'GET', `/courses/${course}/topics?page=1&limit=2`);
  const p2 = await h.api(T.etudiant, 'GET', `/courses/${course}/topics?page=2&limit=2`);
  const p3 = await h.api(T.etudiant, 'GET', `/courses/${course}/topics?page=3&limit=2`);
  assert.equal(p1.status, 200);
  assert.equal(p1.body.items.length, 2);
  assert.equal(p1.body.total, 5);
  assert.equal(p1.body.totalPages, 3);
  assert.equal(p3.body.items.length, 1);
  const ids = new Set([...p1.body.items, ...p2.body.items, ...p3.body.items].map((t) => t._id));
  assert.equal(ids.size, 5);
});

test('limit est plafonné à 50', async () => {
  const r = await h.api(T.etudiant, 'GET', `/courses/${h.COURSE}/topics?limit=1000`);
  assert.equal(r.body.limit, 50);
});

test('consultation : viewsCount +1 à chaque lecture', async () => {
  const t = await h.createTopic(T.etudiant);
  const a = await h.api(T.etudiant2, 'GET', `/topics/${t._id}`);
  const b = await h.api(T.etudiant2, 'GET', `/topics/${t._id}`);
  assert.equal(a.status, 200);
  assert.equal(a.body.viewsCount, 1);
  assert.equal(b.body.viewsCount, 2);
});

test('sujet inexistant → 404, id invalide → 400', async () => {
  assert.equal((await h.api(T.etudiant, 'GET', `/topics/${new mongoose.Types.ObjectId()}`)).status, 404);
  assert.equal((await h.api(T.etudiant, 'GET', '/topics/xyz')).status, 400);
});

test('modification : auteur OK, autre étudiant 403, enseignant/admin OK', async () => {
  const t = await h.createTopic(T.etudiant);
  assert.equal((await h.api(T.etudiant2, 'PUT', `/topics/${t._id}`, { title: 'Nouveau titre' })).status, 403);
  const own = await h.api(T.etudiant, 'PUT', `/topics/${t._id}`, { title: 'Titre par auteur' });
  assert.equal(own.status, 200);
  assert.equal(own.body.title, 'Titre par auteur');
  assert.equal((await h.api(T.enseignant, 'PUT', `/topics/${t._id}`, { title: 'Titre par prof' })).status, 200);
  assert.equal((await h.api(T.admin, 'PUT', `/topics/${t._id}`, { title: 'Titre par admin' })).status, 200);
});

test('suppression : autre étudiant 403, auteur 204 puis 404, modérateur 204', async () => {
  const t = await h.createTopic(T.etudiant);
  assert.equal((await h.api(T.etudiant2, 'DELETE', `/topics/${t._id}`)).status, 403);
  assert.equal((await h.api(T.etudiant, 'DELETE', `/topics/${t._id}`)).status, 204);
  assert.equal((await h.api(T.etudiant, 'GET', `/topics/${t._id}`)).status, 404);
  const t2 = await h.createTopic(T.etudiant);
  assert.equal((await h.api(T.enseignant, 'DELETE', `/topics/${t2._id}`)).status, 204);
});

test('un sujet supprimé disparaît de la liste', async () => {
  const course = 'course-suppr';
  const t = (await h.api(T.etudiant, 'POST', `/courses/${course}/topics`, { title: 'À supprimer', content: 'x' })).body;
  await h.api(T.etudiant, 'DELETE', `/topics/${t._id}`);
  assert.equal((await h.api(T.etudiant, 'GET', `/courses/${course}/topics`)).body.total, 0);
});

for (const [name, flag] of [['pin', 'isPinned'], ['lock', 'isLocked']]) {
  test(`${name} : réservé à ENSEIGNANT/ADMIN (même pour l'auteur étudiant)`, async () => {
    const t = await h.createTopic(T.etudiant);
    assert.equal((await h.api(T.etudiant, 'PATCH', `/topics/${t._id}/${name}`, { value: true })).status, 403);
    const r = await h.api(T.enseignant, 'PATCH', `/topics/${t._id}/${name}`, { value: true });
    assert.equal(r.status, 200);
    assert.equal(r.body[flag], true);
    assert.equal((await h.api(T.admin, 'PATCH', `/topics/${t._id}/${name}`, { value: false })).body[flag], false);
  });

  test(`${name} : value doit être un booléen strict → 400`, async () => {
    const t = await h.createTopic(T.etudiant);
    assert.equal((await h.api(T.enseignant, 'PATCH', `/topics/${t._id}/${name}`, { value: 'true' })).status, 400);
  });
}

test('resolve : auteur OK, autre étudiant 403, modérateur OK', async () => {
  const t = await h.createTopic(T.etudiant);
  assert.equal((await h.api(T.etudiant2, 'PATCH', `/topics/${t._id}/resolve`, { value: true })).status, 403);
  const r = await h.api(T.etudiant, 'PATCH', `/topics/${t._id}/resolve`, { value: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.isResolved, true);
  assert.equal((await h.api(T.enseignant, 'PATCH', `/topics/${t._id}/resolve`, { value: false })).body.isResolved, false);
});

test('les sujets épinglés remontent en tête de liste', async () => {
  const course = 'course-pin';
  const a = (await h.api(T.etudiant, 'POST', `/courses/${course}/topics`, { title: 'Premier sujet', content: 'x' })).body;
  await h.api(T.etudiant, 'POST', `/courses/${course}/topics`, { title: 'Second sujet', content: 'x' });
  await h.api(T.enseignant, 'PATCH', `/topics/${a._id}/pin`, { value: true });
  const r = await h.api(T.etudiant, 'GET', `/courses/${course}/topics`);
  assert.equal(r.body.items[0]._id, a._id);
});

test('sujet verrouillé : auteur étudiant 403 en modification, ENSEIGNANT et ADMIN OK', async () => {
  const t = await h.createTopic(T.etudiant);
  await h.api(T.enseignant, 'PATCH', `/topics/${t._id}/lock`, { value: true });
  assert.equal((await h.api(T.etudiant, 'PUT', `/topics/${t._id}`, { title: 'Titre modifié' })).status, 403);
  const prof = await h.api(T.enseignant, 'PUT', `/topics/${t._id}`, { title: 'Modifié par prof' });
  assert.equal(prof.status, 200);
  assert.equal(prof.body.title, 'Modifié par prof');
  assert.equal((await h.api(T.admin, 'PUT', `/topics/${t._id}`, { title: 'Modifié par admin' })).status, 200);
  // déverrouillé : l'auteur peut de nouveau modifier
  await h.api(T.admin, 'PATCH', `/topics/${t._id}/lock`, { value: false });
  assert.equal((await h.api(T.etudiant, 'PUT', `/topics/${t._id}`, { title: 'Auteur à nouveau' })).status, 200);
});
