# Ported from the ResumeMatcher backend, which is already running this exact
# shape on Render's free tier — same .NET 9 runtime, same port convention.
# No reason to rediscover a working deployment setup.

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["GarbaTaal.Api.csproj", "./"]
RUN dotnet restore "GarbaTaal.Api.csproj"
COPY . .
RUN dotnet publish "GarbaTaal.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .

# Render injects PORT; 8080 is the fallback for local `docker run`.
ENV ASPNETCORE_HTTP_PORTS=8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080

ENTRYPOINT ["dotnet", "GarbaTaal.Api.dll"]
