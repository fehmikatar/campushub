<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\InteractsWithServices;
use Tests\TestCase;

class ForumEventsTest extends TestCase
{
    use InteractsWithServices, RefreshDatabase;

    public function test_reply_notifies_topic_author_only(): void
    {
        $this->postInternal('forum', $this->forumEvent())->assertStatus(201)->assertJson(['created' => 1]);

        $this->asUser('alice')->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('data.0.type', 'forum.reply')
            ->assertJsonPath('data.0.data.topicId', 't1')
            ->assertJsonMissingPath('data.0.user_id');
        $this->asUser('bob')->getJson('/api/notifications')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_no_self_notification_and_no_duplicates(): void
    {
        $this->postInternal('forum', $this->forumEvent(['actorId' => 'alice', 'post' => ['authorId' => 'alice']]))
            ->assertJson(['created' => 0]);

        // l'auteur du sujet est aussi l'auteur du message parent : une seule notification
        $this->postInternal('forum', $this->forumEvent(['post' => ['parentAuthorId' => 'alice']]))->assertJson(['created' => 1]);

        $this->postInternal('forum', $this->forumEvent(['post' => ['parentAuthorId' => 'carol']]))->assertJson(['created' => 2]);
    }

    public function test_like_and_accept_notify_post_author(): void
    {
        $this->postInternal('forum', $this->forumEvent(['event' => 'post.liked', 'actorId' => 'alice', 'post' => ['authorId' => 'bob']]))
            ->assertJson(['created' => 1]);
        $this->postInternal('forum', $this->forumEvent(['event' => 'post.accepted', 'actorId' => 'alice', 'post' => ['authorId' => 'bob']]))
            ->assertJson(['created' => 1]);

        $this->asUser('bob')->getJson('/api/notifications')->assertJsonCount(2, 'data');
    }

    public function test_topic_events_notify_topic_author(): void
    {
        $payload = $this->forumEvent(['event' => 'topic.locked', 'actorId' => 'prof']);
        unset($payload['post']);

        $this->postInternal('forum', $payload)->assertStatus(201)->assertJson(['created' => 1]);
        $this->asUser('alice')->getJson('/api/notifications')->assertJsonPath('data.0.type', 'forum.locked');
    }

    public function test_event_validation(): void
    {
        $this->postInternal('forum', ['event' => 'inconnu'])->assertStatus(422);

        $payload = $this->forumEvent();
        unset($payload['post']);
        $this->postInternal('forum', $payload)->assertStatus(422)->assertJsonValidationErrors('post');
    }
}
