const amqp = require('amqplib');

const QUEUE = process.env.RABBITMQ_QUEUE || 'forum.events';

let channel = null;
let connection = null;
let connecting = null;

function isEnabled() {
  return Boolean(process.env.RABBITMQ_URL);
}

// Connexion paresseuse : créée au premier envoi, puis réutilisée
async function getChannel() {
  if (channel) return channel;
  if (!connecting) {
    connecting = (async () => {
      const conn = await amqp.connect(process.env.RABBITMQ_URL);
      const ch = await conn.createConfirmChannel();
      const reset = () => { connection = null; channel = null; };
      conn.on('error', (err) => console.error('[rabbit] connexion:', err.message));
      conn.on('close', reset); // la prochaine publication se reconnectera
      ch.on('error', (err) => console.error('[rabbit] channel:', err.message));
      connection = conn;
      channel = ch;
      return ch;
    })().finally(() => { connecting = null; });
  }
  return connecting;
}

// Publie sur la queue (on ne la déclare PAS : c'est Notification qui le fait)
async function publish(event, actorId, data) {
  const ch = await getChannel();
  const message = {
    event,
    occurredAt: new Date().toISOString(),
    actorId,
    data,
  };
  ch.sendToQueue(QUEUE, Buffer.from(JSON.stringify(message)), {
    persistent: true,
    contentType: 'application/json',
  });
}

async function close() {
  try {
    if (connection) await connection.close();
  } catch (_) { /* déjà fermée */ }
  connection = null;
  channel = null;
}

module.exports = { isEnabled, publish, close };