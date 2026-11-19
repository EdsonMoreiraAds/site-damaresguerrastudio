import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { agentHash, tooMany } from "@/lib/agent-auth";

const body = z.object({
  outcome: z.enum(["autorizada", "rejeitada", "indefinida"]),
  chave: z.string().min(10).max(100).optional(),
  external_id: z.string().max(100).optional(),
  motivo: z.string().max(1000).optional(),
  xml: z.string().max(2_000_000).optional(),
  pdf_base64: z.string().max(4_000_000).optional(),
});

/** POST — o agente informa o resultado. Reenvio do mesmo resultado é idempotente (finish_attempt). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (tooMany(req.headers.get("x-forwarded-for")?.split(",")[0] ?? "?")) return NextResponse.json({ erro: "limite" }, { status: 429 });
  const hash = agentHash(req);
  if (!hash || !z.string().uuid().safeParse(id).success) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ erro: "invalido" }, { status: 400 });
  const b = p.data; const db = supabaseAdmin();

  // Pertence a este agente? (o banco revalida em agent_report; aqui precisamos do caminho de storage)
  const { data: ag } = await db.from("agents").select("company_id").eq("token_hash", hash).is("revoked_at", null).maybeSingle();
  if (!ag) return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  const { data: at } = await db.from("emission_attempts").select("request_id, org_id, company_id").eq("id", id).eq("company_id", ag.company_id).maybeSingle();
  if (!at) return NextResponse.json({ erro: "nao_encontrado" }, { status: 404 });

  if (b.outcome === "autorizada") {
    const put = async (kind: "xml" | "pdf", content: string | Buffer, type: string) => {
      const path = `${at.org_id}/${at.company_id}/${at.request_id}/nota.${kind}`;
      const up = await db.storage.from("documentos").upload(path, content, { contentType: type, upsert: true });
      if (up.error) throw up.error;
      await db.rpc("register_document", { p_request: at.request_id, p_kind: kind, p_path: path,
        p_sha256: createHash("sha256").update(content).digest("hex") });
    };
    try {
      if (b.xml) await put("xml", b.xml, "application/xml");
      if (b.pdf_base64) await put("pdf", Buffer.from(b.pdf_base64, "base64"), "application/pdf");
    } catch { return NextResponse.json({ erro: "falha_armazenamento" }, { status: 502 }); }   // agente repete
  }
  const { data, error } = await db.rpc("agent_report", {
    p_token_hash: hash, p_attempt: id, p_outcome: b.outcome, p_chave: b.chave ?? null, p_external: b.external_id ?? null, p_motivo: b.motivo ?? null,
  });
  if (error) return NextResponse.json({ erro: "rejeitado" }, { status: 422 });
  return NextResponse.json({ resultado: data });
}
