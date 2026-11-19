import "server-only";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emitirSimulado } from "./simulado";

/**
 * Executa o emissor SIMULADO para uma tentativa já criada pelo banco (begin_send / begin_reconcile)
 * e grava o resultado. Defesa em profundidade: recusa qualquer coisa que não seja homologação.
 * Para emissor "agente" não faz nada — o agente local busca o trabalho em /api/agent/jobs.
 */
export async function runSimulated(attemptId: string) {
  const db = supabaseAdmin();
  const { data: a } = await db.from("emission_attempts")
    .select("id, mode, ambiente, status, request_id, company_id").eq("id", attemptId).single();
  if (!a || a.status !== "enviada") return;
  const { data: c } = await db.from("companies").select("cnpj, emissor, ambiente, org_id").eq("id", a.company_id).single();
  if (!c || c.emissor !== "simulado" || a.ambiente !== "homologacao" || c.ambiente !== "homologacao") return;
  const { data: r } = await db.from("invoice_requests").select("*").eq("id", a.request_id).single();
  if (!r) return;

  const res = emitirSimulado({
    dpsId: r.id, mode: a.mode, prestadorCnpj: c.cnpj, tomadorDoc: r.tomador_doc, tomadorNome: r.tomador_nome,
    descricao: r.descricao, codigoServico: r.codigo_servico, competencia: r.competencia, valor: Number(r.valor),
  });

  if (res.outcome === "autorizada") {
    const path = `${c.org_id}/${a.company_id}/${r.id}/nota.xml`;
    const up = await db.storage.from("documentos").upload(path, res.xml, { contentType: "application/xml", upsert: true });
    if (!up.error) {
      await db.rpc("register_document", {
        p_request: r.id, p_kind: "xml", p_path: path, p_sha256: createHash("sha256").update(res.xml).digest("hex"),
      });
    }
    await db.rpc("finish_attempt", { p_attempt: a.id, p_outcome: "autorizada", p_chave: res.chave, p_external: res.externalId, p_motivo: null });
  } else {
    await db.rpc("finish_attempt", { p_attempt: a.id, p_outcome: res.outcome, p_chave: null, p_external: null, p_motivo: res.motivo });
  }
}
