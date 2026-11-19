"""CLI:  evolua-agent configurar | testar | executar | instalar"""
from __future__ import annotations

import getpass
import sys
from pathlib import Path

from . import __version__, config

AJUDA = """evolua-agent {v}
  configurar   informa o servidor, o token e o certificado A1 (senha guardada no cofre do sistema)
  testar       confere o certificado e a conexão mTLS com a SEFIN (homologação), sem emitir nada
  executar     fica em execução buscando notas para emitir
  instalar     inicia o agente automaticamente quando você entrar no computador
"""


def configurar() -> None:
    from assinar import Certificado, CertificadoInvalido
    cfg = config.carregar()
    cfg["servidor"] = (input(f"Endereço do Evolua Notas [{cfg['servidor'] or 'https://...'}]: ").strip() or cfg["servidor"]).rstrip("/")
    if not cfg["servidor"].startswith("https://"):
        raise SystemExit("o endereço precisa começar com https://")
    token = getpass.getpass("Token do agente (evn_...; não aparece na tela): ").strip()
    pfx = input(f"Caminho do certificado .pfx [{cfg['pfx']}]: ").strip().strip('"') or cfg["pfx"]
    senha = getpass.getpass("Senha do certificado (não aparece na tela): ")
    try:
        cert = Certificado(Path(pfx), senha)
    except CertificadoInvalido as e:
        raise SystemExit(f"erro: {e}")
    if token:
        config.guardar_segredo("token", token)
    config.guardar_segredo("pfx-senha", senha)
    cfg["pfx"] = str(Path(pfx).resolve())
    config.salvar(cfg)
    print(f"OK. Certificado: {cert.titular[:70]}\nVence em {cert.validade[1]:%d/%m/%Y} ({cert.dias_para_vencer()} dias).")
    print("Mantenha o .pfx numa pasta sua, fora de Drive/OneDrive/iCloud. Próximo passo:  evolua-agent testar")


def testar() -> None:
    from sefin import Sefin
    from .runtime import abrir_certificado
    cert = abrir_certificado(config.carregar())
    print("Diagnóstico (homologação):", Sefin(cert, "restrita").diagnostico())


def autoteste() -> None:
    """Offline: gera um certificado descartável, monta a DPS, valida no XSD e assina. Prova que o pacote está íntegro."""
    import datetime as dt, tempfile
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives.serialization import pkcs12
    from cryptography.x509.oid import NameOID
    from assinar import Certificado, assinar_dps
    from dps import Endereco, Nota, Prestador, Servico, Tomador, monta_dps
    from validar import exige_valido
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    n = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "AUTOTESTE:11222333000181")])
    now = dt.datetime.now(dt.timezone.utc)
    c = x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(1) \
        .not_valid_before(now - dt.timedelta(days=1)).not_valid_after(now + dt.timedelta(days=30)).sign(k, hashes.SHA256())
    with tempfile.TemporaryDirectory() as d:
        f = Path(d) / "t.pfx"
        f.write_bytes(pkcs12.serialize_key_and_certificates(b"t", k, c, None, serialization.BestAvailableEncryption(b"x")))
        cert = Certificado(f, "x")
    for tp in ("2", "1"):   # restrita e produção
        nota = Nota(n_dps=1, competencia=dt.date.today().replace(day=1), valor="10.00", aliq_simples_nacional="4.00", tp_amb=tp,
                    prestador=Prestador(cnpj="11222333000181", cloc_emi="2304400"),
                    tomador=Tomador("52998224725", "FULANO", Endereco("60000000", "2304400", "Rua A", "1", "Centro")),
                    servico=Servico("010701", "001", "Teste", "2304400"))
        xml = monta_dps(nota); exige_valido(xml)
        assert b"Signature" in assinar_dps(xml, cert)
    print("autoteste OK: DPS montada, validada nos esquemas (restrita e produção) e assinada.")


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else ""
    if cmd == "configurar": configurar()
    elif cmd == "testar": testar()
    elif cmd == "executar":
        from .runtime import laco
        laco()
    elif cmd == "autoteste": autoteste()
    elif cmd == "instalar":
        from .autostart import instalar
        print(instalar())
    else:
        print(AJUDA.format(v=__version__)); return 0 if not cmd else 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
