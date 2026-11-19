import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { agentHash, tooMany } from "@/lib/agent-auth";

/** GET /api/agent/jobs?cert_valid_until=YYYY-MM-DD — o agente local puxa a próxima tentativa do SEU CNPJ. */
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "?";
  if (tooMany(ip)) return NextResponse.json({ erro: "limite" }, { status: 429 });
  const hash = agentHash(req);
  if (!hash) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const cert = new URL(req.url).searchParams.get("cert_valid_until");
  const { data, error } = await supabaseAdmin().rpc("agent_claim_job", {
    p_token_hash: hash, p_cert_valid_until: cert && /^\d{4}-\d{2}-\d{2}$/.test(cert) ? cert : null,
  });
  if (error) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  return data ? NextResponse.json(data) : new NextResponse(null, { status: 204 });
}
