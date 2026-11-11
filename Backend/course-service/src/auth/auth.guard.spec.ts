import {
  ExecutionContext, ForbiddenException, ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { JwtAuthGuard, RolesGuard } from './auth.guard.js';
import { Role } from './auth.js';

const SUB = '3f2a9c1e-7b4d-4e6a-9d21-5c8b0a1f2e34';
const KEYCLOAK_ISSUER = 'http://localhost:8180/realms/campushub';
type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let keycloakPrivateKey: PrivateKey;
let keycloakJwks: { keys: object[] };
let jwksRequest = 0;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  keycloakPrivateKey = privateKey;
  keycloakJwks = {
    keys: [{ ...publicJwk, kid: 'test-key', use: 'sig', alg: 'RS256' }],
  };
});

// Helper pour creer un token HS256 (mode legacy)
function legacyToken(o: { role?: string; sub?: string; iss?: string; secret?: string; exp?: string } = {}) {
  const SECRET = 'secret-de-test-au-moins-32-octets-de-long';
  return new SignJWT({ role: o.role ?? Role.ENSEIGNANT })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(o.sub ?? SUB)
    .setIssuer(o.iss ?? 'campushub-user-service')
    .setExpirationTime(o.exp ?? '1h')
    .sign(new TextEncoder().encode(o.secret ?? SECRET));
}

async function keycloakToken(
  o: { roles?: string[]; sub?: string; iss?: string; exp?: string; kid?: string; privateKey?: PrivateKey } = {},
) {
  const token = await new SignJWT({
    sub: o.sub ?? SUB,
    realm_access: { roles: o.roles ?? ['ENSEIGNANT'] },
  })
    .setProtectedHeader({ alg: 'RS256', kid: o.kid ?? 'test-key' })
    .setIssuer(o.iss ?? KEYCLOAK_ISSUER)
    .setExpirationTime(o.exp ?? '1h')
    .sign(o.privateKey ?? keycloakPrivateKey);
  return token;
}

function contexte(req: object, roles?: Role[]) {
  const handler = () => undefined;
  if (roles) Reflect.defineMetadata('roles', roles, handler);
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard - Mode Legacy (HS256)', () => {
  const guard = new JwtAuthGuard();
  const verifier = (authorization?: string) => {
    const req: { headers: object; user?: unknown } = { headers: { authorization } };
    return guard.canActivate(contexte(req)).then(() => req.user);
  };

  beforeAll(() => {
    process.env.JWT_SECRET = 'secret-de-test-au-moins-32-octets-de-long';
    delete process.env.JWT_ISSUER;
    delete process.env.KEYCLOAK_ISSUER_URI;
  });

  it('accepte un token valide et expose sub et role', async () => {
    expect(await verifier(`Bearer ${await legacyToken()}`)).toEqual({ id: SUB, role: Role.ENSEIGNANT });
  });

  it('refuse (401) sans token ou sans schema Bearer', async () => {
    await expect(verifier()).rejects.toThrow(UnauthorizedException);
    await expect(verifier(await legacyToken())).rejects.toThrow(UnauthorizedException);
  });

  it('refuse (401) un mauvais secret, un mauvais issuer ou un token expire', async () => {
    const autreSecret = await legacyToken({ secret: 'un-autre-secret-de-test-de-32-octets-mini' });
    await expect(verifier(`Bearer ${autreSecret}`)).rejects.toThrow('Token invalide');
    await expect(verifier(`Bearer ${await legacyToken({ iss: 'autre-service' })}`)).rejects.toThrow('Token invalide');
    await expect(verifier(`Bearer ${await legacyToken({ exp: '-1h' })}`)).rejects.toThrow('Token expire');
  });

  it('refuse (401) un role inconnu ou un sub qui n\'est pas un UUID', async () => {
    await expect(verifier(`Bearer ${await legacyToken({ role: 'DIRECTEUR' })}`)).rejects.toThrow(UnauthorizedException);
    await expect(verifier(`Bearer ${await legacyToken({ sub: '42' })}`)).rejects.toThrow(UnauthorizedException);
  });
});

