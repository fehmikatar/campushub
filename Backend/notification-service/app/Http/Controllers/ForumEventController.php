<?php

namespace App\Http\Controllers;

use App\Http\Requests\ForumEventRequest;
use App\Services\ForumNotifier;
use Illuminate\Http\JsonResponse;

class ForumEventController extends Controller
{
    public function store(ForumEventRequest $request, ForumNotifier $notifier): JsonResponse
    {
        return response()->json(['created' => $notifier->handle($request->validated())], 201);
    }
}
