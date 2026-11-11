# syntax=docker/dockerfile:1

# --- Build ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Dependances d'abord : cette couche reste en cache tant que le .csproj ne change pas.
COPY EvaluationService/EvaluationService.csproj EvaluationService/
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet restore EvaluationService/EvaluationService.csproj

COPY EvaluationService/ EvaluationService/
RUN --mount=type=cache,target=/root/.nuget/packages \
    dotnet publish EvaluationService/EvaluationService.csproj -c Release -o /app/publish --no-restore -p:UseAppHost=false

# --- Migrations EF (image one-shot, voir docker-compose.yml racine) ---
# Pas de cache mount ici : les paquets NuGet doivent rester dans l'image,
# car "dotnet ef database update" s'execute au demarrage du conteneur.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS migrate
ENV PATH="$PATH:/root/.dotnet/tools"
RUN dotnet tool install --global dotnet-ef --version 10.0.13

WORKDIR /src
COPY EvaluationService/EvaluationService.csproj EvaluationService/
RUN dotnet restore EvaluationService/EvaluationService.csproj
COPY EvaluationService/ EvaluationService/

WORKDIR /src/EvaluationService
ENTRYPOINT ["dotnet", "ef", "database", "update"]

# --- Runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
# curl sert au healthcheck docker-compose (image aspnet sans curl par defaut).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8084
EXPOSE 8084
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "EvaluationService.dll"]