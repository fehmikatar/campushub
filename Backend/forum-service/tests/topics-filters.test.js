const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { TOKENS: T } = h;

after(h.stop);

const course = 'course-filtres';
const url = (qs = '') => `/courses/${course}/topics${qs}`;
const create = async (extra) =>
  (await h.api(T.etudiant, 'POST', url(), { title: 'Sujet filtre', content: 'contenu neutre', ...extra })).body;
const list = async (qs) => (await h.api(T.etudiant, 'GET', url(qs))).body;
const ids = (body) => body.items.map((t) => t._id).sort();

let catA, catB, tA, tB, tTag, tResolved, tText, tDeleted;

before(async () => {
  await h.start();
  catA = (await h.api(T.admin, 'POST', '/categories', { name: 'Filtre A' })).body;
  catB = (await h.api(T.admin, 'POST', '/categories', { name: 'Filtre B' })).body;
  tA = await create({ title: 'Sujet en catégorie A', categoryId: catA._id });
  tB = await create({ title: 'Sujet en catégorie B', categoryId: catB._id });
  tTag = await create({ title: 'Sujet avec tags', tags: ['Docker', 'java'] });
  tResolved = await create({ title: 'Sujet résolu' });
  await h.api(T.etudiant, 'PATCH', `/topics/${tResolved._id}/resolve`, { value: true });
  tText = await create({ title: 'Introduction à Kubernetes', content: 'orchestration de conteneurs' });
  // sujet supprimé qui correspondrait à tous les filtres
  tDeleted = await create({ title: 'Kubernetes supprimé', content: 'orchestration', categoryId: catA._id, tags: ['docker'] });
  await h.api(T.etudiant, 'PATCH', `/topics/${tDeleted._id}/resolve`, { value: true });
  assert.equal((await h.api(T.etudiant, 'DELETE', `/topics/${tDeleted._id}`)).status, 204);
});

test('sans filtre : le sujet supprimé est absent', async () => {
  const r = await list();
  assert.equal(r.total, 5);
  assert.ok(!ids(r).includes(tDeleted._id));
});

test('?categoryId=', async () => {
  assert.deepEqual(ids(await list(`?categoryId=${catA._id}`)), [tA._id]);
  assert.deepEqual(ids(await list(`?categoryId=${catB._id}`)), [tB._id]);
});

test('?tag= (insensible à la casse)', async () => {
  assert.deepEqual(ids(await list('?tag=docker')), [tTag._id]);
  assert.deepEqual(ids(await list('?tag=Docker')), [tTag._id]);
  assert.deepEqual(ids(await list('?tag=java')), [tTag._id]);
  assert.equal((await list('?tag=inconnu')).total, 0);
});

test('?resolved=true / false', async () => {
  assert.deepEqual(ids(await list('?resolved=true')), [tResolved._id]);
  const unresolved = await list('?resolved=false');
  assert.equal(unresolved.total, 4);
  assert.ok(!ids(unresolved).includes(tResolved._id));
  assert.ok(!ids(unresolved).includes(tDeleted._id));
});

test('?q= recherche texte sur titre et contenu', async () => {
  assert.deepEqual(ids(await list('?q=Kubernetes')), [tText._id]); // titre
  assert.deepEqual(ids(await list('?q=orchestration')), [tText._id]); // contenu
  assert.equal((await list('?q=introuvablemotclef')).total, 0);
});

test('filtres combinés', async () => {
  assert.deepEqual(ids(await list(`?categoryId=${catA._id}&resolved=false`)), [tA._id]);
  assert.equal((await list(`?categoryId=${catA._id}&resolved=true`)).total, 0); // seul le supprimé était résolu
  assert.equal((await list('?tag=docker&resolved=true')).total, 0);
});

test('valeurs invalides : resolved ignoré, categoryId invalide sans 500', async () => {
  const r = await h.api(T.etudiant, 'GET', url('?resolved=peutetre'));
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 5);
  const bad = await h.api(T.etudiant, 'GET', url('?categoryId=pas-un-id'));
  assert.equal(bad.status, 400);
});
