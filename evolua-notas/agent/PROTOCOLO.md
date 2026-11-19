# Protocolo do agente local (API do Evolua Notas)

O agente roda no computador que guarda o certificado A1 e **só sai para**: a SEFIN Nacional, o ViaCEP e o Evolua Notas. O `.pfx` e a senha nunca são enviados.

Autenticação: `Authorization: Bearer evn_...` (token gerado em *Empresas → Novo agente local*, exibido uma vez). Um token = um CNPJ.

## 1. Buscar trabalho
`GET /api/agent/jobs?cert_valid_until=YYYY-MM-DD` (a cada ~20 s)
- `204` sem trabalho · `401` token inválido/revogado · `429` devagar.
- `200`:
```json
{ "attempt_id":"uuid", "mode":"emitir|consultar", "ambiente":"homologacao|producao",
  "dps_id":"uuid", "dps_numero":2, "serie":"00001",
  "prestador":{"cnpj":"…","razao_social":"…","municipio_ibge":"…","cloc_prestacao":"…","ctrib_nac":"…","ctrib_mun":"…","aliq_simples":4.0,"texto_fixo":""},
  "tomador":{"documento":"…","nome":"…","cep":"…","numero":"…","complemento":""},
  "servico":{"descricao":"…","codigo":"…"}, "competencia":"2026-11-01", "valor":1500.00, "hash_aprovado":"…" }
```
Uma tentativa entregue fica reservada por 2 min; se o agente cair, é entregue de novo.

## 2. Regras obrigatórias (implementadas em `evolua_agent/job.py`)
1. **Antes de emitir**, monte o `Id` da DPS e consulte a SEFIN (`/dps/{id}`). Se já virou nota → **não emita**: leia-a e reporte `autorizada`. Evita duplicidade se o agente cair depois do envio.
2. `mode = "consultar"` **nunca** emite; se a DPS não existe na SEFIN, reporta `rejeitada` ("nada foi emitido").
3. Recusar se o `tpAmb` do XML ≠ `ambiente` do job; o CNPJ do certificado deve ser o do prestador.
4. Falha **antes** do envio (certificado, XSD, CEP, dados incompletos) → `rejeitada` com motivo `[agente] …`: nada saiu, o operador corrige e reenvia. Falha **depois** do envio (timeout, 5xx, queda) → `indefinida`. Resposta 4xx da SEFIN → `rejeitada` com os códigos.

## 3. Reportar resultado
`POST /api/agent/jobs/{attempt_id}/result`
```json
{ "outcome":"autorizada|rejeitada|indefinida", "chave":"…(autorizada)", "external_id":"nº da NFS-e",
  "motivo":"…(rejeitada/indefinida)", "xml":"<NFSe…>", "pdf_base64":"…" }
```
Reenviar o mesmo resultado é seguro (idempotente). `502 falha_armazenamento` → repetir.
