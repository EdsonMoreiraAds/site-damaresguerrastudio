import Link from "next/link";
import { getContext } from "@/lib/context";
import { signOut, switchOrg } from "../actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  return (
    <div className="shell">
      <nav className="side">
        <div className="brand">Evolua Notas</div>
        {ctx.orgs.length > 1 ? (
          <form action={switchOrg}>
            <select name="org" defaultValue={ctx.org.id} aria-label="Organização">{ctx.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            <button style={{ marginTop: ".3rem", width: "100%" }}>Trocar</button>
          </form>
        ) : <div className="mut" style={{ padding: ".25rem .75rem" }}>{ctx.org.name}</div>}
        <Link href="/notas">Notas de serviço</Link>
        <Link href="/empresas">Empresas</Link>
        {ctx.isAdmin && <Link href="/plano">Plano e consumo</Link>}
        <div style={{ flex: 1 }} />
        <div className="mut" style={{ fontSize: ".78rem", padding: ".25rem .75rem" }}>{ctx.user.email}<br />Papel: {ctx.role}</div>
        <form action={signOut}><button style={{ width: "100%" }}>Sair</button></form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
