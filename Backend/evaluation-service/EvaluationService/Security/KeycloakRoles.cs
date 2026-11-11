namespace EvaluationService.Security;

// Rôles CampusHub portés par Keycloak dans realm_access.roles.
// Si plusieurs rôles sont présents, on garde le plus élevé : ADMIN > ENSEIGNANT > ETUDIANT.
public static class KeycloakRoles
{
    public static string? GetHighest(IEnumerable<string>? realmRoles)
    {
        if (realmRoles is null)
        {
            return null;
        }

        var roles = realmRoles as ISet<string> ?? new HashSet<string>(realmRoles, StringComparer.Ordinal);

        if (roles.Contains(CampusHubRoles.Admin))
        {
            return CampusHubRoles.Admin;
        }

        if (roles.Contains(CampusHubRoles.Enseignant))
        {
            return CampusHubRoles.Enseignant;
        }

        if (roles.Contains(CampusHubRoles.Etudiant))
        {
            return CampusHubRoles.Etudiant;
        }

        return null;
    }
}
