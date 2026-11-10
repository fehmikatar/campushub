<?php

namespace Tests\Feature;

use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\InteractsWithServices;
use Tests\TestCase;

class NotificationsTest extends TestCase
{
    use InteractsWithServices, RefreshDatabase;

    public function test_list_unread_and_mark_read(): void
    {
        $this->postInternal('forum', $this->forumEvent());
        $this->postInternal('forum', $this->forumEvent(['post' => ['id' => 'p2']]));

        $this->asUser('alice')->getJson('/api/notifications/unread-count')->assertJson(['count' => 2]);

        $id = Notification::forUser('alice')->first()->id;
        $this->asUser('alice')->patchJson("/api/notifications/$id/read")
            ->assertOk()->assertJsonPath('read_at', fn ($v) => $v !== null);

        $this->asUser('alice')->getJson('/api/notifications/unread-count')->assertJson(['count' => 1]);
        $this->asUser('alice')->getJson('/api/notifications?unread=1')->assertJsonCount(1, 'data');

        $this->asUser('alice')->patchJson('/api/notifications/read-all')->assertJson(['updated' => 1]);
        $this->asUser('alice')->getJson('/api/notifications/unread-count')->assertJson(['count' => 0]);
    }

    public function test_cannot_touch_someone_elses_notification(): void
    {
        $this->postInternal('forum', $this->forumEvent());
        $id = Notification::forUser('alice')->first()->id;

        $this->asUser('mallory')->patchJson("/api/notifications/$id/read")->assertStatus(404);
        $this->asUser('mallory')->deleteJson("/api/notifications/$id")->assertStatus(404);
        $this->assertDatabaseCount('notifications', 1);

        $this->asUser('alice')->deleteJson("/api/notifications/$id")->assertStatus(204);
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_pagination_params_validated(): void
    {
        $this->asUser('alice')->getJson('/api/notifications?per_page=0')->assertStatus(422);
        $this->asUser('alice')->getJson('/api/notifications?per_page=500')->assertStatus(422);
    }
}
