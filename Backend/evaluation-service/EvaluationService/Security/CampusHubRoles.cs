namespace EvaluationService.Security;

// Rôles du contrat d'identité CampusHub (une seule chaîne par "role", sans préfixe ROLE_).
public static class CampusHubRoles
{
    public const string Etudiant = "ETUDIANT";
    public const string Enseignant = "ENSEIGNANT";
    public const string Admin = "ADMIN";

    // Valeurs utilisables dans [Authorize(Roles = ...)].
    public const string EnseignantOuAdmin = Enseignant + "," + Admin;
}
