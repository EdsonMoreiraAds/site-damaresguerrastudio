"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { newAgentToken } from "@/lib/agent-token";
import { runSimulated } from "@/lib/fiscal/run";
import { errorCode } from "@/lib/errors";
import { isValidCnpj, isValidTomadorDoc, onlyDigits, parseMoney } from "@/lib/validators";
import { back } from "./flash";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const uuid = z.string().uuid();

// ---------------- autenticação ----------------
export async function signIn(f: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: str(f, "email"), password: str(f, "senha") });
  if (error) back("/login", { erro: "credenciais" });
  await sb.rpc("accept_invitations");
  back("/notas", {});   // ?erro=erro_generico nunca é exibido sem mapeamento; ver flash
}

export async function signUp(f: FormData) {
  const senha = str(f, "senha");
  if (senha.length < 10) back("/login", { erro: "senha_fraca" });
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({
    email: str(f, "email"), password: senha,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
  });
  if (error) back("/login", { erro: "campos_invalidos" });
  if (!data.session) back("/login", { erro: "confirme_email" });
  back("/onboarding", {});
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  back("/login", {});
}

export async function switchOrg(f: FormData) {
  const id = uuid.safeParse(str(f, "org"));
  const sb = await supabaseServer();
  if (id.success) {
    const { data } = await sb.from("memberships").select("org_id").eq("org_id", id.data).eq("active", true).maybeSingle();
    if (data) (await cookies()).set("org", id.data, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  }
  back("/notas", {});
}

// ---------------- organização / empresas ----------------
export async function createOrg(f: FormData) {
  const p = z.object({ nome: z.string().min(2).max(120), tipo: z.enum(["empresa", "escritorio"]) })
    .safeParse({ nome: str(f, "nome"), tipo: str(f, "tipo") });
  if (!p.success) back("/onboarding", { erro: "campos_invalidos" });
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("create_org", { p_name: p.data!.nome, p_kind: p.data!.tipo });
  if (error) back("/onboarding", { erro: errorCode(error) });
  (await cookies()).set("org", data as string, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  back("/empresas", {});
}

export async function createCompany(f: FormData) {
  const org = uuid.safeParse(str(f, "org"));
  const cnpj = onlyDigits(str(f, "cnpj"));
  if (!org.success || !isValidCnpj(cnpj)) back("/empresas", { erro: "cnpj_invalido" });
  const codigos = str(f, "codigos").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 50);
  const emissor = str(f, "emissor") === "agente" ? "agente" : "simulado";
  const ibge = onlyDigits(str(f, "ibge"));
  if (ibge.length !== 7 || str(f, "razao").length < 2) back("/empresas", { erro: "campos_invalidos" });
  const sb = await supabaseServer();
  const { error } = await sb.rpc("create_company", {
    p_org: org.data, p_cnpj: cnpj, p_razao: str(f, "razao"), p_ibge: ibge, p_codigos: codigos, p_emissor: emissor,
  });
  if (error) back("/empresas", { erro: errorCode(error) });
  back("/empresas", { ok: "empresa" });
}

export async function setEmissor(f: FormData) {
  const id = uuid.safeParse(str(f, "company"));
  if (!id.success) back("/empresas", { erro: "campos_invalidos" });
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_company_emissor", { p_company: id.data, p_emissor: str(f, "emissor") === "agente" ? "agente" : "simulado" });
  if (error) back("/empresas", { erro: errorCode(error) });
  back("/empresas", { ok: "emissor" });
}

export async function updateCompanyFiscal(f: FormData) {
  const id = uuid.safeParse(str(f, "company"));
  const serie = onlyDigits(str(f, "serie")).padStart(5, "0");
  const aliq = Number(str(f, "aliq").replace(",", "."));
  const ok = id.success && /^\d{5}$/.test(serie) && +serie >= 1 && +serie <= 49999 && aliq >= 0 && aliq <= 100
    && /^(\d{6})?$/.test(onlyDigits(str(f, "ctrib_nac"))) && /^(\d{3})?$/.test(onlyDigits(str(f, "ctrib_mun")))
    && /^(\d{7})?$/.test(onlyDigits(str(f, "cloc")));
  if (!ok) back("/empresas", { erro: "campos_invalidos" });
  const sb = await supabaseServer();
  const { error } = await sb.rpc("update_company_fiscal", {
    p_company: id.data, p_serie: serie, p_ctrib_nac: onlyDigits(str(f, "ctrib_nac")), p_ctrib_mun: onlyDigits(str(f, "ctrib_mun")),
    p_cloc_prestacao: onlyDigits(str(f, "cloc")), p_aliq: aliq, p_texto: str(f, "texto").slice(0, 500),
  });
  if (error) back("/empresas", { erro: errorCode(error) });
  back("/empresas", { ok: "fiscal" });
}

export async function enableProduction(f: FormData) {
  const id = uuid.safeParse(str(f, "company"));
  if (!id.success) back("/empresas", { erro: "campos_invalidos" });
  const sb = await supabaseServer();
  const { error } = await sb.rpc("enable_production", { p_company: id.data });
  if (error) back("/empresas", { erro: errorCode(error) });
  back("/empresas", { ok: "producao" });
}

export async function setFourEyes(f: FormData) {
  const org = uuid.safeParse(str(f, "org"));
  if (!org.success) back("/empresas", { erro: "campos_invalidos" });
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_four_eyes", { p_org: org.data, p_on: f.get("on") === "1" });
  if (error) back("/empresas", { erro: errorCode(error) });
  back("/empresas", { ok: "regra" });
}

// ---------------- equipe ----------------
export async function inviteMember(f: FormData) {
  const p = z.object({ org: uuid, email: z.string().email().max(200), papel: z.enum(["admin", "solicitante", "operador"]) })
    .safeParse({ org: str(f, "org"), email: str(f, "email"), papel: str(f, "papel") });
  if (!p.success) back("/empresas", { erro: "campos_invalidos" });
  const companies = f.getAll("empresas").map(String).filter((x) => uuid.safeParse(x).success);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("invite_member", { p_org: p.data!.org, p_email: p.data!.email, p_role: p.data!.papel, p_companies: companies });
  if (error) back("/empresas", { erro: errorCode(error) });
  back("/empresas", { ok: "convite" });
}

export async function setMemberAccess(f: FormData) {
  const p = z.object({ org: uuid, user: uuid, papel: z.enum(["admin", "solicitante", "operador"]) })
    .safeParse({ org: str(f, "org"), user: str(f, "user"), papel: str(f, "papel") });
  if (!p.success) back("/empresas", { erro: "campos_invalidos" });
  const companies = f.getAll("empresas").map(String).filter((x) => uuid.safeParse(x).success);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_member_access", {
    p_org: p.data!.org, p_user: p.data!.user, p_role: p.data!.papel, p_active: f.get("ativo") === "1", p_companies: companies,
  });
  if (error) back("/empresas", { erro: errorCode(error) });
  back("/empresas", { ok: "acesso" });
}

