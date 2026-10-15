namespace EvaluationService.Errors;

// Écrit une erreur dans la réponse HTTP (utilisé par les événements JwtBearer 401/403).
public static class ApiErrorWriter
{
    public static Task WriteAsync(HttpContext context, ApiError error)
    {
        context.Response.StatusCode = error.Status;
        context.Response.ContentType = "application/json";
        return context.Response.WriteAsJsonAsync(error);
    }
}
