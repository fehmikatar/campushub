const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const amqplibPath = require.resolve('amqplib');
const publisherPath = require.resolve('../src/shared/utils/rabbitPublisher');
const notifierPath = require.resolve('../src/shared/utils/notifier');

// Faux broker : enregistre ce qui est envoyé et compte les déclarations de queue
function fakeBroker() {
  const state = { sent: [], asserted: 0 };
  const channel = {
    on() {},
    assertQueue() { state.asserted += 1; },
    sendToQueue(queue, buffer, options) {
      state.sent.push({ queue, message: JSON.parse(buffer.toString()), options });
      return true;
    },
  };
  const connection = {
    on() {},
    createConfirmChannel: async () => channel,
    close: async () => {},
  };
  return { state, connection };
}

// Remplace amqplib par un faux, puis recharge le producteur et le notifier
function load(connect) {
  require.cache[amqplibPath] = {
    id: amqplibPath, filename: amqplibPath, loaded: true, exports: { connect },
  };
  delete require.cache[publisherPath];
  delete require.cache[notifierPath];
  return { publisher: require(publisherPath), notifier: require(notifierPath) };
}

// Exécute fn avec des variables d'environnement données, puis les restaure
async function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) {
    old[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    await fn();
  } finally {
    for (const k of Object.keys(old)) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
}

const topic = { _id: 't1', title: 'Sujet', authorId: 'author-1', courseId: 'course-1' };
const actor = { id: 'actor-1' };
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('publish : message envoyé sur forum.events, persistant, avec enveloppe, sans déclarer la queue', async () => {
  await withEnv({ RABBITMQ_URL: 'amqp://fake', RABBITMQ_QUEUE: undefined }, async () => {
    const broker = fakeBroker();
    const { publisher } = load(async () => broker.connection);

    await publisher.publish('post.created', 'actor-1', { topic: { id: 't1' } });

    assert.equal(broker.state.sent.length, 1);
    const { queue, message, options } = broker.state.sent[0];
    assert.equal(queue, 'forum.events');
    assert.equal(message.event, 'post.created');
    assert.equal(message.actorId, 'actor-1');
    assert.deepEqual(message.data, { topic: { id: 't1' } });
    assert.ok(!Number.isNaN(Date.parse(message.occurredAt)));
    assert.equal(options.persistent, true);
    assert.equal(options.contentType, 'application/json');
    assert.equal(broker.state.asserted, 0, 'la queue ne doit pas être déclarée par le producteur');
    await publisher.close();
  });
});

test('isEnabled : faux quand RABBITMQ_URL est vide', async () => {
  await withEnv({ RABBITMQ_URL: '' }, async () => {
    const { publisher } = load(async () => fakeBroker().connection);
    assert.equal(publisher.isEnabled(), false);
  });
});

test('notify avec RabbitMQ : publie topic et post dans data, sans appel HTTP', async () => {
  await withEnv(
    { RABBITMQ_URL: 'amqp://fake', RABBITMQ_QUEUE: undefined, NOTIFICATION_SERVICE_URL: 'http://notif' },
    async () => {
      const broker = fakeBroker();
      const { publisher, notifier } = load(async () => broker.connection);
      const realFetch = global.fetch;
      let fetchCalls = 0;
      global.fetch = () => { fetchCalls += 1; return Promise.resolve(); };
      try {
        notifier.notify('post.liked', actor, topic, notifier.postPayload({ _id: 'p1', authorId: 'author-2' }));
        await tick(); await tick();
        assert.equal(broker.state.sent.length, 1);
        const { message } = broker.state.sent[0];
        assert.equal(message.event, 'post.liked');
        assert.equal(message.actorId, 'actor-1');
        assert.equal(message.data.topic.id, 't1');
        assert.equal(message.data.topic.courseId, 'course-1');
        assert.equal(message.data.post.id, 'p1');
        assert.equal(fetchCalls, 0, 'pas de HTTP quand RabbitMQ est actif');
      } finally {
        global.fetch = realFetch;
        await publisher.close();
      }
    }
  );
});

test('notify sans RabbitMQ : repli sur le HTTP existant', async () => {
  await withEnv(
    { RABBITMQ_URL: '', NOTIFICATION_SERVICE_URL: 'http://notif/', INTERNAL_API_KEY: 'k' },
    async () => {
      const { notifier } = load(async () => fakeBroker().connection);
      const realFetch = global.fetch;
      const calls = [];
      global.fetch = (url, options) => { calls.push({ url, options }); return Promise.resolve(); };
      try {
        notifier.notify('topic.locked', actor, topic);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'http://notif/api/internal/events/forum');
        assert.equal(calls[0].options.headers['X-Internal-Key'], 'k');
        const body = JSON.parse(calls[0].options.body);
        assert.equal(body.event, 'topic.locked');
        assert.equal(body.topic.id, 't1');
      } finally {
        global.fetch = realFetch;
      }
    }
  );
});

test('notify : aucune exception ni rejet non géré si RabbitMQ est injoignable', async () => {
  await withEnv({ RABBITMQ_URL: 'amqp://fake' }, async () => {
    const { notifier } = load(async () => { throw new Error('broker injoignable'); });
    let unhandled = null;
    const onUnhandled = (err) => { unhandled = err; };
    process.once('unhandledRejection', onUnhandled);
    try {
      assert.doesNotThrow(() => notifier.notify('post.created', actor, topic));
      await tick(); await tick();
      assert.equal(unhandled, null);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });
});