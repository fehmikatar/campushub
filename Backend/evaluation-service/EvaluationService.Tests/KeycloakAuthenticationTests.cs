using System.Net;
using System.Text.Json;
using Xunit;

namespace EvaluationService.Tests;

public class KeycloakAuthenticationTests
{
    private static readonly string[] StudentRoles =
        ["ETUDIANT", "offline_access", "uma_authorization", "default-roles-campushub"];

    private static EvaluationApiFactory CreateFactory(TestSigningKey key)
        => new(new StubJwksHandler(key.JwksJson));

    [Fact]
    public async Task ValidToken_StudentRole_CanAccessAuthenticatedEndpoint()
    {
        var key = new TestSigningKey();
        using var factory = CreateFactory(key);
        using var client = factory.CreateClient();

        var response = await client.CallAsync(HttpMethod.Get, "/api/resultats/me", TestTokens.Create(key, StudentRoles));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ValidToken_EnseignantRole_CanAccessTeacherEndpoint()
    {
        var key = new TestSigningKey();
        using var factory = CreateFactory(key);
        using var client = factory.CreateClient();

        // Route réservée ENSEIGNANT/ADMIN : le quiz n'existe pas (404) mais le rôle est accepté.
        var response = await client.CallAsync(
            HttpMethod.Get,
            "/api/resultats/quiz/1",
            TestTokens.Create(key, ["ENSEIGNANT", "offline_access"]));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task BadSignature_Returns401()
    {
        var signingKey = new TestSigningKey();
        var otherKey = new TestSigningKey(); // même kid, autre clé
        using var factory = CreateFactory(signingKey);
        using var client = factory.CreateClient();

        var response = await client.CallAsync(
            HttpMethod.Get,
            "/api/resultats/me",
            TestTokens.Create(otherKey, StudentRoles));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ExpiredToken_Returns401()
    {
        var key = new TestSigningKey();
        using var factory = CreateFactory(key);
        using var client = factory.CreateClient();

        var token = TestTokens.Create(key, StudentRoles, expires: DateTime.UtcNow.AddMinutes(-5));

        var response = await client.CallAsync(HttpMethod.Get, "/api/resultats/me", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task WrongIssuer_Returns401()
    {
        var key = new TestSigningKey();
        using var factory = CreateFactory(key);
        using var client = factory.CreateClient();

        var token = TestTokens.Create(key, StudentRoles, issuer: "http://autre/realms/campushub");

        var response = await client.CallAsync(HttpMethod.Get, "/api/resultats/me", token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Hs256Token_Returns401()
    {
        var key = new TestSigningKey();
        using var factory = CreateFactory(key);
        using var client = factory.CreateClient();

        var response = await client.CallAsync(
            HttpMethod.Get,
            "/api/resultats/me",
            TestTokens.CreateHs256(["ADMIN"]));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task MissingOrMalformedToken_Returns401()
    {
        var key = new TestSigningKey();
        using var factory = CreateFactory(key);
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.CallAsync(HttpMethod.Get, "/api/resultats/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.CallAsync(HttpMethod.Get, "/api/resultats/me", "pas.un.jwt")).StatusCode);
    }

    [Fact]
    public async Task ValidTokenWithoutCampusHubRole_Returns403()
    {
        var key = new TestSigningKey();
        using var factory = CreateFactory(key);
        using var client = factory.CreateClient();

        var token = TestTokens.Create(key, ["offline_access", "uma_authorization"]);

        var response = await client.CallAsync(HttpMethod.Get, "/api/quizzes/course/1", token);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task StudentRoleOnTeacherRoute_Returns403()
    {
        var key = new TestSigningKey();
        using var factory = CreateFactory(key);
        using var client = factory.CreateClient();

        var response = await client.CallAsync(
            HttpMethod.Post,
            "/api/quizzes",
            TestTokens.Create(key, StudentRoles));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task KeycloakUnreachable_Returns503_Never500()
    {
        var key = new TestSigningKey("kid-jamais-vu");
        using var factory = new EvaluationApiFactory(new StubJwksHandler(new HttpRequestException("Keycloak down")));
        using var client = factory.CreateClient();

        var response = await client.CallAsync(HttpMethod.Get, "/api/resultats/me", TestTokens.Create(key, StudentRoles));

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);

        var body = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(body);
        Assert.Equal("SERVICE_UNAVAILABLE", document.RootElement.GetProperty("code").GetString());
        Assert.Equal(503, document.RootElement.GetProperty("status").GetInt32());
    }
}
