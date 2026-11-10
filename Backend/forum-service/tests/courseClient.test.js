const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.JWT_ISSUER = 'campushub-user-service';

const jwt = require('jsonwebtoken');
const courseClient = require('../src/shared/utils/courseClient');
const app = require('../src/app');

const TOKEN = jwt.sign({ role: 'ETUDIANT' }, process.env.JWT_SECRET, {
  subject: '11111111-1111-4111-8111-111111111111',
  issuer: process.env.JWT_ISSUER,
  expiresIn: '1h',
});

// Faux Course : répond avec le statut voulu et garde les requêtes reçues
function fakeCourse(handler) {
  const received = [];
  const server = http.createServer((req, res) => {
    received.push({ url: req.url, authorization: req.headers.authorization });
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ received, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })
    );
  });
}

const reply = (status) => (req, res) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end('{}');
};

async function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    await fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const rejectsWith = (promise, status) =>
  assert.rejects(promise, (err) => err.status === status);

test('désactivé (COURSE_CHECK_ENABLED absent) : aucun appel', async () => {
  const course = await fakeCourse(reply(404));
  await withEnv({ COURSE_CHECK_ENABLED: 'false', COURSE_SERVICE_URL: course.url }, async () => {
    await courseClient.assertCourseExists('1', `Bearer ${TOKEN}`);
  });
  assert.equal(course.received.length, 0);
  course.close();
});

test('200 : le traitement continue et le token est transmis', async () => {
  const course = await fakeCourse(reply(200));
  await withEnv({ COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: course.url }, async () => {
    await courseClient.assertCourseExists('12', `Bearer ${TOKEN}`);
  });
  assert.equal(course.received.length, 1);
  assert.equal(course.received[0].url, '/courses/12');
  assert.equal(course.received[0].authorization, `Bearer ${TOKEN}`);
  course.close();
});

test('404 et 400 de Course : 404 "Cours introuvable"', async () => {
  for (const status of [404, 400]) {
    const course = await fakeCourse(reply(status));
    await withEnv({ COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: course.url }, async () => {
      await rejectsWith(courseClient.assertCourseExists('999', `Bearer ${TOKEN}`), 404);
    });
    course.close();
  }
});

test('401 et 403 de Course sont renvoyés tels quels', async () => {
  for (const status of [401, 403]) {
    const course = await fakeCourse(reply(status));
    await withEnv({ COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: course.url }, async () => {
      await rejectsWith(courseClient.assertCourseExists('1', `Bearer ${TOKEN}`), status);
    });
    course.close();
  }
});

test('500 de Course : 503, jamais 500', async () => {
  const course = await fakeCourse(reply(500));
  await withEnv({ COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: course.url }, async () => {
    await rejectsWith(courseClient.assertCourseExists('1', `Bearer ${TOKEN}`), 503);
  });
  course.close();
});

test('timeout : 503', async () => {
  const course = await fakeCourse(() => {}); // ne répond jamais
  await withEnv(
    { COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: course.url, COURSE_TIMEOUT_MS: '200' },
    async () => {
      await rejectsWith(courseClient.assertCourseExists('1', `Bearer ${TOKEN}`), 503);
    }
  );
  course.close();
  // coupe la connexion restée ouverte côté faux serveur
  setTimeout(() => {}, 0);
});

test('service injoignable : 503', async () => {
  await withEnv({ COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: 'http://127.0.0.1:1' }, async () => {
    await rejectsWith(courseClient.assertCourseExists('1', `Bearer ${TOKEN}`), 503);
  });
});

test('ni Eureka ni COURSE_SERVICE_URL : 503', async () => {
  await withEnv({ COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: '' }, async () => {
    await rejectsWith(courseClient.assertCourseExists('1', `Bearer ${TOKEN}`), 503);
  });
});

test('Eureka : retrouve course-service par son nom', async () => {
  const course = await fakeCourse(reply(200));
  const port = Number(new URL(course.url).port);
  courseClient.setEurekaClient({
    getInstancesByAppId: (appId) => {
      assert.equal(appId, 'COURSE-SERVICE');
      return [{ status: 'UP', hostName: '127.0.0.1', port: { $: port } }];
    },
  });
  await withEnv({ COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: '' }, async () => {
    await courseClient.assertCourseExists('1', `Bearer ${TOKEN}`);
  });
  assert.equal(course.received.length, 1);
  courseClient.setEurekaClient(null);
  course.close();
});

// --- Dans l'application : la création d'un sujet renvoie bien 404 / 503 (avant tout accès à MongoDB)
async function postTopic() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/courses/1/topics`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Titre valide', content: 'Contenu' }),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

test('POST /courses/:id/topics : cours inconnu -> 404', async () => {
  const course = await fakeCourse(reply(404));
  await withEnv({ COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: course.url }, async () => {
    const r = await postTopic();
    assert.equal(r.status, 404);
    assert.equal(r.body.message, 'Cours introuvable');
  });
  course.close();
});

test('POST /courses/:id/topics : Course en panne -> 503 (pas 500)', async () => {
  await withEnv({ COURSE_CHECK_ENABLED: 'true', COURSE_SERVICE_URL: 'http://127.0.0.1:1' }, async () => {
    const r = await postTopic();
    assert.equal(r.status, 503);
    assert.match(r.body.message, /indisponible/);
  });
});