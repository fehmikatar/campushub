<?php

namespace Tests\Feature;

use App\Models\NotificationPreference;
use App\Services\EventMessageProcessor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\Support\InteractsWithServices;
use Tests\TestCase;

/**
 * reclamation.events, publié par le reclamation-service (Django) avec l'enveloppe commune.
 * Les identifiants sont des sub Keycloak (UUID), comme ceux que Reclamation enregistre.
 */
class ReclamationEventsTest extends TestCase
{
    use InteractsWithServices, RefreshDatabase;

    private const STUDENT = '11111111-1111-4111-8111-111111111111';
    private const ADMIN_1 = '99999999-9999-4999-8999-999999999999';
    private const ADMIN_2 = '88888888-8888-4888-8888-888888888888';

    private function send(array|string $message): bool
    {
        return app(EventMessageProcessor::class)->process('reclamation.events', is_string($message) ? $message : json_encode($message));
    }

    private function event(string $event, array $data, string $actorId = self::ADMIN_1): array
    {
        return ['event' => $event, 'occurredAt' => '2026-11-11T18:05:00Z', 'actorId' => $actorId, 'data' => $data];
    }

    private function statusChanged(array $override = []): array
    {
        return $this->event('reclamation.status_changed', $override + [
            'reclamationId' => '507f1f77bcf86cd799439011', 'reference' => 'REC-2026-00001',
            'studentSub' => self::STUDENT, 'oldStatus' => 'in_progress', 'newStatus' => 'resolved',
        ]);
    }

    private function created(array $override = []): array
    {
        return $this->event('reclamation.created', $override + [
            'reclamationId' => '507f1f77bcf86cd799439011', 'reference' => 'REC-2026-00001',
            'studentSub' => self::STUDENT, 'category' => 'grade',
        ], self::STUDENT);
    }

    public function test_queue_is_declared_by_notification_next_to_the_existing_ones(): void
    {
        $this->assertSame(
            ['forum.events', 'evaluation.events', 'course.events', 'reclamation.events'],
            config('services.rabbitmq.queues'),
        );
    }

    public function test_status_change_notifies_the_student_only(): void
    {
        $this->userFirstNames([self::STUDENT => 'Alice']);

        $this->assertTrue($this->send($this->statusChanged()));

        $this->asUser(self::STUDENT)->getJson('/api/notifications')
            ->assertJsonPath('data.0.type', 'system')
            ->assertJsonPath('data.0.title', 'Réclamation mise à jour')
            ->assertJsonPath('data.0.message', 'Bonjour Alice, votre réclamation REC-2026-00001 est maintenant résolue.')
            ->assertJsonPath('data.0.data.reference', 'REC-2026-00001')
            ->assertJsonPath('data.0.data.status', 'resolved');
        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseMissing('notifications', ['user_id' => self::ADMIN_1]);
    }

    public function test_each_status_change_is_one_notification(): void
    {
        $this->assertTrue($this->send($this->statusChanged(['oldStatus' => 'new', 'newStatus' => 'in_progress'])));
        $this->assertTrue($this->send($this->statusChanged(['oldStatus' => 'in_progress', 'newStatus' => 'rejected'])));

        $this->assertSame(2, $this->asUser(self::STUDENT)->getJson('/api/notifications/unread-count')->json('count'));
    }

    public function test_student_preferences_still_apply(): void
    {
        NotificationPreference::create(['user_id' => self::STUDENT, 'muted_types' => ['system']]);

        $this->assertTrue($this->send($this->statusChanged())); // traité (ack), mais type coupé par l'étudiant
        $this->assertDatabaseCount('notifications', 0);
    }

    public function test_creation_notifies_each_configured_admin_once_and_never_the_student(): void
    {
        Log::spy();
        config(['services.reclamation.admin_ids' => [self::ADMIN_1, strtoupper(self::ADMIN_2), self::ADMIN_1, 'admin', 'admin@esprit.tn']]);

        $this->assertTrue($this->send($this->created()));

        $this->assertDatabaseCount('notifications', 2);
        $this->assertDatabaseHas('notifications', ['user_id' => self::ADMIN_1, 'title' => 'Nouvelle réclamation',
            'message' => 'La réclamation REC-2026-00001 (note) attend un traitement.']);
        $this->assertDatabaseHas('notifications', ['user_id' => self::ADMIN_2]);
        $this->assertDatabaseMissing('notifications', ['user_id' => self::STUDENT]);
        $this->asUser(self::ADMIN_1, 'ADMIN')->getJson('/api/notifications')
            ->assertJsonPath('data.0.data.category', 'grade');
        Log::shouldHaveReceived('warning')->withArgs(fn ($message) => str_contains($message, '2 entrée(s) ignorée(s)'));
    }

    public function test_creation_without_a_valid_admin_is_acknowledged_reported_and_creates_nothing(): void
    {
        foreach ([[], ['not-a-uuid', '']] as $adminIds) {
            Log::spy();
            config(['services.reclamation.admin_ids' => $adminIds]);

            $this->assertTrue($this->send($this->created()), 'valide : confirmé, pas de boucle de renvoi');
            $this->assertDatabaseCount('notifications', 0);
            Log::shouldHaveReceived('warning')->withArgs(fn ($message) => str_contains($message, 'aucun administrateur notifié'));
        }
    }

    public function test_unusable_reclamation_messages_are_discarded(): void
    {
        config(['services.reclamation.admin_ids' => [self::ADMIN_1]]);

        $this->assertFalse($this->send($this->statusChanged(['studentSub' => null])));
        $this->assertFalse($this->send($this->statusChanged(['studentSub' => 'alice']))); // pas un sub Keycloak
        $this->assertFalse($this->send($this->statusChanged(['newStatus' => 'new'])));
        $this->assertFalse($this->send($this->statusChanged(['oldStatus' => 'in_progress', 'newStatus' => 'in_progress'])));
        $this->assertFalse($this->send($this->statusChanged(['oldStatus' => 'resolved'])));
        $this->assertFalse($this->send($this->created(['reference' => null])));
        $this->assertFalse($this->send($this->created(['category' => null])));
        $this->assertFalse($this->send($this->event('reclamation.deleted', ['reclamationId' => 'r1'])));
        $this->assertFalse($this->send('{"event": "reclamation.created", "data": '));
        $this->assertDatabaseCount('notifications', 0);
    }
}
