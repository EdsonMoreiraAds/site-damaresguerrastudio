import type { Company } from "@/lib/context";

export interface RequestValues {
  id?: string; company_id?: string; tomador_doc?: string; tomador_nome?: string; tomador_cep?: string; tomador_numero?: string;
  tomador_complemento?: string; descricao?: string; codigo_servico?: string; competencia?: string; valor?: number | string;
}

export function RequestForm({ action, companies, v = {}, lockCompany, current }: {
  action: (f: FormData) => Promise<void>; companies: Company[]; v?: RequestValues; lockCompany?: boolean; current?: string;
}) {
  const comp = (v.competencia ?? new Date().toISOString()).slice(0, 7);
  const company = companies.find((c) => c.id === (v.company_id ?? current)) ?? companies[0];
  return (
    <form action={action} className="card">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <div className="grid2">
        <div><label htmlFor="company">CNPJ emissor</label>
          {lockCompany
            ? <><input type="hidden" name="company" value={company.id} /><input disabled value={`${company.razao_social} — ${company.cnpj}`} /></>
            : <select id="company" name="company" defaultValue={company?.id}>{companies.map((c) => <option key={c.id} value={c.id}>{c.razao_social} — {c.cnpj}</option>)}</select>}</div>
        <div><label htmlFor="codigo">Código de serviço{company?.codigos_servico.length ? " (habilitados)" : ""}</label>
          {company?.codigos_servico.length
            ? <select id="codigo" name="codigo" defaultValue={v.codigo_servico}>{company.codigos_servico.map((c) => <option key={c}>{c}</option>)}</select>
            : <input id="codigo" name="codigo" required maxLength={20} defaultValue={v.codigo_servico} />}</div>
        <div><label htmlFor="doc">CPF/CNPJ do tomador</label><input id="doc" name="doc" required defaultValue={v.tomador_doc} inputMode="numeric" /></div>
        <div><label htmlFor="nome">Nome / razão social do tomador</label><input id="nome" name="nome" required minLength={2} maxLength={200} defaultValue={v.tomador_nome} /></div>
        <div><label htmlFor="cep">CEP do tomador</label><input id="cep" name="cep" required inputMode="numeric" defaultValue={v.tomador_cep} /></div>
        <div className="row"><div className="grow"><label htmlFor="numero">Número</label><input id="numero" name="numero" required maxLength={10} defaultValue={v.tomador_numero} /></div>
          <div className="grow"><label htmlFor="compl">Complemento</label><input id="compl" name="compl" maxLength={60} defaultValue={v.tomador_complemento} /></div></div>
        <div><label htmlFor="competencia">Competência</label><input id="competencia" name="competencia" type="month" required defaultValue={comp} /></div>
        <div><label htmlFor="valor">Valor (R$)</label><input id="valor" name="valor" required inputMode="decimal" defaultValue={v.valor !== undefined ? String(v.valor).replace(".", ",") : ""} /></div>
      </div>
      <label htmlFor="desc" style={{ marginTop: ".75rem" }}>Descrição do serviço</label>
      <textarea id="desc" name="desc" rows={4} required minLength={3} maxLength={2000} defaultValue={v.descricao} />
      <div className="actions">
        <button className="primary">Salvar</button>
        {!v.id && <button name="revisao" value="1">Salvar e enviar para revisão</button>}
      </div>
    </form>
  );
}
