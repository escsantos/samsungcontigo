import { createClient } from "@supabase/supabase-js";

// ATENÇÃO: este arquivo só pode ser importado dentro de app/api/**/route.js
// (código de servidor). A service_role key nunca deve chegar ao navegador.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada em .env.local — pegue em Project Settings > API Keys > Secret keys no Supabase."
    );
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
