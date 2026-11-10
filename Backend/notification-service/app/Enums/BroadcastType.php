<?php

namespace App\Enums;

enum BroadcastType: string
{
    case Grade = 'grade';
    case Announcement = 'announcement';
    case Deadline = 'deadline';
    case System = 'system';
}