describe('JwtAuthGuard - Mode Keycloak (RS256)', () => {
  const verify = async (token: string) => {
    const req: { headers: object; user?: unknown } = {
      headers: { authorization: `Bearer ${token}` },
    };
    await new JwtAuthGuard().canActivate(contexte(req));
    return req.user;
  };

  beforeEach(() => {
    process.env.KEYCLOAK_ISSUER_URI = KEYCLOAK_ISSUER;
    process.env.KEYCLOAK_JWKS_URI = `http://keycloak.test/jwks/${++jwksRequest}`;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(keycloakJwks), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(() => {
    delete process.env.KEYCLOAK_ISSUER_URI;
    delete process.env.KEYCLOAK_JWKS_URI;
  });

  it('refuse (401) sans token', async () => {
    const req: { headers: object; user?: unknown } = { headers: {} };
    await expect(new JwtAuthGuard().canActivate(contexte(req))).rejects.toThrow(UnauthorizedException);
  });

  it('refuse (401) token HS256 en mode Keycloak', async () => {
    await expect(verify(await legacyToken())).rejects.toThrow(UnauthorizedException);
  });

  it('accepte un token valide et choisit le role CampusHub le plus eleve', async () => {
    const token = await keycloakToken({ roles: ['ETUDIANT', 'ADMIN', 'offline_access'] });
    await expect(verify(token)).resolves.toEqual({ id: SUB, role: Role.ADMIN });
  });

  it('refuse (401) signature invalide, issuer incorrect, expiration et kid inconnu', async () => {
    const otherPair = await generateKeyPair('RS256');
    await expect(verify(await keycloakToken({ privateKey: otherPair.privateKey })))
      .rejects.toThrow(UnauthorizedException);
    await expect(verify(await keycloakToken({ iss: 'https://other.example/realm' })))
      .rejects.toThrow(UnauthorizedException);
    await expect(verify(await keycloakToken({ exp: '-1h' })))
      .rejects.toThrow('Token expire');
    await expect(verify(await keycloakToken({ kid: 'unknown-key' })))
      .rejects.toThrow(UnauthorizedException);
  });

  it('refuse (401) un sub qui n’est pas un UUID', async () => {
    await expect(verify(await keycloakToken({ sub: '42' })))
      .rejects.toThrow(UnauthorizedException);
  });

  it('retourne (403) si le token valide ne contient aucun role CampusHub', async () => {
    await expect(verify(await keycloakToken({ roles: ['offline_access', 'uma_authorization'] })))
      .rejects.toThrow(ForbiddenException);
  });

  it('retourne (503) si le JWKS Keycloak est injoignable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(verify(await keycloakToken())).rejects.toThrow(ServiceUnavailableException);
  });

  it('derive l’URL JWKS de l’issuer si KEYCLOAK_JWKS_URI est vide', async () => {
    process.env.KEYCLOAK_JWKS_URI = '';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(keycloakJwks), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await verify(await keycloakToken());

    expect(fetchMock).toHaveBeenCalledWith(
      `${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`,
      expect.any(Object),
    );
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const user = (role: Role) => ({ user: { id: SUB, role } });

  it('laisse passer une route sans @Roles', () => {
    expect(guard.canActivate(contexte(user(Role.ETUDIANT)))).toBe(true);
  });

  it('laisse passer un role autorise', () => {
    expect(guard.canActivate(contexte(user(Role.ADMIN), [Role.ENSEIGNANT, Role.ADMIN]))).toBe(true);
  });

  it('refuse (403) un role insuffisant', () => {
    expect(() => guard.canActivate(contexte(user(Role.ETUDIANT), [Role.ENSEIGNANT, Role.ADMIN])))
      .toThrow(ForbiddenException);
  });
});

