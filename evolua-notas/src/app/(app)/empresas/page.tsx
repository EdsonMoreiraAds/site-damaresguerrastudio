import { getContext } from "@/lib/context";
import { dateBR, dateTimeBR } from "@/lib/format";
import { formatDoc } from "@/lib/validators";
import { Flash } from "@/components";
import { AgentForm } from "@/agent-form";
import { createCompany, enableProduction, inviteMember, revokeAgent, setEmissor, setFourEyes, setMemberAccess, updateCompanyFiscal } from "../../actions";

export default async function Empresas({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const { supabase, org, isAdmin, companies } = await getContext();
  const [{ data: agents }, { data: members }, { data: invites }] = isAdmin ? await Promise.all([
    supabase.from("agents").select("id, company_id, name, last_seen_at, revoked_at"),
    supabase.rpc("list_members", { p_org: org.id }),
    supabase.from("invitations").select("id, email, role").is("accepted_at", null),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const limite = org.kind === "empresa" && companies.length >= 1;
  const now = Date.now();

  return (
    <>
      <h1>Empresas</h1><Flash ok={sp.ok} erro={sp.erro} />
      {companies.map((c) => {
        const ags = (agents ?? []).filter((a) => a.company_id === c.id);
        const cert = c.cert_valid_until;
        const dias = cert ? Math.ceil((new Date(cert).getTime() - now) / 864e5) : null;
        const f = c;
        return (
          <div className="card" key={c.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div><b>{c.razao_social}</b><div className="mut">{formatDoc(c.cnpj)} · município {c.municipio_ibge}</div></div>
              <div><span className="badge">{c.ambiente === "producao" ? "Produção" : "Homologação"}</span> <span className="badge">emissor: {c.emissor}</span></div>
            </div>
            {dias !== null && <div className={`flash ${dias < 45 ? "err" : "ok"}`}>Certificado A1 válido até {dateBR(cert!)} ({dias} dias){dias < 45 ? " — renove" : ""}</div>}
            {isAdmin && <>
              <h2>Dados fiscais</h2>
              <form action={updateCompanyFiscal} className="row">
                <input type="hidden" name="company" value={c.id} />
                <div><label>Série (00001–49999)</label><input name="serie" defaultValue={f.serie} size={6} /></div>
                <div><label>Cód. tributação nacional (6)</label><input name="ctrib_nac" defaultValue={f.ctrib_nac ?? ""} size={8} /></div>
                <div><label>Cód. municipal (3)</label><input name="ctrib_mun" defaultValue={f.ctrib_mun ?? ""} size={5} /></div>
                <div><label>IBGE da prestação (7)</label><input name="cloc" defaultValue={f.cloc_prestacao ?? ""} size={9} /></div>
                <div><label>Alíq. Simples %</label><input name="aliq" defaultValue={String(f.aliq_simples)} size={6} /></div>
                <div className="grow"><label>Texto fixo da descrição</label><input name="texto" defaultValue={f.texto_fixo} maxLength={500} /></div>
                <button>Salvar</button>
              </form>
              <p className="mut" style={{ fontSize: ".8rem" }}>Os códigos de serviço, o regime e a alíquota são responsabilidade da contabilidade. Copie-os de uma nota já emitida pelo portal.</p>
              <h2>Emissão</h2>
              <div className="actions">
                {c.ambiente === "homologacao" && <form action={setEmissor} className="inline row"><input type="hidden" name="company" value={c.id} />
                  <select name="emissor" defaultValue={c.emissor} aria-label="Emissor"><option value="simulado">Simulado (testes)</option><option value="agente">Agente local (A1)</option></select><button>Alterar</button></form>}
                {c.ambiente === "homologacao" && <form action={enableProduction} className="inline"><input type="hidden" name="company" value={c.id} />
                  <button className="primary">Habilitar produção</button></form>}
              </div>
              {c.emissor === "agente" && <>
                <table><tbody>{ags.map((a) => <tr key={a.id}><td>{a.name}</td>
                  <td className="mut">{a.revoked_at ? "revogado" : a.last_seen_at ? `visto ${dateTimeBR(a.last_seen_at)}` : "nunca conectou"}</td>
                  <td>{!a.revoked_at && <form action={revokeAgent}><input type="hidden" name="agent" value={a.id} /><button className="danger">Revogar</button></form>}</td></tr>)}</tbody></table>
                <AgentForm companyId={c.id} /></>}
            </>}
          </div>
        );
      })}

      {isAdmin && !limite && (
        <form action={createCompany} className="card">
          <h2 style={{ marginTop: 0 }}>Cadastrar empresa</h2>
          <input type="hidden" name="org" value={org.id} />
          <div className="grid2">
            <div><label htmlFor="cnpj">CNPJ</label><input id="cnpj" name="cnpj" required inputMode="numeric" /></div>
            <div><label htmlFor="razao">Razão social</label><input id="razao" name="razao" required minLength={2} maxLength={200} /></div>
            <div><label htmlFor="ibge">Município (código IBGE, 7 dígitos)</label><input id="ibge" name="ibge" required inputMode="numeric" /></div>
            <div><label htmlFor="codigos">Códigos de serviço habilitados (separe por vírgula; vazio = livre)</label><input id="codigos" name="codigos" /></div>
            <div><label htmlFor="emissor">Emissor</label><select id="emissor" name="emissor"><option value="simulado">Simulado (homologação)</option><option value="agente">Agente local (certificado A1)</option></select></div>
          </div>
          <div className="actions"><button className="primary">Cadastrar</button></div>
          <p className="mut" style={{ fontSize: ".8rem" }}>Perfil piloto: Simples Nacional ME/EPP que já emite pelo Emissor Nacional. Novas empresas começam sempre em homologação.</p>
        </form>
      )}
      {limite && isAdmin && <div className="card mut">Seu plano permite 1 CNPJ.</div>}

      {isAdmin && <>
        <h2>Equipe e acessos</h2>
        <form action={setFourEyes} className="card row" style={{ alignItems: "center" }}>
          <input type="hidden" name="org" value={org.id} />
          <div className="grow">Regra de aprovação: <b>{org.four_eyes ? "quem criou a nota não pode aprová-la" : "qualquer operador pode aprovar"}</b></div>
          <input type="hidden" name="on" value={org.four_eyes ? "0" : "1"} /><button>{org.four_eyes ? "Desativar" : "Ativar dupla conferência"}</button>
        </form>
        {(members ?? []).map((m: { user_id: string; email: string; role: string; active: boolean; company_ids: string[] }) => (
          <form key={m.user_id} action={setMemberAccess} className="card row">
            <input type="hidden" name="org" value={org.id} /><input type="hidden" name="user" value={m.user_id} />
            <div className="grow"><b>{m.email}</b></div>
            <div><label>Papel</label><select name="papel" defaultValue={m.role}><option value="admin">Administrador</option><option value="operador">Operador fiscal</option><option value="solicitante">Solicitante</option></select></div>
            <div><label>CNPJs</label>{companies.map((c) => <label key={c.id} style={{ display: "block" }}><input type="checkbox" name="empresas" value={c.id} defaultChecked={m.company_ids.includes(c.id)} style={{ width: "auto" }} /> {c.razao_social}</label>)}</div>
            <label><input type="checkbox" name="ativo" value="1" defaultChecked={m.active} style={{ width: "auto" }} /> ativo</label>
            <button>Salvar</button>
          </form>
        ))}
        {(invites ?? []).map((i) => <div className="card mut" key={i.id}>Convite pendente: {i.email} ({i.role})</div>)}
        <form action={inviteMember} className="card row">
          <input type="hidden" name="org" value={org.id} />
          <div className="grow"><label htmlFor="em">E-mail do convidado</label><input id="em" type="email" name="email" required /></div>
          <div><label htmlFor="pp">Papel</label><select id="pp" name="papel"><option value="solicitante">Solicitante</option><option value="operador">Operador fiscal</option><option value="admin">Administrador</option></select></div>
          <div><label>CNPJs</label>{companies.map((c) => <label key={c.id} style={{ display: "block" }}><input type="checkbox" name="empresas" value={c.id} style={{ width: "auto" }} /> {c.razao_social}</label>)}</div>
          <button>Convidar</button>
        </form>
        <p className="mut" style={{ fontSize: ".8rem" }}>A pessoa cria a conta com este e-mail, confirma o endereço e o acesso é liberado no primeiro login.</p>
      </>}
    </>
  );
}
