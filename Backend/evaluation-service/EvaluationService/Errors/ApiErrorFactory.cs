namespace EvaluationService.Errors;

// Codes d'erreur partagés avec le User Service.
public static class ErrorCodes
{
    public const string Unauthorized = "UNAUTHORIZED";
    public const string Forbidden = "FORBIDDEN";
    public const string NotFound = "NOT_FOUND";
    public const string ValidationError = "VALIDATION_ERROR";
    public const string Conflict = "CONFLICT";
    public const string InternalServerError = "INTERNAL_SERVER_ERROR";
}

// Construit les erreurs au format CampusHub.
public static class ApiErrorFactory
{
    public static ApiError Unauthorized(string message = "Authentication is required to access this resource")
        => Build(401, ErrorCodes.Unauthorized, message);

    // Message identique à celui du User Service.
    public static ApiError Forbidden(string message = "You do not have permission to perform this operation")
        => Build(403, ErrorCodes.Forbidden, message);

    public static ApiError NotFound(string message = "The requested resource was not found")
        => Build(404, ErrorCodes.NotFound, message);

    public static ApiError Validation(string message = "Validation failed", IReadOnlyList<FieldError>? fieldErrors = null)
        => Build(400, ErrorCodes.ValidationError, message, fieldErrors);

    public static ApiError Conflict(string message = "The request conflicts with the current state of the resource")
        => Build(409, ErrorCodes.Conflict, message);

    // Message volontairement générique : aucun détail technique n'est exposé au client.
    public static ApiError InternalServerError(string message = "An unexpected error occurred")
        => Build(500, ErrorCodes.InternalServerError, message);

    private static ApiError Build(int status, string code, string message, IReadOnlyList<FieldError>? fieldErrors = null)
        => new(
            DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'"),
            status,
            code,
            message,
            fieldErrors ?? Array.Empty<FieldError>());
}
