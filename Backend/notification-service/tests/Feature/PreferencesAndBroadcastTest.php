<?php

namespace Tests\Feature;

use App\Mail\NotificationMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PreferencesAndBroadcastTest extends TestCase
{
    use RefreshDatabase;

    private function as(string $sub)
    {
        $b64 = fn ($v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');
        $h = $b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $p = $b64(json_encode(['sub' => $sub, 'role' => 'ETUDIANT', 'iss' => 'campushub-user-service', 'exp' => time() + 3600]));
        $t = "$h.$p.".$b64(hash_hmac('sha256', "$h.$p", 'test-secret', true));

        return $this->withHeader('Authorization', "Bearer $t");
    }

    private function broadcast(array $override = [], string $key = 'test-internal-key')
    {
        return $this->withHeader('X-Internal-Key', $key)->postJson('/api/internal/events/broadcast', array_merge([
            'userIds' => ['alice', 'bob'],
            'type' => 'announcement',
            'title' => 'Nouvelle annonce',
            'message' => 'Le cours de demain est reporté.',
        ], $override));
    }

    public function test_broadcast_creates_one_notification_per_user(): void
    {
        $this->broadcast(['userIds' => ['alice', 'bob', 'alice']])->assertStatus(201)->assertJson(['created' => 2]);

        $this->as('alice')->getJson('/api/notifications')->assertJsonCount(1, 'data')->assertJsonPath('data.0.type', 'announcement');
        $this->as('bob')->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);
    }

    public function test_broadcast_requires_key_and_valid_payload(): void
    {
        $this->broadcast([], 'faux')->assertStatus(403);
        $this->broadcast(['type' => 'inconnu'])->assertStatus(422);
        $this->broadcast(['userIds' => []])->assertStatus(422);
    }

    public function test_malformed_json_gets_explicit_error(): void
    {
        $this->call('POST', '/api/internal/events/broadcast', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_INTERNAL_KEY' => 'test-internal-key',
        ], '{"userIds":["a"],"data": {23/10/2026}}')
            ->assertStatus(400)
            ->assertJsonPath('message', fn ($m) => str_starts_with($m, 'JSON invalide'));
    }

    public function test_default_preferences(): void
    {
        $this->as('alice')->getJson('/api/notifications/preferences')
            ->assertOk()->assertJson(['email' => null, 'email_enabled' => true, 'muted_types' => []]);
    }

    public function test_update_preferences_and_validation(): void
    {
        $this->as('alice')->putJson('/api/notifications/preferences', ['email' => 'pas-un-email'])->assertStatus(422);

        $this->as('alice')->putJson('/api/notifications/preferences', ['email' => 'a@esprit.tn', 'muted_types' => ['grade']])
            ->assertOk()->assertJson(['email' => 'a@esprit.tn', 'muted_types' => ['grade']]);
        $this->as('alice')->getJson('/api/notifications/preferences')->assertJson(['email' => 'a@esprit.tn']);
        $this->as('bob')->getJson('/api/notifications/preferences')->assertJson(['email' => null]);
    }

    public function test_muted_type_is_skipped(): void
    {
        $this->as('alice')->putJson('/api/notifications/preferences', ['muted_types' => ['announcement']]);

        $this->broadcast()->assertJson(['created' => 1]);
        $this->as('alice')->getJson('/api/notifications/unread-count')->assertJson(['count' => 0]);
        $this->as('bob')->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);
    }

    public function test_email_sent_only_when_enabled_and_address_set(): void
    {
        Mail::fake();
        $this->as('alice')->putJson('/api/notifications/preferences', ['email' => 'a@esprit.tn']);
        $this->as('bob')->putJson('/api/notifications/preferences', ['email' => 'b@esprit.tn', 'email_enabled' => false]);

        $this->broadcast(['userIds' => ['alice', 'bob', 'carol']])->assertJson(['created' => 3]);

        Mail::assertSent(NotificationMail::class, 1);
        Mail::assertSent(NotificationMail::class, fn ($m) => $m->hasTo('a@esprit.tn'));
    }
}
