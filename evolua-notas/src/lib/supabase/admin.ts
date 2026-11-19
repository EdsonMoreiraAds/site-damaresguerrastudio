import "server-only";
import { createClient } from "@supabase/supabase-js";

/** service_role: ignora a RLS. Usar SOMENTE em rotas de servidor depois de autenticar o chamador. */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
