import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { PLANS, brl, estimate } from "@/lib/billing";
import { dateBR } from "@/lib/format";

export default async function Plano() {
  const { supabase, org, isAdmin } = await getContext();
  if (!isAdmin) redirect("/notas");
  const { data } = await supabase.rpc("usage_summary", { p_org: org.id });
  const u = (Array.isArray(data) ? data[0] : data) as { cycle_start: string; cycle_end: string; autorizadas: number; cnpjs_ativos: number };
  const plan = PLANS[org.plan];
  const est = estimate(org.plan, Number(u.autorizadas), Number(u.cnpjs_ativos));
  const pct = Math.min(100, Math.round((Number(u.autorizadas) / plan.notasIncluidas) * 100));
  return (
    <>
      <h1>Plano e consumo</h1>
      <div className="card"><b>{plan.nome}</b> — {brl(plan.mensalidade)}/mês · {plan.cnpjsIncluidos} CNPJ(s) e {plan.notasIncluidas} notas incluídas
        <div className="mut">Ciclo {dateBR(u.cycle_start)} a {dateBR(new Date(new Date(u.cycle_end).getTime() - 864e5))}</div></div>
      <div className="card"><div className="row" style={{ justifyContent: "space-between" }}><span>Notas autorizadas em produção</span><b>{u.autorizadas} / {plan.notasIncluidas}</b></div>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <p className="mut">Contam apenas autorizações de produção. Rascunhos, rejeições, tentativas duplicadas e homologação ficam de fora.</p></div>
      <div className="card"><h2 style={{ marginTop: 0 }}>Estimativa do ciclo</h2>
        <table><tbody>
          <tr><td>Mensalidade</td><td>{brl(est.mensalidade)}</td></tr>
          <tr><td>{u.cnpjs_ativos} CNPJs ativos ({est.cnpjsExtras} adicionais)</td><td>{brl(est.valorCnpjsExtras)}</td></tr>
          <tr><td>{est.notasExcedentes} notas excedentes × {brl(plan.excedenteNota)}</td><td>{brl(est.valorExcedente)}</td></tr>
          <tr><th>Total estimado</th><th>{brl(est.total)}</th></tr></tbody></table>
        <p className="mut">Estimativa informativa: a cobrança automática ainda não está ativa no piloto.</p></div>
    </>
  );
}
