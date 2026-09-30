// Production. Substituted for environment.ts by angular.json fileReplacements.
// Populate from Vercel environment variables at build time — do not paste real
// project values into git.
export const environment = {
  production: true,

  supabaseUrl: 'https://ufnnymmxocwdlnzmhcpv.supabase.co',
  supabaseAnonKey: 'sb_publishable_1SclEhGFKeM7CXF5MsB4nA_INMJqHsP',

  // Google Identity Services client id — public by design, exactly like
  // ResumeMatcher's environment.ts. It is an identifier, not a secret; the
  // client SECRET never appears in this folder.
  googleClientId: 'REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',

  apiBaseUrl: 'https://garbataal-api.onrender.com',

  razorpayKeyId: 'rzp_live_xxxxxxxxxx',

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
