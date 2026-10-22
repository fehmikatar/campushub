namespace EvaluationService.Errors;

// Erreur de validation rattachée à un champ de la requête.
public sealed record FieldError(string Field, string Message);

// Format d'erreur commun à tous les services CampusHub.
// Sérialisé en camelCase par ASP.NET : timestamp, status, code, message, fieldErrors.
public sealed record ApiError(
    string Timestamp,
    int Status,
    string Code,
    string Message,
    IReadOnlyList<FieldError> FieldErrors);
