using Microsoft.IdentityModel.Tokens;

namespace GarbaTaal.Api.Infrastructure;

/// <summary>
/// Resolves Supabase's JWT signing keys from its public JWKS endpoint.
///
/// This project signs tokens with asymmetric keys (ECC P-256), not the legacy
/// HS256 shared secret. The API therefore validates with a PUBLIC key it
/// downloads: there is no signing secret on this server at all, so a leak here
/// exposes nothing, and Supabase can rotate keys without a redeploy.
///
/// Keys are cached and only re-fetched when a token arrives bearing a key id we
/// have not seen. That is what makes rotation automatic — Supabase publishes a
/// standby key, starts signing with it, and the first token carrying the new
/// kid triggers exactly one refresh.
///
/// Same pattern as GoogleTokenValidator in the ResumeMatcher backend, which
/// already does this against Google's keys in production.
/// </summary>
public sealed class SupabaseJwks
{
    // One shared client. HttpClient is thread-safe and meant to be long-lived;
    // a new one per fetch would leak sockets.
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };

    private readonly string _jwksUri;
    private readonly ILogger? _log;
    private readonly SecurityKey? _legacyKey;

    private readonly SemaphoreSlim _lock = new(1, 1);
    private IReadOnlyList<SecurityKey> _keys = [];
    private DateTimeOffset _fetchedAt = DateTimeOffset.MinValue;

    // Floor between refreshes, so a flood of tokens signed by an unknown key
    // cannot be turned into a flood of outbound requests.
    private static readonly TimeSpan MinRefreshInterval = TimeSpan.FromMinutes(2);

    /// <param name="legacySharedSecret">
    /// Optional HS256 secret, kept only so tokens issued before the switch to
    /// asymmetric keys keep validating until they expire. Safe to drop after.
    /// </param>
    public SupabaseJwks(string supabaseUrl, ILogger? log = null, string? legacySharedSecret = null)
    {
        _jwksUri = $"{supabaseUrl.TrimEnd('/')}/auth/v1/.well-known/jwks.json";
        _log = log;

        if (!string.IsNullOrWhiteSpace(legacySharedSecret))
        {
            _legacyKey = new SymmetricSecurityKey(
                System.Text.Encoding.UTF8.GetBytes(legacySharedSecret));
        }
    }

    /// <summary>
    /// Key resolver for JwtBearer. Serves cached keys when the token's kid is
    /// known and refreshes once when it is not.
    /// </summary>
    public IEnumerable<SecurityKey> Resolve(string token, SecurityToken securityToken,
                                            string? kid, TokenValidationParameters parameters)
    {
        var cached = _keys;

        if (cached.Count == 0 || (kid is not null && !cached.Any(k => k.KeyId == kid)))
        {
            // Unknown kid: Supabase has probably rotated. This path is bounded by
            // MinRefreshInterval, so it cannot become a request amplifier.
            Refresh();
            cached = _keys;
        }

        return _legacyKey is null ? cached : cached.Append(_legacyKey);
    }

    private void Refresh() => RefreshAsync().GetAwaiter().GetResult();

    public async Task RefreshAsync(CancellationToken ct = default)
    {
        if (IsFresh()) return;

        await _lock.WaitAsync(ct);
        try
        {
            // Another request may have refreshed while we waited on the lock.
            if (IsFresh()) return;

            var json = await Http.GetStringAsync(_jwksUri, ct);
            var keySet = new JsonWebKeySet(json);

            if (keySet.Keys.Count == 0)
            {
                _log?.LogWarning("Supabase JWKS returned no keys from {Uri}", _jwksUri);
                return;
            }

            _keys = keySet.Keys.Cast<SecurityKey>().ToList();
            _fetchedAt = DateTimeOffset.UtcNow;

            _log?.LogInformation("Loaded {Count} Supabase signing key(s): {Kids}",
                _keys.Count, string.Join(", ", _keys.Select(k => k.KeyId)));
        }
        catch (Exception ex)
        {
            // Keep serving with whatever is cached. Losing the JWKS endpoint must
            // not sign every user out.
            _log?.LogError(ex, "Could not refresh Supabase JWKS from {Uri}", _jwksUri);
        }
        finally
        {
            _lock.Release();
        }
    }

    private bool IsFresh() =>
        _keys.Count > 0 && DateTimeOffset.UtcNow - _fetchedAt < MinRefreshInterval;
}
