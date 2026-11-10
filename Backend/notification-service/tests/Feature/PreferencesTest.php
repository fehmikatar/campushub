<?php

namespace Tests\Feature;

use App\Mail\NotificationMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\Support\InteractsWithServices;
use Tests\TestCase;

class PreferencesTest extends TestCase
{
    use InteractsWithServices, RefreshDatabase;

    public function test_default_preferences(): void
    {
        $this->asUser('alice')->getJson('/api/notifications/preferences')
            ->assertOk()->assertJson(['email' => null, 'email_enabled' => true, 'muted_types' => []]);
    }

    public function test_update_preferences_and_validation(): void
    {
        $this->asUser('alice')->putJson('/api/notifications/preferences', ['email' => 'pas-un-email'])->assertStatus(422);

        $this->asUser('alice')->putJson('/api/notifications/preferences', ['email' => 'a@esprit.tn', 'muted_types' => ['grade']])
            ->assertOk()->assertJson(['email' => 'a@esprit.tn', 'muted_types' => ['grade']]);
        $this->asUser('alice')->getJson('/api/notifications/preferences')->assertJson(['email' => 'a@esprit.tn']);
        $this->asUser('bob')->getJson('/api/notifications/preferences')->assertJson(['email' => null]);
    }

    public function test_muted_type_is_skipped(): void
    {
        $this->asUser('alice')->putJson('/api/notifications/preferences', ['muted_types' => ['announcement']]);

        $this->postInternal('broadcast', $this->broadcastPayload())->assertJson(['created' => 1]);
        $this->asUser('alice')->getJson('/api/notifications/unread-count')->assertJson(['count' => 0]);
        $this->asUser('bob')->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);
    }

    public function test_email_sent_only_when_enabled_and_address_set(): void
    {
        Mail::fake();
        $this->asUser('alice')->putJson('/api/notifications/preferences', ['email' => 'a@esprit.tn']);
        $this->asUser('bob')->putJson('/api/notifications/preferences', ['email' => 'b@esprit.tn', 'email_enabled' => false]);

        $this->postInternal('broadcast', $this->broadcastPayload(['userIds' => ['alice', 'bob', 'carol']]))
            ->assertJson(['created' => 3]);

        Mail::assertSent(NotificationMail::class, 1);
        Mail::assertSent(NotificationMail::class, fn ($m) => $m->hasTo('a@esprit.tn'));
    }
}
