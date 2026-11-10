using System.Text;
using DotNetEnv;
using EvaluationService.Clients;
using EvaluationService.Data;
using EvaluationService.Errors;
using EvaluationService.Messaging;
using EvaluationService.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using Steeltoe.Discovery.Eureka;

// Charge un éventuel fichier .env local (valeurs non committées). Sans effet en production.
Env.TraversePath().Load();

var builder = WebApplication.CreateBuilder(args);

// --- Authentification : Keycloak (RS256) si KEYCLOAK_ISSUER_URI est renseigné, sinon ancien mode HS256 ---
var keycloakEnabled = KeycloakAuthentication.IsEnabled(builder.Configuration);

SymmetricSecurityKey? jwtKey = null;
string? jwtIssuer = null;

if (!keycloakEnabled)
{
    // --- Secret JWT (HS256) : chaîne UTF-8 brute, jamais dans le code ni appsettings ---
    var jwtSecret = builder.Configuration["JWT_SECRET"];
    if (string.IsNullOrWhiteSpace(jwtSecret) || Encoding.UTF8.GetByteCount(jwtSecret) < 32)
    {
        throw new InvalidOperationException(
            "JWT_SECRET est absent ou trop court (minimum 32 octets). " +
            "Définissez-le via la variable d'environnement JWT_SECRET, dotnet user-secrets ou un fichier .env local.");
    }

    // La clé est la chaîne UTF-8 brute (pas de décodage Base64).
    jwtKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));

    // Issuer exigé (claim "iss" du User Service).
    jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? builder.Configuration["JWT_ISSUER"];
    if (string.IsNullOrWhiteSpace(jwtIssuer))
    {
        throw new InvalidOperationException(
            "L'issuer JWT est requis : renseignez Jwt:Issuer (configuration) ou JWT_ISSUER (variable d'environnement).");
    }
}

builder.Services.AddControllers();

// Publication d'événements RabbitMQ (best effort) vers notification-service.
builder.Services.AddSingleton<IEventPublisher, RabbitMqEventPublisher>();

// Erreurs de validation (400) au format CampusHub.
builder.Services.Configure<ApiBehaviorOptions>(options =>
{
    options.InvalidModelStateResponseFactory = context =>
    {
        var fieldErrors = context.ModelState
            .Where(entry => entry.Value is { Errors.Count: > 0 })
            .SelectMany(entry => entry.Value!.Errors.Select(error =>
                new FieldError(entry.Key, string.IsNullOrWhiteSpace(error.ErrorMessage) ? "Invalid value." : error.ErrorMessage)))
            .ToList();

        return new ObjectResult(ApiErrorFactory.Validation(fieldErrors: fieldErrors)) { StatusCode = 400 };
    };
});

// OpenAPI (documentation de l'API en développement) + schéma de sécurité Bearer JWT.
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, cancellationToken) =>
    {
        const string schemeName = "Bearer";

        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        document.Components.SecuritySchemes[schemeName] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "Token JWT émis par le User Service. Coller uniquement le token, sans le préfixe \"Bearer\"."
        };

        document.Security ??= new List<OpenApiSecurityRequirement>();
        document.Security.Add(new OpenApiSecurityRequirement
        {
            [new OpenApiSecuritySchemeReference(schemeName, document)] = new List<string>()
        });

        return Task.CompletedTask;
    });
});

// Connexion à SQL Server via EF Core.
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// --- Authentification JWT : Keycloak (RS256) ou ancien mode HS256 (transition) ---
if (keycloakEnabled)
{
    // IHttpContextAccessor : permet de marquer la requête en cours si Keycloak est injoignable (503).
    builder.Services.AddHttpContextAccessor();

    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer();

    // Configuration DI-aware (l'accesseur HttpContext n'existe pas dans le délégué AddJwtBearer).
    builder.Services
        .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
        .Configure<IServiceProvider>((options, services) => KeycloakAuthentication.Configure(
            options,
            services.GetRequiredService<IConfiguration>(),
            services.GetService<IHttpContextAccessor>()));

    // Un token Keycloak valide mais sans rôle CampusHub est refusé (403) sur tous les endpoints protégés.
    builder.Services.AddAuthorization(options => options.DefaultPolicy = KeycloakAuthentication.DefaultPolicy);
}
else
{
    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            // Conserve les noms de claims d'origine ("sub", "role") sans mapping automatique.
            options.MapInboundClaims = false;

            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = jwtIssuer!,
                ValidateAudience = false, // pas de claim "aud"
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromSeconds(30),
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = jwtKey!,
                NameClaimType = "sub",
                RoleClaimType = "role"
            };

            options.Events = new JwtBearerEvents
            {
                OnTokenValidated = context =>
                {
                    // Le contrat d'identité impose "sub" = Guid et "role" parmi les rôles connus.
                    var sub = context.Principal?.FindFirst("sub")?.Value;
                    var role = context.Principal?.FindFirst("role")?.Value;

                    bool subValide = Guid.TryParse(sub, out _);
                    bool roleValide = role is CampusHubRoles.Etudiant or CampusHubRoles.Enseignant or CampusHubRoles.Admin;

                    if (!subValide || !roleValide)
                    {
                        context.Fail("Token invalide : claims sub/role non conformes au contrat CampusHub.");
                    }

                    return Task.CompletedTask;
                },
                // 401 : pas de token, token invalide, expiré, mauvais secret ou mauvais issuer.
                OnChallenge = async context =>
                {
                    context.HandleResponse(); // supprime la réponse 401 par défaut
                    await ApiErrorWriter.WriteAsync(context.HttpContext, ApiErrorFactory.Unauthorized());
                },
                // 403 : token valide mais droits insuffisants.
                OnForbidden = context =>
                    ApiErrorWriter.WriteAsync(context.HttpContext, ApiErrorFactory.Forbidden())
            };
        });

    builder.Services.AddAuthorization();
}

builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.AddTransient<IStartupFilter, ExceptionHandlerStartupFilter>();

// Enregistrement Eureka : les échecs de contact sont réessayés en arrière-plan sans bloquer le démarrage.
builder.Services.AddEurekaDiscoveryClient();

// Appel synchrone vers course-service : URL via COURSE_SERVICE_URL sinon Eureka.
// Délai maximal de 3 s, un seul essai (pas de retry).
builder.Services.AddHttpClient<ICourseClient, CourseClient>(client => client.Timeout = CourseClient.Timeout);

// --- CORS : origines autorisées lues depuis la configuration (défaut : front local) ---
const string CorsPolicy = "CorsPolicy";
var corsOrigins = (builder.Configuration["CORS_ALLOWED_ORIGINS"] ?? "http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy => policy
        .WithOrigins(corsOrigins)
        .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        .WithHeaders("Authorization", "Content-Type"));
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi(); // documentation publique en développement uniquement
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/openapi/v1.json", "Evaluation Service v1");
        options.RoutePrefix = "swagger";
    });
}

app.UseCors(CorsPolicy);

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Endpoint public de santé (Eureka / gateway / orchestration).
app.MapGet("/health", () => Results.Ok(new { status = "UP" })).AllowAnonymous();

app.Run();

// Exposé aux tests d'intégration (WebApplicationFactory).
public partial class Program
{
}
