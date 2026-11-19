"""
Processa UMA tentativa de emissão. Sem I/O próprio: a SEFIN, o CEP e o PDF entram por parâmetro (testável).

Regras de segurança contra duplicidade:
  1. Antes de emitir, pergunta à SEFIN se a DPS (série+número) já virou nota (HEAD /dps/{id}). Se virou, NÃO emite: recupera.
  2. Falha ANTES do envio  -> "rejeitada" com motivo "[agente] ..." (nada saiu; o operador corrige e reenvia).
  3. Falha DEPOIS do envio (timeout/5xx/queda) -> "indefinida" (a nota vai para "em verificação"; nunca reenvia sozinha).
  4. mode="consultar" nunca emite.
"""
from __future__ import annotations

import base64
import dataclasses
import gzip
import re
from datetime import date, datetime, timedelta
from decimal import Decimal

from assinar import Certificado, assinar_dps, corpo_requisicao  # noqa: E402 (via sys.path)
from dps import BRASILIA, Endereco, Nota, Prestador, Servico, Tomador, id_dps, monta_dps
from sefin import ErroSefin
from validar import exige_valido

PAINEL = {"homologacao": ("restrita", "2"), "producao": ("producao", "1")}


class RecusaLocal(Exception):
    """Problema detectado antes de qualquer envio à SEFIN."""


def cnpj_do_certificado(cert: Certificado, cnpj: str) -> bool:
    """O CNPJ do titular consta no certificado (CN e extensão ICP-Brasil guardam os 14 dígitos em ASCII)."""
    from cryptography.hazmat.primitives import serialization
    return cnpj.encode() in cert.cert.public_bytes(serialization.Encoding.DER)


def montar_nota(job: dict, cep_lookup) -> Nota:
    p, t, s = job["prestador"], job["tomador"], job["servico"]
    _, tp_amb = PAINEL[job["ambiente"]]
    for k in ("ctrib_nac", "cloc_prestacao"):
        if not p.get(k):
            raise RecusaLocal(f"dados fiscais da empresa incompletos ({k})")
    end = cep_lookup(t["cep"])
    descricao = s["descricao"] + (("\n" + p["texto_fixo"]) if p.get("texto_fixo") else "")
    return Nota(
        n_dps=int(job["dps_numero"]), competencia=date.fromisoformat(job["competencia"]), valor=Decimal(str(job["valor"])),
        prestador=Prestador(cnpj=p["cnpj"], cloc_emi=p["municipio_ibge"], serie=job["serie"]),
        tomador=Tomador(cnpj_cpf=t["documento"], nome=t["nome"], endereco=Endereco(
            cep=t["cep"], cmun=end["cmun"], logradouro=end["logradouro"], numero=t["numero"],
            bairro=end["bairro"], complemento=t.get("complemento", ""))),
        servico=Servico(ctrib_nac=p["ctrib_nac"], ctrib_mun=p.get("ctrib_mun") or "", descricao=descricao, cloc_prestacao=p["cloc_prestacao"]),
        aliq_simples_nacional=f"{Decimal(str(p.get('aliq_simples') or 0)):.2f}", tp_amb=tp_amb,
    )


def _extrair(resposta: dict) -> dict:
    chave = resposta.get("chaveAcesso") or resposta.get("chave") or ""
    xml = b""
    if resposta.get("nfseXmlGZipB64"):
        xml = gzip.decompress(base64.b64decode(resposta["nfseXmlGZipB64"]))
    if not chave and xml:
        m = re.search(rb'<infNFSe[^>]*Id="NFS(\d{50})"', xml)
        chave = m.group(1).decode() if m else ""
    if len(chave) < 10:
        raise ErroSefin("resposta da SEFIN sem chave de acesso", corpo=resposta)
    m = re.search(rb"<nNFSe>\s*(\d+)\s*</nNFSe>", xml)
    return {"outcome": "autorizada", "chave": chave, "external_id": m.group(1).decode() if m else None,
            "xml": xml.decode("utf-8") if xml else None}


