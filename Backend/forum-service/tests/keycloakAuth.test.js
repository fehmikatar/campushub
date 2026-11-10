const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');

process.env.NODE_ENV = 'test';

const jwt = require('jsonwebtoken');
const { authenticate, requireRole } = require('../src/shared/middlewares/auth');

const ISSUER = 'http://localhost:8180/realms/campushub';
const SUB = '3739afd8-a708-4112-9920-915970173346';

function newKey(kid) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}

const KEY = newKey('kid-1');
const OTHER = newKey('kid-1'); // même kid, autre clé : signature fausse

function sign(key, roles, opts = {}) {
  return jwt.sign(
    { realm_access: { roles }, ...(opts.payload || {}) },
    key.privateKey,
    { algorithm: 'RS256', keyid: key.kid, subject: SUB, issuer: ISSUER, expiresIn: '5m', ...(opts.options || {}) }
  );
}

// Faux Keycloak : sert les clés publiques (JWKS)
function fakeKeycloak(keys) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: keys.map((k) => k.jwk) }));
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${server.address().port}/certs`, close: () => server.close() })
    )
  );
}

// Mini application : une route protégée, une route réservée aux enseignants
async function withApp(jwksUri, fn) {
  const app = express();
  app.use(authenticate);
  app.get('/me', (req, res) => res.json(req.user));
  app.get('/prof', requireRole('ENSEIGNANT', 'ADMIN'), (req, res) => res.json({ ok: true }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const prev = { i: process.env.KEYCLOAK_ISSUER_URI, j: process.env.KEYCLOAK_JWKS_URI };
  process.env.KEYCLOAK_ISSUER_URI = ISSUER;
  process.env.KEYCLOAK_JWKS_URI = jwksUri;
  const call = async (path, token) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await fn(call);
  } finally {
    server.close();
    for (const [k, v] of [['KEYCLOAK_ISSUER_URI', prev.i], ['KEYCLOAK_JWKS_URI', prev.j]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('token Keycloak valide : id = sub, rôle lu dans realm_access.roles', async () => {
  const kc = await fakeKeycloak([KEY]);
  await withApp(kc.url, async (call) => {
    const r = await call('/me', sign(KEY, ['ETUDIANT', 'offline_access', 'uma_authorization', 'default-roles-campushub']));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { id: SUB, role: 'ETUDIANT' });
  });
  kc.close();
});

test('plusieurs rôles : le plus élevé est retenu', async () => {
  const kc = await fakeKeycloak([KEY]);
  await withApp(kc.url, async (call) => {
    const r = await call('/me', sign(KEY, ['ETUDIANT', 'ENSEIGNANT']));
    assert.equal(r.body.role, 'ENSEIGNANT');
  });
  kc.close();
});

test('requireRole fonctionne avec le rôle Keycloak', async () => {
  const kc = await fakeKeycloak([KEY]);
  await withApp(kc.url, async (call) => {
    assert.equal((await call('/prof', sign(KEY, ['ETUDIANT']))).status, 403);
    assert.equal((await call('/prof', sign(KEY, ['ENSEIGNANT']))).status, 200);
  });
  kc.close();
});

test('aucun rôle CampusHub (seulement les rôles par défaut) : 403', async () => {
  const kc = await fakeKeycloak([KEY]);
  await withApp(kc.url, async (call) => {
    const r = await call('/me', sign(KEY, ['offline_access', 'uma_authorization']));
    assert.equal(r.status, 403);
  });
  kc.close();
});

test('401 : sans token, token mal formé, mauvaise signature, expiré, mauvais issuer', async () => {
  const kc = await fakeKeycloak([KEY]);
  await withApp(kc.url, async (call) => {
    assert.equal((await call('/me')).status, 401);
    assert.equal((await call('/me', 'pas.un.jwt')).status, 401);
    assert.equal((await call('/me', sign(OTHER, ['ADMIN']))).status, 401);
    assert.equal((await call('/me', sign(KEY, ['ADMIN'], { options: { expiresIn: -10 } }))).status, 401);
    assert.equal((await call('/me', sign(KEY, ['ADMIN'], { options: { issuer: 'http://autre/realms/x' } }))).status, 401);
  });
  kc.close();
});

test('401 : algorithme HS256 refusé en mode Keycloak', async () => {
  const kc = await fakeKeycloak([KEY]);
  await withApp(kc.url, async (call) => {
    const hs = jwt.sign({ realm_access: { roles: ['ADMIN'] } }, 'secret-secret-secret-secret-secret-12', {
      subject: SUB, issuer: ISSUER, header: { kid: 'kid-1', alg: 'HS256' },
    });
    assert.equal((await call('/me', hs)).status, 401);
  });
  kc.close();
});

test('kid inconnu : 401', async () => {
  const kc = await fakeKeycloak([KEY]);
  await withApp(kc.url, async (call) => {
    assert.equal((await call('/me', sign(newKey('kid-inconnu'), ['ADMIN']))).status, 401);
  });
  kc.close();
});

test('Keycloak injoignable : 503, jamais 500', async () => {
  await withApp('http://127.0.0.1:1/certs', async (call) => {
    const r = await call('/me', sign(newKey('kid-jamais-vu'), ['ETUDIANT']));
    assert.equal(r.status, 503);
  });
});