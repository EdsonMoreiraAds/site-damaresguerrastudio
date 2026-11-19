import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { PlanId } from "@/lib/billing";

export interface Org { id: string; name: string; kind: "empresa" | "escritorio"; plan: PlanId; four_eyes: boolean }
export interface Company {
  id: string; org_id: string; cnpj: string; razao_social: string; municipio_ibge: string;
  codigos_servico: string[]; serie: string; ctrib_nac: string | null; ctrib_mun: string | null;
  cloc_prestacao: string | null; aliq_simples: number; texto_fixo: string; cert_valid_until: string | null; emissor: "simulado" | "agente"; ambiente: "homologacao" | "producao";
}
export type Role = "admin" | "solicitante" | "operador";

/** Contexto autenticado da requisição. Tudo que vem daqui já passou pela RLS. */
export async function getContext() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase
    .from("memberships")
    .select("org_id, role, organizations(id, name, kind, plan, four_eyes)")
    .eq("user_id", user.id).eq("active", true);
  const ms = (data ?? []) as unknown as { org_id: string; role: Role; organizations: Org }[];
  if (!ms.length) redirect("/onboarding");
  const wanted = (await cookies()).get("org")?.value;
  const m = ms.find((x) => x.org_id === wanted) ?? ms[0];
  const { data: cs } = await supabase.from("companies").select("*")
    .eq("org_id", m.org_id).eq("active", true).order("razao_social");
  return {
    supabase, user, org: m.organizations, role: m.role,
    isAdmin: m.role === "admin", canOperate: m.role === "admin" || m.role === "operador",
    companies: (cs ?? []) as Company[],
    orgs: ms.map((x) => ({ id: x.org_id, name: x.organizations.name })),
  };
}
