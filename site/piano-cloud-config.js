/* Browser-safe Supabase project configuration. RLS protects private songs/progress.
   Never put a secret/service-role key or database password here. */
window.PianoCloudConfig = {
  supabaseUrl: 'https://uhebiyxvwrlnjxzqytjn.supabase.co',
  supabaseAnonKey: 'sb_publishable_Tl3MAs7cW9Y2tXPvii0s6w_LWLwXJuM',
  publicEmailReady: false,
  googleEnabled: true,
  // Community tab, Reels, profile community section, piece-page strip and Share buttons
  // (docs/social.md). Off for now; set to true to show them again.
  community: false
};
