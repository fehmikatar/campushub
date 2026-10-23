<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotificationPreference extends Model
{
    protected $fillable = ['user_id', 'email', 'email_enabled', 'muted_types'];

    protected $hidden = ['id', 'user_id'];

    protected function casts(): array
    {
        return ['email_enabled' => 'boolean', 'muted_types' => 'array'];
    }
}
