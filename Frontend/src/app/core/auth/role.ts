export type Role = 'ETUDIANT' | 'ENSEIGNANT' | 'ADMIN';

/** Du plus élevé au plus bas : un utilisateur avec plusieurs rôles CampusHub garde le premier. */
export const ROLES_BY_RANK: readonly Role[] = ['ADMIN', 'ENSEIGNANT', 'ETUDIANT'];

export const ROLE_LABELS: Record<Role, string> = {
  ETUDIANT: 'Étudiant',
  ENSEIGNANT: 'Enseignant',
  ADMIN: 'Administrateur',
};

/** Rôle CampusHub le plus élevé ; les autres rôles Keycloak (offline_access, ...) sont ignorés. */
export function highestRole(roles: unknown): Role | null {
  if (!Array.isArray(roles)) {
    return null;
  }
  return ROLES_BY_RANK.find((role) => roles.includes(role)) ?? null;
}