// ---------------- agente local ----------------
export async function createAgent(_prev: unknown, f: FormData): Promise<{ token?: string; erro?: string }> {
  const company = uuid.safeParse(str(f, "company"));
  const nome = str(f, "nome");
  if (!company.success || nome.length < 2) return { erro: "Informe um nome para o agente." };
  const { token, hash } = newAgentToken();
  const sb = await supabaseServer();
  const { error } = await sb.rpc("create_agent", { p_company: company.data, p_name: nome, p_token_hash: hash });
  if (error) return { erro: errorCode(error) === "empresa_sem_agente" ? "Mude o emissor da empresa para 'agente' primeiro." : "Sem permissão." };
  return { token };   // exibido uma única vez; só o hash fica no banco
}

export async function revokeAgent(f: FormData) {
  const id = uuid.safeParse(str(f, "agent"));
  if (!id.success) back("/empresas", { erro: "campos_invalidos" });
  const sb = await supabaseServer();
  const { error } = await sb.rpc("revoke_agent", { p_agent: id.data });
  if (error) back("/empresas", { erro: errorCode(error) });
  back("/empresas", { ok: "agente" });
}

// ---------------- notas ----------------
const reqSchema = z.object({
  doc: z.string().refine(isValidTomadorDoc, "documento_invalido"),
  nome: z.string().min(2).max(200),
  cep: z.string().regex(/^\d{8}$/, "cep_invalido"),
  numero: z.string().min(1).max(10),
  compl: z.string().max(60),
  desc: z.string().min(3).max(2000),
  codigo: z.string().min(1).max(20),
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  valor: z.number().positive(),
});
function parseReq(f: FormData) {
  return reqSchema.safeParse({
    doc: str(f, "doc"), nome: str(f, "nome"), cep: onlyDigits(str(f, "cep")), numero: str(f, "numero"),
    compl: str(f, "compl"), desc: str(f, "desc"), codigo: str(f, "codigo"),
    competencia: str(f, "competencia"), valor: parseMoney(str(f, "valor")) ?? -1,
  });
}

