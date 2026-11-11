import {
  CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable,
  ServiceUnavailableException, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import { AuthUser, Role, ROLES_KEY } from './auth.js';

export const JWT_ISSUER_DEFAUT = 'campushub-user-service';

// Verrouille le JWKS en memoire pour eviter les fetches repetes
let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUriCache: string | null = null;

// Determine si on est en mode Keycloak (RS256) ou legacy (HS256)
function isKeycloakMode(): boolean {
  return !!process.env.KEYCLOAK_ISSUER_URI;
}

// Retourne le JWKS remote avec cache (createRemoteJWKSet gere le cache interne ~10min)
function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  const issuer = process.env.KEYCLOAK_ISSUER_URI!;
  const jwksUri = process.env.KEYCLOAK_JWKS_URI?.trim()
    || `${issuer.replace(/\/+$/, '')}/protocol/openid-connect/certs`;

  if (cachedJWKS && jwksUriCache === jwksUri) return cachedJWKS;

  cachedJWKS = createRemoteJWKSet(new URL(jwksUri), {
    cacheMaxAge: 600_000,
  });
  jwksUriCache = jwksUri;
  return cachedJWKS;
}

// Extrait le role CampusHub le plus eleve depuis realm_access.roles
function extractCampusHubRole(payload: Record<string, unknown>): Role | null {
  const realmAccess = payload.realm_access;
  if (!realmAccess || typeof realmAccess !== 'object') return null;
  const roles = (realmAccess as { roles?: unknown }).roles;
  if (!Array.isArray(roles)) return null;

  // Hierarchie : ADMIN > ENSEIGNANT > ETUDIANT
  if (roles.includes('ADMIN')) return Role.ADMIN;
  if (roles.includes('ENSEIGNANT')) return Role.ENSEIGNANT;
  if (roles.includes('ETUDIANT')) return Role.ETUDIANT;
  return null;
}

// Meme contrat que les autres services :
// - Mode Keycloak : RS256, JWKS, issuer = KEYCLOAK_ISSUER_URI, role dans realm_access.roles
// - Mode Legacy   : HS256, JWT_SECRET, issuer = JWT_ISSUER, role dans claim "role"
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const [scheme, token] = String(req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Token manquant');

    try {
      const keycloakMode = isKeycloakMode();
      let payload: Record<string, unknown>;

      if (keycloakMode) {
        // Mode Keycloak : RS256 + JWKS
        const jwks = getJWKS();
        const { payload: verified } = await jwtVerify(token, jwks, {
          algorithms: ['RS256'],
          issuer: process.env.KEYCLOAK_ISSUER_URI,
        });
        payload = verified;
      } else {
        // Mode Legacy : HS256 + secret partage
        const { payload: verified } = await jwtVerify(
          token,
          new TextEncoder().encode(process.env.JWT_SECRET ?? ''),
          { algorithms: ['HS256'], issuer: process.env.JWT_ISSUER || JWT_ISSUER_DEFAUT },
        );
        payload = verified;
      }

      const { sub } = payload;
      const role = keycloakMode
        ? extractCampusHubRole(payload)
        : (payload.role as Role);

      if (typeof sub !== 'string' || !isUUID(sub)) {
        throw new UnauthorizedException('Token invalide');
      }
      if (keycloakMode && !role) throw new ForbiddenException('Aucun role CampusHub');
      if (!role || !Object.values(Role).includes(role)) throw new UnauthorizedException('Token invalide');

      req.user = { id: sub, role } satisfies AuthUser;
      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;

      const jwksUnavailable = err instanceof TypeError
        || err instanceof errors.JWKSTimeout
        || err instanceof errors.JWKSInvalid
        || (err instanceof errors.JOSEError && err.code === 'ERR_JOSE_GENERIC');
      if (isKeycloakMode() && jwksUnavailable) {
        throw new ServiceUnavailableException('Service d\'authentification indisponible');
      }

      throw new UnauthorizedException(
        err instanceof errors.JWTExpired ? 'Token expire' : 'Token invalide',
      );
    }
  }
}

// S'execute apres JwtAuthGuard : verifie le role exige par @Roles(...)
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Acces interdit');
    return true;
  }
}
