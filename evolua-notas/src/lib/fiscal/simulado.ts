/**
 * Emissor SIMULADO — somente homologação. Não fala com nenhuma prefeitura e o XML gerado
 * não tem valor fiscal. Serve para exercitar fila, idempotência, rejeição e reconciliação.
 *
 * Regras de teste (para o piloto reproduzir cada caminho):
 *   - descrição contendo "TIMEOUT"  -> resultado indefinido (nota vai para "Em verificação"); a consulta autoriza
 *   - descrição contendo "REJEITAR" -> rejeitada com motivo
 *   - valor acima de R$ 50.000,00   -> rejeitada
 */
import { createHash } from "node:crypto";

export interface Job {
  dpsId: string;
  mode: "emitir" | "consultar";
  prestadorCnpj: string; tomadorDoc: string; tomadorNome: string;
  descricao: string; codigoServico: string; competencia: string; valor: number;
}
export type Outcome =
  | { outcome: "autorizada"; chave: string; externalId: string; xml: string }
  | { outcome: "rejeitada"; motivo: string }
  | { outcome: "indefinida"; motivo: string };

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));

/** Chave determinística pelo dpsId: reconsultar devolve SEMPRE a mesma nota (idempotência). */
export function chaveSimulada(dpsId: string) {
  return "SIM" + createHash("sha256").update(dpsId).digest("hex").slice(0, 47).toUpperCase();
}

export function emitirSimulado(j: Job): Outcome {
  if (j.mode === "emitir") {
    if (/TIMEOUT/i.test(j.descricao)) return { outcome: "indefinida", motivo: "Sem resposta do emissor (simulado)." };
    if (/REJEITAR/i.test(j.descricao)) return { outcome: "rejeitada", motivo: "E999 — rejeição simulada pelo texto da descrição." };
    if (j.valor > 50_000) return { outcome: "rejeitada", motivo: "E160 — valor acima do limite do simulador." };
  }
  const chave = chaveSimulada(j.dpsId);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- DOCUMENTO SIMULADO — SEM VALOR FISCAL -->
<NFSeSimulada versao="0">
  <chave>${chave}</chave><dps>${esc(j.dpsId)}</dps>
  <prestador><cnpj>${esc(j.prestadorCnpj)}</cnpj></prestador>
  <tomador><documento>${esc(j.tomadorDoc)}</documento><nome>${esc(j.tomadorNome)}</nome></tomador>
  <servico><codigo>${esc(j.codigoServico)}</codigo><descricao>${esc(j.descricao)}</descricao></servico>
  <competencia>${esc(j.competencia)}</competencia><valor>${j.valor.toFixed(2)}</valor>
</NFSeSimulada>`;
  return { outcome: "autorizada", chave, externalId: "SIM-" + j.dpsId.slice(0, 8), xml };
}
