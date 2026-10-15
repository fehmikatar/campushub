const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const h = require('./helpers');

before(h.start);
after(h.stop);

test('401 sans token', async () => {
  const r = await h.api(null, 'GET', '/categories');
  assert.equal(r.status, 401);
});

test('401 avec un schéma autre que Bearer', async () => {
  assert.equal((await h.apiRaw('Basic ' + h.TOKENS.admin, '/categories')).status, 401);
});

test('401 avec token invalide / mal formé', async () => {
  assert.equal((await h.api('pas.un.jwt', 'GET', '/categories')).status, 401);
});

test('401 avec mauvaise signature', async () => {
  const bad = jwt.sign({ role: 'ADMIN' }, 'autre-secret-autre-secret-autre-secret-xx', { subject: h.IDS.admin, issuer: 'campushub-user-service' });
  assert.equal((await h.api(bad, 'GET', '/categories')).status, 401);
});

test('401 avec token expiré', async () => {
  const t = h.token('ETUDIANT', h.IDS.etudiant, { expiresIn: -10 });
  assert.equal((await h.api(t, 'GET', '/categories')).status, 401);
});

test('401 avec mauvais issuer', async () => {
  const t = h.token('ETUDIANT', h.IDS.etudiant, { issuer: 'autre' });
  assert.equal((await h.api(t, 'GET', '/categories')).status, 401);
});

test('401 avec rôle inconnu', async () => {
  const t = h.token('HACKER');
  assert.equal((await h.api(t, 'GET', '/categories')).status, 401);
});

test('401 avec algorithme HS512 (seul HS256 accepté)', async () => {
  const t = jwt.sign({ role: 'ADMIN' }, process.env.JWT_SECRET, { subject: h.IDS.admin, issuer: 'campushub-user-service', algorithm: 'HS512' });
  assert.equal((await h.api(t, 'GET', '/categories')).status, 401);
});

test('token valide accepté', async () => {
  assert.equal((await h.api(h.TOKENS.etudiant, 'GET', '/categories')).status, 200);
});
