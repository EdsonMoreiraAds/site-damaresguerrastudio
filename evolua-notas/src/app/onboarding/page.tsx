import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { errorMessage } from "@/lib/errors";
import { createOrg } from "../actions";

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  await sb.rpc("accept_invitations");   // convites pendentes para o e-mail confirmado
  const { data } = await sb.from("memberships").select("org_id").eq("active", true).limit(1);
  if (data?.length) redirect("/notas");
  const { erro } = await searchParams;
  const msg = errorMessage(erro);
  return (
    <div className="center">
      <h1>Bem-vindo</h1>
      <p className="mut">Crie sua organização. Se um escritório convidou você, use o mesmo e-mail do convite e recarregue esta página.</p>
      {msg && <div className="flash err" role="alert">{msg}</div>}
      <form action={createOrg} className="card">
        <label htmlFor="n">Nome</label><input id="n" name="nome" required minLength={2} maxLength={120} />
        <label htmlFor="t" style={{ marginTop: ".6rem" }}>Tipo</label>
        <select id="t" name="tipo"><option value="empresa">Empresa (1 CNPJ)</option><option value="escritorio">Escritório contábil (vários CNPJs)</option></select>
        <div className="actions"><button className="primary">Criar organização</button></div>
      </form>
    </div>
  );
}
