<?php

namespace Tests\Feature;

use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    private function token(string $sub, string $role = 'ETUDIANT', array $override = [], string $secret = 'test-secret'): string
    {
        $b64 = fn ($v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        $h = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p = $b64(json_encode(array_merge([
            'sub' => $sub, 'role' => $role, 'iss' => 'campushub-user-service', 'exp' => time() + 3600,
        ], $override)));

        return "$h.$p.".$b64(hash_hmac('sha256', "$h.$p", $secret, true));
    }

    private function as(string $sub)
    {
        return $this->withHeader('Authorization', 'Bearer '.$this->token($sub));
    }

    private function event(array $override = []): array
    {
        return array_replace_recursive([
            'event' => 'post.created',
            'actorId' => 'bob',
            'topic' => ['id' => 't1', 'title' => 'Question sur Laravel', 'authorId' => 'alice', 'courseId' => 'c1'],
            'post' => ['id' => 'p1', 'authorId' => 'bob'],
        ], $override);
    }

    private function internal(array $payload, ?string $key = 'test-internal-key')
    {
        return $this->withHeaders($key ? ['X-Internal-Key' => $key] : [])->postJson('/api/internal/events/forum', $payload);
    }

    public function test_requires_valid_jwt(): void
    {
        $this->getJson('/api/notifications')->assertStatus(401);
        $this->withHeader('Authorization', 'Bearer '.$this->token('a', 'ETUDIANT', [], 'mauvais'))
            ->getJson('/api/notifications')->assertStatus(401);
        $this->withHeader('Authorization', 'Bearer '.$this->token('a', 'ETUDIANT', ['exp' => time() - 10]))
            ->getJson('/api/notifications')->assertStatus(401)->assertJson(['message' => 'Token expiré']);
        $this->withHeader('Authorization', 'Bearer '.$this->token('a', 'HACKER'))
            ->getJson('/api/notifications')->assertStatus(401);
        $this->withHeader('Authorization', 'Bearer '.$this->token('a', 'ETUDIANT', ['iss' => 'autre']))
            ->getJson('/api/notifications')->assertStatus(401);
    }

    public function test_internal_endpoint_requires_key(): void
    {
        $this->internal($this->event(), null)->assertStatus(403);
        $this->internal($this->event(), 'faux')->assertStatus(403);
    }

    public function test_reply_notifies_topic_author_only(): void
    {
        $this->internal($this->event())->assertStatus(201)->assertJson(['created' => 1]);

        $this->as('alice')->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.type', 'forum.reply')
            ->assertJsonPath('data.0.data.topicId', 't1')
            ->assertJsonMissingPath('data.0.user_id');
        $this->as('bob')->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_no_self_notification_and_no_duplicates(): void
    {
        $this->internal($this->event(['actorId' => 'alice', 'post' => ['authorId' => 'alice']]))->assertJson(['created' => 0]);

        // l'auteur du sujet est aussi l'auteur du message parent : une seule notification
        $this->internal($this->event(['post' => ['parentAuthorId' => 'alice']]))->assertJson(['created' => 1]);

        $this->internal($this->event(['post' => ['parentAuthorId' => 'carol']]))->assertJson(['created' => 2]);
    }

    public function test_like_and_accept_notify_post_author(): void
    {
        $this->internal($this->event(['event' => 'post.liked', 'actorId' => 'alice', 'post' => ['authorId' => 'bob']]))
            ->assertJson(['created' => 1]);
        $this->internal($this->event(['event' => 'post.accepted', 'actorId' => 'alice', 'post' => ['authorId' => 'bob']]))
            ->assertJson(['created' => 1]);

        $this->as('bob')->getJson('/api/notifications')->assertJsonCount(2, 'data');
    }

    public function test_event_validation(): void
    {
        $this->internal(['event' => 'inconnu'])->assertStatus(422);
        $this->internal($this->event(['event' => 'post.liked']) + [])->assertStatus(201);
        $payload = $this->event();
        unset($payload['post']);
        $this->internal($payload)->assertStatus(422)->assertJsonValidationErrors('post');
        $payload['event'] = 'topic.locked';
        $this->internal($payload)->assertStatus(201);
    }

    public function test_list_unread_and_mark_read(): void
    {
        $this->internal($this->event());
        $this->internal($this->event(['post' => ['id' => 'p2']]));

        $this->as('alice')->getJson('/api/notifications/unread-count')->assertJson(['count' => 2]);

        $id = Notification::forUser('alice')->first()->id;
        $this->as('alice')->patchJson("/api/notifications/$id/read")->assertOk()->assertJsonPath('read_at', fn ($v) => $v !== null);

        $this->as('alice')->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);
        $this->as('alice')->getJson('/api/notifications?unread=1')->assertJsonCount(1, 'data');

        $this->as('alice')->patchJson('/api/notifications/read-all')->assertJson(['updated' => 1]);
        $this->as('alice')->getJson('/api/notifications/unread-count')->assertJson(['count' => 0]);
    }

    public function test_cannot_touch_someone_elses_notification(): void
    {
        $this->internal($this->event());
        $id = Notification::forUser('alice')->first()->id;

        $this->as('mallory')->patchJson("/api/notifications/$id/read")->assertStatus(404);
        $this->as('mallory')->deleteJson("/api/notifications/$id")->assertStatus(404);
        $this->assertDatabaseCount('notifications', 1);

        $this->as('alice')->deleteJson("/api/notifications/$id")->assertStatus(204);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_pagination_params_validated(): void
    {
        $this->as('alice')->getJson('/api/notifications?per_page=0')->assertStatus(422);
        $this->as('alice')->getJson('/api/notifications?per_page=500')->assertStatus(422);
    }
}
