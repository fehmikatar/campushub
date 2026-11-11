using System.Security.Claims;
using System.Text.Json;
using EvaluationService.Errors;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace EvaluationService.Security;

// Authentification Keycloak (RS256). Activee quand KEYCLOAK_ISSUER_URI est renseigne ;
// sinon Program.cs conserve l'ancien mode HS256 (transition).
public static class KeycloakAuthentication
{
    public const string IssuerConfigurationKey = "KEYCLOAK_ISSUER_URI";
    public const string JwksConfigurationKey = "KEYCLOAK_JWKS_URI";

    private const string RealmAccessClaim = "realm_access";
    private const string UnavailableItemKey = "KeycloakUnavailable";

    public const string UnavailableMessage = "Authentication service unavailable, please retry later.";

    private static readonly TimeSpan KeyCacheDuration = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan BackchannelTimeout = TimeSpan.FromSeconds(3);

    public static bool IsEnabled(IConfiguration configuration)
        => !string.IsNullOrWhiteSpace(configuration[IssuerConfigurationKey]);

    // Politique des [Authorize] sans rôle explicite : un token valide sans rôle CampusHub est refusé (403).
    public static AuthorizationPolicy DefaultPolicy { get; } = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .RequireClaim(ClaimTypes.Role)
        .Build();

    public static string ResolveJwksUri(IConfiguration configuration)
    {
        var issuer = configuration[IssuerConfigurationKey]!.Trim().TrimEnd('/');
        var jwksUri = configuration[JwksConfigurationKey]?.Trim();

        return string.IsNullOrWhiteSpace(jwksUri)
            ? $"{issuer}/protocol/openid-connect/certs"
            : jwksUri;
    }

