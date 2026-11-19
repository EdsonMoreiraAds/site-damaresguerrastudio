import base64, datetime as dt, gzip, sys
from pathlib import Path

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

sys.path.insert(0, str(Path(__file__).parent.parent))
import evolua_agent  # noqa: F401  (ajusta sys.path para _ref)
from assinar import Certificado
from sefin import ErroSefin
from evolua_agent.job import processar

CNPJ = "11222333000181"


def faz_pfx(tmp_path, cnpj=CNPJ, dias=365):
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nome = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, f"EMPRESA TESTE LTDA:{cnpj}")])
    agora = dt.datetime.now(dt.timezone.utc)
    c = (x509.CertificateBuilder().subject_name(nome).issuer_name(nome).public_key(k.public_key())
         .serial_number(1).not_valid_before(agora - dt.timedelta(days=400)).not_valid_after(agora + dt.timedelta(days=dias))
         .sign(k, hashes.SHA256()))
    p = tmp_path / "c.pfx"
    p.write_bytes(pkcs12.serialize_key_and_certificates(b"t", k, c, None, serialization.BestAvailableEncryption(b"senha")))
    return Certificado(p, "senha")


def job(**kw):
    j = {"attempt_id": "a" * 36, "mode": "emitir", "ambiente": "homologacao", "dps_id": "x", "dps_numero": 7, "serie": "00001",
         "prestador": {"cnpj": CNPJ, "razao_social": "EMPRESA TESTE", "municipio_ibge": "2304400", "cloc_prestacao": "2304400",
                       "ctrib_nac": "010701", "ctrib_mun": "001", "aliq_simples": 4.0, "texto_fixo": ""},
         "tomador": {"documento": "52998224725", "nome": "FULANO", "cep": "60000000", "numero": "10", "complemento": ""},
         "servico": {"descricao": "Consultoria", "codigo": "01.07"}, "competencia": "2026-11-01", "valor": 1500.0}
    j.update(kw)
    return j


CEP = lambda c: {"cmun": "2304400", "logradouro": "Rua A", "bairro": "Centro"}


def resposta_nfse():
    xml = b'<NFSe><infNFSe Id="NFS' + b"1" * 50 + b'"><nNFSe>42</nNFSe></infNFSe></NFSe>'
    return {"chaveAcesso": "1" * 50, "nfseXmlGZipB64": base64.b64encode(gzip.compress(xml)).decode()}


class FakeSefin:
    def __init__(self, existente=None, emitir=None):
        self.existente, self._emitir, self.emitiu = existente, emitir, 0

    def nfse_da_dps(self, i): return self.existente
    def emitir(self, corpo):
        self.emitiu += 1
        r = self._emitir
        if isinstance(r, Exception): raise r
        assert b"Signature" in gzip.decompress(base64.b64decode(corpo["dpsXmlGZipB64"]))   # DPS foi assinada
        return r


def roda(j, cert, sefin): return processar(j, cert, lambda c, amb: sefin, CEP)


def test_emite_assina_e_valida_no_xsd(tmp_path):
    s = FakeSefin(emitir=resposta_nfse())
    r = roda(job(), faz_pfx(tmp_path), s)
    assert r["outcome"] == "autorizada" and r["chave"] == "1" * 50 and r["external_id"] == "42" and s.emitiu == 1


def test_dps_que_ja_virou_nota_nao_reemite(tmp_path):
    s = FakeSefin(existente=resposta_nfse(), emitir=AssertionError("não pode emitir"))
    r = roda(job(), faz_pfx(tmp_path), s)
    assert r["outcome"] == "autorizada" and s.emitiu == 0


def test_timeout_depois_do_envio_e_indefinida(tmp_path):
    r = roda(job(), faz_pfx(tmp_path), FakeSefin(emitir=ErroSefin("timeout")))
    assert r["outcome"] == "indefinida"


def test_recusa_da_sefin_e_rejeitada_com_codigos(tmp_path):
    e = ErroSefin("recusou", status=400, corpo={"erros": [{"codigo": "E0010", "descricao": "Série inválida"}]})
    r = roda(job(), faz_pfx(tmp_path), FakeSefin(emitir=e))
    assert r["outcome"] == "rejeitada" and "E0010" in r["motivo"]


def test_5xx_e_incerto(tmp_path):
    r = roda(job(), faz_pfx(tmp_path), FakeSefin(emitir=ErroSefin("x", status=503)))
    assert r["outcome"] == "indefinida"


def test_certificado_de_outro_cnpj_nao_envia(tmp_path):
    s = FakeSefin(emitir=AssertionError())
    r = roda(job(), faz_pfx(tmp_path, cnpj="11444777000161"), s)
    assert r["outcome"] == "rejeitada" and "[agente]" in r["motivo"] and s.emitiu == 0


def test_certificado_vencido(tmp_path):
    assert roda(job(), faz_pfx(tmp_path, dias=-2), FakeSefin())["outcome"] == "rejeitada"


def test_consulta_nunca_emite(tmp_path):
    s = FakeSefin(emitir=AssertionError())
    r = roda(job(mode="consultar"), faz_pfx(tmp_path), s)
    assert r["outcome"] == "rejeitada" and "nada foi emitido" in r["motivo"] and s.emitiu == 0


def test_producao_usa_tp_amb_1(tmp_path):
    seen = {}
    class S(FakeSefin):
        def emitir(self, corpo):
            seen["xml"] = gzip.decompress(base64.b64decode(corpo["dpsXmlGZipB64"]))
            return resposta_nfse()
    r = processar(job(ambiente="producao"), faz_pfx(tmp_path), lambda c, amb: (seen.setdefault("amb", amb), S())[1], CEP)
    assert r["outcome"] == "autorizada" and seen["amb"] == "producao" and b"<tpAmb>1</tpAmb>" in seen["xml"]
    assert b"finNFSe" not in seen["xml"]


def test_dados_fiscais_incompletos(tmp_path):
    j = job(); j["prestador"]["ctrib_nac"] = None
    assert roda(j, faz_pfx(tmp_path), FakeSefin())["outcome"] == "rejeitada"
