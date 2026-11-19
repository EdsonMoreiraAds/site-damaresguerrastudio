import { describe, expect, it } from "vitest";
import { chaveSimulada, emitirSimulado, type Job } from "./simulado";

const job: Job = { dpsId: "0b2d8f9e-1111-4222-8333-444455556666", mode: "emitir", prestadorCnpj: "11222333000181",
  tomadorDoc: "52998224725", tomadorNome: "Fulano <&>", descricao: "Consultoria", codigoServico: "01.07",
  competencia: "2026-11-01", valor: 100 };

describe("emissor simulado", () => {
  it("autoriza e escapa XML", () => {
    const r = emitirSimulado(job);
    expect(r.outcome).toBe("autorizada");
    if (r.outcome === "autorizada") { expect(r.xml).toContain("Fulano &lt;&amp;&gt;"); expect(r.xml).toContain("SEM VALOR FISCAL"); }
  });
  it("timeout -> indefinida; a consulta devolve a mesma chave", () => {
    const t = { ...job, descricao: "teste TIMEOUT" };
    expect(emitirSimulado(t).outcome).toBe("indefinida");
    const c = emitirSimulado({ ...t, mode: "consultar" });
    expect(c.outcome === "autorizada" && c.chave).toBe(chaveSimulada(job.dpsId));
  });
  it("rejeições", () => {
    expect(emitirSimulado({ ...job, descricao: "REJEITAR" }).outcome).toBe("rejeitada");
    expect(emitirSimulado({ ...job, valor: 60000 }).outcome).toBe("rejeitada");
  });
});
