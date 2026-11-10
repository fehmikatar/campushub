import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { errors, jwtVerify } from 'jose';
import { AuthUser, Role, ROLES_KEY } from './auth.js';

export const JWT_ISSUER_DEFAUT = 'campushub-user-service';

// Meme contrat que les autres services : HS256, secret partage avec le User Service
// (chaine UTF-8 brute), issuer verifie, claims "sub" (UUID) et "role".
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const [scheme, token] = String(req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Token manquant');

    try {
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.JWT_SECRET ?? ''),
        { algorithms: ['HS256'], issuer: process.env.JWT_ISSUER || JWT_ISSUER_DEFAUT },
      );
      const { sub } = payload;
      const role = payload.role as Role;
      if (typeof sub !== 'string' || !isUUID(sub) || !Object.values(Role).includes(role)) {
        throw new UnauthorizedException('Token invalide');
      }
      req.user = { id: sub, role } satisfies AuthUser;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
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
