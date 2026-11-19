"""Agente local do Evolua Notas: assina com o certificado A1 e fala com a SEFIN Nacional."""
import sys
from pathlib import Path

__version__ = "0.1.0"

# Os módulos do emissor de referência (MIT) são importados como estão, por nome simples.
if not getattr(sys, "frozen", False):   # no executável (PyInstaller) os módulos já vêm empacotados
    _REF = Path(__file__).parent / "_ref"
    if str(_REF) not in sys.path:
        sys.path.insert(0, str(_REF))
