// Envoi best-effort des événements du forum vers le notification-service.
// Mode 1 : RabbitMQ (si RABBITMQ_URL est défini) -> queue forum.events
// Mode 2 : HTTP vers le notification-service (si NOTIFICATION_SERVICE_URL est défini)
// N'échoue jamais la requête appelante.

const rabbitPublisher = require('./rabbitPublisher');

function topicPayload(topic) {
  return {
    id: String(topic._id),
    title: topic.title,
    authorId: topic.authorId,
    courseId: topic.courseId,
  };
}

function postPayload(post, parentAuthorId) {
  return {
    id: String(post._id),
    authorId: post.authorId,
    ...(parentAuthorId ? { parentAuthorId } : {}),
  };
}

function warn(event, err) {
  if (process.env.NODE_ENV !== 'test') console.warn(`[notifier] ${event} non envoyé : ${err.message}`);
}

function notify(event, actor, topic, post) {
  // --- Mode RabbitMQ ---
  if (rabbitPublisher.isEnabled()) {
    rabbitPublisher
      .publish(event, actor.id, {
        topic: topicPayload(topic),
        ...(post ? { post } : {}),
      })
      .catch((err) => warn(event, err));
    return;
  }

  // --- Mode HTTP (secours) ---
  const baseUrl = process.env.NOTIFICATION_SERVICE_URL;
  if (!baseUrl) return;

  const body = {
    event,
    actorId: actor.id,
    topic: topicPayload(topic),
    ...(post ? { post } : {}),
  };

  fetch(`${baseUrl.replace(/\/$/, '')}/api/internal/events/forum`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  }).catch((err) => warn(event, err));
}

module.exports = { notify, postPayload };