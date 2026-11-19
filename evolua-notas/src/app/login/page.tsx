import { errorMessage } from "@/lib/errors";
import { signIn, signUp } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const msg = errorMessage(erro);
  return (
    <div className="center">
      <h1>Evolua Notas</h1>
      <p className="mut">Solicite, revise e emita NFS-e de vários CNPJs em um painel.</p>
      {msg && <div className={`flash ${erro === "confirme_email" ? "ok" : "err"}`} role="alert">{msg}</div>}
      <form action={signIn} className="card">
        <h2 style={{ marginTop: 0 }}>Entrar</h2>
        <label htmlFor="e1">E-mail</label><input id="e1" name="email" type="email" required autoComplete="email" />
        <label htmlFor="s1" style={{ marginTop: ".6rem" }}>Senha</label><input id="s1" name="senha" type="password" required autoComplete="current-password" />
        <div className="actions"><button className="primary">Entrar</button></div>
      </form>
      <form action={signUp} className="card">
        <h2 style={{ marginTop: 0 }}>Criar conta</h2>
        <label htmlFor="e2">E-mail</label><input id="e2" name="email" type="email" required autoComplete="email" />
        <label htmlFor="s2" style={{ marginTop: ".6rem" }}>Senha (mínimo 10 caracteres)</label>
        <input id="s2" name="senha" type="password" required minLength={10} autoComplete="new-password" />
        <div className="actions"><button>Criar conta</button></div>
        <p className="mut" style={{ fontSize: ".8rem" }}>Convidado por um escritório? Crie a conta com o e-mail do convite.</p>
      </form>
    </div>
  );
}
