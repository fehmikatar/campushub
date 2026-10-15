# CampusHub identity contract (User Service)

For the teams building the Academic, Grade, Request and Announcement services. It describes what
the User Service guarantees and how your service identifies the caller. Integration isn't
implemented yet; this is the agreed contract. Each service owns its own database. **Never** read
the User Service database.

## 1. User ids are UUIDs

Every user has one stable id: a UUID, serialized as a 36-character string
(`"3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90"`). It never changes, not even when the user's role
changes. Store references as plain columns, with no foreign key and no JPA relationship to a user
entity:

```java
// Grade Service - Note
private UUID etudiantId;
private UUID enseignantId;

// Request Service - Demande
private UUID etudiantId;
private UUID traiteParId;

// Announcement Service - Annonce
private UUID auteurId;
```

(`CHAR(36)` with `hibernate.type.preferred_uuid_jdbc_type: CHAR`, like the User Service.)

## 2. Roles

| Role         | Spring Security authority |
|--------------|---------------------------|
| `ETUDIANT`   | `ROLE_ETUDIANT`           |
| `ENSEIGNANT` | `ROLE_ENSEIGNANT`         |
| `ADMIN`      | `ROLE_ADMIN`              |

One role per user. Only `ACTIVE` accounts can obtain a token.

## 3. The access token

`POST /api/v1/auth/login` returns an HS256 JWT valid for 1 hour by default:

```json
{
  "sub": "3f2b8c1e-5d4a-4c1b-9a0e-2d7f6b1c8e90",
  "role": "ENSEIGNANT",
  "iss": "campushub-user-service",
  "iat": 1760520000,
  "exp": 1760523600,
  "jti": "..."
}
```

- `sub` is the user id; `role` is a **single string**.
- No password, email, name or matricule is in the token.
- There is no refresh token. When it expires, the user logs in again at the User Service.

## 4. How your service validates it

Locally, on every request, without calling the User Service:

1. Verify the HS256 signature with the shared `JWT_SECRET`.
2. Require `iss = campushub-user-service`, and reject expired tokens.
3. Take the caller's id **only** from `sub`, and the role **only** from `role` (→ `ROLE_` + role).
4. Ignore any client-sent identity header (`X-User-Id`, `X-Role`, …).

With Spring Security's OAuth2 Resource Server (`spring-boot-starter-oauth2-resource-server`):

```java
@Bean
JwtDecoder jwtDecoder(@Value("${campushub.jwt.secret}") String secret) {
    SecretKey key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
    decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer("campushub-user-service"));
    return decoder;
}

@Bean
JwtAuthenticationConverter jwtAuthenticationConverter() {
    JwtGrantedAuthoritiesConverter roles = new JwtGrantedAuthoritiesConverter();
    roles.setAuthoritiesClaimName("role");
    roles.setAuthorityPrefix("ROLE_");
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(roles);
    return converter;
}
```

Then `http.oauth2ResourceServer(o -> o.jwt(Customizer.withDefaults()))`, authorize with
`hasRole('ENSEIGNANT')` etc., and read the caller with `UUID.fromString(jwt.getSubject())`.

**Never trust an id sent by the client for the caller's own identity.** The Request Service sets
`demande.etudiantId = sub`. The Grade Service sets `note.enseignantId = sub`. The Announcement
Service sets `annonce.auteurId = sub`.

## 5. Limits of this model

- **Revocation.** The User Service rejects a token immediately after a suspension, a role change
  or a password change, because it re-reads the user on every request. Your service only checks
  the signature, so it keeps accepting such a token until it expires (at most 1 hour). Keep
  `JWT_ACCESS_TOKEN_TTL` short if that matters.
- **Shared secret.** Every service holding `JWT_SECRET` could also *create* tokens. Treat it as a
  credential, given only to CampusHub services. Moving to RS256 with a published public key would
  remove this.
- **Other users.** The User Service doesn't yet expose an endpoint for looking up *another* user
  (e.g. checking that an `etudiantId` is really a student). When a service needs it, add a small
  read-only endpoint returning `{id, nom, prenom, role, matricule}`, restricted to the roles that
  need it, and call it while forwarding the caller's token. Don't copy the user table.

## 6. User Service API (summary)

| Method & path                            | Access    |
|------------------------------------------|-----------|
| `POST /api/v1/auth/register`             | public (creates a pending ETUDIANT) |
| `POST /api/v1/auth/login`                | public    |
| `GET` / `PUT /api/v1/users/me`, `PUT /api/v1/users/me/password` | any role |
| `GET /api/v1/admin/users`, `GET /api/v1/admin/users/{id}`, `POST /api/v1/admin/users`, `PUT /api/v1/admin/users/{id}` | ADMIN |
| `PATCH /api/v1/admin/users/{id}/role`, `/status`, `/approve` | ADMIN |

`UserResponse` (null fields omitted; only the attribute of the user's own role appears):

```json
{ "id": "...", "email": "alice@univ.example", "nom": "Martin", "prenom": "Alice",
  "role": "ETUDIANT", "status": "ACTIVE", "matricule": "ETU20260001",
  "createdAt": "2026-10-15T09:30:00.123456Z" }
```

A teacher has `"specialite"`, an administrator `"service"`.
