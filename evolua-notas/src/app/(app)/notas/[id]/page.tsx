import Link from "next/link";
import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { availableActions, type Status } from "@/lib/status";
import { competenciaBR, dateTimeBR, moneyBR } from "@/lib/format";
import { formatDoc } from "@/lib/validators";
import { Flash, StatusBadge } from "@/components";
import { approveRequest, deleteDraft, reconcileRequest, reopenRequest, sendRequest, submitRequest } from "../../../actions";

const Btn = ({ action, id, children, cls }: { action: (f: FormData) => Promise<void>; id: string; children: React.ReactNode; cls?: string }) =>
  <form action={action} className="inline"><input type="hidden" name="id" value={id} /><button className={cls}>{children}</button></form>;

export default async function Detalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const { supabase, user, canOperate, companies } = await getContext();
  const { data: r } = await supabase.from("invoice_requests").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();   // sem acesso == não existe
  const [{ data: events }, { data: attempts }, { data: docs }] = await Promise.all([
    supabase.from("events").select("id, action, actor, at, detail").eq("request_id", id).order("at"),
    supabase.from("emission_attempts").select("attempt_no, mode, ambiente, status, error, sent_at").eq("request_id", id).order("attempt_no"),
    supabase.from("documents").select("id, kind").eq("request_id", id),
  ]);
  const company = companies.find((c) => c.id === r.company_id);
  const a = availableActions(r.status as Status, canOperate, r.created_by === user.id);
  const stale = r.approved_hash && r.approved_hash !== r.content_hash;
  const row = (k: string, v: React.ReactNode) => <tr><th style={{ width: 190 }}>{k}</th><td>{v}</td></tr>;

  return (
    <>
      <Link href="/notas">← Notas</Link>
      <div className="row" style={{ alignItems: "center", marginTop: ".5rem" }}><h1>{r.tomador_nome}</h1><StatusBadge s={r.status} /></div>
      <Flash ok={sp.ok} erro={sp.erro} />
      {r.status === "em_verificacao" && <div className="flash err">O resultado da emissão é incerto. Use <b>Consultar resultado</b>: a nota nunca é reenviada para evitar duplicidade.</div>}
      {r.status === "rejeitada" && <div className="flash err"><b>Rejeitada:</b> {r.rejection_reason}. Corrija e envie novamente para revisão.</div>}
      {stale && <div className="flash err">Dados alterados após a aprovação.</div>}
      <div className="actions">
        {a.editar && <Link className="btn" href={`/notas/${id}/editar`}>Editar</Link>}
        {a.enviarParaRevisao && <Btn action={submitRequest} id={id}>Enviar para revisão</Btn>}
        {a.aprovar && <Btn action={approveRequest} id={id} cls="primary">Aprovar</Btn>}
        {a.enviar && <Btn action={sendRequest} id={id} cls="primary">Enviar ao emissor{company?.ambiente === "homologacao" ? " (homologação)" : ""}</Btn>}
        {a.consultar && <Btn action={reconcileRequest} id={id} cls="primary">Consultar resultado</Btn>}
        {a.reabrir && <Btn action={reopenRequest} id={id}>Voltar para revisão</Btn>}
        {a.excluir && <Btn action={deleteDraft} id={id} cls="danger">Excluir rascunho</Btn>}
      </div>
      <div className="card"><h2 style={{ marginTop: 0 }}>Dados submetidos</h2>
        <table><tbody>
          {row("Empresa emissora", company ? `${company.razao_social} (${formatDoc(company.cnpj)})` : "—")}
          {row("Tomador", `${formatDoc(r.tomador_doc)} — CEP ${r.tomador_cep}, nº ${r.tomador_numero}${r.tomador_complemento ? `, ${r.tomador_complemento}` : ""}`)}
          {row("Serviço", `${r.codigo_servico} — ${r.descricao}`)}
          {row("Competência", competenciaBR(r.competencia))}{row("Valor", moneyBR(r.valor))}
          {r.approved_at && row("Aprovada em", dateTimeBR(r.approved_at))}
          {r.chave_acesso && row("Chave de acesso", <span className="mono">{r.chave_acesso}</span>)}
          {r.dps_numero && row("Nº da DPS", `${company?.serie ?? ""}-${r.dps_numero}`)}
        </tbody></table></div>
      {(docs?.length ?? 0) > 0 && <div className="card"><h2 style={{ marginTop: 0 }}>Documentos</h2>
        <div className="actions">{docs!.map((d) => <a key={d.id} className="btn" href={`/api/documentos/${d.id}`}>Baixar {String(d.kind).toUpperCase()}</a>)}</div></div>}
      <div className="card"><h2 style={{ marginTop: 0 }}>Tentativas de emissão</h2>
        <table><thead><tr><th>#</th><th>Modo</th><th>Ambiente</th><th>Status</th><th>Detalhe</th><th>Quando</th></tr></thead><tbody>
          {(attempts ?? []).map((t) => <tr key={t.attempt_no}><td>{t.attempt_no}</td><td>{t.mode}</td><td>{t.ambiente}</td><td>{t.status}</td><td>{t.error}</td><td>{dateTimeBR(t.sent_at)}</td></tr>)}
          {!attempts?.length && <tr><td colSpan={6} className="mut">Nenhuma tentativa.</td></tr>}
        </tbody></table></div>
      <div className="card"><h2 style={{ marginTop: 0 }}>Histórico</h2>
        <table><tbody>{(events ?? []).map((e) => <tr key={e.id}><td style={{ width: 150 }}>{dateTimeBR(e.at)}</td><td>{e.action}</td>
          <td className="mut">{e.actor === user.id ? "você" : e.actor ? String(e.actor).slice(0, 8) : "sistema"}</td></tr>)}</tbody></table></div>
    </>
  );
}
