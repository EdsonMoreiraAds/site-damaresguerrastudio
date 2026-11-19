import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Marca tentativas sem resposta como "em verificação". Chamar a cada poucos minutos (Vercel Cron ou pg_cron). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const a = Buffer.from(got), b = Buffer.from(secret);
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const { data, error } = await supabaseAdmin().rpc("sweep_stale_attempts", { p_minutes: 10 });
  return error ? NextResponse.json({ erro: "falha" }, { status: 500 }) : NextResponse.json({ marcadas: data });
}
