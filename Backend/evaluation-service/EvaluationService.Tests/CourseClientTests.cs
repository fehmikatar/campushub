using System.Net;
using EvaluationService.Clients;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace EvaluationService.Tests;

public class CourseClientTests
{
    private const string AuthorizationHeader = "Bearer header.payload.signature";

    private static CourseClient CreateClient(
        HttpMessageHandler handler,
        string? configuredUrl = "http://course.local:8082",
        FakeDiscoveryClient? discovery = null,
        TimeSpan? timeout = null)
    {
        var settings = new Dictionary<string, string?>();
        if (configuredUrl is not null)
        {
            settings["COURSE_SERVICE_URL"] = configuredUrl;
        }

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();
        var httpClient = new HttpClient(handler) { Timeout = timeout ?? TimeSpan.FromSeconds(3) };

        return new CourseClient(
            httpClient,
            configuration,
            discovery ?? new FakeDiscoveryClient(),
            NullLogger<CourseClient>.Instance);
    }

    [Fact]
    public async Task EnsureCourseExists_WhenCourseAnswers200_ReturnsAndForwardsAuthorization()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.OK);
        var client = CreateClient(handler);

        await client.EnsureCourseExistsAsync(42, AuthorizationHeader);

        Assert.Equal(1, handler.Calls);
        Assert.Equal(HttpMethod.Get, handler.LastRequest!.Method);
        Assert.Equal("http://course.local:8082/courses/42", handler.LastRequest.RequestUri!.ToString());
        Assert.Equal(AuthorizationHeader, handler.LastRequest.Headers.Authorization!.ToString());
    }

    [Fact]
    public async Task EnsureCourseExists_WhenNoConfiguredUrl_ResolvesCourseServiceFromEureka()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.OK);
        var discovery = new FakeDiscoveryClient(new FakeServiceInstance("courses-host", 8082));
        var client = CreateClient(handler, configuredUrl: null, discovery: discovery);

        await client.EnsureCourseExistsAsync(7, AuthorizationHeader);

        Assert.Equal(1, discovery.GetInstancesCalls);
        Assert.Equal("http://courses-host:8082/courses/7", handler.LastRequest!.RequestUri!.ToString());
    }

    [Fact]
    public async Task EnsureCourseExists_WhenCourseAnswers404_ThrowsCourseNotFound()
    {
        var client = CreateClient(new StubHttpMessageHandler(HttpStatusCode.NotFound));

        await Assert.ThrowsAsync<CourseNotFoundException>(
            () => client.EnsureCourseExistsAsync(42, AuthorizationHeader));
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    public async Task EnsureCourseExists_WhenCourseAnswers401Or403_ThrowsAccessDeniedWithSameStatus(
        HttpStatusCode statusCode)
    {
        var client = CreateClient(new StubHttpMessageHandler(statusCode));

        var exception = await Assert.ThrowsAsync<CourseAccessDeniedException>(
            () => client.EnsureCourseExistsAsync(42, AuthorizationHeader));

        Assert.Equal(statusCode, exception.StatusCode);
    }

    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.BadGateway)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    public async Task EnsureCourseExists_WhenCourseAnswers5xx_ThrowsUnavailableWithoutRetry(
        HttpStatusCode statusCode)
    {
        var handler = new StubHttpMessageHandler(statusCode);
        var client = CreateClient(handler);

        await Assert.ThrowsAsync<CourseServiceUnavailableException>(
            () => client.EnsureCourseExistsAsync(42, AuthorizationHeader));

        Assert.Equal(1, handler.Calls); // un seul essai
    }

    [Fact]
    public async Task EnsureCourseExists_WhenConnectionIsRefused_ThrowsUnavailable()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromException<HttpResponseMessage>(new HttpRequestException("Connection refused")));
        var client = CreateClient(handler);

        await Assert.ThrowsAsync<CourseServiceUnavailableException>(
            () => client.EnsureCourseExistsAsync(42, AuthorizationHeader));
    }

    [Fact]
    public async Task EnsureCourseExists_WhenCallExceedsTimeout_ThrowsUnavailable()
    {
        var handler = new StubHttpMessageHandler(async (_, cancellationToken) =>
        {
            await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK);
        });
        var client = CreateClient(handler, timeout: TimeSpan.FromMilliseconds(100));

        var exception = await Record.ExceptionAsync(
            () => client.EnsureCourseExistsAsync(42, AuthorizationHeader));

        Assert.IsType<CourseServiceUnavailableException>(exception);
    }

    [Fact]
    public async Task EnsureCourseExists_WhenEurekaHasNoInstance_ThrowsUnavailableWithoutCallingCourse()
    {
        var handler = new StubHttpMessageHandler(HttpStatusCode.OK);
        var discovery = new FakeDiscoveryClient();
        var client = CreateClient(handler, configuredUrl: null, discovery: discovery);

        await Assert.ThrowsAsync<CourseServiceUnavailableException>(
            () => client.EnsureCourseExistsAsync(42, AuthorizationHeader));

        Assert.Equal(0, handler.Calls);
    }
}
