const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

before(h.start);
after(h.stop);

test('création de catégorie refusée (403) pour ETUDIANT et ENSEIGNANT', async () => {
  for (const t of [h.TOKENS.etudiant, h.TOKENS.enseignant]) {
    const r = await h.api(t, 'POST', '/categories', { name: 'Général' });
    assert.equal(r.status, 403);
  }
});

test('ADMIN crée une catégorie, le slug est généré', async () => {
  const r = await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'Éléments Généraux & Co', description: 'desc', order: 2 });
  assert.equal(r.status, 201);
  assert.equal(r.body.slug, 'elements-generaux-co');
  assert.equal(r.body.order, 2);
});

test('nom trop court → 400', async () => {
  assert.equal((await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'a' })).status, 400);
});

test('slug dupliqué → 409', async () => {
  await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'Doublon' });
  assert.equal((await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'doublon' })).status, 409);
});

test('liste des catégories triée par order puis name', async () => {
  await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'Zeta', order: 0 });
  await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'Alpha', order: 0 });
  const r = await h.api(h.TOKENS.etudiant, 'GET', '/categories');
  assert.equal(r.status, 200);
  const names = r.body.map((c) => c.name);
  assert.ok(names.indexOf('Alpha') < names.indexOf('Zeta'));
  assert.equal(names[names.length - 1], 'Éléments Généraux & Co'); // order 2 en dernier
});

const mongoose = require('mongoose');

test('PUT : 403 pour ETUDIANT et ENSEIGNANT', async () => {
  const c = (await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'Put droits' })).body;
  for (const t of [h.TOKENS.etudiant, h.TOKENS.enseignant]) {
    assert.equal((await h.api(t, 'PUT', `/categories/${c._id}`, { name: 'Nouveau nom' })).status, 403);
  }
});

test('PUT : le nom change et le slug est régénéré', async () => {
  const c = (await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'Ancien nom' })).body;
  assert.equal(c.slug, 'ancien-nom');
  const r = await h.api(h.TOKENS.admin, 'PUT', `/categories/${c._id}`, { name: 'Nouveau Nom Été', description: 'maj', order: 5 });
  assert.equal(r.status, 200);
  assert.equal(r.body.name, 'Nouveau Nom Été');
  assert.equal(r.body.slug, 'nouveau-nom-ete');
  assert.equal(r.body.description, 'maj');
  assert.equal(r.body.order, 5);
});

test('PUT : id inexistant → 404, id invalide → 400, nom invalide → 400', async () => {
  const c = (await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'Put erreurs' })).body;
  assert.equal((await h.api(h.TOKENS.admin, 'PUT', `/categories/${new mongoose.Types.ObjectId()}`, { name: 'Valide' })).status, 404);
  assert.equal((await h.api(h.TOKENS.admin, 'PUT', '/categories/xyz', { name: 'Valide' })).status, 400);
  assert.equal((await h.api(h.TOKENS.admin, 'PUT', `/categories/${c._id}`, { name: 'a' })).status, 400);
});

test('DELETE : 403 pour ETUDIANT et ENSEIGNANT', async () => {
  const c = (await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'Delete droits' })).body;
  for (const t of [h.TOKENS.etudiant, h.TOKENS.enseignant]) {
    assert.equal((await h.api(t, 'DELETE', `/categories/${c._id}`)).status, 403);
  }
});

test('DELETE : 204, la catégorie disparaît et les sujets rattachés passent à categoryId null', async () => {
  const c = (await h.api(h.TOKENS.admin, 'POST', '/categories', { name: 'À supprimer' })).body;
  const t = await h.createTopic(h.TOKENS.etudiant, { categoryId: c._id });
  assert.equal(t.categoryId, c._id);
  assert.equal((await h.api(h.TOKENS.admin, 'DELETE', `/categories/${c._id}`)).status, 204);
  const list = (await h.api(h.TOKENS.etudiant, 'GET', '/categories')).body;
  assert.ok(!list.some((x) => x._id === c._id));
  assert.equal((await h.getTopic(t._id)).categoryId, null);
});

test('DELETE : id inexistant → 404, id invalide → 400', async () => {
  assert.equal((await h.api(h.TOKENS.admin, 'DELETE', `/categories/${new mongoose.Types.ObjectId()}`)).status, 404);
  assert.equal((await h.api(h.TOKENS.admin, 'DELETE', '/categories/xyz')).status, 400);
});
