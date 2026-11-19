"use client";
import { useActionState } from "react";
import { createAgent } from "./app/actions";

export function AgentForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(createAgent, {} as { token?: string; erro?: string });
  return (
    <form action={action} className="row">
      <input type="hidden" name="company" value={companyId} />
      <div className="grow"><label htmlFor={`ag-${companyId}`}>Novo agente local</label><input id={`ag-${companyId}`} name="nome" placeholder="Ex.: PC do escritório" required minLength={2} maxLength={80} /></div>
      <button disabled={pending}>Gerar token</button>
      {state.erro && <div className="flash err" style={{ width: "100%" }}>{state.erro}</div>}
      {state.token && <div className="flash ok" style={{ width: "100%" }}>Copie agora — não será exibido de novo:<div className="mono">{state.token}</div></div>}
    </form>
  );
}
