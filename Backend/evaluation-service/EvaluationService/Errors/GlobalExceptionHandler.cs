using EvaluationService.Security;
using Microsoft.AspNetCore.Diagnostics;

namespace EvaluationService.Errors;

// Dernier rempart : journalise l'exception côté serveur et renvoie un 500 CampusHub générique.
// Exception : Keycloak injoignable (clé inconnue du cache) -> 503, jamais 500.
public sealed class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger,
    IConfiguration configuration) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        if (KeycloakAuthentication.IsEnabled(configuration) && KeycloakAuthentication.IsUnavailable(exception))
        {
            logger.LogWarning(
                exception,
                "Keycloak unavailable while processing {Method} {Path}",
                httpContext.Request.Method,
                httpContext.Request.Path);

            if (httpContext.Response.HasStarted)
            {
                return false;
            }

            await ApiErrorWriter.WriteAsync(
                httpContext,
                ApiErrorFactory.ServiceUnavailable(KeycloakAuthentication.UnavailableMessage));
            return true;
        }

        logger.LogError(
            exception,
            "Unhandled exception while processing {Method} {Path}",
            httpContext.Request.Method,
            httpContext.Request.Path);

        if (httpContext.Response.HasStarted)
        {
            return false;
        }

        await ApiErrorWriter.WriteAsync(httpContext, ApiErrorFactory.InternalServerError());
        return true;
    }
}
