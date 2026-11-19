import { redirect } from "next/navigation";
import { errorMessage } from "@/lib/errors";

const OK: Record<string, string> = {
  criada: "Solicitação criada.", salva: "Alterações salvas.", revisao: "Enviada para revisão.", aprovada: "Nota aprovada.",
  reaberta: "Nota reaberta para revisão.", enviada: "Nota enviada ao emissor.", consultada: "Consulta de resultado enviada.",
  excluida: "Rascunho excluído.", empresa: "Empresa cadastrada.", producao: "Produção habilitada.", convite: "Convite registrado.",
  acesso: "Acesso atualizado.", regra: "Regra atualizada.", agente: "Agente revogado.", emissor: "Emissor atualizado.", fiscal: "Dados fiscais salvos.",
};
export const okMessage = (k?: string) => (k ? OK[k] : undefined);
export { errorMessage };

export function back(path: string, flash: { ok?: string; erro?: string }): never {
  const sep = path.includes("?") ? "&" : "?";
  const q = flash.ok ? `ok=${encodeURIComponent(flash.ok)}` : `erro=${encodeURIComponent(flash.erro ?? "erro_generico")}`;
  redirect(`${path}${sep}${q}`);
}
