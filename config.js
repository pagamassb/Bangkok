// ============================================================
// Your settings. Fill these in from Supabase > Project Settings > API.
// The "anon public" key is safe to put here: the database rules
// (supabase/schema.sql) decide what each visitor may do.
// Leave SUPABASE_URL empty to run the site in demo mode with sample data.
// ============================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://ngoxzddzybjgfmmgeetl.supabase.co",            // e.g. "https://abcdefghijkl.supabase.co"
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nb3h6ZGR6eWJqZ2ZtbWdlZXRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NjQ1NTYsImV4cCI6MjEwNjE0MDU1Nn0.-Nvw8iUr3ESjlYvFED2iSAh4i_oZgca8Y1LUUdwQkqo",       // the long "anon public" key

  // Login buttons. Set LINE_PROVIDER to "" to hide the LINE button
  // until you have set LINE up in Supabase (see SETUP.md, step 5).
  GOOGLE_ENABLED: true,
  LINE_PROVIDER: "",

  // Shown in the header and browser tab.
  SITE_NAME: "Bangkok Social Floor"
};
