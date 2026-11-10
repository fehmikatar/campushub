// Envoi best-effort des événements du forum vers le notification-service (Laravel).
// Désactivé tant que NOTIFICATION_SERVICE_URL n'est pas défini ; n'échoue jamais la requête appelante.

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

function notify(event, actor, topic, post) {
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
  }).catch((err) => {
    if (process.env.NODE_ENV !== 'test') console.warn(`[notifier] ${event} non envoyé : ${err.message}`);
  });
}

module.exports = { notify, postPayload };
