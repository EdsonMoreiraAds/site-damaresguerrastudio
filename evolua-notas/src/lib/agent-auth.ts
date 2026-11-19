import "server-only";
import { hashToken } from "./agent-token";

/** Extrai o token Bearer do agente e devolve o hash (é o que o banco conhece). */
export function agentHash(req: Request): string | null {
  const m = /^Bearer (evn_[A-Za-z0-9_-]{40,60})$/.exec(req.headers.get("authorization") ?? "");
  return m ? hashToken(m[1]) : null;
}

/** Limite simples por instância contra força bruta de token (a defesa real é a entropia de 256 bits). */
const hits = new Map<string, { n: number; t: number }>();
export function tooMany(key: string, max = 120, windowMs = 60_000) {
  const now = Date.now(); const h = hits.get(key);
  if (!h || now - h.t > windowMs) { hits.set(key, { n: 1, t: now }); return false; }
  return ++h.n > max;
}
