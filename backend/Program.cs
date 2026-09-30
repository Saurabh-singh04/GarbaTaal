using System.Text;
using System.Threading.RateLimiting;
using GarbaTaal.Api.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Npgsql;

// Prevents inotify instance exhaustion crashes on Linux container hosts (Render/Docker).
// Carried over from the ResumeMatcher backend, where this was found the hard way.
Environment.SetEnvironmentVariable("DOTNET_USE_POLLING_FILE_WATCHER", "true");

var builder = WebApplication.CreateBuilder(args);

// ─────────────────────────────────────────────────────────────────────────────
// Database
// Fail fast rather than starting up and failing on the first request — a broken
// deploy should be obvious at boot, not at 9 PM on night one.
// ─────────────────────────────────────────────────────────────────────────────
var rawConn = Environment.GetEnvironmentVariable("DATABASE_URL")
              ?? builder.Configuration.GetConnectionString("Postgres");

if (string.IsNullOrWhiteSpace(rawConn))
{
    throw new InvalidOperationException(
        "DATABASE_URL is not configured. Set it as an environment variable " +
        "(use the Supavisor pooler on port 6543, not 5432).");
}

builder.Services.AddSingleton(_ => NpgsqlDataSource.Create(DatabaseUrl.ToNpgsql(rawConn)));

// ─────────────────────────────────────────────────────────────────────────────
// Authentication — Supabase-issued JWTs
//
// This is the piece ResumeMatcher does NOT have: it authenticates with a shared
// X-Api-Key that ships inside the browser bundle, and identifies users by an
// email passed in the request body. For a resume tool that is sloppy; for an app
// with private chat it would mean anyone can read anyone's messages by changing
// a string. Every request here carries a per-user token instead.
// ─────────────────────────────────────────────────────────────────────────────
// This project signs tokens with ASYMMETRIC keys (ECC P-256), so there is no
// shared signing secret on this server — only public keys fetched from
// Supabase's JWKS endpoint. Nothing here is worth leaking, and Supabase can
// rotate keys without a redeploy.
//
// SUPABASE_JWT_SECRET is still honoured if present, purely to keep validating
// tokens issued before the switch to asymmetric keys. Once those have expired
// it can be removed.
var supabaseUrl = Environment.GetEnvironmentVariable("SUPABASE_URL") ?? string.Empty;
var legacyJwtSecret = Environment.GetEnvironmentVariable("SUPABASE_JWT_SECRET") ?? string.Empty;
var authEnabled = !string.IsNullOrWhiteSpace(supabaseUrl);

if (authEnabled)
{
    // Built once, here, so the resolver closure below captures a single instance
    // instead of constructing a container per request.
    var jwks = new SupabaseJwks(
        supabaseUrl,
        LoggerFactory.Create(b => b.AddConsole()).CreateLogger<SupabaseJwks>(),
        legacyJwtSecret);

    builder.Services.AddSingleton(jwks);

    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = $"{supabaseUrl.TrimEnd('/')}/auth/v1",
                ValidateAudience = true,
                ValidAudience = "authenticated",
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromMinutes(2),

                // Without this, short claim names are remapped to legacy WS-Federation
                // URIs and User.FindFirst("sub") returns null on a perfectly valid token.
                // Same trap GoogleTokenValidator hit in the ResumeMatcher backend.
                NameClaimType = "sub"
            };

            // Keys are resolved per request, not at startup: a cold-started
            // container must not reject every request because it could not reach
            // Supabase during boot. The resolver also folds in the legacy HS256
            // key when one is configured.
            options.TokenValidationParameters.IssuerSigningKeyResolver = jwks.Resolve;

            options.MapInboundClaims = false;
        });

    builder.Services.AddAuthorization();
}

// ─────────────────────────────────────────────────────────────────────────────
// CORS — an explicit allowlist.
//
// ResumeMatcher has a correct allowlist sitting in appsettings and then calls
// AllowAnyOrigin() anyway, which makes it decorative. Not repeating that here.
// ─────────────────────────────────────────────────────────────────────────────
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                     ?? ["http://localhost:4200"];

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy => policy
        .WithOrigins(allowedOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting — absent entirely from ResumeMatcher.
// On nine nights of concentrated traffic, an unthrottled endpoint is the whole
// free tier gone in an afternoon.
// ─────────────────────────────────────────────────────────────────────────────
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetFixedWindowLimiter(
            // Per authenticated user where possible, per IP otherwise.
            partitionKey: ctx.User.FindFirst("sub")?.Value
                          ?? ctx.Connection.RemoteIpAddress?.ToString()
                          ?? "anonymous",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "GarbaTaal API",
        Version = "v1",
        Description = "Batch jobs, admin and payment processing. " +
                      "User-facing reads and writes go directly to Supabase — this service sleeps."
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        In = ParameterLocation.Header,
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "Supabase access token."
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseRateLimiter();

if (authEnabled)
{
    app.UseAuthentication();
    app.UseAuthorization();
}

app.MapControllers();

// Cheap, unauthenticated, and deliberately does NOT touch the database: this is
// what the keep-alive cron hits, and it must answer while the app is waking up.
app.MapGet("/health", () => Results.Ok(new
{
    status = "healthy",
    service = "garbataal-api",
    utc = DateTime.UtcNow
})).ExcludeFromDescription();

app.Run();
