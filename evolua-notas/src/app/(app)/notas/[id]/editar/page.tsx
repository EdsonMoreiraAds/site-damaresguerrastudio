import { notFound } from "next/navigation";
import { getContext } from "@/lib/context";
import { EDITABLE, type Status } from "@/lib/status";
import { Flash } from "@/components";
import { RequestForm } from "@/request-form";
import { updateRequest } from "../../../../actions";

export default async function Editar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { id } = await params; const sp = await searchParams;
  const { supabase, companies } = await getContext();
  const { data: r } = await supabase.from("invoice_requests").select("*").eq("id", id).maybeSingle();
  if (!r || !EDITABLE.includes(r.status as Status)) notFound();
  return (<><h1>Editar solicitação</h1>
    {r.status === "aprovada" && <div className="flash err">Alterar uma nota aprovada cancela a aprovação: ela volta para revisão.</div>}
    <Flash erro={sp.erro} /><RequestForm action={updateRequest} companies={companies} v={r} lockCompany /></>);
}
