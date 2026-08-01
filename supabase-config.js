/* ══════════════════════════════════════════════════════════════
   Supabase 접속 정보  (인터넷설정.command 가 생성)

   url     : 프로젝트 URL      (Settings → API → Project URL)
   anonKey : anon public key   (Settings → API → Project API keys → anon public)

   anon key는 공개되어도 되는 값입니다. 실제 접근 통제는 서버의 RLS 정책이 합니다.
   (service_role key는 절대 여기 넣지 마세요 — supabase/.env 에만 둡니다)
   ══════════════════════════════════════════════════════════════ */
window.SUPABASE_CONFIG = {
  url: 'https://dkvqkimgdopiriqmxthy.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdnFraW1nZG9waXJpcW14dGh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1MDMyNjUsImV4cCI6MjEwMTA3OTI2NX0.oaEcfFJPaLWbjiePraVkaGKQoICFob2rEBUB4TwA8R4',
  dataBucket: 'hwayak-data'
};
