// Production. Substituted for environment.ts by angular.json fileReplacements.
// Populate from Vercel environment variables at build time — do not paste real
// project values into git.
export const environment = {
  production: true,

  supabaseUrl: 'https://ufnnymmxocwdlnzmhcpv.supabase.co',
  supabaseAnonKey: 'sb_publishable_1SclEhGFKeM7CXF5MsB4nA_INMJqHsP',

  // Google Identity Services client id — public by design, exactly like
  // ResumeMatcher's environment.ts. An identifier, not a secret; the client
  // SECRET never appears in this folder.
  //
  // TEMPORARY: ResumeMatcher's client, reused to unblock testing. Google's
  // account chooser will say CareerAI rather than GarbaTaal. Replace with a
  // client from the 'garbataal' project before this reaches real users.
  googleClientId: '703087488750-laqcdu9kfk7p7t4cap9ijkd8tekkaoi5.apps.googleusercontent.com',

  apiBaseUrl: 'https://garbataal-api.onrender.com',

  // PLACEHOLDER — checkout will not open until this is a real key.
  // Use the rzp_test_ key while Razorpay KYC is pending, and switch to
  // rzp_live_ only together with the backend's key, never one without the
  // other: a live backend order opened with a test key fails signature
  // verification, and the failure looks like the user's card being declined.
  razorpayKeyId: 'rzp_test_REPLACE_ME',

  launchCitySlug: 'all',

  festival: {
    name: 'Navratri 2026',
    startDate: '2026-10-11',
    endDate: '2026-10-19',
    nights: 9
  },

  pricing: {
    seasonPassInr: 99,
    verifiedBadgeInr: 49
  }
};
