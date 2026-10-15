using EvaluationService.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Contrôleurs (API Web).
builder.Services.AddControllers();

// OpenAPI (documentation de l'API en développement).
builder.Services.AddOpenApi();

// Connexion à SQL Server via EF Core.
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// CORS : autoriser toutes les origines en développement.
const string CorsPolicy = "CorsPolicy";
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Pas de redirection HTTPS (service exposé en HTTP dans le réseau interne).
app.UseCors(CorsPolicy);

app.UseAuthorization();

app.MapControllers();

app.Run();
