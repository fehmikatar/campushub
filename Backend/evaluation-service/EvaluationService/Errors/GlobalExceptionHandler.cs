using Microsoft.AspNetCore.Diagnostics;

namespace EvaluationService.Errors;

// Dernier rempart : journalise l'exception côté serveur et renvoie un 500 CampusHub générique.
public sealed class GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
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
