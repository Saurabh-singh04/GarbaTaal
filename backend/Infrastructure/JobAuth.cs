using Microsoft.AspNetCore.Http;

namespace GarbaTaal.Api.Infrastructure;

/// <summary>
/// Gate for /jobs/* endpoints, which GitHub Actions cron calls to rebuild decks
/// and reconcile payments. These are not user endpoints and must not be reachable
/// with a user's JWT — a user token proves who you are, not that you are the
/// scheduler.
///
/// Ported from ResumeMatcher's AdminAuth, keeping its most important property:
/// when no key is configured it FAILS CLOSED, rather than silently leaving an
/// admin surface open because an env var was forgotten on a new deploy.
/// </summary>
public static class JobAuth
{
    public static bool IsAuthorized(HttpContext context, IConfiguration config)
    {
        var expected = Environment.GetEnvironmentVariable("JOB_TOKEN")
                       ?? config["JobAuth:Token"]
                       ?? string.Empty;

        if (string.IsNullOrWhiteSpace(expected))
        {
            return false;
        }

        if (!context.Request.Headers.TryGetValue("Authorization", out var header))
        {
            return false;
        }

        var provided = header.ToString();
        if (provided.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            provided = provided["Bearer ".Length..];
        }

        // Fixed-time comparison: a plain == on a secret leaks its prefix to anyone
        // patient enough to measure the response.
        return CryptographicEquals(provided.Trim(), expected);
    }

    private static bool CryptographicEquals(string a, string b)
    {
        if (a.Length != b.Length) return false;
        var diff = 0;
        for (var i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
        return diff == 0;
    }
}
