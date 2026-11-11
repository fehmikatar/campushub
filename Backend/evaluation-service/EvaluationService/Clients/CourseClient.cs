using System.Net;
using Microsoft.Extensions.Configuration;
using Steeltoe.Common.Discovery;

namespace EvaluationService.Clients;

// Client HTTP synchrone vers course-service.
// URL : COURSE_SERVICE_URL si renseignée, sinon résolution Eureka par nom.
// Délai maximal de 3 s, un seul essai (aucun retry).
public sealed class CourseClient : ICourseClient
{
    public const string ServiceName = "course-service";
    public static readonly TimeSpan Timeout = TimeSpan.FromSeconds(3);

    private const string BaseUrlConfigurationKey = "COURSE_SERVICE_URL";

    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;
    private readonly IDiscoveryClient _discoveryClient;
    private readonly ILogger<CourseClient> _logger;

    public CourseClient(
        HttpClient httpClient,
        IConfiguration configuration,
        IDiscoveryClient discoveryClient,
        ILogger<CourseClient> logger)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _discoveryClient = discoveryClient;
        _logger = logger;
    }

    public async Task EnsureCourseExistsAsync(
        int courseId,
        string? authorizationHeader,
        CancellationToken cancellationToken = default)
    {
        // Le délai de 3 s couvre la résolution et l'appel HTTP.
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(Timeout);
        var token = timeoutCts.Token;

        try
        {
            var baseAddress = await ResolveBaseAddressAsync(token);

            using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(baseAddress, $"courses/{courseId}"));

            // Le token de l'utilisateur d'origine est transmis tel quel : aucun token technique.
            if (!string.IsNullOrWhiteSpace(authorizationHeader))
            {
                request.Headers.TryAddWithoutValidation("Authorization", authorizationHeader);
            }

            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, token);

            if (response.IsSuccessStatusCode)
            {
                return;
            }

            _logger.LogWarning(
                "Course service answered {StatusCode} for course {CourseId}",
                (int)response.StatusCode,
                courseId);

            switch (response.StatusCode)
            {
                case HttpStatusCode.NotFound:
                    throw new CourseNotFoundException();
                case HttpStatusCode.Unauthorized:
                case HttpStatusCode.Forbidden:
                    throw new CourseAccessDeniedException(response.StatusCode);
                default:
                    throw new CourseServiceUnavailableException();
            }
        }
        catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Course service call timed out after {TimeoutSeconds} s", Timeout.TotalSeconds);
            throw new CourseServiceUnavailableException(ex);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Course service is unreachable");
            throw new CourseServiceUnavailableException(ex);
        }
    }

    private async Task<Uri> ResolveBaseAddressAsync(CancellationToken cancellationToken)
    {
        // En Docker, COURSE_SERVICE_URL remplace Eureka.
        var configuredUrl = _configuration[BaseUrlConfigurationKey];
        if (!string.IsNullOrWhiteSpace(configuredUrl))
        {
            if (!Uri.TryCreate(configuredUrl.TrimEnd('/') + "/", UriKind.Absolute, out var configuredBaseAddress))
            {
                _logger.LogError("{ConfigurationKey} is not a valid absolute URL", BaseUrlConfigurationKey);
                throw new CourseServiceUnavailableException();
            }

            return configuredBaseAddress;
        }

        IList<IServiceInstance> instances;
        try
        {
            instances = await _discoveryClient.GetInstancesAsync(ServiceName, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Eureka lookup failed for {ServiceName}", ServiceName);
            throw new CourseServiceUnavailableException(ex);
        }

        var instance = instances?.FirstOrDefault();
        if (instance is null)
        {
            _logger.LogWarning("{ServiceName} has no instance registered in Eureka", ServiceName);
            throw new CourseServiceUnavailableException();
        }

        return instance.Uri;
    }
}
