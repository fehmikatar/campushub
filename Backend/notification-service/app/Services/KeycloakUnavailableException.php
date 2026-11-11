<?php

namespace App\Services;

use RuntimeException;

/** Keycloak injoignable et clés publiques inconnues du cache : l'API répond 503. */
class KeycloakUnavailableException extends RuntimeException
{
}
