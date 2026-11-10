using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using EvaluationService.Data;
using EvaluationService.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace EvaluationService.Tests;

// Clé RSA de test : sert à signer les tokens et à publier la JWKS simulée.
internal sealed class TestSigningKey(string keyId = "kid-1")
{
    private readonly RSA _rsa = RSA.Create(2048);

    public string KeyId { get; } = keyId;

    public RsaSecurityKey SecurityKey => new(_rsa) { KeyId = KeyId };

    public string JwksJson => $$"""{"keys":[{{BuildJwk()}}]}""";

    private string BuildJwk()
    {
        var parameters = _rsa.ExportParameters(includePrivateParameters: false);

        return JsonSerializer.Serialize(new Dictionary<string, string>
        {
            ["kty"] = "RSA",
            ["use"] = "sig",
            ["alg"] = "RS256",
            ["kid"] = KeyId,
            ["n"] = Base64UrlEncoder.Encode(parameters.Modulus),
            ["e"] = Base64UrlEncoder.Encode(parameters.Exponent)
        });
    }
}

internal static class TestTokens
{
    public const string Issuer = "http://localhost:8180/realms/campushub";
    public const string JwksUri = Issuer + "/protocol/openid-connect/certs";
    public const string Sub = "11111111-1111-4111-8111-111111111111";

    public static string Create(
        TestSigningKey key,
        string[] realmRoles,
        string? issuer = null,
        string? sub = null,
        DateTime? expires = null)
    {
        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = issuer ?? Issuer,
            Subject = new ClaimsIdentity([new Claim("sub", sub ?? Sub)]),
            Claims = RealmAccess(realmRoles),
            NotBefore = (expires ?? DateTime.UtcNow).AddMinutes(-10),
            Expires = expires ?? DateTime.UtcNow.AddMinutes(5),
            SigningCredentials = new SigningCredentials(key.SecurityKey, SecurityAlgorithms.RsaSha256)
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }

    public static string CreateHs256(string[] realmRoles)
    {
        var secret = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("campushub-hs256-test-secret-0123456789"));

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = Issuer,
            Subject = new ClaimsIdentity([new Claim("sub", Sub)]),
            Claims = RealmAccess(realmRoles),
            NotBefore = DateTime.UtcNow.AddMinutes(-10),
            Expires = DateTime.UtcNow.AddMinutes(5),
            SigningCredentials = new SigningCredentials(secret, SecurityAlgorithms.HmacSha256)
        };

        return new JsonWebTokenHandler().CreateToken(descriptor);
    }

    private static Dictionary<string, object> RealmAccess(string[] realmRoles) => new()
    {
        ["realm_access"] = new Dictionary<string, object> { ["roles"] = realmRoles }
    };
}

// Faux Keycloak : sert la JWKS (ou simule une panne).
internal sealed class StubJwksHandler : HttpMessageHandler
{
    private readonly Func<HttpResponseMessage> _respond;

    public StubJwksHandler(string jwksJson) : this(() => new HttpResponseMessage(HttpStatusCode.OK)
    {
        Content = new StringContent(jwksJson, Encoding.UTF8, "application/json")
    })
    {
    }

    public StubJwksHandler(Exception exception) : this(() => throw exception)
    {
    }

    private StubJwksHandler(Func<HttpResponseMessage> respond) => _respond = respond;

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        => Task.FromResult(_respond());
}

// Hôte de test : mode Keycloak, Keycloak simulé, base InMemory, Eureka désactivée.
internal sealed class EvaluationApiFactory : WebApplicationFactory<Program>
{
    private readonly StubJwksHandler _jwksHandler;
    private readonly string _databaseName = Guid.NewGuid().ToString();

    static EvaluationApiFactory()
    {
        Environment.SetEnvironmentVariable(KeycloakAuthentication.IssuerConfigurationKey, TestTokens.Issuer);
        Environment.SetEnvironmentVariable(KeycloakAuthentication.JwksConfigurationKey, TestTokens.JwksUri);
        Environment.SetEnvironmentVariable("Eureka__Client__Enabled", "false");
    }

    public EvaluationApiFactory(StubJwksHandler jwksHandler) => _jwksHandler = jwksHandler;

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<AppDbContext>();
            services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
            services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(_databaseName));

            // Remplace les clés publiques par le faux Keycloak (aucun réseau réel).
            // Configure nommé : les options JwtBearer sont enregistrées sous le nom du schéma.
            services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
                .Configure<IServiceProvider>((options, provider) =>
                    options.ConfigurationManager = KeycloakAuthentication.CreateJwksConfigurationManager(
                        TestTokens.JwksUri,
                        _jwksHandler,
                        provider.GetService<IHttpContextAccessor>()));
        });
    }
}

internal static class HttpTestExtensions
{
    public static async Task<HttpResponseMessage> CallAsync(
        this HttpClient client,
        HttpMethod method,
        string path,
        string? token = null)
    {
        using var request = new HttpRequestMessage(method, path);
        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return await client.SendAsync(request);
    }
}
