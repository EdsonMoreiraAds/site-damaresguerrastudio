"""Laço principal e peças de I/O reais."""
from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

from assinar import Certificado, CertificadoInvalido
from sefin import Sefin

from . import config
from .api import ErroApi, Evolua
from .job import RecusaLocal, processar


def consulta_cep(cep: str) -> dict:
    cep = "".join(c for c in cep if c.isdigit())
    try:
        with urllib.request.urlopen(f"https://viacep.com.br/ws/{cep}/json/", timeout=15) as r:
            d = json.load(r)
    except (OSError, ValueError) as e:
        raise RecusaLocal(f"não consegui consultar o CEP {cep}: {e}") from None
    if d.get("erro") or not d.get("ibge"):
        raise RecusaLocal(f"o CEP {cep} não existe: confira o cadastro da nota")
    return {"cmun": d["ibge"], "logradouro": d.get("logradouro") or "-", "bairro": d.get("bairro") or "-"}


def gerador_pdf():
    """DANFSe só se existir o molde (danfse_modelo.pdf) na pasta de configuração e o pymupdf estiver instalado."""
    modelo = config.pasta_config() / "danfse_modelo.pdf"
    if not modelo.exists():
        return None
    try:
        from danfse import gerar
    except Exception:
        return None
    return lambda xml: gerar(xml, modelo)


def abrir_certificado(cfg: dict) -> Certificado:
    senha = config.obter_segredo("pfx-senha", "EVOLUA_PFX_SENHA")
    if not cfg.get("pfx") or not senha:
        raise CertificadoInvalido("certificado não configurado: rode  evolua-agent configurar")
    return Certificado(Path(cfg["pfx"]), senha)


def laco(uma_vez: bool = False, log=print) -> None:
    cfg = config.carregar()
    token = config.obter_segredo("token", "EVOLUA_TOKEN")
    if not cfg["servidor"] or not token:
        raise SystemExit("agente não configurado: rode  evolua-agent configurar")
    api, cert, pdf = Evolua(cfg["servidor"], token), abrir_certificado(cfg), gerador_pdf()
    validade = cert.validade[1].date()
    log(f"agente ativo — certificado de {cert.titular[:60]} vence em {validade} ({cert.dias_para_vencer()} dias)")
    espera = cfg["intervalo_segundos"]
    while True:
        try:
            job = api.proximo_job(validade)
            if job:
                log(f"tentativa {job['attempt_id'][:8]} ({job['mode']}, {job['ambiente']})")
                res = processar(job, cert, lambda c, amb: Sefin(c, amb), consulta_cep, pdf)
                for _ in range(5):                                   # o resultado NÃO pode se perder
                    try:
                        log(f"  -> {res['outcome']} ({api.reportar(job['attempt_id'], res)})")
                        break
                    except ErroApi as e:
                        log(f"  falha ao reportar: {e}; repetindo")
                        time.sleep(5)
                if uma_vez:
                    return
                continue
        except ErroApi as e:
            if e.status == 401:
                raise SystemExit("token revogado ou inválido: gere outro em Empresas > Novo agente local")
            log(f"aviso: {e}")
        if uma_vez:
            return
        time.sleep(espera)
