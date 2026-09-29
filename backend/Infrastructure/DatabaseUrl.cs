namespace GarbaTaal.Api.Infrastructure;

/// <summary>
/// Converts a postgres:// URL (the format Supabase, Render and Neon all hand you)
/// into an Npgsql connection string.
///
/// Ported from the ResumeMatcher backend, where this is already running against
/// Supabase in production — including the two settings that are easy to get wrong:
///
///   • Port 6543 default — the Supavisor POOLER, not the direct 5432 port.
///     .NET's connection pool against the direct port will exhaust Supabase's
///     connection limit on the first busy night.
///   • Multiplexing=false / No Reset On Close=true — required when talking to a
///     transaction-mode pooler, which does not support session-level state.
/// </summary>
public static class DatabaseUrl
{
    public static string ToNpgsql(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            throw new ArgumentException("Connection string is empty.", nameof(raw));
        }

        // Already an Npgsql keyword string — pass it through untouched.
        if (!raw.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !raw.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        {
            return raw;
        }

        var uri = new Uri(raw);
        var userInfo = uri.UserInfo.Split(':');
        var user = Uri.UnescapeDataString(userInfo[0]);
        var pass = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : string.Empty;
        var database = uri.AbsolutePath.TrimStart('/');
        if (string.IsNullOrEmpty(database)) database = "postgres";

        var port = uri.Port > 0 ? uri.Port : 6543;

        return $"Host={uri.Host};Port={port};Database={database};Username={user};Password={pass};" +
               "SSL Mode=Require;Trust Server Certificate=true;" +
               "Multiplexing=false;Pooling=true;No Reset On Close=true;" +
               // Capped deliberately: instances × MaxPoolSize must stay under the
               // plan's connection limit, and the free tier is not generous.
               "Maximum Pool Size=20;Keepalive=30;Timeout=60;Command Timeout=60;";
    }
}
