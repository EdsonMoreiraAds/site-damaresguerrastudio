"""Inicia o agente com o login do usuário: Windows (Agendador de Tarefas), macOS (LaunchAgent), Linux (systemd --user)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

NOME = "EvoluaAgent"


def _comando() -> list[str]:
    exe = Path(sys.executable if getattr(sys, "frozen", False) else sys.argv[0]).resolve()
    return [str(exe), "executar"] if getattr(sys, "frozen", False) else [sys.executable, "-m", "evolua_agent", "executar"]


def instalar() -> str:
    cmd = _comando()
    if sys.platform == "win32":
        subprocess.run(["schtasks", "/Create", "/F", "/SC", "ONLOGON", "/RL", "LIMITED", "/TN", NOME,
                        "/TR", subprocess.list2cmdline(cmd)], check=True)
        return "Tarefa criada no Agendador de Tarefas (inicia no login)."
    if sys.platform == "darwin":
        p = Path.home() / "Library/LaunchAgents/br.com.evolua.agent.plist"
        args = "".join(f"<string>{a}</string>" for a in cmd)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(f'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" '
                     f'"http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>'
                     f'<key>Label</key><string>br.com.evolua.agent</string><key>ProgramArguments</key><array>{args}</array>'
                     f'<key>RunAtLoad</key><true/><key>KeepAlive</key><true/></dict></plist>')
        subprocess.run(["launchctl", "unload", str(p)], check=False, capture_output=True)
        subprocess.run(["launchctl", "load", str(p)], check=True)
        return f"LaunchAgent instalado em {p}."
    p = Path.home() / ".config/systemd/user/evolua-agent.service"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(f"[Unit]\nDescription=Evolua Notas agente\n\n[Service]\nExecStart={' '.join(cmd)}\nRestart=always\n\n[Install]\nWantedBy=default.target\n")
    subprocess.run(["systemctl", "--user", "enable", "--now", "evolua-agent"], check=True)
    return f"Serviço systemd de usuário instalado em {p}."
