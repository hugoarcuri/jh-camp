// CONFIGURACIÓN: reemplazar con tus datos de Supabase
// (Supabase Dashboard -> Project Settings -> API)
window.CAMP_CONFIG = {
  SUPABASE_URL: "https://jlfnagtongbfltymbolp.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZm5hZ3RvbmdiZmx0eW1ib2xwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4ODg2MjYsImV4cCI6MjEwNzQ2NDYyNn0.LLdiG4xuXkRe2lKmUsIMA1xhWdT7s-lvPAyG0TrSFlo",
  CAMP_DATE: "2027-01-18",
  // Tramos de precio segun fecha limite
  PRICE_TIERS: [
    { until: "2026-09-30", price: 230000 },
    { until: "2026-11-30", price: 270000 },
    { until: "2027-01-18", price: 320000 }
  ],
  // Precio que se considera pago completo del primer tramo (saldado)
  FIRST_TIER_PRICE: 230000,
};
