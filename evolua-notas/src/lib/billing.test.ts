import { describe, expect, it } from "vitest";
import { estimate } from "./billing";

describe("estimativa de cobrança", () => {
  it("exemplo da especificação: 12 CNPJs e 350 notas = R$ 372,00", () => {
    const r = estimate("escritorio", 350, 12);
    expect(r).toMatchObject({ cnpjsExtras: 2, valorCnpjsExtras: 3800, notasExcedentes: 50, valorExcedente: 3500, total: 37200 });
  });
  it("dentro da franquia cobra só a mensalidade", () => {
    expect(estimate("essencial", 30, 1).total).toBe(4900);
    expect(estimate("pro", 100, 1).total).toBe(9900);
  });
  it("excedente por nota nos planos de empresa", () => {
    expect(estimate("essencial", 40, 1).total).toBe(4900 + 10 * 150);
    expect(estimate("pro", 110, 1).total).toBe(9900 + 10 * 90);
  });
  it("zero notas", () => expect(estimate("escritorio", 0, 3).total).toBe(29900));
});
