# Agente local do Evolua Notas

Programa que roda no **Windows ou macOS** (Linux também) do escritório/empresa que tem o **certificado digital A1 (e-CNPJ)**. Ele:
1. busca as notas aprovadas no Evolua Notas (`GET /api/agent/jobs`);
2. monta a DPS, valida no XSD oficial, **assina com o seu A1** e envia à SEFIN Nacional por mTLS;
3. devolve a chave de acesso, o XML (e o PDF, se houver molde) ao painel.

O `.pfx` e a senha **nunca saem do computador**. A senha e o token ficam no **Cofre do sistema** (Gerenciador de Credenciais do Windows / Chaves do macOS).

## Quem usa o quê

| Dispositivo | Papel |
|---|---|
| **Windows / macOS** com o A1 | roda o agente (emite). Também acessa o painel pelo navegador |
| **iPhone / iPad** (e Android) | **não roda o agente** (o iOS não permite guardar o .pfx nem abrir mTLS com certificado de cliente). Usa o **painel**: criar, revisar, aprovar, enviar e baixar XML. Em Safari: *Compartilhar → Adicionar à Tela de Início* |
| Empresa **sem** A1 | precisa de um certificado A1 do CNPJ (emitido por qualquer AC ICP-Brasil). Certificado A3 (token/cartão) e A1 em nuvem **ainda não** são suportados pelo agente |

Se o computador do agente estiver desligado, as notas aprovadas ficam na fila (status *Processando*); ao ligar, são emitidas. Passou de 10 minutos sem resposta → *Em verificação*, e o operador usa *Consultar resultado*.

## Instalação (Windows ou Mac)
1. Em *Empresas*, ative o emissor **Agente local** e clique em **Gerar token** (aparece uma vez).
2. Baixe `evolua-agent` da página de Releases (`agent-v*`) — `evolua-agent.exe` no Windows, `evolua-agent` no macOS (na primeira execução: *botão direito → Abrir*, pois o app não é assinado pela Apple/Microsoft ainda).
3. Em um terminal (PowerShell ou Terminal):
   ```
   evolua-agent configurar    # endereço do painel, token, caminho do .pfx e a senha (digitada aqui, nunca no chat)
   evolua-agent testar        # confere o certificado e a conexão com a SEFIN em homologação
   evolua-agent instalar      # inicia sozinho quando você entrar no computador
   ```
4. Em *Empresas*, preencha os **dados fiscais** (copie de uma nota já emitida pelo portal), emita uma nota em **homologação** e só então clique **Habilitar produção**.

Guarde o `.pfx` numa pasta sua, **fora** do Google Drive/OneDrive/iCloud. O certificado A1 vence em 1 ano; o painel avisa 45 dias antes.

## O que o agente garante
- Só emite se o **CNPJ do certificado = CNPJ da empresa** do job.
- Antes de emitir, pergunta à SEFIN se aquela DPS já virou nota; se virou, **recupera** em vez de emitir de novo (queda do computador depois do envio não duplica).
- Falha **antes** do envio → `rejeitada` com motivo `[agente] …` (nada saiu; corrija e reenvie). Falha **depois** do envio → `indefinida` (nunca reenvia sozinho).
- O ambiente (`tpAmb` do XML) tem que bater com o endereço da SEFIN; produção usa tpAmb=1 e o servidor de produção.
- Só fala com: o painel, `sefin(.producaorestrita).nfse.gov.br` e `viacep.com.br` (CEP do tomador).
- Nota técnica: a biblioteca de TLS do Python só aceita certificado de cliente a partir de arquivo; o emissor de referência grava a chave num arquivo temporário (permissão 600) por milissegundos e o apaga sobrescrevendo. Está documentado em `_ref/sefin.py`.

## PDF (DANFSe)
Opcional. Para gerar, coloque um molde `danfse_modelo.pdf` (derivado de uma nota baixada do portal; veja `_ref/danfse.py --modelo`) na pasta de configuração. Sem ele, o XML é o documento fiscal e o PDF sai da consulta pública pela chave de acesso.

## Desenvolvimento
```
pip install -r requirements.txt pytest && python -m pytest tests     # 10 testes (assinatura real + XSD + SEFIN simulada)
python -m evolua_agent configurar|testar|executar|instalar
```
`_ref/` é cópia sem alterações do emissor de referência (MIT) — ver `_ref/LEIAME.md`.
