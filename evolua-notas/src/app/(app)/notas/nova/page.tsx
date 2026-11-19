import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { Flash } from "@/components";
import { RequestForm } from "@/request-form";
import { createRequest } from "../../../actions";

export default async function Nova({ searchParams }: { searchParams: Promise<{ erro?: string; empresa?: string }> }) {
  const sp = await searchParams;
  const { companies } = await getContext();
  if (!companies.length) redirect("/empresas");
  return (<><h1>Nova solicitação</h1><Flash erro={sp.erro} /><RequestForm action={createRequest} companies={companies} current={sp.empresa} /></>);
}
