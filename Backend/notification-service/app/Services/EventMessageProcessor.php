<?php

namespace App\Services;

use App\Enums\BroadcastType;
use App\Http\Requests\ForumEventRequest;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Transforme un message RabbitMQ en notifications.
 *
 * Enveloppe commune : {"event":"...","occurredAt":"...","actorId":"...","data":{...}}
 *   forum.events      post.created | post.liked | post.accepted | topic.locked | topic.resolved
 *                     data = { topic: {id,title,authorId,courseId?}, post?: {id,authorId,parentAuthorId?} }
 *   evaluation.events result.published    data = { studentId, quizTitle, score? }
 *   course.events     course.published    data = { courseId, title, userIds[] }
 *   reclamation.events reclamation.created        data = { reclamationId, reference, studentSub, category }
 *                      reclamation.status_changed data = { reclamationId, reference, studentSub, oldStatus, newStatus }
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
            'reclamation.events' => $this->reclamation($message),
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
            greet: true,
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

    private const RECLAMATION_STATUS = [
        'in_progress' => 'en cours de traitement',
        'resolved' => 'résolue',
        'rejected' => 'rejetée',
    ];

    private const RECLAMATION_CATEGORY = [
        'grade' => 'note', 'exam' => 'examen', 'absence' => 'absence', 'registration' => 'inscription',
        'internship' => 'stage', 'administrative' => 'administratif', 'other' => 'autre',
    ];

    /**
     * Destinataires de reclamation.created : les sub Keycloak (UUID) de RECLAMATION_ADMIN_IDS, en minuscules,
     * sans doublon. Une entrée qui n'est pas un UUID (nom, email...) est ignorée : jamais un destinataire au hasard.
     *
     * @return string[]
     */
    public function reclamationAdminIds(): array
    {
        $configured = (array) config('services.reclamation.admin_ids', []);
        $valid = [];
        $ignored = 0;
        foreach ($configured as $id) {
            $id = strtolower(trim((string) $id));
            if (Str::isUuid($id)) {
                $valid[$id] = true;
            } else {
                $ignored++;
            }
        }
        if ($ignored > 0) {
            Log::warning("RECLAMATION_ADMIN_IDS : $ignored entrée(s) ignorée(s), un sub Keycloak (UUID) est attendu.");
        }

        return array_keys($valid);
    }

    /** @param array<string,mixed> $message */
    private function reclamation(array $message): ?bool
    {
        // studentSub = l'auteur enregistré par Reclamation (sub Keycloak), le même identifiant que user_id ici.
        $rules = [
            'reclamationId' => ['required', 'string', 'max:64'],
            'reference' => ['required', 'string', 'max:30'],
            'studentSub' => ['required', 'string', 'uuid'],
        ];
        if ($message['event'] === 'reclamation.status_changed') {
            $data = Validator::make($message['data'], $rules + [
                'oldStatus' => ['required', 'string', 'in:new,in_progress'],
                'newStatus' => ['required', 'string', 'in:'.implode(',', array_keys(self::RECLAMATION_STATUS)), 'different:oldStatus'],
            ]);
            if ($data->fails()) {
                return null;
            }
            $d = $data->validated();
            // Le destinataire est l'auteur enregistré de la réclamation (jamais un champ du client).
            $this->dispatcher->send(
                $d['studentSub'],
                BroadcastType::System->value,
                'Réclamation mise à jour',
                "Votre réclamation {$d['reference']} est maintenant ".self::RECLAMATION_STATUS[$d['newStatus']].'.',
                ['reclamationId' => $d['reclamationId'], 'reference' => $d['reference'], 'status' => $d['newStatus']],
                greet: true,
            );

            return true;
        }
        if ($message['event'] === 'reclamation.created') {
            $data = Validator::make($message['data'], $rules + ['category' => ['required', 'string', 'max:30']]);
            if ($data->fails()) {
                return null;
            }
            $d = $data->validated();
            $admins = $this->reclamationAdminIds();
            if ($admins === []) {
                // Message valide, mais personne à prévenir : confirmé (le renvoyer ne changerait rien) et signalé.
                Log::warning("[rabbitmq:reclamation.events] {$d['reference']} : aucun administrateur notifié, "
                    .'RECLAMATION_ADMIN_IDS ne contient aucun sub Keycloak valide.');

                return true;
            }
            $category = self::RECLAMATION_CATEGORY[$d['category']] ?? $d['category'];
            foreach ($admins as $adminId) {
                $this->dispatcher->send(
                    $adminId,
                    BroadcastType::System->value,
                    'Nouvelle réclamation',
                    "La réclamation {$d['reference']} ($category) attend un traitement.",
                    ['reclamationId' => $d['reclamationId'], 'reference' => $d['reference'], 'category' => $d['category']],
                );
            }

            return true;
        }

        return null;
    }

    private function discard(string $queue, string $reason, string $body): false
    {
        Log::warning("[rabbitmq:$queue] message écarté ($reason)", ['body' => mb_substr($body, 0, 500)]);

        return false;
    }
}
