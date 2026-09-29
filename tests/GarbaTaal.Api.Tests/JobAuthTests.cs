using FluentAssertions;
using GarbaTaal.Api.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace GarbaTaal.Api.Tests;

/// <summary>
/// /jobs/* rebuilds decks and reconciles payments. If a user's token could reach
/// these, any user could trigger expensive work or interfere with payment state.
/// </summary>
public class JobAuthTests : IDisposable
{
    private const string Token = "job-token-super-secret-value";

    private static IConfiguration EmptyConfig() =>
        new ConfigurationBuilder().AddInMemoryCollection().Build();

    private static HttpContext ContextWith(string? authorizationHeader)
    {
        var ctx = new DefaultHttpContext();
        if (authorizationHeader is not null)
        {
            ctx.Request.Headers.Authorization = authorizationHeader;
        }
        return ctx;
    }

    public JobAuthTests() => Environment.SetEnvironmentVariable("JOB_TOKEN", Token);
    public void Dispose() => Environment.SetEnvironmentVariable("JOB_TOKEN", null);

    [Fact]
    public void Accepts_the_configured_token_as_a_bearer()
    {
        JobAuth.IsAuthorized(ContextWith($"Bearer {Token}"), EmptyConfig())
            .Should().BeTrue();
    }

    [Fact]
    public void Accepts_the_raw_token_without_the_bearer_prefix()
    {
        JobAuth.IsAuthorized(ContextWith(Token), EmptyConfig())
            .Should().BeTrue();
    }

    [Fact]
    public void Bearer_prefix_is_case_insensitive()
    {
        JobAuth.IsAuthorized(ContextWith($"bearer {Token}"), EmptyConfig())
            .Should().BeTrue();
    }

    [Fact]
    public void Rejects_a_wrong_token()
    {
        JobAuth.IsAuthorized(ContextWith("Bearer not-the-right-token-at-all"), EmptyConfig())
            .Should().BeFalse();
    }

    [Fact]
    public void Rejects_a_token_that_only_shares_a_prefix()
    {
        // Guards the fixed-time comparison: a correct prefix must not be
        // distinguishable from a wholly wrong value.
        JobAuth.IsAuthorized(ContextWith($"Bearer {Token[..10]}"), EmptyConfig())
            .Should().BeFalse();
    }

    [Fact]
    public void Rejects_a_missing_header()
    {
        JobAuth.IsAuthorized(ContextWith(null), EmptyConfig()).Should().BeFalse();
    }

    [Fact]
    public void Rejects_an_empty_header()
    {
        JobAuth.IsAuthorized(ContextWith(""), EmptyConfig()).Should().BeFalse();
    }

    [Fact]
    public void Fails_closed_when_no_token_is_configured()
    {
        // The important one. A forgotten env var on a new deploy must CLOSE the
        // endpoint, not leave it open to anyone who sends an empty header.
        Environment.SetEnvironmentVariable("JOB_TOKEN", null);

        JobAuth.IsAuthorized(ContextWith("Bearer anything"), EmptyConfig()).Should().BeFalse();
        JobAuth.IsAuthorized(ContextWith(""), EmptyConfig()).Should().BeFalse();
        JobAuth.IsAuthorized(ContextWith(null), EmptyConfig()).Should().BeFalse();
    }

    [Fact]
    public void Falls_back_to_configuration_when_no_env_var_is_set()
    {
        Environment.SetEnvironmentVariable("JOB_TOKEN", null);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["JobAuth:Token"] = Token })
            .Build();

        JobAuth.IsAuthorized(ContextWith($"Bearer {Token}"), config).Should().BeTrue();
    }

    [Fact]
    public void Tolerates_surrounding_whitespace()
    {
        JobAuth.IsAuthorized(ContextWith($"Bearer  {Token}  "), EmptyConfig())
            .Should().BeTrue();
    }
}
