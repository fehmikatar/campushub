namespace EvaluationService.Clients;

// Appel synchrone vers course-service (règles communes CampusHub).
public interface ICourseClient
{
    // Vérifie que le cours existe. Le header Authorization d'origine est transmis tel quel.
    // Lève CourseNotFoundException, CourseAccessDeniedException ou CourseServiceUnavailableException.
    Task EnsureCourseExistsAsync(int courseId, string? authorizationHeader, CancellationToken cancellationToken = default);
}
