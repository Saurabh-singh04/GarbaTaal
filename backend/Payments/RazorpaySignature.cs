using System.Security.Cryptography;
using System.Text;

namespace GarbaTaal.Api.Payments;

/// <summary>
/// Razorpay signature verification.
///
/// Ported from ResumeMatcher's PaymentsController, which already has the checkout
/// algorithm right. Two things are added here that the original is missing:
///
///   1. VerifyWebhook — the original has NO webhook endpoint at all, so entitlements
///      depend entirely on the client calling back. If the app dies between payment
///      and callback (cold start, 2G at a garba ground), the money is taken and
///      nothing is granted. The webhook is the source of truth; checkout verification
///      is only a fast path so the UI feels instant.
///
///   2. Fixed-time comparison — a plain string compare on a signature leaks how much
///      of a forged signature was correct.
///
/// NOTE: the webhook secret is a DIFFERENT secret from the API key secret. Using
/// the key secret to verify webhooks silently rejects every event.
/// </summary>
public static class RazorpaySignature
{
    /// <summary>
    /// Checkout callback: HMAC-SHA256(order_id + "|" + payment_id) keyed with the API key secret.
    /// </summary>
    public static bool VerifyCheckout(string orderId, string paymentId, string signature, string keySecret)
    {
        if (string.IsNullOrWhiteSpace(orderId) ||
            string.IsNullOrWhiteSpace(paymentId) ||
            string.IsNullOrWhiteSpace(signature) ||
            string.IsNullOrWhiteSpace(keySecret))
        {
            return false;
        }

        return Matches($"{orderId}|{paymentId}", signature, keySecret);
    }

    /// <summary>
    /// Webhook: HMAC-SHA256 over the RAW request body, keyed with the webhook secret.
    /// The body must be the exact bytes received — re-serializing the parsed JSON
    /// changes whitespace and key order, and the signature will never match.
    /// </summary>
    public static bool VerifyWebhook(string rawBody, string signature, string webhookSecret)
    {
        if (string.IsNullOrWhiteSpace(rawBody) ||
            string.IsNullOrWhiteSpace(signature) ||
            string.IsNullOrWhiteSpace(webhookSecret))
        {
            return false;
        }

        return Matches(rawBody, signature, webhookSecret);
    }

    private static bool Matches(string payload, string providedSignature, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var expected = Convert.ToHexString(hash).ToLowerInvariant();

        var provided = providedSignature.Trim().ToLowerInvariant();

        // Both are hex of a fixed-length hash, so length mismatch is already a reject.
        if (provided.Length != expected.Length) return false;

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(provided));
    }
}
