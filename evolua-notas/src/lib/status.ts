export type Status = "rascunho" | "a_revisar" | "aprovada" | "processando" | "autorizada" | "rejeitada" | "em_verificacao";

export const STATUS_LABEL: Record<Status, string> = {
  rascunho: "Rascunho", a_revisar: "A revisar", aprovada: "Aprovada", processando: "Processando",
  autorizada: "Autorizada", rejeitada: "Rejeitada", em_verificacao: "Em verificação",
};

/** Espelha as regras do banco (apenas para a interface decidir quais botões mostrar). */
export const EDITABLE: Status[] = ["rascunho", "a_revisar", "aprovada", "rejeitada"];

export function availableActions(status: Status, canOperate: boolean, isOwner: boolean) {
  return {
    editar: EDITABLE.includes(status) && (canOperate || isOwner),
    enviarParaRevisao: (status === "rascunho" || status === "rejeitada") && (canOperate || isOwner),
    aprovar: status === "a_revisar" && canOperate,
    reabrir: (status === "aprovada" || status === "rejeitada") && canOperate,
    enviar: status === "aprovada" && canOperate,
    consultar: status === "em_verificacao" && canOperate,
    excluir: status === "rascunho" && (canOperate || isOwner),
  };
}
