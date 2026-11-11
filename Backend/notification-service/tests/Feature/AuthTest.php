<?php

namespace Tests\Feature;

use App\Services\JwtService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\InteractsWithServices;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use InteractsWithServices, RefreshDatabase;

    public function test_requires_a_token(): void
    {
        $this->getJson('/api/notifications')->assertStatus(401)->assertJson(['message' => 'Token manquant']);
    }

    public function test_rejects_wrong_signature_issuer_role_and_expired_token(): void
    {
        $bearer = fn (string $t) => $this->withHeader('Authorization', "Bearer $t");

        $bearer($this->token('a').'x')->getJson('/api/notifications')->assertStatus(401);

        config(['services.jwt.issuer' => 'autre']);
        $foreign = app(JwtService::class)->encode('a', 'ETUDIANT');
        config(['services.jwt.issuer' => 'campushub-user-service']);
        $bearer($foreign)->getJson('/api/notifications')->assertStatus(401);

        $bearer($this->token('a', 'HACKER'))->getJson('/api/notifications')->assertStatus(401);

        $expired = app(JwtService::class)->encode('a', 'ETUDIANT', -1);
        $bearer($expired)->getJson('/api/notifications')->assertStatus(401)->assertJson(['message' => 'Token expiré']);
    }

    public function test_service_adds_no_cors_headers_because_the_gateway_handles_them(): void
    {
        $response = $this->withHeader('Origin', 'http://localhost:4200')
            ->asUser('a')
            ->getJson('/api/notifications');

        $response->assertOk();
        $this->assertFalse($response->headers->has('Access-Control-Allow-Origin'));
    }

    public function test_valid_token_is_accepted(): void
    {
        $this->asUser('a')->getJson('/api/notifications')->assertOk();
    }

    public function test_internal_routes_require_the_shared_key(): void
    {
        $this->postInternal('forum', $this->forumEvent(), null)->assertStatus(403);
        $this->postInternal('forum', $this->forumEvent(), 'faux')->assertStatus(403);
        $this->postInternal('broadcast', $this->broadcastPayload(), 'faux')->assertStatus(403);
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
}
