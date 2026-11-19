"""Configuração e segredos. A senha do .pfx e o token ficam no cofre do sistema (Windows/macOS), nunca em arquivo."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

SERVICE = "evolua-agent"


def pasta_config() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config"))
    return base / "EvoluaAgent"


ARQUIVO = pasta_config() / "config.json"
PADRAO = {"servidor": "", "pfx": "", "intervalo_segundos": 20}


def carregar() -> dict:
    try:
        return {**PADRAO, **json.loads(ARQUIVO.read_text(encoding="utf-8"))}
    except (OSError, ValueError):
        return dict(PADRAO)


def salvar(cfg: dict) -> None:
    ARQUIVO.parent.mkdir(parents=True, exist_ok=True)
    ARQUIVO.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")
    try:
        os.chmod(ARQUIVO, 0o600)
    except OSError:
        pass


def _keyring():
    try:
        import keyring
        return keyring
    except ImportError:
        return None


def obter_segredo(nome: str, env: str) -> str | None:
    """Variável de ambiente (servidores sem cofre) ou cofre do sistema."""
    if os.environ.get(env):
        return os.environ[env]
    kr = _keyring()
    if kr is None:
        return None
    try:
        return kr.get_password(SERVICE, nome)
    except Exception:
        return None


def guardar_segredo(nome: str, valor: str) -> None:
    kr = _keyring()
    if kr is None:
        raise RuntimeError("cofre do sistema indisponível: defina EVOLUA_TOKEN e EVOLUA_PFX_SENHA no ambiente")
    kr.set_password(SERVICE, nome, valor)
