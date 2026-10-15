using System.Security.Claims;

namespace EvaluationService.Security;

// Accès aux claims du token (seule source d'identité fiable : les headers envoyés par le client sont ignorés).
public static class ClaimsPrincipalExtensions
{
    public const string SubClaim = "sub";
    public const string RoleClaim = "role";

    // Id de l'utilisateur authentifié ("sub", un Guid garanti par la validation du token).
    public static Guid GetUserId(this ClaimsPrincipal user)
        => Guid.Parse(user.FindFirst(SubClaim)!.Value);

    public static string? GetRole(this ClaimsPrincipal user)
        => user.FindFirst(RoleClaim)?.Value;

    public static bool IsAdmin(this ClaimsPrincipal user)
        => user.GetRole() == CampusHubRoles.Admin;

    public static bool IsEnseignant(this ClaimsPrincipal user)
        => user.GetRole() == CampusHubRoles.Enseignant;

    public static bool IsEnseignantOrAdmin(this ClaimsPrincipal user)
        => user.IsEnseignant() || user.IsAdmin();
}
