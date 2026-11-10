<?php

namespace App\Enums;

enum ForumEvent: string
{
    case PostCreated = 'post.created';
    case PostLiked = 'post.liked';
    case PostAccepted = 'post.accepted';
    case TopicLocked = 'topic.locked';
    case TopicResolved = 'topic.resolved';

    public function requiresPost(): bool
    {
        return match ($this) {
            self::PostCreated, self::PostLiked, self::PostAccepted => true,
            default => false,
        };
    }

    /** @return string[] */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