    public static void Configure(JwtBearerOptions options, IConfiguration configuration, IHttpContextAccessor? httpContextAccessor = null)
    {
        var issuer = configuration[IssuerConfigurationKey]!.Trim().TrimEnd('/');
        var jwksUri = ResolveJwksUri(configuration);

        options.MapInboundClaims = false;
        options.BackchannelTimeout = BackchannelTimeout;

        // Les clés publiques sont mises en cache ~10 min : pas d'appel Keycloak à chaque requête.
        options.ConfigurationManager = CreateJwksConfigurationManager(jwksUri, httpContextAccessor: httpContextAccessor);

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = issuer,
            ValidateAudience = false, // aud = "account" dans Keycloak : non vérifié
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            ValidateIssuerSigningKey = true,
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            NameClaimType = "sub",
            RoleClaimType = ClaimTypes.Role
        };

        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = OnTokenValidated,
            OnAuthenticationFailed = context =>
            {
                if (IsUnavailable(context.Exception))
                {
                    context.HttpContext.Items[UnavailableItemKey] = true;
                }

                return Task.CompletedTask;
            },
            OnChallenge = async context =>
            {
                context.HandleResponse();

                if (context.HttpContext.Items.ContainsKey(UnavailableItemKey))
                {
                    await ApiErrorWriter.WriteAsync(
                        context.HttpContext,
                        ApiErrorFactory.ServiceUnavailable(UnavailableMessage));
                    return;
                }

                await ApiErrorWriter.WriteAsync(context.HttpContext, ApiErrorFactory.Unauthorized());
            },
            OnForbidden = context => ApiErrorWriter.WriteAsync(context.HttpContext, ApiErrorFactory.Forbidden())
        };
    }

    // Récupère directement la JWKS (pas de document de découverte) : en Docker, l'issuer reste
    // "localhost" alors que les clés sont servies par "keycloak".
    // En cas de panne, la requête en cours est marquée indisponible et une configuration vide est
    // renvoyée : .NET 10 laisse sinon l'exception s'échapper du handler (500) au lieu d'un 503.
    public static IConfigurationManager<OpenIdConnectConfiguration> CreateJwksConfigurationManager(
        string jwksUri,
        HttpMessageHandler? handler = null,
        IHttpContextAccessor? httpContextAccessor = null)
    {
        var httpClient = new HttpClient(handler ?? new HttpClientHandler(), disposeHandler: false)
        {
            Timeout = BackchannelTimeout
        };

        var retriever = new HttpDocumentRetriever(httpClient)
        {
            RequireHttps = new Uri(jwksUri).Scheme == Uri.UriSchemeHttps
        };

        var inner = new ConfigurationManager<OpenIdConnectConfiguration>(jwksUri, new JwksConfigurationRetriever(), retriever)
        {
            RefreshInterval = KeyCacheDuration,
            AutomaticRefreshInterval = KeyCacheDuration
        };

        return new RequiredConfigurationManager(inner, httpContextAccessor);
    }

    private sealed class RequiredConfigurationManager(
        ConfigurationManager<OpenIdConnectConfiguration> inner,
        IHttpContextAccessor? httpContextAccessor) : IConfigurationManager<OpenIdConnectConfiguration>
    {
        public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(CancellationToken cancel)
        {
            try
            {
                var configuration = await inner.GetConfigurationAsync(cancel);
                if (configuration is not null && configuration.SigningKeys.Count > 0)
                {
                    return configuration;
                }
            }
            catch (OperationCanceledException) when (cancel.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception)
            {
                // Keycloak injoignable : traité comme une indisponibilité ci-dessous.
            }

            if (httpContextAccessor?.HttpContext is { } httpContext)
            {
                httpContext.Items[UnavailableItemKey] = true;
            }

            return new OpenIdConnectConfiguration();
        }

        public void RequestRefresh() => inner.RequestRefresh();
    }

    private static Task OnTokenValidated(TokenValidatedContext context)
    {
        var sub = context.Principal?.FindFirst("sub")?.Value;
        if (!Guid.TryParse(sub, out _))
        {
            context.Fail("Token invalide : claim sub absent ou non conforme au contrat CampusHub.");
            return Task.CompletedTask;
        }

        if (context.Principal?.Identity is ClaimsIdentity identity)
        {
            var role = KeycloakRoles.GetHighest(ReadRealmRoles(identity));
            if (role is not null)
            {
                identity.AddClaim(new Claim(ClaimTypes.Role, role));
            }
        }

        return Task.CompletedTask;
    }

    private static IEnumerable<string> ReadRealmRoles(ClaimsIdentity identity)
    {
        var realmAccess = identity.FindFirst(RealmAccessClaim)?.Value;
        if (string.IsNullOrWhiteSpace(realmAccess))
        {
            return [];
        }

        try
        {
            using var document = JsonDocument.Parse(realmAccess);
            if (!document.RootElement.TryGetProperty("roles", out var roles) ||
                roles.ValueKind != JsonValueKind.Array)
            {
                return [];
            }

            return roles
                .EnumerateArray()
                .Where(role => role.ValueKind == JsonValueKind.String)
                .Select(role => role.GetString()!)
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    // Keycloak injoignable (clé inconnue du cache) : 503, jamais 500.
    public static bool IsUnavailable(Exception? exception)
    {
        for (var current = exception; current is not null; current = current.InnerException)
        {
            if (current is HttpRequestException or TaskCanceledException or TimeoutException or IOException)
            {
                return true;
            }
        }

        return false;
    }

    private sealed class JwksConfigurationRetriever : IConfigurationRetriever<OpenIdConnectConfiguration>
    {
        public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(
            string address,
            IDocumentRetriever retriever,
            CancellationToken cancel)
        {
            var json = await retriever.GetDocumentAsync(address, cancel);
            var keySet = new JsonWebKeySet(json);

            var configuration = new OpenIdConnectConfiguration { JsonWebKeySet = keySet };
            foreach (var key in keySet.Keys.Where(key => string.IsNullOrEmpty(key.Use) || key.Use == "sig"))
            {
                configuration.SigningKeys.Add(key);
            }

            return configuration;
        }
    }
}
