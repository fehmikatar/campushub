<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'jwt' => [
        'secret' => env('JWT_SECRET'),
        'issuer' => env('JWT_ISSUER', 'campushub-user-service'),
    ],

    'eureka' => [
        'host' => env('EUREKA_HOST', 'localhost'),
        'port' => env('EUREKA_PORT', 8761),
        'instance_host' => env('EUREKA_INSTANCE_HOST', 'localhost'),
        'service_port' => env('SERVICE_PORT', 8085),
    ],

    'internal' => [
        'key' => env('INTERNAL_API_KEY'),
    ],

];
