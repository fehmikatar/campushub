<?php

namespace Tests\Feature;

use App\Services\EventMessageProcessor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\InteractsWithServices;
use Tests\TestCase;

class RabbitMqMessagesTest extends TestCase
{
    use InteractsWithServices, RefreshDatabase;

    private function send(string $queue, array|string $message): bool
    {
        $body = is_string($message) ? $message : json_encode($message);

        return app(EventMessageProcessor::class)->process($queue, $body);
    }

    private function envelope(string $event, array $data, ?string $actorId = 'bob'): array
    {
        return ['event' => $event, 'occurredAt' => '2026-11-10T12:00:00Z', 'actorId' => $actorId, 'data' => $data];
    }

    private function unread(string $user): int
    {
        return $this->asUser($user)->getJson('/api/notifications/unread-count')->json('count');
    }

    public function test_forum_reply_notifies_topic_author(): void
    {
        $event = $this->forumEvent();

        $this->assertTrue($this->send('forum.events', $this->envelope('post.created', [
            'topic' => $event['topic'], 'post' => $event['post'],
        ])));

        $this->assertSame(1, $this->unread('alice'));
        $this->assertSame(0, $this->unread('bob'));
    }

    public function test_forum_topic_event_without_post(): void
    {
        $this->assertTrue($this->send('forum.events', $this->envelope('topic.resolved', [
            'topic' => $this->forumEvent()['topic'],
        ], 'prof')));

        $this->assertSame(1, $this->unread('alice'));
    }

    public function test_forum_event_missing_actor_or_post_is_discarded(): void
    {
        $event = $this->forumEvent();

        $this->assertFalse($this->send('forum.events', $this->envelope('post.created', ['topic' => $event['topic']])));
        $this->assertFalse($this->send('forum.events', $this->envelope('post.created', [
            'topic' => $event['topic'], 'post' => $event['post'],
        ], null)));
        $this->assertSame(0, $this->unread('alice'));
    }

    public function test_evaluation_result_notifies_student(): void
    {
        $this->assertTrue($this->send('evaluation.events', $this->envelope('result.published', [
            'studentId' => 'alice', 'quizTitle' => 'Quiz Laravel', 'score' => 16,
        ], 'prof')));

        $this->asUser('alice')->getJson('/api/notifications')
            ->assertJsonPath('data.0.type', 'grade')
            ->assertJsonPath('data.0.data.score', 16);
    }

    public function test_course_published_notifies_each_user_once(): void
    {
        $this->assertTrue($this->send('course.events', $this->envelope('course.published', [
            'courseId' => 'c1', 'title' => 'PHP avancé', 'userIds' => ['alice', 'bob', 'alice'],
        ], 'prof')));

        $this->assertSame(1, $this->unread('alice'));
        $this->assertSame(1, $this->unread('bob'));
    }

    public function test_muted_type_is_acknowledged_without_notification(): void
    {
        $this->asUser('alice')->putJson('/api/notifications/preferences', ['muted_types' => ['grade']]);

        $this->assertTrue($this->send('evaluation.events', $this->envelope('result.published', [
            'studentId' => 'alice', 'quizTitle' => 'Quiz',
        ])));
        $this->assertSame(0, $this->unread('alice'));
    }

    public function test_forum_notification_greets_recipient_by_first_name(): void
    {
        $this->userFirstNames(['alice' => 'Alice']);
        $event = $this->forumEvent();

        $this->send('forum.events', $this->envelope('post.created', ['topic' => $event['topic'], 'post' => $event['post']]));

        $this->assertDatabaseHas('notifications', [
            'user_id' => 'alice',
            'message' => 'Bonjour Alice, nouvelle réponse à votre sujet « Question sur Laravel ».',
        ]);
    }

    public function test_notification_is_sent_without_first_name_when_user_service_has_none(): void
    {
        $this->assertTrue($this->send('evaluation.events', $this->envelope('result.published', [
            'studentId' => 'alice', 'quizTitle' => 'Quiz',
        ])));

        $this->assertDatabaseHas('notifications', [
            'user_id' => 'alice',
            'message' => 'Votre résultat pour « Quiz » est disponible.',
        ]);
    }

    public function test_course_published_makes_no_user_service_call_per_recipient(): void
    {
        $this->userFirstNames(['alice' => 'Alice']);

        $this->send('course.events', $this->envelope('course.published', [
            'courseId' => 'c1', 'title' => 'PHP avancé', 'userIds' => ['alice'],
        ], 'prof'));

        $this->assertDatabaseHas('notifications', ['user_id' => 'alice', 'message' => 'Le cours « PHP avancé » est disponible.']);
    }

    public function test_unusable_messages_are_discarded(): void
    {
        $this->assertFalse($this->send('forum.events', 'pas du json'));
        $this->assertFalse($this->send('forum.events', ['event' => 'post.created']));                        // pas de data
        $this->assertFalse($this->send('forum.events', $this->envelope('evenement.inconnu', ['x' => 1])));   // événement inconnu
        $this->assertFalse($this->send('evaluation.events', $this->envelope('result.published', [])));       // data incomplète
        $this->assertFalse($this->send('autre.queue', $this->envelope('post.created', ['x' => 1])));         // file inconnue
        $this->assertDatabaseCount('notifications', 0);
    }
}