export async function createRequest(f: FormData) {
  const company = uuid.safeParse(str(f, "company"));
  const p = parseReq(f);
  if (!company.success) back("/notas/nova", { erro: "campos_invalidos" });
  if (!p.success) back("/notas/nova", { erro: p.error.issues.some((i) => i.message === "documento_invalido") ? "documento_invalido" : p.error.issues.some((i) => i.message === "cep_invalido") ? "cep_invalido" : "campos_invalidos" });
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("create_request", {
    p_company: company.data, p_doc: p.data!.doc, p_nome: p.data!.nome, p_cep: p.data!.cep, p_numero: p.data!.numero, p_compl: p.data!.compl, p_desc: p.data!.desc,
    p_codigo: p.data!.codigo, p_competencia: `${p.data!.competencia}-01`, p_valor: p.data!.valor,
  });
  if (error) back("/notas/nova", { erro: errorCode(error) });
  if (f.get("revisao") === "1") await sb.rpc("submit_request", { p_id: data });
  back(`/notas/${data}`, { ok: f.get("revisao") === "1" ? "revisao" : "criada" });
}

export async function updateRequest(f: FormData) {
  const id = uuid.safeParse(str(f, "id"));
  if (!id.success) back("/notas", { erro: "campos_invalidos" });
  const path = `/notas/${id.data}/editar`;
  const p = parseReq(f);
  if (!p.success) back(path, { erro: p.error.issues.some((i) => i.message === "documento_invalido") ? "documento_invalido" : p.error.issues.some((i) => i.message === "cep_invalido") ? "cep_invalido" : "campos_invalidos" });
  const sb = await supabaseServer();
  const { error } = await sb.rpc("update_request", {
    p_id: id.data, p_doc: p.data!.doc, p_nome: p.data!.nome, p_cep: p.data!.cep, p_numero: p.data!.numero, p_compl: p.data!.compl, p_desc: p.data!.desc,
    p_codigo: p.data!.codigo, p_competencia: `${p.data!.competencia}-01`, p_valor: p.data!.valor,
  });
  if (error) back(path, { erro: errorCode(error) });
  back(`/notas/${id.data}`, { ok: "salva" });
}

async function simple(f: FormData, fn: string, ok: string) {
  const id = uuid.safeParse(str(f, "id"));
  if (!id.success) back("/notas", { erro: "campos_invalidos" });
  const sb = await supabaseServer();
  const { error } = await sb.rpc(fn, { p_id: id.data });
  if (error) back(`/notas/${id.data}`, { erro: errorCode(error) });
  back(fn === "delete_draft" ? "/notas" : `/notas/${id.data}`, { ok });
}
export const submitRequest = async (f: FormData) => simple(f, "submit_request", "revisao");
export const approveRequest = async (f: FormData) => simple(f, "approve_request", "aprovada");
export const reopenRequest = async (f: FormData) => simple(f, "reopen_request", "reaberta");
export const deleteDraft = async (f: FormData) => simple(f, "delete_draft", "excluida");

async function dispatch(f: FormData, fn: "begin_send" | "begin_reconcile", ok: string) {
  const id = uuid.safeParse(str(f, "id"));
  if (!id.success) back("/notas", { erro: "campos_invalidos" });
  const sb = await supabaseServer();
  const { data: attempt, error } = await sb.rpc(fn, { p_id: id.data });
  if (error) back(`/notas/${id.data}`, { erro: errorCode(error) });
  // O banco já travou a nota em "processando": um 2º clique cai em status_invalido.
  try { await runSimulated(attempt as string); } catch { /* fica "enviada"; a varredura marca como em verificação */ }
  back(`/notas/${id.data}`, { ok });
}
export const sendRequest = async (f: FormData) => dispatch(f, "begin_send", "enviada");
export const reconcileRequest = async (f: FormData) => dispatch(f, "begin_reconcile", "consultada");
