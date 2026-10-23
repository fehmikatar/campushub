<?php

namespace App\Services;

/**
 * Transforme un événement du forum-service en notifications destinées aux bonnes personnes.
 */
class ForumNotifier
{
    public function __construct(private NotificationDispatcher $dispatcher)
    {
    }

    public const EVENTS = ['post.created', 'post.liked', 'post.accepted', 'topic.locked', 'topic.resolved'];

    /**
     * @param  array<string,mixed>  $payload  événement validé
     * @return int nombre de notifications créées
     */
    public function handle(array $payload): int
    {
        $actor = (string) $payload['actorId'];
        $topic = $payload['topic'];
        $post = $payload['post'] ?? null;
        $title = $topic['title'];

        $recipients = match ($payload['event']) {
            'post.created' => [
                [$topic['authorId'], 'forum.reply', 'Nouvelle réponse', "Nouvelle réponse à votre sujet « $title »."],
                [$post['parentAuthorId'] ?? null, 'forum.reply', 'Réponse à votre message', "Quelqu'un a répondu à votre message dans « $title »."],
            ],
            'post.liked' => [
                [$post['authorId'] ?? null, 'forum.like', 'Votre réponse a été aimée', "Votre réponse dans « $title » a reçu un j'aime."],
            ],
            'post.accepted' => [
                [$post['authorId'] ?? null, 'forum.accepted', 'Réponse validée', "Votre réponse dans « $title » a été marquée comme solution."],
            ],
            'topic.locked' => [
                [$topic['authorId'], 'forum.locked', 'Sujet verrouillé', "Votre sujet « $title » a été verrouillé."],
            ],
            'topic.resolved' => [
                [$topic['authorId'], 'forum.resolved', 'Sujet résolu', "Votre sujet « $title » a été marqué comme résolu."],
            ],
        };

        $data = array_filter([
            'courseId' => $topic['courseId'] ?? null,
            'topicId' => $topic['id'],
            'postId' => $post['id'] ?? null,
            'actorId' => $actor,
        ], fn ($v) => $v !== null);

        $created = 0;
        $seen = [];
        foreach ($recipients as [$userId, $type, $heading, $message]) {
            // Jamais d'auto-notification, ni de doublon pour un même événement.
            if ($userId === null || (string) $userId === $actor || isset($seen[$userId])) {
                continue;
            }
            $seen[$userId] = true;

            if ($this->dispatcher->send((string) $userId, $type, $heading, $message, $data)) {
                $created++;
            }
        }

        return $created;
    }
}
