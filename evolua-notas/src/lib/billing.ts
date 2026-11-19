/** Preços em centavos — evita erro de ponto flutuante. Valores do MVP, a validar com escritórios piloto. */
export type PlanId = "essencial" | "pro" | "escritorio";

export interface Plan {
  id: PlanId;
  nome: string;
  mensalidade: number;
  cnpjsIncluidos: number;
  notasIncluidas: number;
  excedenteNota: number;
  cnpjAdicional: number; // 0 = não permite CNPJ adicional
}

export const PLANS: Record<PlanId, Plan> = {
  essencial: { id: "essencial", nome: "Empresa Essencial", mensalidade: 4900, cnpjsIncluidos: 1, notasIncluidas: 30, excedenteNota: 150, cnpjAdicional: 0 },
  pro: { id: "pro", nome: "Empresa Pro", mensalidade: 9900, cnpjsIncluidos: 1, notasIncluidas: 100, excedenteNota: 90, cnpjAdicional: 0 },
  escritorio: { id: "escritorio", nome: "Escritório Contábil", mensalidade: 29900, cnpjsIncluidos: 10, notasIncluidas: 300, excedenteNota: 70, cnpjAdicional: 1900 },
};

export interface Invoice {
  mensalidade: number;
  cnpjsExtras: number;
  valorCnpjsExtras: number;
  notasExcedentes: number;
  valorExcedente: number;
  total: number;
}

export function estimate(planId: PlanId, autorizadas: number, cnpjsAtivos: number): Invoice {
  const p = PLANS[planId];
  const cnpjsExtras = Math.max(0, cnpjsAtivos - p.cnpjsIncluidos);
  const notasExcedentes = Math.max(0, autorizadas - p.notasIncluidas);
  const valorCnpjsExtras = cnpjsExtras * p.cnpjAdicional;
  const valorExcedente = notasExcedentes * p.excedenteNota;
  return { mensalidade: p.mensalidade, cnpjsExtras, valorCnpjsExtras, notasExcedentes, valorExcedente,
           total: p.mensalidade + valorCnpjsExtras + valorExcedente };
}

export const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