def _motivo(e: ErroSefin) -> str:
    corpo = e.corpo if isinstance(e.corpo, dict) else {}
    itens = [f"{x.get('codigo') or x.get('Codigo') or ''} {x.get('descricao') or x.get('Descricao') or ''}".strip()
             for x in corpo.get("erros", []) if isinstance(x, dict)]
    return ("; ".join(itens) or str(e))[:900]


def processar(job: dict, cert: Certificado, abrir_sefin, cep_lookup, gerar_pdf=None) -> dict:
    ambiente_sefin, _ = PAINEL[job["ambiente"]]
    pre = lambda msg: {"outcome": "rejeitada", "motivo": f"[agente] {msg}"[:900]}        # nada foi enviado
    incerto = lambda msg: {"outcome": "indefinida", "motivo": f"[agente] {msg}"[:900]}   # pode ter sido enviado

    if cert.dias_para_vencer() < 0:
        return pre("certificado A1 vencido")
    if not cnpj_do_certificado(cert, job["prestador"]["cnpj"]):
        return pre("o certificado não pertence ao CNPJ desta empresa")
    try:
        nota = montar_nota(job, cep_lookup)
        did = id_dps(nota)
        sefin = abrir_sefin(cert, ambiente_sefin)
    except RecusaLocal as e:
        return pre(str(e))
    except Exception as e:
        return pre(f"não consegui montar a nota: {e}")

    # 1) a DPS já virou nota? (cobre queda do agente depois do envio e toda consulta)
    try:
        existente = sefin.nfse_da_dps(did)
    except ErroSefin as e:
        return incerto(f"não consegui consultar a SEFIN: {e}")
    if existente is not None:
        try:
            return _com_pdf(_extrair(existente), gerar_pdf)
        except ErroSefin as e:
            return incerto(f"a DPS existe mas a resposta veio incompleta: {e}")
    if job["mode"] == "consultar":
        return pre("DPS não localizada na SEFIN: nada foi emitido. Revise e envie novamente")

    # 2) emitir
    try:
        def preparar(n: Nota):
            xml = monta_dps(n)
            exige_valido(xml)
            return corpo_requisicao(assinar_dps(xml, cert))
        corpo = preparar(nota)
    except Exception as e:
        return pre(f"DPS inválida: {e}")
    try:
        try:
            resposta = sefin.emitir(corpo)
        except ErroSefin as e:
            hora = (e.corpo or {}).get("dataHoraProcessamento") if isinstance(e.corpo, dict) else None
            if "E0008" not in _motivo(e) or not hora:
                raise
            servidor = datetime.fromisoformat(hora)                       # relógio adiantado: refaz uma vez
            servidor = servidor if servidor.tzinfo else servidor.replace(tzinfo=BRASILIA)
            resposta = sefin.emitir(preparar(dataclasses.replace(nota, dh_emi=servidor.astimezone(BRASILIA) - timedelta(seconds=30))))
    except ErroSefin as e:
        if e.status is not None and 400 <= e.status < 500:               # a SEFIN respondeu e recusou
            return {"outcome": "rejeitada", "motivo": _motivo(e)}
        return incerto(f"SEFIN sem resposta conclusiva: {e}")
    except Exception as e:
        return incerto(f"falha após o envio: {e}")
    try:
        return _com_pdf(_extrair(resposta), gerar_pdf)
    except ErroSefin as e:
        return incerto(f"resposta incompleta: {e}")


def _com_pdf(res: dict, gerar_pdf) -> dict:
    if gerar_pdf and res.get("xml"):
        try:
            res["pdf_base64"] = base64.b64encode(gerar_pdf(res["xml"].encode())).decode()
        except Exception:
            pass   # o PDF não desfaz a nota; fica disponível na consulta pública pela chave
    return res
