# Protocolo do agente local

O agente roda no computador que guarda o certificado A1 e **só sai para dois lugares**: a SEFIN Nacional e o Evolua Notas. O `.pfx` e a senha (cofre do sistema) nunca são enviados.

Autenticação: `Authorization: Bearer evn_...` (token gerado em *Empresas → Novo agente local*, exibido uma vez). Um token = um CNPJ.

## 1. Buscar trabalho
`GET /api/agent/jobs?cert_valid_until=YYYY-MM-DD` (a cada ~15–30 s)
- `204` sem trabalho · `401` token inválido/revogado · `429` devagar.
- `200`:
```json
{ "attempt_id":"uuid", "mode":"emitir|consultar", "ambiente":"homologacao|producao",
  "dps_id":"uuid", "dps_numero":2, "serie":"00001",
  "prestador":{"cnpj":"…","razao_social":"…","municipio_ibge":"…","cloc_prestacao":"…","ctrib_nac":"…","ctrib_mun":"…","aliq_simples":4.0,"texto_fixo":""},
  "tomador":{"documento":"…","nome":"…","cep":"…","numero":"…","complemento":""},
  "servico":{"descricao":"…","codigo":"…"}, "competencia":"2026-11-01", "valor":1500.00, "hash_aprovado":"…" }
```
Uma tentativa entregue fica reservada por 2 min; se o agente cair, ela é entregue de novo.

## 2. Regras que o agente DEVE seguir
1. **Antes de emitir**, monte o `Id` da DPS (IBGE + tipo + CNPJ + série + número) e faça `HEAD /dps/{id}`. Se já existe nota → **não emita**: leia-a e reporte `autorizada`. É isso que evita duplicidade se o agente cair depois do envio.
2. `mode = "consultar"` **nunca** emite: só consulta pelo `Id` da DPS e reporta `autorizada`, `rejeitada` ou `indefinida`.
3. Recusar se o `tpAmb` do XML ≠ `ambiente` do job.
4. Validar no XSD do ambiente antes de assinar. Não reportar "rejeitada" por erro local (use `indefinida` com motivo) para não travar a nota por falha do próprio agente.
5. Timeout/erro de rede depois do `POST /nfse` → reportar `indefinida`.

## 3. Reportar resultado
`POST /api/agent/jobs/{attempt_id}/result`
```json
{ "outcome":"autorizada|rejeitada|indefinida", "chave":"…(autorizada)", "external_id":"…",
  "motivo":"…(rejeitada/indefinida)", "xml":"<NFSe…>", "pdf_base64":"…" }
```
Reenviar o mesmo resultado é seguro (idempotente). `502 falha_armazenamento` → repetir.
