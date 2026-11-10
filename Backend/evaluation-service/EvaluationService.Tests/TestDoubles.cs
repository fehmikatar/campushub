using System.Net;
using EvaluationService.Clients;
using EvaluationService.Messaging;
using Steeltoe.Common.Discovery;

namespace EvaluationService.Tests;

// Service Course simulé : mémorise l'en-tête Authorization reçu.
internal sealed class StubCourseClient : ICourseClient
{
    public Exception? ExceptionToThrow { get; init; }
    public int Calls { get; private set; }
    public string? AuthorizationHeader { get; private set; }

    public Task EnsureCourseExistsAsync(
        int courseId,
        string? authorizationHeader,
        CancellationToken cancellationToken = default)
    {
        Calls++;
        AuthorizationHeader = authorizationHeader;

        return ExceptionToThrow is null
            ? Task.CompletedTask
            : Task.FromException(ExceptionToThrow);
    }
}

internal sealed class NoOpEventPublisher : IEventPublisher
{
    public Task PublishAsync(
        string eventName,
        Guid actorId,
        object data,
        CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}

// Handler HTTP simulé : aucun réseau réel.
internal sealed class StubHttpMessageHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _handler;

    public StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
        => _handler = handler;

    public StubHttpMessageHandler(HttpStatusCode statusCode)
        => _handler = (_, _) => Task.FromResult(new HttpResponseMessage(statusCode));

    public HttpRequestMessage? LastRequest { get; private set; }
    public int Calls { get; private set; }

    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        Calls++;
        LastRequest = request;
        return _handler(request, cancellationToken);
    }
}

// Registre Eureka simulé : renvoie les instances fournies.
internal sealed class FakeDiscoveryClient : IDiscoveryClient
{
    private readonly IList<IServiceInstance> _instances;

    public FakeDiscoveryClient(params IServiceInstance[] instances)
        => _instances = instances;

    public int GetInstancesCalls { get; private set; }

    public string Description => "Fake discovery client";

#pragma warning disable CS0067 // événement non utilisé par les tests
    public event EventHandler<DiscoveryInstancesFetchedEventArgs>? InstancesFetched;
#pragma warning restore CS0067

    public IServiceInstance? GetLocalServiceInstance() => null;

    public Task<ISet<string>> GetServiceIdsAsync(CancellationToken cancellationToken)
        => Task.FromResult<ISet<string>>(new HashSet<string> { "course-service" });

    public Task<IList<IServiceInstance>> GetInstancesAsync(string serviceId, CancellationToken cancellationToken)
    {
        GetInstancesCalls++;
        return Task.FromResult(_instances);
    }

    public Task ShutdownAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}

internal sealed class FakeServiceInstance : IServiceInstance
{
    public FakeServiceInstance(string host, int port)
    {
        Host = host;
        Port = port;
    }

    public string ServiceId => "course-service";
    public string InstanceId => $"{Host}:{Port}";
    public string Host { get; }
    public int Port { get; }
    public bool IsSecure => false;
    public Uri Uri => new($"http://{Host}:{Port}");
    public Uri NonSecureUri => Uri;
    public Uri SecureUri => new($"https://{Host}:{Port}");
    public IReadOnlyDictionary<string, string?> Metadata => new Dictionary<string, string?>();
}
