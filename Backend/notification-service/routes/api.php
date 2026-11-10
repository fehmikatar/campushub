<?php

use App\Http\Controllers\BroadcastController;
use App\Http\Controllers\ForumEventController;
use App\Http\Controllers\PreferenceController;
use App\Http\Controllers\NotificationController;
use Illuminate\Support\Facades\Route;

Route::middleware('jwt')->prefix('notifications')->group(function () {
    Route::get('/', [NotificationController::class, 'index']);
    Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
    Route::get('/preferences', [PreferenceController::class, 'show']);
    Route::put('/preferences', [PreferenceController::class, 'update']);
    Route::patch('/read-all', [NotificationController::class, 'markAllRead']);
    Route::patch('/{id}/read', [NotificationController::class, 'markRead'])->whereNumber('id');
    Route::delete('/{id}', [NotificationController::class, 'destroy'])->whereNumber('id');
});

// Appels de service à service (clé partagée), jamais exposés au frontend.
Route::middleware('internal')->prefix('internal/events')->group(function () {
    Route::post('/forum', [ForumEventController::class, 'store']);
    Route::post('/broadcast', [BroadcastController::class, 'store']);
});
