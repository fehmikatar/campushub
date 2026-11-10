<?php

// Faux user-service pour les essais manuels (en attendant l'endpoint d'Aziz) :
//   php -S localhost:8081 tests/Support/fake-user-service.php
// GET /api/v1/users/{id}/public : alice, bob et prof existent, tout autre identifiant donne 404.

$users = [
    'alice' => ['id' => 'alice', 'prenom' => 'Alice', 'nom' => 'Martin'],
    'bob' => ['id' => 'bob', 'prenom' => 'Bob', 'nom' => 'Durand'],
    'prof' => ['id' => 'prof', 'prenom' => 'Sami', 'nom' => 'Ben Ali'],
];

header('Content-Type: application/json');

if (preg_match('#^/api/v1/users/([^/]+)/public$#', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), $m)) {
    $id = urldecode($m[1]);
    if (isset($users[$id])) {
        echo json_encode($users[$id]);
    } else {
        http_response_code(404);
        echo json_encode(['message' => 'User not found']);
    }
} else {
    http_response_code(404);
    echo json_encode(['message' => 'Not found']);
}
