import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

// Roles du User Service (claim "role" du JWT)
export enum Role {
  ETUDIANT = 'ETUDIANT',
  ENSEIGNANT = 'ENSEIGNANT',
  ADMIN = 'ADMIN',
}

// Utilisateur connecte, lu dans le JWT : id = claim "sub" (UUID)
export interface AuthUser {
  id: string;
  role: Role;
}

export const ROLES_KEY = 'roles';

// Restreint une route (ou un controleur) a certains roles : sinon 403
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
