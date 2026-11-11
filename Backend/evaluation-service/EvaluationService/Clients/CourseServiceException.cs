using System.Net;

namespace EvaluationService.Clients;

// Erreur métier remontée par l'appel synchrone vers course-service.
public abstract class CourseServiceException : Exception
{
    protected CourseServiceException(string message) : base(message)
    {
    }

    protected CourseServiceException(string message, Exception innerException) : base(message, innerException)
    {
    }
}

// 404 : le cours n'existe pas (ou n'est pas visible pour cet utilisateur).
public sealed class CourseNotFoundException : CourseServiceException
{
    public CourseNotFoundException() : base("Course not found.")
    {
    }
}

// 401 / 403 renvoyé par course-service : le statut est relayé tel quel au client.
public sealed class CourseAccessDeniedException : CourseServiceException
{
    public CourseAccessDeniedException(HttpStatusCode statusCode)
        : base($"Course service rejected the call ({(int)statusCode}).")
    {
        StatusCode = statusCode;
    }

    public HttpStatusCode StatusCode { get; }
}

// Timeout, connexion refusée, instance absente d'Eureka ou 5xx : service indisponible.
public sealed class CourseServiceUnavailableException : CourseServiceException
{
    public CourseServiceUnavailableException() : base("Course service is unavailable.")
    {
    }

    public CourseServiceUnavailableException(Exception innerException)
        : base("Course service is unavailable.", innerException)
    {
    }
}
