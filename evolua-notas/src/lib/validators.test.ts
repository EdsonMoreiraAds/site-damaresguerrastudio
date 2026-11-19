import { describe, expect, it } from "vitest";
import { isValidCnpj, isValidCpf, parseMoney } from "./validators";

describe("documentos", () => {
  it("CNPJ", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11444777000161")).toBe(true);
    expect(isValidCnpj("11222333000182")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
  });
  it("CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224724")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
  });
});
describe("valores", () => {
  it("parseMoney", () => {
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("R$ 99,9")).toBe(99.9);
    expect(parseMoney("1500")).toBe(1500);
    expect(parseMoney("0")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
  });
});
