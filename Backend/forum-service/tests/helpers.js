// Utilitaires partagés : démarre l'app en mémoire sur un port libre, base de test dédiée.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.TEST_JWT_SECRET || 'test-secret-test-secret-test-secret-0123456789';
process.env.JWT_ISSUER = 'campushub-user-service';

const TEST_URI = process.env.TEST_MONGO_URI || 'mongodb://localhost:27017/campushub_forum_test';
if (!/_test(\?|$)/.test(TEST_URI)) throw new Error('TEST_MONGO_URI doit pointer vers une base *_test');

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../src/app');

const IDS = {
  etudiant: '11111111-1111-4111-8111-111111111111',
  etudiant2: '22222222-2222-4222-8222-222222222222',
  enseignant: '3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90',
  admin: '99999999-9999-4999-8999-999999999999',
};

const token = (role, sub = IDS.etudiant, opts = {}) =>
  jwt.sign({ role }, process.env.JWT_SECRET, { subject: sub, issuer: process.env.JWT_ISSUER, expiresIn: '1h', ...opts });

const TOKENS = {
  etudiant: token('ETUDIANT', IDS.etudiant),
  etudiant2: token('ETUDIANT', IDS.etudiant2),
  enseignant: token('ENSEIGNANT', IDS.enseignant),
  admin: token('ADMIN', IDS.admin),
};

let server;
let baseUrl;

async function start() {
  await mongoose.connect(TEST_URI);
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
}

async function stop() {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
}

// api(token, method, path, body?) -> { status, body }
async function api(tok, method, path, body) {
  const headers = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

// Requête avec un en-tête Authorization arbitraire
async function apiRaw(authorization, path) {
  const res = await fetch(baseUrl + path, { headers: authorization ? { Authorization: authorization } : {} });
  return { status: res.status };
}

const COURSE = 'course-101';
const uniq = (() => { let n = 0; return (p) => `${p} ${++n}`; })();

async function createTopic(tok, extra = {}) {
  const r = await api(tok, 'POST', `/courses/${COURSE}/topics`, { title: uniq('Sujet de test'), content: 'Contenu du sujet', ...extra });
  if (r.status !== 201) throw new Error(`createTopic a échoué: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

async function createPost(tok, topicId, extra = {}) {
  const r = await api(tok, 'POST', `/topics/${topicId}/posts`, { content: 'Une réponse', ...extra });
  if (r.status !== 201) throw new Error(`createPost a échoué: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

const getTopic = async (id) => (await api(TOKENS.admin, 'GET', `/topics/${id}`)).body;

module.exports = { apiRaw, IDS, TOKENS, token, start, stop, api, COURSE, createTopic, createPost, getTopic };
