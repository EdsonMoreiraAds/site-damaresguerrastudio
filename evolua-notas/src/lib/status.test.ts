import { describe, expect, it } from "vitest";
import { availableActions } from "./status";

describe("ações por status", () => {
  it("nota em verificação só permite consultar (nunca reenviar)", () => {
    const a = availableActions("em_verificacao", true, true);
    expect(a.consultar).toBe(true);
    expect(a.enviar).toBe(false);
    expect(a.editar).toBe(false);
  });
  it("solicitante não aprova nem envia", () => {
    const a = availableActions("a_revisar", false, true);
    expect(a.aprovar).toBe(false);
    expect(a.enviar).toBe(false);
  });
  it("autorizada é imutável", () => {
    expect(Object.values(availableActions("autorizada", true, true)).every((v) => v === false)).toBe(true);
  });
});
