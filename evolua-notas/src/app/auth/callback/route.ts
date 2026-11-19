import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;   // nunca redireciona para host vindo da requisição
  if (code) {
    const sb = await supabaseServer();
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) { await sb.rpc("accept_invitations"); return NextResponse.redirect(`${base}/notas`); }
  }
  return NextResponse.redirect(`${base}/login?erro=credenciais`);
}
