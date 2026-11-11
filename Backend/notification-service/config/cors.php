<?php

/*
| Le CORS est géré par l'API Gateway (origines autorisées pour le frontend). Le service ne doit pas
| ajouter ses propres en-têtes : le navigateur refuse une réponse avec deux « Access-Control-Allow-Origin ».
*/
return [
    'paths' => [],
    'allowed_methods' => ['*'],
    'allowed_origins' => [],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
