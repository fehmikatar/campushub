<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\InteractsWithServices;
use Tests\TestCase;

class BroadcastTest extends TestCase
{
    use InteractsWithServices, RefreshDatabase;

    public function test_creates_one_notification_per_distinct_user(): void
    {
        $this->postInternal('broadcast', $this->broadcastPayload(['userIds' => ['alice', 'bob', 'alice']]))
            ->assertStatus(201)->assertJson(['created' => 2]);

        $this->asUser('alice')->getJson('/api/notifications')
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.type', 'announcement');
        $this->asUser('bob')->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);
    }

    public function test_validates_payload(): void
    {
        $this->postInternal('broadcast', $this->broadcastPayload(['type' => 'inconnu']))->assertStatus(422);
        $this->postInternal('broadcast', $this->broadcastPayload(['userIds' => []]))->assertStatus(422);
    }
}
