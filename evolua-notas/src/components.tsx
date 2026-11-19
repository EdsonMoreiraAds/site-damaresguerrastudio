import { STATUS_LABEL, type Status } from "@/lib/status";
import { errorMessage, okMessage } from "@/app/flash";

export function StatusBadge({ s }: { s: Status }) { return <span className={`badge s-${s}`}>{STATUS_LABEL[s]}</span>; }

export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  const o = okMessage(ok), e = errorMessage(erro);
  if (o) return <div className="flash ok" role="status">{o}</div>;
  if (e) return <div className="flash err" role="alert">{e}</div>;
  return null;
}
