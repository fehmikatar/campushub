# CampusHub identity contract

For every team building a CampusHub service. It describes who issues identities, what the access
token contains, how your service identifies the caller, and what the User Service still provides.
Each service owns its own database. **Never** read the User Service database.

**Keycloak is the single source of identity** (accounts, passwords, roles). No CampusHub service
creates tokens: they all *verify* the token Keycloak issued.

## 1. User ids are UUIDs

Every user has one stable id: the Keycloak `sub`, a UUID serialized as a 36-character string
(`"3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90"`). It never changes, not even when the user's role
changes. Store references as plain columns, with no foreign key and no relationship to a user
entity:

```java
// Evaluation / Enrollment / Reclamation ... any service
private UUID etudiantId;      // or a plain string column
private UUID enseignantId;
```

Test accounts of the imported realm (password `Test1234!`):

| Account       | Role         | `sub`                                  |
|---------------|--------------|----------------------------------------|
| `etudiant1`   | `ETUDIANT`   | `11111111-1111-4111-8111-111111111111` |
| `enseignant1` | `ENSEIGNANT` | `3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90` |
| `admin1`      | `ADMIN`      | `99999999-9999-4999-8999-999999999999` |

## 2. Roles

Realm roles in Keycloak (realm `campushub`):

| Role         | Spring Security authority |
|--------------|---------------------------|
| `ETUDIANT`   | `ROLE_ETUDIANT`           |
| `ENSEIGNANT` | `ROLE_ENSEIGNANT`         |
| `ADMIN`      | `ROLE_ADMIN`              |

A token may carry several realm roles. When one role is needed, take the highest:
`ADMIN` > `ENSEIGNANT` > `ETUDIANT` (default `ETUDIANT`). A new account is `ETUDIANT`; a user who
asks to be `ENSEIGNANT` stays `ETUDIANT` until an administrator validates the request (screen
**Utilisateurs**, button **Valider enseignant**), then logs in again to get the new role.

## 3. The access token

Keycloak issues an RS256 JWT through the public client `campushub-frontend`. Claims used by
CampusHub:

```json
{
  "sub": "3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90",
  "iss": "http://localhost:8180/realms/campushub",
  "realm_access": { "roles": ["ENSEIGNANT"] },
  "preferred_username": "enseignant1",
  "given_name": "sami",
  "family_name": "enseignant",
  "email": "enseignant1@campushub.test",
  "iat": 1760520000,
  "exp": 1760523600
}
```

- `sub` is the user id; roles are in `realm_access.roles` (**a list**, not a single string).
- Names and e-mail come from the standard claims `given_name`, `family_name`, `email`
  (`preferred_username` as a fallback).
- The `iss` is the address the **browser** uses (`http://localhost:8180/realms/campushub`).
  Always open the application with `localhost`, never `127.0.0.1`.
- Tokens are short-lived. The frontend renews the session with Keycloak; services never refresh.

## 4. How your service validates it

Locally, on every request, without calling Keycloak or the User Service for each call:

1. Verify the RS256 signature with Keycloak's public keys (JWKS).
2. Require `iss = http://localhost:8180/realms/campushub`, and reject expired tokens.
3. Take the caller's id **only** from `sub`, and the roles **only** from `realm_access.roles`
   (→ `ROLE_` + role).
4. Ignore any client-sent identity header (`X-User-Id`, `X-Role`, ...).

Inside Docker, the issuer and the key location differ: the token keeps the `localhost:8180`
issuer, but the services read the keys on the Docker network. Both values are environment
variables in the root `docker-compose.yml`:

| Variable                 | Value                                                                      |
|--------------------------|----------------------------------------------------------------------------|
| `KEYCLOAK_ISSUER_URI`    | `http://localhost:8180/realms/campushub`                                   |
| `KEYCLOAK_JWKS_URI`      | `http://keycloak:8080/realms/campushub/protocol/openid-connect/certs`      |

With Spring Security's OAuth2 Resource Server (`spring-boot-starter-oauth2-resource-server`),
set **both** properties, so the service does not call Keycloak's discovery endpoint at startup
but still validates the issuer:

```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${KEYCLOAK_ISSUER_URI:http://localhost:8180/realms/campushub}
          jwk-set-uri: ${KEYCLOAK_JWKS_URI:http://localhost:8180/realms/campushub/protocol/openid-connect/certs}
```

```java
@Bean
JwtAuthenticationConverter jwtAuthenticationConverter() {
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(jwt -> {
        Map<String, Object> realm = jwt.getClaimAsMap("realm_access");
        Collection<?> roles = realm == null ? List.of() : (Collection<?>) realm.getOrDefault("roles", List.of());
        return roles.stream()
                .map(String::valueOf)
                .filter(r -> Set.of("ETUDIANT", "ENSEIGNANT", "ADMIN").contains(r))
                .map(r -> new SimpleGrantedAuthority("ROLE_" + r))
                .collect(Collectors.toList());
    });
    return converter;
}
```

Then authorize with `hasRole('ENSEIGNANT')` etc., and read the caller with
`UUID.fromString(jwt.getSubject())`. Services written with other stacks (Express, NestJS,
Django, ASP.NET, Laravel) apply the same four rules with their own JWT library.

**Never trust an id sent by the client for the caller's own identity.** A service that records
who did something sets it from `sub` (for example `reclamation.etudiantId = sub`).

The API Gateway validates the token first; every service then **revalidates it itself**.

## 5. Limits of this model

- **Revocation.** A service only checks signature, issuer and expiry. If a user is disabled or
  loses a role in Keycloak, services keep accepting the existing token until it expires. Keep the
  token lifetime short in Keycloak if that matters.
- **Role changes need a new login.** The role is read from the token, so a promotion (for
  example a validated teacher) is visible only after the user logs in again.
- **Other users.** Keycloak is the only owner of accounts. A service must not copy the user
  table. To show a user's name, call the User Service (section 6) with the user's id.

## 6. User Service API (summary)

The User Service is a stateless resource server. It stores only a **profile** (`users` table:
`id` = token `sub`, `email`, `nom`, `prenom`, `role`, timestamps). It has no login, no
registration, no password and no administration endpoint: all of that lives in Keycloak.

| Method & path                  | Access                        | Purpose |
|--------------------------------|-------------------------------|---------|
| `GET /api/v1/users/me`         | any authenticated role        | returns the caller's profile; **creates it on the first call** from the token claims |
| `PUT /api/v1/users/me`         | any authenticated role        | updates the caller's own `nom` / `prenom` |
| `GET /api/v1/users/{id}/public`| open on the service, token required through the Gateway | returns `{id, prenom, nom}` only (no e-mail) |

Through the Gateway, every call needs a Bearer token. Services on the Docker network (for
example Notification, which reads display names) call the User Service directly at
`http://user-service:8081` (variable `USER_SERVICE_URL`).

Profile example:

```json
{ "id": "11111111-1111-4111-8111-111111111111", "email": "etudiant1@campushub.test",
  "nom": "katar", "prenom": "fehmi", "role": "ETUDIANT" }
```

Account management (creating users, changing roles, validating a teacher) is done in the
**Utilisateurs** screen of the frontend, which calls the Keycloak Admin API with an
administrator's token.