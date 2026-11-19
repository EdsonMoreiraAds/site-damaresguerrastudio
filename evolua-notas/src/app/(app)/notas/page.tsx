import Link from "next/link";
import { getContext } from "@/lib/context";
import { STATUS_LABEL, type Status } from "@/lib/status";
import { competenciaBR, dateBR, moneyBR } from "@/lib/format";
import { formatDoc } from "@/lib/validators";
import { Flash, StatusBadge } from "@/components";

type SP = { q?: string; empresa?: string; status?: string; de?: string; ate?: string; ok?: string; erro?: string };

export default async function Notas({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, companies, org } = await getContext();
  let q = supabase.from("invoice_requests")
    .select("id, status, tomador_nome, tomador_doc, valor, competencia, created_at, ambiente, companies(razao_social)")
    .eq("org_id", org.id).order("created_at", { ascending: false }).limit(200);
  if (sp.empresa && companies.some((c) => c.id === sp.empresa)) q = q.eq("company_id", sp.empresa);
  if (sp.status && sp.status in STATUS_LABEL) q = q.eq("status", sp.status);
  if (sp.de && /^\d{4}-\d{2}$/.test(sp.de)) q = q.gte("competencia", `${sp.de}-01`);
  if (sp.ate && /^\d{4}-\d{2}$/.test(sp.ate)) q = q.lte("competencia", `${sp.ate}-01`);
  if (sp.q) q = q.ilike("tomador_nome", `%${sp.q.replace(/[%_\\]/g, "\\$&").slice(0, 100)}%`);
  const { data } = await q;
  const rows = (data ?? []) as unknown as { id: string; status: Status; tomador_nome: string; tomador_doc: string; valor: number;
    competencia: string; created_at: string; ambiente: string | null; companies: { razao_social: string } }[];
  const pendentes = rows.filter((r) => r.status === "a_revisar").length;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <div><h1>Notas de serviço</h1><div className="mut">{rows.length} registros · {pendentes} a revisar</div></div>
        {companies.length > 0 && <Link className="btn primary" href="/notas/nova">Nova solicitação</Link>}
      </div>
      <Flash ok={sp.ok} erro={sp.erro} />
      {companies.length === 0 && <div className="card">Nenhuma empresa disponível. <Link href="/empresas">Cadastre ou peça acesso a um CNPJ.</Link></div>}
      <form className="card row" method="get">
        <div className="grow"><label htmlFor="q">Tomador</label><input id="q" name="q" defaultValue={sp.q} /></div>
        <div className="grow"><label htmlFor="empresa">CNPJ</label>
          <select id="empresa" name="empresa" defaultValue={sp.empresa ?? ""}><option value="">Todos</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.razao_social}</option>)}</select></div>
        <div><label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={sp.status ?? ""}><option value="">Todos</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label htmlFor="de">De</label><input id="de" type="month" name="de" defaultValue={sp.de} /></div>
        <div><label htmlFor="ate">Até</label><input id="ate" type="month" name="ate" defaultValue={sp.ate} /></div>
        <button>Filtrar</button>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Tomador</th><th>Empresa</th><th>Comp.</th><th>Valor</th><th>Status</th><th>Criada</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/notas/${r.id}`}>{r.tomador_nome}</Link><div className="mut">{formatDoc(r.tomador_doc)}</div></td>
                <td>{r.companies?.razao_social}</td><td>{competenciaBR(r.competencia)}</td><td>{moneyBR(r.valor)}</td>
                <td><StatusBadge s={r.status} />{r.ambiente === "homologacao" && <div className="mut">homologação</div>}</td><td>{dateBR(r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="mut">Nada encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
