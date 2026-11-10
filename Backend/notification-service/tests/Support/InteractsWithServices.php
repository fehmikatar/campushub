<?php

namespace Tests\Support;

use App\Services\JwtService;

/**
 * Helpers communs aux tests (équivalent de tests/helpers.js du forum-service).
 */
trait InteractsWithServices
{
    protected function token(string $sub, string $role = 'ETUDIANT'): string
    {
        return app(JwtService::class)->encode($sub, $role, 1);
    }

    protected function asUser(string $sub, string $role = 'ETUDIANT')
    {
        return $this->withHeader('Authorization', 'Bearer '.$this->token($sub, $role));
    }

    protected function postInternal(string $path, array $payload, ?string $key = 'test-internal-key')
    {
        return $this->withHeaders($key ? ['X-Internal-Key' => $key] : [])->postJson("/api/internal/events/$path", $payload);
    }

    /** @param array<string,mixed> $override */
    protected function forumEvent(array $override = []): array
    {
        return array_replace_recursive([
            'event' => 'post.created',
            'actorId' => 'bob',
            'topic' => ['id' => 't1', 'title' => 'Question sur Laravel', 'authorId' => 'alice', 'courseId' => 'c1'],
            'post' => ['id' => 'p1', 'authorId' => 'bob'],
        ], $override);
    }

    /** @param array<string,mixed> $override */
    protected function broadcastPayload(array $override = []): array
    {
        return array_merge([
            'userIds' => ['alice', 'bob'],
            'type' => 'announcement',
            'title' => 'Nouvelle annonce',
            'message' => 'Le cours de demain est reporté.',
        ], $override);
    }
}
