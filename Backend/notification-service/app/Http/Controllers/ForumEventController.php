<?php

namespace App\Http\Controllers;

use App\Services\ForumNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ForumEventController extends Controller
{
    public function store(Request $request, ForumNotifier $notifier): JsonResponse
    {
        $needsPost = in_array($request->input('event'), ['post.created', 'post.liked', 'post.accepted'], true);

        $payload = $request->validate([
            'event' => ['required', Rule::in(ForumNotifier::EVENTS)],
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
        ]);

        return response()->json(['created' => $notifier->handle($payload)], 201);
    }
}
