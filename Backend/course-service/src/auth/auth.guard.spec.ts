import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SignJWT } from 'jose';
import { JwtAuthGuard, RolesGuard } from './auth.guard.js';
import { Role } from './auth.js';

const SECRET = 'secret-de-test-au-moins-32-octets-de-long';
const SUB = '3f2a9c1e-7b4d-4e6a-9d21-5c8b0a1f2e34';

function token(o: { role?: string; sub?: string; iss?: string; secret?: string; exp?: string } = {}) {
  return new SignJWT({ role: o.role ?? Role.ENSEIGNANT })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(o.sub ?? SUB)
    .setIssuer(o.iss ?? 'campushub-user-service')
    .setExpirationTime(o.exp ?? '1h')
    .sign(new TextEncoder().encode(o.secret ?? SECRET));
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

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();
  const verifier = (authorization?: string) => {
    const req: { headers: object; user?: unknown } = { headers: { authorization } };
    return guard.canActivate(contexte(req)).then(() => req.user);
  };

  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
    delete process.env.JWT_ISSUER;
  });

  it('accepte un token valide et expose sub et role', async () => {
    expect(await verifier(`Bearer ${await token()}`)).toEqual({ id: SUB, role: Role.ENSEIGNANT });
  });

  it('refuse (401) sans token ou sans schema Bearer', async () => {
    await expect(verifier()).rejects.toThrow(UnauthorizedException);
    await expect(verifier(await token())).rejects.toThrow(UnauthorizedException);
  });

  it('refuse (401) un mauvais secret, un mauvais issuer ou un token expire', async () => {
    const autreSecret = await token({ secret: 'un-autre-secret-de-test-de-32-octets-mini' });
    await expect(verifier(`Bearer ${autreSecret}`)).rejects.toThrow('Token invalide');
    await expect(verifier(`Bearer ${await token({ iss: 'autre-service' })}`)).rejects.toThrow('Token invalide');
    await expect(verifier(`Bearer ${await token({ exp: '-1h' })}`)).rejects.toThrow('Token expire');
  });

  it('refuse (401) un role inconnu ou un sub qui n\'est pas un UUID', async () => {
    await expect(verifier(`Bearer ${await token({ role: 'DIRECTEUR' })}`)).rejects.toThrow(UnauthorizedException);
    await expect(verifier(`Bearer ${await token({ sub: '42' })}`)).rejects.toThrow(UnauthorizedException);
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
