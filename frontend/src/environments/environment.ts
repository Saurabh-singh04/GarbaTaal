// Development. Swapped for environment.prod.ts at build time via angular.json
// fileReplacements — same pattern as careeraipro.com.
//
// WHAT BELONGS HERE: values that are public by design. Anything in this file
// ships inside the browser bundle and is readable by anyone who opens devtools.
//
// The Supabase ANON key is safe here — it is meant to be public, and RLS is what
// actually protects the data. The SERVICE key never appears in this folder.
//
// This is also where ResumeMatcher went wrong: it puts a shared `apiKey` here and
// treats it as a secret. A key in a browser bundle is not a secret.
export const environment = {
  production: false,

  supabaseUrl: 'https://ufnnymmxocwdlnzmhcpv.supabase.co',
  supabaseAnonKey: 'sb_publishable_1SclEhGFKeM7CXF5MsB4nA_INMJqHsP',

  apiBaseUrl: 'http://localhost:5000',

  // key_id is public — it reaches the Razorpay checkout widget by design.
  // key_secret stays on the server and is never referenced in this project.
  razorpayKeyId: 'rzp_test_xxxxxxxxxx',

  // Pan-India festival launch
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
