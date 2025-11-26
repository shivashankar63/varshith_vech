// Centralized config for Smart Bus UI
// Adjust these values per environment; avoid hardcoding in HTML
(function(){
  window.SUPABASE_URL = window.SUPABASE_URL || "https://xeibdoqrxpqgdwuackfc.supabase.co";
  window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlaWJkb3FyeHBxZ2R3dWFja2ZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNzYyNTAsImV4cCI6MjA3OTc1MjI1MH0.J3b3xaAa532E03mUYHjFabBhd7kwNvoLkoSQJ0CX04k";
  window.APP_ENV = window.APP_ENV || "DEV"; // DEV | PROD
})();
