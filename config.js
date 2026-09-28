// ============================================================
// Your settings. Fill these in from Supabase > Project Settings > API.
// The "anon public" key is safe to put here: the database rules
// (supabase/schema.sql) decide what each visitor may do.
// Leave SUPABASE_URL empty to run the site in demo mode with sample data.
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "",            // e.g. "https://abcdefghijkl.supabase.co"
  SUPABASE_ANON_KEY: "",       // the long "anon public" key

  // Login buttons. Set LINE_PROVIDER to "" to hide the LINE button
  // until you have set LINE up in Supabase (see SETUP.md, step 5).
  GOOGLE_ENABLED: true,
  LINE_PROVIDER: "custom:line",

  // Shown in the header and browser tab.
  SITE_NAME: "Bangkok Social Floor"
};
