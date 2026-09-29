using FluentAssertions;
using GarbaTaal.Api.Infrastructure;
using Xunit;

namespace GarbaTaal.Api.Tests;

/// <summary>
/// Getting this wrong does not fail at boot — it fails at 9 PM on night one when
/// connections run out. These tests pin the settings that prevent that.
/// </summary>
public class DatabaseUrlTests
{
    [Fact]
    public void Defaults_to_the_pooler_port_when_none_is_given()
    {
        // 6543 is Supavisor (transaction pooling). The direct port 5432 will
        // exhaust Supabase's connection limit under concurrent load.
        DatabaseUrl.ToNpgsql("postgresql://postgres:pw@db.abc.supabase.co/postgres")
            .Should().Contain("Port=6543");
    }

    [Fact]
    public void Honours_an_explicit_port()
    {
        DatabaseUrl.ToNpgsql("postgresql://postgres:pw@db.abc.supabase.co:5432/postgres")
            .Should().Contain("Port=5432");
    }

    [Fact]
    public void Caps_the_connection_pool()
    {
        // instances × MaxPoolSize must stay under the plan's connection limit.
        // An uncapped pool is the classic way to take down a free-tier database.
        DatabaseUrl.ToNpgsql("postgresql://postgres:pw@db.abc.supabase.co/postgres")
            .Should().Contain("Maximum Pool Size=20");
    }

    [Fact]
    public void Sets_the_flags_a_transaction_pooler_requires()
    {
        var result = DatabaseUrl.ToNpgsql("postgresql://postgres:pw@db.abc.supabase.co/postgres");

        // A transaction-mode pooler does not support session-level state.
        result.Should().Contain("Multiplexing=false");
        result.Should().Contain("No Reset On Close=true");
    }

    [Fact]
    public void Requires_ssl()
    {
        DatabaseUrl.ToNpgsql("postgresql://postgres:pw@db.abc.supabase.co/postgres")
            .Should().Contain("SSL Mode=Require");
    }

    [Theory]
    [InlineData("postgres://")]
    [InlineData("postgresql://")]
    public void Accepts_both_url_schemes(string scheme)
    {
        DatabaseUrl.ToNpgsql($"{scheme}postgres:pw@db.abc.supabase.co/postgres")
            .Should().Contain("Host=db.abc.supabase.co");
    }

    [Fact]
    public void Parses_credentials()
    {
        var result = DatabaseUrl.ToNpgsql("postgresql://myuser:mypass@host.co/postgres");

        result.Should().Contain("Username=myuser");
        result.Should().Contain("Password=mypass");
    }

    [Fact]
    public void Decodes_percent_encoded_passwords()
    {
        // Supabase-generated passwords contain characters that must be URL-encoded.
        // Failing to decode gives a confusing "password authentication failed".
        DatabaseUrl.ToNpgsql("postgresql://postgres:p%40ss%3Aword@host.co/postgres")
            .Should().Contain("Password=p@ss:word");
    }

    [Fact]
    public void Defaults_the_database_name_when_the_path_is_empty()
    {
        DatabaseUrl.ToNpgsql("postgresql://postgres:pw@host.co")
            .Should().Contain("Database=postgres");
    }

    [Fact]
    public void Passes_through_a_native_npgsql_string_untouched()
    {
        const string native = "Host=localhost;Port=5432;Database=garbataal;Username=postgres;Password=pw;";

        DatabaseUrl.ToNpgsql(native).Should().Be(native);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void Throws_on_an_empty_connection_string(string? input)
    {
        // Fail fast at boot. A broken deploy should be obvious immediately,
        // not on the first request during the festival.
        var act = () => DatabaseUrl.ToNpgsql(input!);

        act.Should().Throw<ArgumentException>();
    }
}
