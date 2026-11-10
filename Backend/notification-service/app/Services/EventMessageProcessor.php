<?php

namespace App\Services;

use App\Enums\BroadcastType;
use App\Http\Requests\ForumEventRequest;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

/**
 * Transforme un message RabbitMQ en notifications.
 *
 * Enveloppe commune : {"event":"...","occurredAt":"...","actorId":"...","data":{...}}
 *   forum.events      post.created | post.liked | post.accepted | topic.locked | topic.resolved
 *                     data = { topic: {id,title,authorId,courseId?}, post?: {id,authorId,parentAuthorId?} }
 *   evaluation.events result.published    data = { studentId, quizTitle, score? }
 *   course.events     course.published    data = { courseId, title, userIds[] }
 */
class EventMessageProcessor
{
    public function __construct(
        private ForumNotifier $forum,
        private NotificationDispatcher $dispatcher,
    ) {
    }

    /**
     * @return bool true = message traité (ack) ; false = message inutilisable, écarté sans remise en file.
     *              Une exception (ex. base indisponible) est laissée remonter pour que le message soit retenté.
     */
    public function process(string $queue, string $body): bool
    {
        $message = json_decode($body, true);
        if (! is_array($message)) {
            return $this->discard($queue, 'JSON invalide', $body);
        }

        $envelope = Validator::make($message, [
            'event' => ['required', 'string', 'max:100'],
            'occurredAt' => ['nullable', 'string', 'max:40'],
            'actorId' => ['nullable', 'string', 'max:64'],
            'data' => ['required', 'array'],
        ]);
        if ($envelope->fails()) {
            return $this->discard($queue, 'enveloppe invalide : '.$envelope->errors()->first(), $body);
        }

        $handled = match ($queue) {
            'forum.events' => $this->forum($message),
            'evaluation.events' => $this->evaluation($message),
            'course.events' => $this->course($message),
            default => null,
        };

        return $handled ?? $this->discard($queue, "file inconnue ou événement « {$message['event']} » non géré", $body);
    }

    /** @param array<string,mixed> $message */
    private function forum(array $message): ?bool
    {
        $payload = [
            'event' => $message['event'],
            'actorId' => $message['actorId'] ?? null,
            'topic' => $message['data']['topic'] ?? null,
            'post' => $message['data']['post'] ?? null,
        ];

        $validator = Validator::make($payload, ForumEventRequest::rulesFor($message['event']));
        if ($validator->fails()) {
            return null;
        }

        $this->forum->handle($validator->validated());

        return true;
    }

    /** @param array<string,mixed> $message */
    private function evaluation(array $message): ?bool
    {
        if ($message['event'] !== 'result.published') {
            return null;
        }

        $data = Validator::make($message['data'], [
            'studentId' => ['required', 'string', 'max:64'],
            'quizTitle' => ['required', 'string', 'max:150'],
            'score' => ['nullable', 'numeric'],
        ]);
        if ($data->fails()) {
            return null;
        }
        $d = $data->validated();

        $score = isset($d['score']) ? " Note : {$d['score']}." : '';
        $this->dispatcher->send(
            $d['studentId'],
            BroadcastType::Grade->value,
            'Nouveau résultat',
            "Votre résultat pour « {$d['quizTitle']} » est disponible.$score",
            array_filter(['quizTitle' => $d['quizTitle'], 'score' => $d['score'] ?? null], fn ($v) => $v !== null),
        );

        return true;
    }

    /** @param array<string,mixed> $message */
    private function course(array $message): ?bool
    {
        if ($message['event'] !== 'course.published') {
            return null;
        }

        $data = Validator::make($message['data'], [
            'courseId' => ['required', 'string', 'max:64'],
            'title' => ['required', 'string', 'max:150'],
            'userIds' => ['required', 'array', 'min:1', 'max:500'],
            'userIds.*' => ['required', 'string', 'max:64'],
        ]);
        if ($data->fails()) {
            return null;
        }
        $d = $data->validated();

        foreach (array_unique($d['userIds']) as $userId) {
            $this->dispatcher->send(
                $userId,
                BroadcastType::Announcement->value,
                'Nouveau cours',
                "Le cours « {$d['title']} » est disponible.",
                ['courseId' => $d['courseId']],
            );
        }

        return true;
    }

    private function discard(string $queue, string $reason, string $body): false
    {
        Log::warning("[rabbitmq:$queue] message écarté ($reason)", ['body' => mb_substr($body, 0, 500)]);

        return false;
    }
}
