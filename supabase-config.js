// Supabase connection for leaderboards and accounts.
// The anon / publishable key is meant to be public: Row Level Security in
// supabase/setup.sql decides what browsers may read and write.
// NEVER put the service_role or secret key here (or anywhere in this repo).
window.NG_CONFIG = {
  url: "https://nawwuteybfauzvzrvtev.supabase.co",
  anonKey: "sb_publishable_EHlGfx7lfD25QAKFFHbm3w_Dw8gAHCQ", // publishable key (safe to be public)

  // Sign-in methods shown on the "Save your scores" screen.
  // Phone codes are built in but off: to turn them on later, set phone: true
  // and add an SMS provider under Authentication > Sign In / Providers > Phone.
  signIn: { google: true, email: true, phone: false },
};
