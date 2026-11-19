"""Cliente HTTPS do Evolua Notas (somente biblioteca padrão)."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import date


class ErroApi(Exception):
    def __init__(self, msg: str, status: int | None = None):
        super().__init__(msg)
        self.status = status


class Evolua:
    def __init__(self, servidor: str, token: str, timeout: int = 60):
        if not servidor.startswith("https://") and not servidor.startswith("http://localhost"):
            raise ValueError("o servidor deve usar https://")
        self.base, self.token, self.timeout = servidor.rstrip("/"), token, timeout

    def _req(self, metodo: str, caminho: str, corpo: dict | None = None):
        dados = json.dumps(corpo).encode() if corpo is not None else None
        req = urllib.request.Request(self.base + caminho, data=dados, method=metodo, headers={
            "Authorization": f"Bearer {self.token}", "Content-Type": "application/json", "User-Agent": "evolua-agent/0.1"})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                bruto = r.read()
                return r.status, (json.loads(bruto) if bruto else None)
        except urllib.error.HTTPError as e:
            raise ErroApi(f"HTTP {e.code}", e.code) from None
        except (OSError, ValueError) as e:
            raise ErroApi(f"sem conexão com o Evolua Notas: {e}") from None

    def proximo_job(self, cert_valido_ate: date | None = None) -> dict | None:
        q = f"?cert_valid_until={cert_valido_ate.isoformat()}" if cert_valido_ate else ""
        status, corpo = self._req("GET", "/api/agent/jobs" + q)
        return corpo if status == 200 else None

    def reportar(self, attempt_id: str, resultado: dict) -> str:
        _, corpo = self._req("POST", f"/api/agent/jobs/{attempt_id}/result", resultado)
        return (corpo or {}).get("resultado", "")
