<?php

namespace App\Http\Requests;

use App\Enums\ForumEvent;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ForumEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // protégé par le middleware « internal »
    }

    /** @return array<string,mixed> */
    public function rules(): array
    {
        $needsPost = ForumEvent::tryFrom((string) $this->input('event'))?->requiresPost() ?? false;

        return [
            'event' => ['required', Rule::in(ForumEvent::values())],
            'actorId' => ['required', 'string', 'max:64'],
            'topic' => ['required', 'array'],
            'topic.id' => ['required', 'string', 'max:64'],
            'topic.title' => ['required', 'string', 'max:150'],
            'topic.authorId' => ['required', 'string', 'max:64'],
            'topic.courseId' => ['nullable', 'string', 'max:64'],
            'post' => [$needsPost ? 'required' : 'nullable', 'array'],
            'post.id' => ['required_with:post', 'string', 'max:64'],
            'post.authorId' => ['required_with:post', 'string', 'max:64'],
            'post.parentAuthorId' => ['nullable', 'string', 'max:64'],
        ];
    }
}
