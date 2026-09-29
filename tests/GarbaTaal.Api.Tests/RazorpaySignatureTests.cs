using System.Security.Cryptography;
using System.Text;
using FluentAssertions;
using GarbaTaal.Api.Payments;
using Xunit;

namespace GarbaTaal.Api.Tests;

/// <summary>
/// The money path. A bug here either lets someone unlock the ₹99 pass without
/// paying, or silently rejects people who did pay.
/// </summary>
public class RazorpaySignatureTests
{
    private const string KeySecret = "test_key_secret_abc123";
    private const string WebhookSecret = "test_webhook_secret_xyz789";

    private static string Sign(string payload, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
    }

    // ── Checkout ────────────────────────────────────────────────────────────

    [Fact]
    public void Checkout_accepts_a_correctly_signed_payment()
    {
        var signature = Sign("order_ABC|pay_XYZ", KeySecret);

        RazorpaySignature.VerifyCheckout("order_ABC", "pay_XYZ", signature, KeySecret)
            .Should().BeTrue();
    }

    [Fact]
    public void Checkout_accepts_an_uppercase_signature()
    {
        // Razorpay returns lowercase hex, but a proxy or client could upcase it.
        var signature = Sign("order_ABC|pay_XYZ", KeySecret).ToUpperInvariant();

        RazorpaySignature.VerifyCheckout("order_ABC", "pay_XYZ", signature, KeySecret)
            .Should().BeTrue();
    }

    [Fact]
    public void Checkout_rejects_a_forged_signature()
    {
        RazorpaySignature.VerifyCheckout("order_ABC", "pay_XYZ", new string('a', 64), KeySecret)
            .Should().BeFalse();
    }

    [Fact]
    public void Checkout_rejects_a_signature_from_a_different_order()
    {
        // The attack this blocks: pay ₹99 once, then replay that signature with a
        // different order id to unlock a second account.
        var signature = Sign("order_OTHER|pay_XYZ", KeySecret);

        RazorpaySignature.VerifyCheckout("order_ABC", "pay_XYZ", signature, KeySecret)
            .Should().BeFalse();
    }

    [Fact]
    public void Checkout_rejects_a_signature_made_with_the_wrong_secret()
    {
        var signature = Sign("order_ABC|pay_XYZ", "someone_elses_secret");

        RazorpaySignature.VerifyCheckout("order_ABC", "pay_XYZ", signature, KeySecret)
            .Should().BeFalse();
    }

    [Theory]
    [InlineData(null, "pay", "sig")]
    [InlineData("order", null, "sig")]
    [InlineData("order", "pay", null)]
    [InlineData("", "pay", "sig")]
    [InlineData("order", "", "sig")]
    [InlineData("order", "pay", "")]
    public void Checkout_rejects_missing_fields(string? order, string? payment, string? signature)
    {
        // Fail closed. A null here must never be read as "nothing to verify, allow it".
        RazorpaySignature.VerifyCheckout(order!, payment!, signature!, KeySecret)
            .Should().BeFalse();
    }

    [Fact]
    public void Checkout_rejects_when_no_secret_is_configured()
    {
        var signature = Sign("order_ABC|pay_XYZ", KeySecret);

        RazorpaySignature.VerifyCheckout("order_ABC", "pay_XYZ", signature, "")
            .Should().BeFalse();
    }

    // ── Webhook ─────────────────────────────────────────────────────────────

    [Fact]
    public void Webhook_accepts_a_correctly_signed_body()
    {
        var body = """{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_XYZ"}}}}""";

        RazorpaySignature.VerifyWebhook(body, Sign(body, WebhookSecret), WebhookSecret)
            .Should().BeTrue();
    }

    [Fact]
    public void Webhook_rejects_a_body_altered_after_signing()
    {
        var original = """{"event":"payment.captured","amount":9900}""";
        var tampered = """{"event":"payment.captured","amount":100}""";

        RazorpaySignature.VerifyWebhook(tampered, Sign(original, WebhookSecret), WebhookSecret)
            .Should().BeFalse();
    }

    [Fact]
    public void Webhook_is_whitespace_sensitive()
    {
        // Documents a real trap: re-serializing the parsed JSON changes whitespace
        // and key order, so the signature never matches. The RAW bytes must be used.
        var raw = """{"event":"payment.captured"}""";
        var reserialized = """{ "event": "payment.captured" }""";

        RazorpaySignature.VerifyWebhook(reserialized, Sign(raw, WebhookSecret), WebhookSecret)
            .Should().BeFalse();
    }

    [Fact]
    public void Webhook_rejects_a_signature_made_with_the_api_key_secret()
    {
        // The single most common Razorpay integration bug: the webhook secret is a
        // DIFFERENT secret. Using the key secret silently rejects every event.
        var body = """{"event":"payment.captured"}""";

        RazorpaySignature.VerifyWebhook(body, Sign(body, KeySecret), WebhookSecret)
            .Should().BeFalse();
    }

    [Fact]
    public void Webhook_rejects_an_empty_body()
    {
        RazorpaySignature.VerifyWebhook("", Sign("", WebhookSecret), WebhookSecret)
            .Should().BeFalse();
    }
}
