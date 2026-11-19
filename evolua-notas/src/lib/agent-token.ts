import { createHash, randomBytes } from "node:crypto";

/** Token do agente: 256 bits aleatórios. Só o SHA-256 é guardado; o valor claro aparece uma única vez. */
export function newAgentToken() {
  const token = "evn_" + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
